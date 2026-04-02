# Vyana Backend - System Design Document

## 1. Purpose and Scope

This document describes the end-to-end system design of the Vyana backend API.

It covers:
- runtime architecture and module boundaries
- request/response lifecycle across major APIs
- database schema and data flows
- authentication and authorization model
- AI/insights integration design and fallbacks
- reliability, performance, and scaling strategy
- deployment, operations, and future evolution

This document complements `INSIGHTS_SYSTEM.md`, which goes deeper into the insight engine internals.

---

## 2. System Overview

Vyana backend is a TypeScript + Express service backed by PostgreSQL (via Prisma). It supports:
- user onboarding and token-based authentication (email/password and Google ID tokens)
- profile updates, cycle-phase computation, period-start recording, and calendar/home aggregates
- daily wellness logging
- deterministic insights with optional GPT phrasing; separate forecast and health-pattern endpoints
- AI chat with persisted history

### 2.1 High-level Context

```text
Mobile/Web Client
      |
      v
Express API (Node.js, TypeScript)
  - Auth middleware (JWT)
  - Controllers
  - Domain services (cycle, insights, AI)
      |
      v
Prisma ORM
      |
      v
PostgreSQL
```

External dependency:
- OpenAI API (optional): insight phrasing enhancement + chat responses

---

## 3. Goals and Non-Goals

### 3.1 Goals
- Provide stable and explainable wellness insights with graceful degradation.
- Keep API surface simple for client integration.
- Maintain clean separation between transport (`routes/controllers`) and domain logic (`services`).
- Ensure auth-protected access to user-specific data.
- Preserve deterministic behavior even when AI services are unavailable.

### 3.2 Non-Goals (current scope)
- No OAuth authorization-code redirect flow (clients use Google ID tokens + server verification).
- No multi-region deployment, sharding, or read replicas yet.
- No automated test suite framework (custom test runners exist for insightGuard).
- No refresh token rotation on use.

---

## 4. Runtime Architecture

## 4.1 Service Topology

Single deployable API service:
- HTTP entrypoint in `src/index.ts`
- route modules under `src/routes`
- controllers under `src/controllers`
- domain logic under `src/services`
- persistence via `src/lib/prisma.ts`
- auth and errors in `src/middleware`

## 4.2 Layered Structure

1) **Routes Layer**
- Defines endpoint paths + middleware composition.
- No business logic.

2) **Controller Layer**
- Parses/validates request input.
- Coordinates DB queries + service calls.
- Shapes response DTOs.

3) **Domain Services Layer**
- `cycleEngine`: phase/day math and phase suggestions.
- `insightService`: deterministic context building + insight generation.
- `aiService`: OpenAI integration for insights/chat with strict fallback behavior.

4) **Persistence Layer**
- Prisma models map to PostgreSQL tables.
- Controllers perform direct Prisma calls (service repository abstraction not yet introduced).

---

## 5. Module and Responsibility Map

### 5.1 Entry and Middleware
- `src/index.ts`: bootstraps server, middleware, routes, and global handlers.
- `src/middleware/auth.ts`: JWT validation
- `src/middleware/errorHandler.ts`: catch-all JSON 404/500 (production-safe: never leaks stack traces)
- `src/middleware/rateLimit.ts`: per-scope rate limiting (general, auth, insights, logs, chat)
- `src/middleware/requestLogger.ts`: structured JSON request logging (method, path, status, duration, userId)
- `src/types/express.d.ts`: request type augmentation for `userId`.

### 5.2 Auth and Identity
- `src/controllers/authController.ts`
  - register with unique email, bcrypt-hashed password, and profile fields
  - login with email + password
  - Google signup/sign-in: verify Google ID token, then create or match user (`googleId` / email)
  - issue access + refresh tokens
  - persist refresh token records
  - rotate access token from valid refresh token
- `src/utils/jwt.ts`
  - access token (`15m`)
  - refresh token (`30d`)
  - token verification
- `src/utils/password.ts` — bcrypt hashing and verification (`MIN_PASSWORD_LENGTH` = 8)
- `src/utils/userPublic.ts` — strips `passwordHash` from user objects returned to clients
- `src/services/googleAuthService.ts` — verifies Google ID tokens against `GOOGLE_CLIENT_ID`

