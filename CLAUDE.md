# CLAUDE.md — Vyana Backend: Master Operating Manual

> **Read this entire file before writing any code.**
> This is the single source of truth for all Claude Code sessions on Vyana's backend.
> 
> **Supporting documents (read when referenced):**
> - `EDGE_CASES_MASTER.md` — 232 edge cases across 17 lifecycle stages
> - `EDGE_CASES_ADVANCED.md` — trust breakers, recovery, system stress, learning integrity
> - `INSIGHT_LANGUAGE_FIX.md` — zero-data vs personalized language tier system
> - `SPRINT_LAUNCH.md` — 20-task execution plan with Claude Code prompts
>
> **Execution rule:** One task at a time → verify → commit → next task. Never batch.

---

## 1. WHAT VYANA IS

Vyana is a menstrual health companion app. Phase 1 delivers:
- **Period tracking** with adaptive cycle prediction
- **Daily logging** (mood, energy, sleep, stress, symptoms, flow)
- **AI-generated daily insights** — personalized to logged data, not generic phase text
- **Forecasting** — tomorrow preview, next-phase preview, PMS symptom forecast
- **Health pattern detection** — PMDD, PCOS indicators, endometriosis, iron deficiency
- **Chat** — conversational AI (Vyana persona) with intent classification
- **Calendar** — full month view with per-day insight cards
- **Home screen** — phase-aware content with quick-log fields
- **Contraception-aware engine** — hormonal vs natural cycle mode switching
- **Contraception transition handling** — mid-cycle method changes with full reset

Design principle: **"This app knows me."** Every insight must feel specific to the individual user.

---

## 2. TECH STACK

| Layer | Technology |
|---|---|
| Runtime | Node.js + TypeScript |
| Framework | Express.js |
| ORM | Prisma |
| Database | PostgreSQL (Supabase) |
| AI | OpenAI GPT-4o-mini |
| Auth | JWT (access + refresh tokens) + Google OAuth |

**Key files:**
- `prisma/schema.prisma` — database schema
- `src/services/cycleEngine.ts` — phase calculation, cycle mode
- `src/services/insightService.ts` — rule-based insights + context building
- `src/services/insightGptService.ts` — GPT rewriting + guard pipeline
- `src/services/vyanaContext.ts` — multi-layer context (identity, anticipation, delight, surprise, emotional memory)
- `src/services/contraceptionengine.ts` — contraception type resolution + behavioral rules
- `src/services/contraceptionTransition.ts` — mid-cycle method change handling
- `src/services/correlationEngine.ts` — cross-signal pattern detection
- `src/services/healthPatternEngine.ts` — multi-cycle health alert detection
- `src/controllers/insightController.ts` — main insight pipeline orchestrator

---

## 3. THE INSIGHT LANGUAGE PRINCIPLE

**This is the most important design rule in the system.**

The voice changes based on how much data we have:

| Data Level | Voice | Example |
|---|---|---|
| **0 logs** | Suggestive, phase-educational | "Energy can still feel lower toward the end of your period" |
| **1-4 logs** | References actual data, no trend claims | "Your latest log shows lower energy" |
| **5+ logs** | Assertive, evidence-based, personal | "Your sleep has dropped from 7h to 5h — that's what's driving how you feel" |

**NEVER assert a user's current state without data to support it.**

For zero-data users:
- ✅ "This phase tends to bring lower energy"
- ❌ "Energy is noticeably lower today"
- ✅ "Focus might not be at its peak yet"
- ❌ "Focus is lower today"
- ✅ "Many people notice emotional sensitivity easing around this time"
- ❌ "Small things feel easier today"

See `INSIGHT_LANGUAGE_FIX.md` for full implementation spec.

---

## 4. THE THREE CRITICAL USER SCENARIOS

Every code change must be tested against these three scenarios.

### SCENARIO A: Regular user, period doesn't come

User told us 28-day cycle. Today is day 29, 30, 31+ — she hasn't logged a new period.

**Current bug:** Cycle day wraps via modulo. Day 29 → shows "Day 1 · Period". User isn't menstruating.

**Required behavior:**
- `cycleDay` should NOT wrap. Day 31 of a 28-day cycle = `cycleDay: 31`
- `phase` should stay `"luteal"` (last phase before expected period)
- `isPeriodDelayed: true` with tiered messaging:
  - 1-3 days: "This can happen — stress, travel, diet can shift things"
  - 4-7 days: "If you're concerned, a pregnancy test or doctor visit might help"
  - 8-14 days: "Your period is significantly late. Consider seeing a doctor."
  - 15+ days: "Your period is more than two weeks late. We'd recommend seeing a doctor."
