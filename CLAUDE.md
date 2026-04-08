# CLAUDE.md — Vyana Backend

> Last updated: April 2026
> Repo: github.com/abhirajsinha/vyana-backend

## What Vyana Is

Vyana is a menstrual health companion app. The backend powers a deeply personalized insight engine — every response must feel specific to the individual user, never generic. The core product philosophy is **"this app knows me."**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (TypeScript) |
| Framework | Express.js |
| ORM | Prisma |
| Database | PostgreSQL (Supabase) |
| AI | OpenAI GPT-4o-mini (`OPENAI_MODEL` env var) |
| Auth | JWT (access + refresh tokens), Google OAuth |
| Password hashing | bcryptjs (12 rounds) |
| Push notifications | Firebase Cloud Messaging (FCM) |

---

## Project Structure

```
src/
├── config/
│   └── featureFlags.ts            # PHASE1_MODE, GPT gating thresholds
│
├── controllers/
│   ├── authController.ts          # Register, login, Google OAuth, refresh
│   ├── calendarController.ts      # GET /api/calendar, GET /api/calendar/day-insight
│   ├── chatController.ts          # POST /api/chat (intent classification → light vs full pipeline)
│   ├── cycleController.ts         # GET /api/cycle/current, POST /api/cycle/period-started, DELETE undo
│   ├── homeController.ts          # GET /api/home (signal-aware home screen)
│   ├── insightControllerPhase1.ts # GET /api/insights, /insights/context, /insights/forecast (Phase 1)
│   ├── logController.ts           # POST/GET/PUT logs, quick-check-in, quick-log-config
│   ├── notificationController.ts  # FCM token update, admin notification batch
│   └── userController.ts          # GET /api/user/me, PUT /api/user/profile
│
├── middleware/
│   ├── auth.ts                    # requireAuth — verifies JWT, sets req.userId
│   ├── errorHandler.ts            # notFound + errorHandler
│   ├── rateLimit.ts               # Per-endpoint rate limiters (auth, chat, insights, logs, general)
│   └── requestLogger.ts           # Structured JSON request logging
│
├── routes/                        # Express routers (admin, auth, calendar, chat, cycle, home, insights, logs, user)
│
├── services/                      # Core business logic
│   ├── aiService.ts               # Re-export barrel (chatService + insightGptService)
│   ├── chatService.ts             # Intent classifier + askVyanaWithGpt (casual/full modes)
│   ├── insightGptService.ts       # GPT insight rewrite + forecast rewrite + all post-GPT guards
│   ├── insightService.ts          # Signal processing, trends, drivers, rule-based insights
│   ├── insightData.ts             # getUserInsightData, NumericBaseline, CrossCycleNarrative
│   ├── insightView.ts             # View composition, insightBasis progressive unlock
│   ├── insightGuard.ts            # Post-generation deterministic enforcement (12 guard layers)
│   ├── insightValidator.ts        # Insight validation with hard/soft checks + fallback
│   ├── cycleEngine.ts             # Phase calculation, cycle info, irregularity detection
│   ├── cycleInsightLibrary.ts     # 28-day × 3-variant insight library + getCycleNumber
│   ├── hormoneengine.ts           # Phase→hormone state mapping + safe language builder
│   ├── contraceptionengine.ts     # Contraception type resolution + behavior rules + forecast eligibility
│   ├── contraceptionTransition.ts # Handles contraception method changes (cache clear, baseline reset)
│   ├── transitionWarmup.ts        # 14-day warmup messaging after contraception switch
│   ├── healthPatternEngine.ts     # PCOS, PMDD, endometriosis, iron deficiency detection + watching states
│   ├── vyanaContext.ts            # VyanaContext humanization layer (v5) — 4-layer signal composition
│   ├── googleAuthService.ts       # Google ID token verification
│   ├── notificationScheduler.ts   # Query users due for notification
│   ├── notificationService.ts     # Firebase push send
│   ├── notificationTemplates.ts   # Phase-aware notification templates
│   └── openaiClient.ts            # OpenAI client + circuit breaker (5 failures → 5min cooldown)
│
├── types/
│   ├── cycleUser.ts               # CycleLengthDays, HORMONAL_CONTRACEPTIVE_METHODS
│   └── express.ts                 # Extend Express.Request with userId
│
├── utils/
│   ├── confidencelanguage.ts      # Forbidden phrase detection, softening, cleanup, CERTAINTY_RULES_FOR_GPT
│   ├── homeScreen.ts              # Home screen day content generator
│   ├── jwt.ts                     # signAccessToken, signRefreshToken, verifyToken
│   ├── password.ts                # hashPassword, verifyPassword
│   └── userPublic.ts              # toPublicUser (strips passwordHash)
│
├── lib/prisma.ts                  # Prisma client singleton
└── index.ts                       # Express app setup, middleware, route mounting
```

---

## API Routes

