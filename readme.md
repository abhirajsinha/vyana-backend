# Vyana Backend

Express + Prisma API for Vyana: cycle tracking, daily logs, deterministic wellness insights, optional OpenAI phrasing, chat, home/calendar aggregates, and health-pattern hints.

---

## New developer onboarding

**Goal:** In one pass you should know *where* things live, *how* data flows, and *which doc* to open next.

### Read in this order

| Order | Document | What you get |
|-------|-----------|----------------|
| 1 | **This file** (`readme.md`) | Setup, env, endpoint index, caching, AI behavior, workflow |
| 2 | [`API.md`](./API.md) | Request/response shapes, field tables, errors |

### Mental model (30 seconds)

1. **HTTP** → `src/routes/*` → **controllers** → **services** (domain) → **Prisma** → PostgreSQL.  
2. **Insights** are **deterministic first**; OpenAI **rewrites** copy when configured (daily insights vs forecast have **different** gates — see below).  
3. **Insight rows** are cached per user per **UTC calendar day**; **new logs** wipe that user’s insight + health caches so the next fetch recomputes.

### Where to change what

| You want to… | Start here |
|--------------|------------|
| Add or change an HTTP route | `src/routes/`, then controller under `src/controllers/` |
| Cycle phase / calendar math | `src/services/cycleEngine.ts` |
| Insight rules and context | `src/services/insightService.ts`, `insightData.ts`, `insightControllerPhase1.ts` |
| OpenAI prompts / JSON shaping | `src/services/insightGptService.ts`, `chatService.ts` |
| Contraception-specific behavior | `src/services/contraceptionengine.ts`, `contraceptionTransition.ts` |
| Feature flags | `src/config/featureFlags.ts` |
| Auth / JWT | `src/controllers/authController.ts`, `src/middleware/auth.ts`, `src/utils/jwt.ts` |
| DB schema | `prisma/schema.prisma` → then `npx prisma migrate dev` |

---

## Tech stack

- Node.js + TypeScript  
- Express 5  
- Prisma ORM + PostgreSQL (Supabase-compatible)  
- JWT access + refresh (bcrypt for passwords)  
- Google Sign-In (ID token verification)  
- OpenAI (optional): daily/forecast phrasing + chat  

---

## Project structure

```text
src/
  config/          # Feature flags (Phase 1 mode, GPT gating)
  controllers/     # HTTP handlers (thin: validate, call services, respond)
  lib/             # Prisma client
  middleware/      # auth, errors, rate limits
  routes/          # Mount paths → controllers
  services/        # Domain logic (cycle, insights, AI, health, …)
  types/
  utils/
prisma/
  schema.prisma
  migrations/
scripts/           # Smoke tests, utilities
tests/
  units/
  integration/
```

---

## Environment variables

Copy from `.env.example` if present, or create `.env`:

```bash
DATABASE_URL="postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
JWT_SECRET="replace-with-strong-secret"
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"   # for POST /api/auth/google
OPENAI_API_KEY="sk-..."        # optional; without it, GPT paths short-circuit to drafts / chat fallback
OPENAI_MODEL="gpt-4o-mini"     # optional
PORT=3000
```

---

## Setup

```bash
npm install
npx prisma migrate dev    # apply migrations to your local DB
npx prisma generate       # client (often already run by migrate)
npm run dev
```

Production-style run:

```bash
npm run build
npm run start
```

---

## After you change code

| Change type | What to run |
|-------------|-------------|
| TypeScript only (no `schema.prisma`) | `npx tsc --noEmit` and/or `npm run build`; restart `npm run dev` if needed |
| `schema.prisma` | `npx prisma migrate dev` (and commit the new migration folder) |
| Behavior you care about | `npm run test:unit` / `npm test` as appropriate |

You do **not** run Prisma on every edit — only when the database schema or generated client must change.

---

## API surface (summary)

Base URL: `http://localhost:${PORT}` (default `3000`).  
Protected routes need: `Authorization: Bearer <access_token>`.