- Include `periodAction: { show: true, label: "Has your period started?" }`

### SCENARIO B: Irregular period user

User selects `cycleRegularity: "irregular"`. Cycles range 21-45 days.

**Required behavior:**
- Delayed period detection DISABLED (can't say "late" when you don't know "expected")
- Phase labels suppressed or marked as estimated when < 2 completed cycles
- Extended cycle notice when day 45+: "It's been a while since your last period"
- Anticipation layer suppressed (no forward predictions for irregular users)
- Language softened: "around this time" instead of "today"

### SCENARIO C: Hormonal contraception user

User selects `contraceptiveMethod: "pill"` (or `iud_hormonal`, `implant`, `injection`, `patch`, `ring`, `mini_pill`) — at registration OR mid-cycle.

**Required behavior:**
- ALL phase/hormone language suppressed across ALL screens
- Home: "Your day, your patterns" — no phase labels, no fertility info
- Calendar: `phase: null`, no phase colors, no ovulation/period markers
- Insights: pattern-based tone, 60+ regex hormone language stripped
- Quick log: mood, energy, fatigue, pain — same every day (no phase-specific fields)
- `periodStarted`: creates CycleHistory with `cycleLength: null` (withdrawal bleed, not biological)
- Mid-cycle switch: full cache clear, baseline reset, 14-day warmup messaging

---

## 5. KNOWN BUGS — CURRENT STATE

### P0 — Must fix (breaks user trust)

| # | Bug | File | Status |
|---|---|---|---|
| 1 | Cycle day wraps via modulo past cycleLength | `cycleEngine.ts` | ❌ Open |
| 2 | InsightCache not cleared on periodStarted | `cycleController.ts` | ❌ Open |
| 3 | Hormonal user periodStarted creates invalid CycleHistory with cycleLength | `cycleController.ts` | ❌ Open |
| 4 | No future date validation on lastPeriodStart | `authController.ts`, `userController.ts` | ❌ Open |
| 5 | No duplicate log prevention | `logController.ts` | ❌ Open |
| 6 | Error handler leaks stack traces in production | `errorHandler.ts` | ❌ Open |
| 7 | Chat message has no length limit | `chatController.ts` | ❌ Open |
| 8 | Zero-data insights use assertive language (sounds like we know her state) | `insightService.ts`, `insightGptService.ts` | ❌ Open |

### P1 — Should fix (degrades experience)

| # | Bug | File |
|---|---|---|
| 9 | No tiered delayed period messaging (1-3 / 4-7 / 8-14 / 15+ days) | `insightController.ts`, `homeController.ts` |
| 10 | Single-day spike flips entire insight narrative | `insightCause.ts` |
| 11 | One bad day erases positive streak (no momentum protection) | `insightService.ts` |
| 12 | Home screen is phase-only, doesn't reflect actual logged signals | `homeController.ts` |
| 13 | No log edit endpoint | `logController.ts` |
| 14 | No period-started undo endpoint | `cycleController.ts` |
| 15 | No rate limiting on insights/logs/home/calendar | route files |
| 16 | No GPT timeout or circuit breaker | `insightGptService.ts` |
| 17 | No input validation on sleep/pads/age ranges | `logController.ts`, `authController.ts` |

---

## 6. EXECUTION PLAN — 20 TASKS

**Pre-sprint check:**
```bash
npx tsc --noEmit
npx prisma validate
npx prisma generate
```

### PHASE 1: P0 BUG FIXES (Tasks 1-8) — Days 1-4

**Task 1: Fix cycle day modulo wrapping**
- File: `src/services/cycleEngine.ts` → `calculateCycleInfoForDate()`
- Fix: When `diffDays >= cycleLength`, don't wrap. `currentDay = diffDays + 1`, `phase = "luteal"`
- Verify: Day 31 of 28-day cycle → `cycleDay: 31`, `phase: "luteal"`, `isPeriodDelayed: true`
- Ref: EDGE_CASES_MASTER #88-90

**Task 2: Clear InsightCache on periodStarted**
- File: `src/controllers/cycleController.ts` → `periodStarted()`
- Fix: Add `await prisma.insightCache.deleteMany({ where: { userId: req.userId! } })` after user update
- Also: Return fresh cycleInfo in response (cycleDay: 1, phase: "menstrual")
- Verify: Log period → GET /api/insights → shows day 1 menstrual, not stale cache
- Ref: EDGE_CASES_MASTER #76