```
# Auth
POST   /api/auth/register          # Email/password registration
POST   /api/auth/login             # Email/password login
POST   /api/auth/google            # Google OAuth (idToken + profile)
POST   /api/auth/refresh           # Refresh access token

# User
GET    /api/user/me                # Get current user profile
PUT    /api/user/profile           # Update profile (handles contraception transitions)
PUT    /api/user/fcm-token         # Update push notification token

# Cycle
GET    /api/cycle/current          # Current cycle day, phase, insight
POST   /api/cycle/period-started   # Log new period start (closes previous cycle)
DELETE /api/cycle/period-started/:id  # Undo period logging

# Logs
POST   /api/logs                   # Save daily log (upsert for today)
GET    /api/logs                   # Get logs (optional ?date=YYYY-MM-DD filter)
PUT    /api/logs/:id               # Edit existing log
POST   /api/logs/quick-check-in   # Minimal log (mood, energy, sleep, stress, pain, fatigue)
GET    /api/logs/quick-log-config  # Phase-aware log field configuration

# Insights
GET    /api/insights               # Phase 1 insight pipeline (GPT gated on 3+ logs)
GET    /api/insights/context       # Debug context (drivers, basedOn, hormoneContext)
GET    /api/insights/forecast      # Tomorrow forecast + confidence

# Chat
POST   /api/chat                   # Vyana chat (intent classified → casual or full pipeline)
GET    /api/chat/history           # Last 100 messages

# Home
GET    /api/home                   # Home screen content (signal-aware, phase-aware)

# Calendar
GET    /api/calendar?month=YYYY-MM # Calendar grid with phase colors, log summaries
GET    /api/calendar/day-insight?date=YYYY-MM-DD  # Day tap insight card

# Admin
POST   /api/admin/send-notifications  # Trigger notification batch (API key required)

# Health check
GET    /health                     # { ok: true }
GET    /api/health                 # { status: "ok" }
```

---

## The Insight Pipeline (Critical Path)

When `GET /api/insights` is called:

```
1. Check InsightCache (userId + today's date) → return if fresh
2. getUserInsightData() — parallel fetch: user + 90-day logs
3. Split logs: recentLogs (first 7), baselineLogs (rest)
4. computeNumericBaseline() — weighted averages for sleep/stress/mood/energy
5. buildCrossCycleNarrative() — same cycle-day window across past 6 cycles (1 query)
6. calculateCycleInfo() — cycle day, phase, days until next phase/period
7. buildInsightContext() — signal processing, trends, drivers, confidence scoring
8. isStableInsightState() — detect if logs are flat (no drama)
9. detectPrimaryInsightCause() — sleep_disruption / stress_led / cycle / stable
10. generateRuleBasedInsights() — deterministic draft from signal state
11. buildTomorrowPreview() — trend-adjusted tomorrow preview
12. softenForConfidenceTier() — pre-GPT zero-data softening (3 tiers)
13. Apply correlation patterns, cross-cycle narrative, cause-specific overrides
14. softendeterministic() — strip forbidden deterministic language
15. buildVyanaContext() — v5 humanization layer (4-layer signal composition)
16. generateInsightsWithGpt() — GPT rewrite with VYANA_SYSTEM_PROMPT
17. sanitizeInsights() → enforceTwoLines → removeUnearned* → fixCapitalization
18. softenDailyInsights() — post-GPT deterministic softening
19. cleanupInsightText() — dedup sentences, fix contradictions
20. applyAllGuards() — 12-layer deterministic enforcement
21. validateZeroDataSafety() — final safety net for 0-log users
22. buildInsightView() — primary/supporting/action/explanation composition
23. Cache write → respond → fire-and-forget: memory + history writes
```

---

## VyanaContext (v5) — The Humanization Layer

The VyanaContext transforms raw signals into natural language BEFORE GPT sees them. GPT rewrites pre-humanized context, not raw data.

**4-layer signal composition:**
1. **Core** — high-weight factual signals (delayed period, persistent driver, sleep-stress interaction)
2. **Narrative** — identity patterns, cross-cycle context, sleep/stress/mood deviations
3. **Enhancement** — max 1 (surprise insight takes priority over anticipation)
4. **Emotional** — max 1, always last (emotional memory recall OR delight moment)

**Key systems:**
- **Identity layer** — "for you, this part of your cycle tends to..." (requires 2+ matching cycles)
- **Emotional memory** — "last time sleep dropped like this, you logged feeling exhausted" (requires 2+ matching occurrences with mood data)
- **Anticipation** — forward-looking warnings/encouragement based on phase position + signal trends
- **Surprise insight** — non-obvious signal connections (~25% chance per day, user-specific seed)
- **Delight** — warm human touches (reassurance, validation, relief, normalcy) — mutually exclusive with surprise
- **Severity gating** — high-severity states only get validation delight, never relief/normalcy

---

## Contraception System