**Full detail:** [`API.md`](./API.md).

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | No | Liveness |
| GET | `/api/health` | No | Health status |
| POST | `/api/auth/register` | No | Email + password signup |
| POST | `/api/auth/login` | No | Email + password login |
| POST | `/api/auth/google` | No | Google ID token signup/sign-in |
| POST | `/api/auth/refresh` | No | New access token from refresh JWT |
| GET | `/api/user/me` | Yes | Current user profile |
| PUT | `/api/user/profile` | Yes | Update profile (may trigger contraception transition / cache invalidation) |
| PUT | `/api/user/fcm-token` | Yes | Update FCM push token |
| GET | `/api/home` | Yes | Home screen aggregate |
| GET | `/api/cycle/current` | Yes | Current cycle info |
| POST | `/api/cycle/period-started` | Yes | Record new period start (updates cycle + history) |
| DELETE | `/api/cycle/period-started/:id` | Yes | Undo period logging |
| GET | `/api/calendar` | Yes | Monthly calendar + cycle overlay (`?month=YYYY-MM`) |
| GET | `/api/calendar/day-insight` | Yes | Per-day insight card for calendar |
| POST | `/api/logs` | Yes | Create daily log |
| GET | `/api/logs` | Yes | List logs (optional `?date=YYYY-MM-DD`) |
| PUT | `/api/logs/:id` | Yes | Edit existing log |
| POST | `/api/logs/quick-check-in` | Yes | Minimal log (mood, energy, sleep, stress, pain, fatigue) |
| GET | `/api/logs/quick-log-config` | Yes | Phase-aware log field config |
| GET | `/api/insights` | Yes | Daily insights + view payload |
| GET | `/api/insights/context` | Yes | Debug-style insight context |
| GET | `/api/insights/forecast` | Yes | Forecast (or warmup if not eligible) |
| POST | `/api/chat` | Yes | Chat completion |
| GET | `/api/chat/history` | Yes | Persisted chat messages |
| POST | `/api/admin/send-notifications` | API Key | Trigger notification batch |

**Login identifier:** use **email** + password, not `userId`.

---

## Authentication

Register / login / Google responses include `{ user, tokens: { accessToken, refreshToken } }`.  
`passwordHash` is never exposed on `user`.

Access token TTL is **1 day** (`src/utils/jwt.ts`). Refresh token TTL is **30 days**, stored in `RefreshToken`.  
Login/register routes use **rate limiting** (`src/middleware/rateLimit.ts`).

---

## Caching

| Store | Behavior |
|-------|-----------|
| **`InsightCache`** | One row per `(userId, UTC date)` for that day’s insights payload and optional forecast JSON. No sub-day TTL — reused until UTC midnight **or** invalidated. |
| **Invalidation** | Saving a log (`logController`) clears insight cache for that user; health pattern cache is also cleared. Profile / contraception updates may clear caches too (see `userController`, `contraceptionTransition`). |
| **`transitionWarmup`** | Time-sensitive; recomputed on read even when the rest of the insights payload is cached. |
| **`HealthPatternCache`** | One row per user; treated as fresh for **1 day** from `updatedAt` (`healthController`). |

---

## OpenAI / GPT behavior (current code)

| Feature | When OpenAI runs |
|---------|-------------------|
| **Daily insights** (`GET /api/insights`) | On cache miss, GPT enhancement runs when the user has **3+ logs** (`FEATURE_FLAGS.MIN_LOGS_FOR_GPT`). Users below this threshold get deterministic-only insights. Controlled by `FEATURE_FLAGS.ENABLE_GPT_ENHANCEMENT` in `src/config/featureFlags.ts`. |
| **Forecast** (`GET /api/insights/forecast`) | GPT rewrite only when `logsCount >= 7`, `context.mode === "personalized"`, and `context.confidence !== "low"`. Otherwise returns a **warmup / locked** payload. |
| **Chat** (`POST /api/chat`) | Uses GPT when configured; otherwise a configuration fallback message. |

---

## Important `User` fields (for product behavior)

- **`lastPeriodStart`**, **`cycleLength`**, **`cycleMode`** — phase and predictions (`cycleMode` derives from contraception + regularity).  
- **`contraceptiveMethod`**, **`cycleRegularity`** — drive `getCycleMode` and contraception behavior.  
- **`contraceptionChangedAt`** — set when contraception method changes; powers **transition warmup** messaging (`transitionWarmup.ts`).  
- **`fcmToken`** — optional; reserved for push (no cron in this repo yet).

---

## Scripts and tests

```bash
npm run dev              # dev server + reload
npm run build            # compile to dist/
npm run test:unit        # unit tests
npm run test:integration # integration tests
npm test                 # all Jest tests
```

Phase 1 smoke test: `npx ts-node scripts/phase1-smoke-test.ts`.

---

## Implemented vs not in this repo

**Implemented:** Auth (email, Google, refresh), profile updates, cycle + calendar + period start + undo, logs (full + quick-check-in + quick-log-config), insights + forecast + context (Phase 1 controller), home, chat + history, admin notifications, rate limiting, insight caching.

**Not implemented here:** Background jobs, refresh-token rotation / logout endpoint.

---

## License

ISC (see `package.json`).