**Task 3: Fix hormonal user periodStarted**
- File: `src/controllers/cycleController.ts` → `periodStarted()`
- Fix: When `cycleMode === "hormonal"`, create CycleHistory with `cycleLength: null`, skip closing previous cycle with calculated length
- Verify: Hormonal user logs period → CycleHistory.cycleLength is null
- Ref: EDGE_CASES_MASTER #85, #134

**Task 4: Validate lastPeriodStart not in future**
- Files: `src/controllers/authController.ts` (register + googleAuth), `src/controllers/userController.ts` (updateProfile)
- Fix: Reject if `parsedDate > new Date()` or `isNaN(parsedDate.getTime())`
- Verify: Register with future date → 400 error

**Task 5: Prevent duplicate logs**
- File: `src/controllers/logController.ts` → `saveLog()`
- Fix: Check for existing log today. If exists, UPDATE (merge fields). If not, CREATE.
- Verify: POST /api/logs twice same day → one DailyLog entry

**Task 6: Error handler production safety**
- File: `src/middleware/errorHandler.ts`
- Fix: If `NODE_ENV === "production"`, return "Internal server error" — never err.message
- Verify: Production mode error → generic message only

**Task 7: Chat message length limit**
- File: `src/controllers/chatController.ts` → `chat()`
- Fix: Reject messages > 2000 characters with 400
- Verify: 5000-char message → 400 error

**Task 8: Zero-data insight language tier system**
- Files: `src/services/insightService.ts`, `src/services/insightGptService.ts`, `src/controllers/insightController.ts`
- Fix: Implement `softenForConfidenceTier()` — see `INSIGHT_LANGUAGE_FIX.md` for full spec
  - 0 logs: suggestive voice ("Energy can still feel lower")
  - 1-4 logs: references actual data, no trend claims
  - 5+ logs: assertive, evidence-based (current behavior — no change)
- Also: Add zero-data instruction block to GPT system prompt when logsCount === 0
- Verify: Zero-log user GET /api/insights → no "Energy is lower today", no "Focus is lower today"
- Ref: INSIGHT_LANGUAGE_FIX.md (read fully before implementing)

**After Tasks 1-8: Checkpoint verification**
```bash
npx tsc --noEmit
npx prisma validate
```
Test all three scenarios (A, B, C) manually.

---

### PHASE 2: RECOVERY ENDPOINTS (Tasks 9-11) — Days 5-6

**Task 9: Log edit endpoint**
- Files: `src/controllers/logController.ts`, `src/routes/logs.ts`
- Add: `PUT /api/logs/:id` — find log, verify ownership, update provided fields, invalidate caches
- Verify: Create log → edit it → GET /api/insights → reflects updated data
- Ref: EDGE_CASES_ADVANCED R1

**Task 10: Period-started undo endpoint**
- Files: `src/controllers/cycleController.ts`, `src/routes/cycle.ts`
- Add: `DELETE /api/cycle/period-started/:id` — delete entry, reopen previous cycle, restore lastPeriodStart, clear caches
- Verify: Log period → undo → lastPeriodStart restored to previous cycle's startDate
- Ref: EDGE_CASES_ADVANCED R2

**Task 11: Quick check-in endpoint**
- Files: `src/controllers/logController.ts`, `src/routes/logs.ts`
- Add: `POST /api/logs/quick-check-in` — accepts partial fields, upserts today's log, validates ranges
- Verify: Send `{ mood: "good", sleep: 7 }` → creates/updates log → returns fieldsLogged
- Ref: Previous conversation about engagement strategy

---

### PHASE 3: TRUST PROTECTION (Tasks 12-14) — Days 7-9

**Task 12: Single-day spike protection**
- File: `src/services/insightCause.ts` → `detectPrimaryInsightCause()`
- Fix: Require 2+ of last 3 days with poor sleep before declaring "sleep_disruption". Same for stress_led.
- Verify: User with 5 good days + 1 bad night → primary cause is "cycle" not "sleep_disruption"
- Ref: EDGE_CASES_ADVANCED T8

**Task 13: Momentum protection**
- File: `src/services/insightService.ts`
- Add: `detectMomentumBreak()` — when 4+ positive days are followed by 1 negative day, frame as "today is rougher than your recent streak" instead of full negative narrative
- Verify: 5 good days then 1 stressed day → insight says "rougher than recent streak" not "stress has been building"
- Ref: EDGE_CASES_ADVANCED T15

**Task 14: Signal-aware home screen**
- File: `src/controllers/homeController.ts`
- Fix: When user has 3+ recent logs, home headline should reflect actual signal state, not just phase defaults. If phase says "low energy" but logs show positive signals → home should reflect the positive reality.
- Verify: Menstrual user with mood: "good", energy: "high" → home doesn't say "You might feel low energy"
- Ref: EDGE_CASES_ADVANCED T2, T13, T16, T21