| Type | Natural cycle engine | Ovulation prediction | Hormone curves | PMS forecast | Insight tone |
|---|---|---|---|---|---|
| none / barrier / natural / iud_copper | ✅ | ✅ | ✅ | ✅ | cycle-based |
| combined_pill / patch / ring | ❌ | ❌ | ❌ | ❌ | pattern-based |
| mini_pill | ❌ | ❌ | ❌ | ❌ | pattern-based |
| iud_hormonal / implant / injection | ❌ | ❌ | ❌ | ❌ | symptom-based |

**Transition handling** (`contraceptionTransition.ts`):
- natural→hormonal: full baseline reset, period start reset, cache clear, contraceptionChangedAt set
- hormonal→natural: baseline reset, cycleRegularity forced to "not_sure", cache clear
- hormonal→hormonal: baseline reset, cache clear
- natural→natural: cache clear only
- 14-day warmup window after any transition

---

## Health Pattern Detection

**Full alerts** (require multi-cycle evidence):
- PCOS indicator (3+ cycles)
- PMDD indicator (2+ cycles)
- Endometriosis indicator (3+ cycles)
- Iron deficiency risk (2+ cycles)

**Progressive watching states** (early signals with progress percentage)

All patterns include medical disclaimers. Never diagnose.

---

## Database Schema (Prisma)

**Core:** User, DailyLog, ChatMessage, RefreshToken
**Insight system:** InsightCache (daily, userId+date unique), InsightMemory (driver persistence, userId+driver unique), InsightHistory (generation history with primaryKey, driver, cycleDay, phase)
**Cycle:** CycleHistory (startDate, endDate, cycleLength)
**Health:** HealthPatternCache (userId unique)

---

## Coding Conventions

- TypeScript strict mode
- Controllers thin — delegate to services
- `req.userId` set by `requireAuth` middleware
- All dates UTC
- Structured JSON logging
- Never say "you will feel" — always probabilistic language
- Never make diagnostic claims
- Zero-data users: "can", "may", "often", "typically" only
- Hormonal users: no phase/ovulation/hormone language
- Each insight field: max 2 sentences, max 350 chars
- All GPT output through `sanitizeInsights()` → guards → softening

---

## Rate Limiting

- Auth: 30 req / 15 min
- Google auth: 20 req / 15 min
- Chat: 60 req / min
- Insights: 10 req / min
- Logs: 30 req / min
- General API: 120 req / min

---

## Environment Variables

```
DATABASE_URL            # Supabase pooled connection (port 6543 recommended)
DIRECT_DATABASE_URL     # Supabase direct connection (for migrations)
OPENAI_API_KEY          # OpenAI API key
OPENAI_MODEL            # Default: gpt-4o-mini
JWT_SECRET              # JWT signing secret
GOOGLE_CLIENT_ID        # Google OAuth client ID
FIREBASE_SERVICE_ACCOUNT # Firebase Admin SDK JSON
ADMIN_API_KEY           # API key for admin endpoints
PORT                    # Default: 3000
NODE_ENV                # development / production
```

---

## Scripts

```bash
# Phase 1 smoke test
npx ts-node scripts/phase1-smoke-test.ts

# Database
npx prisma migrate deploy
npx prisma generate
npx prisma studio
```

---

## Known Architectural Decisions

1. **GPT fires on insight requests with 3+ logs** — gated by `FEATURE_FLAGS.MIN_LOGS_FOR_GPT`. Circuit breaker protects against outages. Draft is always the fallback.
2. **Insight cache is per-day** — keyed on userId + date. Invalidated on log save, period-started, profile update.
3. **Cross-cycle narrative: 1 batch query** — fetches all logs across all cycle windows, filters in memory.
4. **User + logs fetched in parallel** — `getUserInsightData()` uses `Promise.all`.
5. **Memory + history writes are fire-and-forget** — after `res.json()`.
6. **Interaction flags require 5+ logs** — causal claims need enough data.
7. **Single-day spike protection** — requires 2+ of last 3 days before declaring sleep_disruption/stress_led.
8. **Phase tone system** — 6 tones with allowed/avoided language per tone.
9. **Momentum break detection** — 4+ positive days → 1 negative = "rougher than your recent streak" framing.

---

## Critical Rules for Any Code Change

1. **Never hardcode contraception type** — always use `resolveContraceptionType(user.contraceptiveMethod)`.
2. **Always use `effectiveCycleLength`** from `getCyclePredictionContext` — never raw `user.cycleLength`.
3. **Always compute `isPeriodDelayed` consistently** — same formula across insights, home, calendar.
4. **Never surface hormone language for hormonal users** — strip function must stay in sync.
5. **All GPT output through `sanitizeInsights()` + `applyAllGuards()`** — no exceptions.
6. **Zero-data users must never see hard assertions** — validated by `validateZeroDataSafety()`.
7. **insightHistory writes gated on `context.mode === "personalized"`** — never for 0-log users.
8. **Cache invalidation on every data mutation** — log save, period-started, profile update must clear caches.