### 5.3 User and Logs
- `src/controllers/userController.ts`: `GET /me`, `PUT /profile` (with contraception transition handling)
- `src/controllers/logController.ts`:
  - `POST /api/logs` — create/upsert daily log with input validation
  - `GET /api/logs` — query recent logs (optional date filter, latest 30)
  - `PUT /api/logs/:id` — edit existing log with ownership verification
  - `POST /api/logs/quick-check-in` — partial field upsert for quick logging

### 5.4 Cycle Engine
- `src/controllers/cycleController.ts`: current cycle + monthly calendar endpoints
  - `DELETE /api/cycle/period-started/:id` — undo period logging, restore previous cycle
- `src/services/cycleEngine.ts`:
  - cycle day normalization
  - phase resolution (`menstrual`, `follicular`, `ovulation`, `luteal`)
  - phase-tailored suggestions for UI logging
  - Cycle day no longer wraps via modulo past cycleLength (delayed period support)
  - `isPeriodDelayed` detection with tiered messaging (1-3, 4-7, 8-14, 15+ days)
  - Hormonal users: `CycleHistory.cycleLength = null` (withdrawal bleeds, not biological cycles)

### 5.5 Insights and Forecast
- `src/controllers/insightController.ts`
  - Full pipeline: context → rule-based → softenForConfidenceTier → GPT rewrite → softenDailyInsights → cleanupInsightText → applyAllGuards → buildInsightView → cache
  - Cache hit/miss logging
  - Momentum break detection
  - Signal-aware narrative overrides
- `src/services/insightService.ts` — signal processing, rule-based insights, 3-tier confidence language (0 logs suggestive, 1-4 reference-based, 5+ assertive)
- `src/services/insightGptService.ts` — GPT rewrite with 8s timeout, circuit breaker, duration logging
- `src/services/insightGuard.ts` — 8-guard post-generation enforcement layer (zero-data assertions, direction, intensity, hallucination, technical language, tomorrow softener, capitalization, consistency)
- `src/services/insightCause.ts` — primary cause detection (sleep_disruption, stress_led, stable, cycle) with single-day spike protection
- `src/services/insightMonitor.ts` — production shadow monitoring for GPT quality signals
- `src/services/vyanaContext.ts` — 4-layer priority signal composition for GPT prompts

### 5.7 Notifications
- `src/controllers/notificationController.ts`: `PUT /api/user/fcm-token`, `POST /api/admin/send-notifications`
- `src/services/notificationTemplates.ts`: phase-aware notification templates (menstrual, follicular, ovulation, luteal, delayed period)
- `src/services/notificationScheduler.ts`: queries users due for notification (20h+ since last)
- `src/services/notificationService.ts`: FCM integration, invalid token cleanup
- `src/cron/notificationCron.ts`: hourly notification batch runner

### 5.6 Chat
- `src/controllers/chatController.ts`
  - gathers user/cycle/log context
  - sends bounded history + query to AI
  - persists user and assistant messages
- `src/services/aiService.ts`
  - structured prompts and response sanitation
  - optional behavior when `OPENAI_API_KEY` absent

---

## 6. API Surface and Contracts

### 6.1 Public and Protected Endpoints

Health:
- `GET /health`