---

### PHASE 4: OBSERVABILITY (Task 15) — Day 10

**Task 15: Production monitoring baseline**
- New file: `src/middleware/requestLogger.ts` — log method, path, status, duration, userId
- Update: `src/services/insightGptService.ts` — log GPT call duration, success/failure
- Update: `src/controllers/insightController.ts` — log cache hit/miss
- Update: `src/controllers/cycleController.ts` → `periodStarted()` — log prediction accuracy (predicted vs actual period date)
- Verify: Server logs show structured JSON for each request
- Ref: EDGE_CASES_ADVANCED S3

---

### PHASE 5: DEFENSIVE HARDENING (Tasks 16-17) — Days 11-12

**Task 16: Input validation**
- Files: `src/controllers/logController.ts`, `src/controllers/authController.ts`
- Fix: Validate sleep (0-24), padsChanged (0-50), age (10-100), height (50-300), weight (20-500). Whitelist valid mood/stress/energy values.
- Verify: sleep: -5 → 400 error. sleep: 25 → 400 error. mood: "hacked" → 400 error.
- Ref: EDGE_CASES_MASTER #59-63

**Task 17: Rate limiting + GPT timeout + circuit breaker**
- Files: `src/middleware/rateLimit.ts`, route files, `src/services/insightGptService.ts`
- Fix: Add insightLimiter (10/min), logLimiter (30/min), generalLimiter (60/min). Add 8s timeout on OpenAI calls. Add circuit breaker (5 failures → 5min cooldown). Add authLoginRegisterLimiter to Google auth route.
- Verify: Rapid insight requests → 429 after limit. GPT timeout → draft served within 8s.
- Ref: EDGE_CASES_MASTER #221-222, ADVANCED S1, S3, S4

---

### PHASE 6: NOTIFICATION BACKEND (Tasks 18-20) — Days 13-14

**Task 18: Notification templates + scheduler**
- New files: `src/services/notificationTemplates.ts`, `src/services/notificationScheduler.ts`
- Phase-aware templates: menstrual ("How's your flow?"), follicular ("How's your energy?"), luteal ("How are you holding up?"), delayed ("Has your period started?")
- Scheduler: query users due for notification (fcmToken not null, last sent 20+ hours ago)
- Verify: `getNotificationForUser(phase, cycleDay)` returns correct template per phase

**Task 19: Notification sending service**
- New file: `src/services/notificationService.ts`
- FCM integration for sending push notifications
- New endpoint: `PUT /api/user/fcm-token` — update user's FCM token
- Update: `src/routes/user.ts` to add route
- Verify: Valid FCM token → notification sent successfully

**Task 20: Notification cron + schema update**
- New file: `src/cron/notificationCron.ts`
- Schema: Add `lastNotificationSentAt DateTime?` to User model
- Migration: `npx prisma migrate dev --name add_notification_fields`
- Admin endpoint: `POST /api/admin/send-notifications` (API key protected)
- Verify: Cron runs → users receive phase-appropriate notifications

---

## 7. VERIFICATION PROTOCOL

**After EVERY task:**
```bash
npx tsc --noEmit          # must pass
npx prisma validate       # must pass (if schema changed)
```

**After each phase (every 2-3 days):**
Test all three scenarios:

**Scenario A:** User with lastPeriodStart 32 days ago, cycleLength 28
- GET /api/home → `isPeriodDelayed: true`, cycleDay > 28, NOT "Day 4 · menstrual"
- GET /api/insights → late period messaging

**Scenario B:** User with `cycleRegularity: "irregular"`, 0 completed cycles
- GET /api/home → `isIrregular: true`, softened language
- GET /api/insights → suggestive voice (Tier 1)

**Scenario C:** User with `contraceptiveMethod: "pill"`
- GET /api/home → "Your day, your patterns"
- GET /api/insights → no estrogen/progesterone/ovulation/follicular/luteal language
- POST /api/cycle/period-started → CycleHistory.cycleLength is null

**Scenario D (NEW):** Zero-log natural user, cycle day 5
- GET /api/insights → "Energy can still feel lower" NOT "Energy is noticeably lower today"
- No field repeats the same idea (energy not mentioned in both physical and mental)
- No technical hormone terms in user-facing fields

**After all 20 tasks:**
```bash
npx ts-node src/testRunner/runTestCases.ts --source generated --batch 50 --out test-results-final.json
npx ts-node src/testRunner/validateResults.ts --in test-results-final.json
```
Expected: 100% no-crash, >99% phase correctness, 100% no forbidden language.

---

## 8. FILE CHANGE RULES

1. **Never modify migration SQL files** — they are immutable history
2. **Always `npx prisma validate` after schema changes**
3. **Always `npx tsc --noEmit` after any TypeScript change**
4. **When changing insightService.ts or insightGptService.ts**, run 50+ test cases
5. **When changing contraceptionengine.ts or contraceptionTransition.ts**, verify hormonal AND natural paths
6. **When adding a new endpoint**, add to routes AND update this document
7. **When adding a new Prisma model**, add appropriate indexes
8. **Read INSIGHT_LANGUAGE_FIX.md before touching any insight text generation**

---

## 9. ENDPOINTS (Phase 1)

| Screen | Endpoint | Controller |
|---|---|---|
| Home | `GET /api/home` | homeController.ts |
| Calendar (month) | `GET /api/calendar?month=YYYY-MM` | calendarController.ts |
| Calendar (day tap) | `GET /api/calendar/day-insight?date=YYYY-MM-DD` | calendarController.ts |
| Daily Insights | `GET /api/insights` | insightController.ts |
| Insight Context | `GET /api/insights/context` | insightController.ts |
| Forecast | `GET /api/insights/forecast` | insightController.ts |
| Quick Log Config | `GET /api/logs/quick-log-config` | logController.ts |
| Save Log | `POST /api/logs` | logController.ts |
| Get Logs | `GET /api/logs` | logController.ts |
| Quick Check-In | `POST /api/logs/quick-check-in` | logController.ts (Task 11) |
| Edit Log | `PUT /api/logs/:id` | logController.ts (Task 9) |
| Current Cycle | `GET /api/cycle/current` | cycleController.ts |
| Period Started | `POST /api/cycle/period-started` | cycleController.ts |
| Undo Period | `DELETE /api/cycle/period-started/:id` | cycleController.ts (Task 10) |
| Health Patterns | `GET /api/health/patterns` | healthController.ts |
| Chat | `POST /api/chat` | chatController.ts |
| Chat History | `GET /api/chat/history` | chatController.ts |
| Get Profile | `GET /api/user/me` | userController.ts |
| Update Profile | `PUT /api/user/profile` | userController.ts |
| Update FCM Token | `PUT /api/user/fcm-token` | notificationController.ts (Task 19) |
| Register | `POST /api/auth/register` | authController.ts |
| Login | `POST /api/auth/login` | authController.ts |
| Google Auth | `POST /api/auth/google` | authController.ts |
| Refresh Token | `POST /api/auth/refresh` | authController.ts |
| Send Notifications | `POST /api/admin/send-notifications` | notificationController.ts (Task 20) |

---

## 10. SUPPORTING DOCUMENTS

| Document | What it covers | When to read |
|---|---|---|
| `EDGE_CASES_MASTER.md` | 232 edge cases: registration, logging, cycles, insights, contraception, calendar, forecast, chat, auth, timing, concurrency, GPT, long-term usage | Before any logic change |
| `EDGE_CASES_ADVANCED.md` | Trust breakers (21 scenarios), recovery (13), system stress (14), learning integrity (16) | Before any insight/UX change |
| `INSIGHT_LANGUAGE_FIX.md` | Three-tier language system, zero-data rules, implementation spec, testing checklist | Before touching any insight text |
| `SPRINT_LAUNCH.md` | Full Claude Code prompts for all 20 tasks | During execution |

---

## 11. POST-LAUNCH BACKLOG (v1.1)

Prioritize based on real user data:

| Priority | Task | Trigger |
|---|---|---|
| 1 | Phase transition bridging language | Users confused by sudden tone shifts |
| 2 | Inactivity detection + graduated messaging | DAU/MAU dropping |
| 3 | Cross-cycle narrative staleness detection | Users with 3+ months of data |
| 4 | Prediction accuracy feedback loop | Period predictions consistently off |
| 5 | Insight thumbs up/down | Need qualitative feedback |
| 6 | Outlier detection on logged values | Users reporting wrong insights from bad data |
| 7 | Cycle length trend detection | Users whose cycles are lengthening/shortening |
| 8 | Chronic stress elevation detection | Sustained stress not acknowledged |
| 9 | Apple Health / Google Health Connect | Auto-import sleep data |
| 10 | iOS/Android home screen widget | Passive engagement |
| 11 | Prisma transactions on periodStarted | Data consistency under failure |
| 12 | Welcome-back flow for inactive users | Users returning after weeks/months |