Auth:
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/google`
- `POST /api/auth/refresh`

Protected (require `Authorization: Bearer <access_token>`):
- `GET /api/user/me`
- `PUT /api/user/profile`
- `GET /api/home`
- `GET /api/cycle/current`
- `POST /api/cycle/period-started`
- `GET /api/calendar?month=YYYY-MM`
- `GET /api/calendar/day-insight`
- `POST /api/logs`
- `GET /api/logs?date=YYYY-MM-DD`
- `GET /api/insights`
- `GET /api/insights/context`
- `GET /api/insights/forecast`
- `GET /api/health/patterns`
- `POST /api/chat`
- `GET /api/chat/history`
- `PUT /api/user/fcm-token`
- `PUT /api/logs/:id`
- `POST /api/logs/quick-check-in`
- `DELETE /api/cycle/period-started/:id`

Admin (API key protected):
- `POST /api/admin/send-notifications`

Canonical tables and examples: `readme.md` and `API.md`.

### 6.2 Response Strategy
- Consistent JSON responses.
- Client errors: explicit `4xx` with `{ error: string }`.
- Unhandled failures: `500` with message from global error handler.
- Route misses: `404` via `notFound`.

---

## 7. Request Flow Design

## 7.1 Auth Flow

**Email/password**

1. Client `POST /api/auth/register` with unique `email`, `password` (minimum 8 characters), and required profile fields (`name`, `age`, `height`, `weight`, `lastPeriodStart`, optional `cycleLength`). Email is normalized to lowercase.
2. Or client `POST /api/auth/login` with `email` + `password`. On success, credentials are verified with bcrypt against `User.passwordHash`.
3. API issues short-lived access JWT and long-lived refresh JWT; refresh row is stored in `RefreshToken`.

**Google**

1. Client completes Google Sign-In and obtains a Google **ID token** (audience must match server `GOOGLE_CLIENT_ID`).
2. Client `POST /api/auth/google` with `idToken` and the same profile fields as register (`name` optional; Google display name used if omitted). Server verifies the token via `google-auth-library`; Google email must be marked verified.
3. If `User` already exists for that `googleId`, tokens are issued. If a row exists for the same email with password only (no `googleId`), the API returns `409` to avoid silent account linking. Otherwise a user is created with `googleId` and without `passwordHash`.

**Common**

4. Protected APIs validate the access token in middleware (`requireAuth`).
5. Access token renewal uses `/api/auth/refresh`: verifies JWT + refresh type, confirms DB row exists and is valid, mints a new access token.

Security note: refresh-token rotation and explicit revoke endpoint are not yet implemented.

## 7.2 Log Ingestion and Retrieval

Create log:
1. Authenticated request reaches controller.
2. Payload is written to `DailyLog` with `userId` from token.
3. API returns created log.

If a log already exists for today, it is updated (upsert). Input validation enforces ranges: sleep (0-24), padsChanged (0-50), and whitelisted mood/stress/energy values. Log edits (PUT) verify ownership. All write operations invalidate InsightCache and HealthPatternCache.

Read logs:
1. Optional date query creates daily UTC range filter.
2. API fetches latest 30 logs ordered by date desc.
3. Returns array of logs for client rendering.

## 7.3 Insights Generation Flow

1. Check InsightCache for today (log cache hit/miss).
2. Fetch user profile, recent logs (7), baseline logs (90-day window).
3. Build cycle info, resolve cycle mode, prediction confidence.
4. Build insight context (signals, trends, interactions, deviations, priority drivers).
5. Generate rule-based insights (deterministic draft).
6. Apply confidence tier softening (0 logs → suggestive, 1-4 → reference-based, 5+ → assertive).
7. Detect primary insight cause (sleep_disruption / stress_led / stable / cycle) with spike protection.
8. Check for momentum break (positive streak disrupted by single bad day).
9. If OpenAI configured: GPT rewrite with 8s timeout, circuit breaker (5 failures → 5min cooldown).
10. Apply post-GPT softening + cleanup.
11. Apply insightGuard (8 deterministic guards — zero-data, direction, intensity, hallucination, technical, tomorrow, capitalization, consistency).
12. Build view, apply narrative overrides (sleep/stress/stable/momentum).
13. Cache result, log guard activity, record monitor entry.

## 7.4 Forecast Flow

1. Build same context used for insights.
2. If `checkForecastEligibility` fails, return warmup / locked payload (and cache it for the UTC day).
3. Else compute tomorrow outlook, next-phase preview, PMS block, etc.
4. Optionally call `generateForecastWithGpt` only when `logsCount >= 7`, mode is personalized, and confidence is not `low`.
5. Return forecast JSON (partially cached per UTC day; `transitionWarmup` recomputed on read when needed).

## 7.5 Chat Flow

1. Authenticated user sends question + optional short history.
2. API loads user profile, cycle state, and recent logs.
3. AI prompt includes contextual block + bounded conversation history.
4. AI response is sanitized.
5. Both user message and assistant reply are persisted.
6. Reply returned to client.

Failure fallback: when AI is not configured, chat returns a configuration guidance string.

---

## 8. Data Model Design

Prisma schema defines core entities (see `prisma/schema.prisma` for the full list, including `InsightCache`, `CycleHistory`, `HealthPatternCache`, etc.):

### 8.1 `User`
- identity: optional unique `email`, optional `passwordHash` (email/password users), optional unique `googleId` (Google users)
- profile: `name`, `age`, `height`, `weight`, `cycleLength` (default 28), `lastPeriodStart`, optional `contraceptiveMethod`, `cycleRegularity`, derived `cycleMode`, optional `fcmToken`, optional `contraceptionChangedAt` (contraception transition / warmup)
- owns logs, chat messages, refresh tokens, insight caches, memories, cycle history, health cache

### 8.2 `DailyLog`
- flexible daily wellness/behavior/symptom fields
- captures both qualitative strings and quantitative values (e.g. sleep, padsChanged)
- indexed by `(userId, date desc)` for recent access patterns

### 8.3 `ChatMessage`
- conversational transcript storage
- role-based entries (`user`, `assistant`)
- chronological retrieval for history endpoint

### 8.4 `RefreshToken`
- persisted refresh token state
- unique token constraint
- expiry + revocation metadata
- indexed by `(userId, createdAt desc)`

## 8.5 Relationship Model

```text
User (1) ---- (N) DailyLog
User (1) ---- (N) ChatMessage
User (1) ---- (N) RefreshToken
User (1) ---- (N) InsightCache
User (1) ---- (N) CycleHistory
... (see schema for InsightMemory, InsightHistory, HealthPatternCache)
```

On user deletion, dependent rows cascade delete.

---

## 9. Insights Subsystem Design

The insights subsystem is deterministic-first with optional AI enhancement:

Core stages:
1. signal normalization
2. trend/variability analysis
3. cross-signal interaction detection
4. baseline deviation comparison
5. priority driver resolution
6. deterministic narrative generation
7. optional constrained AI rewrite
8. post-generation guard layer (8 deterministic guards)
9. confidence-tier language enforcement
10. primary cause detection with spike protection

Key properties:
- explainable `basedOn` metadata returned to clients
- explicit confidence and onboarding progress for low-data users
- strict fallback guarantees when AI is unavailable/invalid
- Post-generation guard layer ensures zero-data users never see assertive state claims, even when GPT ignores prompt instructions (~30% failure rate)

For deeper rules and semantics, refer to `INSIGHTS_SYSTEM.md`.

---

## 10. Security Design

### 10.1 Authentication
- JWT Bearer auth on protected routes.
- Access token TTL is **1 day** (`ACCESS_TOKEN_TTL` in `src/utils/jwt.ts`).
- Refresh token validity is 30 days, persisted server-side.
- Passwords stored as bcrypt hashes; API responses never include `passwordHash`.
- Google Sign-In: ID tokens validated with `google-auth-library` and `GOOGLE_CLIENT_ID` as audience.
- Production error handler never leaks stack traces or internal error messages.

### 10.2 Authorization
- User scoping is enforced by `req.userId` in all data access paths.
- Controllers query by authenticated user context for row-level isolation.

### 10.3 Current Security Gaps (Known)
- No refresh token rotation on use.
- No dedicated logout/revoke endpoint in API.
- `JWT_SECRET` has a permissive dev fallback if env var missing.
- Google + email account linking for the same address is not supported (conflict returns `409`).

### 10.4 Recommended Upgrades
- optional passkey or OTP as additional factors
- implement token rotation + token family invalidation
- enforce strict env validation at startup
- add structured audit logging for auth events

### 10.5 Rate Limiting (Implemented)
| Scope | Limit | Window |
|-------|-------|--------|
| General API | 120 req | 1 min |
| Auth login/register | 30 req | 15 min |
| Google auth | 20 req | 15 min |
| Insights | 10 req | 1 min |
| Log writes | 30 req | 1 min |
| Chat | 60 req | 1 min |

### 10.6 Input Validation (Implemented)
- sleep: 0-24, padsChanged: 0-50
- age: 10-100, height: 50-300cm, weight: 20-500kg
- Whitelist validation for mood, energy, stress values
- Chat message length: max 2000 characters
- Future date rejection on lastPeriodStart and period-started
- Duplicate period guard (same-day detection)

---

## 11. Reliability and Error Handling

### 11.1 Degradation Strategy
- AI-dependent features never block core response generation.
- Deterministic insights are always available when logs exist.
- Chat has a clear non-AI fallback message.
- GPT circuit breaker: 5 consecutive failures → 5-minute cooldown, auto-recovery.
- 8-second timeout on all OpenAI calls.

### 11.2 Error Handling
- Synchronous route misses return `404`.
- Uncaught exceptions return `500` JSON error.
- Controllers explicitly return `400/401/404` for common cases.

### 11.3 Data Robustness
- Insight engine handles sparse logs via fallback mode.
- Trend calculations mark insufficient signal explicitly.
- Forecast confidence messaging adapts to data quality.

### 11.4 Observability
- Structured JSON request logging (method, path, status, duration, userId)
- GPT call duration and success/failure logging
- Insight cache hit/miss logging
- Period prediction accuracy logging (predicted vs actual date, error in days)
- Post-generation guard activity logging
- Insight monitor: GPT quality signals, guard rejection rate, pipeline timing

---

## 12. Performance and Scaling

### 12.1 Current Performance Characteristics
- Typical request paths are light-to-moderate DB reads.
- Insight endpoints perform multiple queries and in-memory analysis over small windows (5-30 logs).
- Chat and AI-enhanced insights depend on external OpenAI latency.
- InsightCache provides day-level TTL per user, avoiding repeat GPT calls.
- PgBouncer pooled connection (port 6543) for production.

### 12.2 Scaling Approach
- Horizontal scale API instances behind load balancer (stateless app layer).
- Keep JWT verification stateless for access tokens.
- Database remains shared state; optimize with indexes and query profiling.

### 12.3 Bottleneck Risks
- OpenAI call latency/timeouts affect user-perceived response times.
- High chat volume increases write load (two message inserts per request).
- Prisma client per-process concurrency must be monitored under burst traffic.

### 12.4 Optimizations to Consider
- cache cycle calculations per request/user where useful
- optionally queue chat persistence if write latency becomes visible

---

## 13. Deployment and Runtime Operations

### 13.1 Environment Configuration

Required/expected variables:
- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `GOOGLE_CLIENT_ID` (required for `POST /api/auth/google`; OAuth client ID whose tokens the app sends)
- `FIREBASE_SERVICE_ACCOUNT` (JSON string, for push notifications)
- `ADMIN_API_KEY` (for admin endpoints)
- `NODE_ENV` (controls error detail exposure: production vs development)
- optional: `OPENAI_API_KEY`, `OPENAI_MODEL`

### 13.2 Build and Run
- Dev: `npm run dev`
- Build: `npm run build`
- Prod run: `npm run start`

### 13.3 Data Lifecycle
- Prisma migrations evolve schema.
- Prisma client generated from schema.
- PostgreSQL is source of truth.

### 13.4 Operational Recommendations
- add readiness/liveness split beyond `/health`
- centralize structured logs (request-id correlated)
- capture error rates and latency by endpoint
- monitor AI call failure rate separately from API failures

---

## 14. Testing Strategy (Current and Target)

### 14.1 Current State
- Custom test runner for insightGuard: 179 tests (128 core + 51 edge cases)
- Covers all 28 cycle days × zero data, exact bad outputs from quality feedback, phase transitions, variable cycle lengths, high-data passthrough

### 14.2 Recommended Test Pyramid
- Unit tests:
  - cycle calculations
  - insight signal/trend/priority logic
  - JWT helper behavior
- Integration tests:
  - auth lifecycle (register/login/refresh)
  - protected route access and user scoping
  - log ingest and query filters
  - insights fallback vs AI-enhanced paths
- Contract tests:
  - response shape validation for client-critical endpoints

### 14.3 Synthetic/Operational Tests
- periodic health checks
- smoke tests against staging after deploy
- alerting on error-rate and p95 latency regressions

---

## 15. Extension Roadmap

Done (Short-term):
- ✅ notification service integration (FCM) — implemented
- ✅ rate limits and auth event monitoring — implemented

Short-term:
- logout + refresh revoke endpoint
- scheduled check-ins via cron/worker (notification cron exists, check-in scheduling planned)

Medium-term:
- richer user baseline modeling across cycles
- multi-day forecast beyond tomorrow
- better observability instrumentation
- idempotency and replay protections for critical writes

Long-term:
- event-driven architecture for analytics and personalization pipelines
- feature flags for iterative model/prompt rollout
- privacy governance enhancements (retention, export, deletion tooling)

---

## 16. Architecture Decision Notes

1. **Deterministic-first insights**  
   Chosen to maintain explainability and reliability independent of AI services.

2. **Controller-centric persistence access**  
   Current code directly uses Prisma in controllers for speed of development; repository abstraction can be introduced when complexity grows.

3. **JWT + persisted refresh tokens**  
   Balances stateless access checks with server-side refresh token control.

4. **Single service deployment**  
   Simpler operational model for current product stage; can evolve into split services once load/ownership boundaries justify it.

---

## 17. Summary

Vyana backend is a modular monolithic API optimized for rapid product iteration with deterministic health insight quality and optional AI enhancement. The core architecture is sound for current scope: clear route/controller/service layering, user-scoped data access, email/password and Google-backed authentication, explainable insights, and practical fallback behavior. The highest-impact next improvements are token lifecycle hardening (rotation, revoke), broader automated test coverage, and advanced observability (distributed tracing, alerting dashboards).
