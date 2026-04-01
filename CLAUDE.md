# CLAUDE.md — Vyana Backend (Phase 1)

> **Purpose**: This file is the single source of truth for any Claude Code session working on Vyana's backend. Read it fully before writing any code. Follow every protocol. Skip nothing.

---

## 1. WHAT VYANA IS

Vyana is a menstrual health companion app. Phase 1 delivers:
- **Period tracking** with adaptive cycle prediction
- **Daily logging** (mood, energy, sleep, stress, symptoms, flow, etc.)
- **AI-generated daily insights** — personalized to logged data, not generic phase text
- **Forecasting** — tomorrow preview, next-phase preview, PMS symptom forecast
- **Health pattern detection** — PMDD, PCOS indicators, endometriosis, iron deficiency
- **Chat** — conversational AI (Vyana persona) with intent classification
- **Calendar** — full month view with per-day insight cards
- **Home screen** — phase-aware content with quick-log fields
- **Contraception-aware engine** — hormonal vs natural cycle mode switching
- **Contraception transition handling** — mid-cycle method changes with cache/baseline reset

The design principle: **"This app knows me."** Every insight must feel specific to the individual user. Generic phase-based text is the fallback, not the goal.

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
- `prisma/schema.prisma` — database schema (source of truth)
- `src/index.ts` — Express app entry point
- `src/services/cycleEngine.ts` — phase calculation, cycle mode detection
- `src/services/insightService.ts` — rule-based insight generation + context building
- `src/services/insightGptService.ts` — GPT rewriting of insights
- `src/services/vyanaContext.ts` — multi-layer VyanaContext builder (identity, anticipation, delight, surprise, emotional memory)
- `src/services/contraceptionengine.ts` — contraception type resolution + behavioral rules
- `src/services/contraceptionTransition.ts` — mid-cycle method change handling
- `src/services/correlationEngine.ts` — cross-signal pattern detection
- `src/services/healthPatternEngine.ts` — multi-cycle health alert detection
- `src/controllers/insightController.ts` — main insight pipeline orchestrator

---

## 3. ARCHITECTURE — HOW INSIGHTS FLOW

```
User opens app → GET /api/insights
  │
  ├─ Check InsightCache (same UTC day?) → return cached if fresh
  │
  ├─ getUserInsightData() → parallel fetch: User + last 90 days of DailyLogs
  │    ├─ recentLogs = first 7
  │    ├─ baselineLogs = remaining
  │    ├─ numericBaseline = weighted averages + deltas
  │    └─ crossCycleNarrative = same-day-window comparison across past 6 cycles
  │
  ├─ Cycle calculation
  │    ├─ getCyclePredictionContext() → avg length from CycleHistory
  │    ├─ calculateCycleInfo() → current day, phase, days until next phase/period
  │    ├─ getCycleMode() → natural | hormonal | irregular
  │    └─ Delayed period detection
  │
  ├─ buildInsightContext() → signals, trends, drivers, confidence
  │    ├─ Stable state detection (isStableInsightState)
  │    ├─ Primary cause detection (sleep_disruption | stress_led | cycle | stable)
  │    └─ Priority driver ranking (13 possible drivers, scored)
  │
  ├─ generateRuleBasedInsights() → deterministic draft (7 fields)
  │
  ├─ Correlation engine → cross-signal patterns (7 patterns)
  │
  ├─ Narrative overlays
  │    ├─ Hormonal language injection (natural cycle only)
  │    ├─ Hormonal language stripping (hormonal contraception)
  │    ├─ Irregular cycle softening
  │    ├─ Delayed period override
  │    ├─ Cross-cycle narrative injection
  │    ├─ Sleep disruption narrative (when sleep is primary cause)
  │    ├─ Stress-led narrative
  │    └─ Stable state narrative
  │
  ├─ buildVyanaContextForInsights() → multi-layer context for GPT
  │    ├─ Core layer: high-weight factual signals
  │    ├─ Narrative layer: identity + trends
  │    ├─ Enhancement layer: surprise OR anticipation (max 1)
  │    └─ Emotional layer: emotional memory OR delight (max 1)
  │
  ├─ generateInsightsWithGpt() → GPT rewrites draft → guard pipeline
  │    ├─ Length guard (max 2.5x draft)
  │    ├─ Sentence guard (max 3 per field)
  │    ├─ Strength regression guard
  │    ├─ Forbidden language check
  │    ├─ Vague language fix
  │    ├─ Unearned identity/memory/historical claim removal
  │    ├─ Phase-specific discipline (menstrual, ovulation, etc.)
  │    └─ Confidence-based tone sharpening/softening
  │
  ├─ Memory fallback overrides (when GPT didn't improve)
  │
  ├─ View layer → buildInsightView() → primary + supporting + action
  │
  ├─ Cache write → InsightCache
  ├─ InsightHistory write
  ├─ InsightMemory upsert
  └─ Monitor log
```

---

## 4. SCREENS & ENDPOINTS (Phase 1)

| Screen | Endpoint | Controller |
|---|---|---|
| Home | `GET /api/home` | homeController.ts |
| Calendar (month) | `GET /api/calendar?month=YYYY-MM` | calendarController.ts |
| Calendar (day tap) | `GET /api/calendar/day-insight?date=YYYY-MM-DD` | calendarController.ts |
| Daily Insights | `GET /api/insights` | insightController.ts |
| Insight Context (debug) | `GET /api/insights/context` | insightController.ts |
| Forecast | `GET /api/insights/forecast` | insightController.ts |
| Quick Log Config | `GET /api/logs/quick-log-config` | logController.ts |
| Save Log | `POST /api/logs` | logController.ts |
| Get Logs | `GET /api/logs` | logController.ts |
| Current Cycle | `GET /api/cycle/current` | cycleController.ts |
| Period Started | `POST /api/cycle/period-started` | cycleController.ts |
| Health Patterns | `GET /api/health/patterns` | healthController.ts |
| Chat | `POST /api/chat` | chatController.ts |
| Chat History | `GET /api/chat/history` | chatController.ts |
| Get Profile | `GET /api/user/me` | userController.ts |
| Update Profile | `PUT /api/user/profile` | userController.ts |
| Register | `POST /api/auth/register` | authController.ts |
| Login | `POST /api/auth/login` | authController.ts |
| Google Auth | `POST /api/auth/google` | authController.ts |
| Refresh Token | `POST /api/auth/refresh` | authController.ts |

---

## 5. THE THREE CRITICAL USER SCENARIOS

These are the three hardest user scenarios in Phase 1. Every Claude Code session working on cycle/insight logic MUST understand these deeply.

---

### SCENARIO A: REGULAR USER — PERIOD DOESN'T COME ON EXPECTED DAY

**What the user experiences:** She told us her cycle is 28 days. Today is day 29, 30, 31... and she hasn't logged a new period.

**How the code currently handles it:**

```
// In insightController.ts, homeController.ts, calendarController.ts:
const rawDiffDays = utcDayDiff(now, user.lastPeriodStart);
const daysOverdue = Math.max(0, rawDiffDays - effectiveCycleLength);
const isPeriodDelayed =
  daysOverdue > 0 &&
  cyclePrediction.confidence !== "irregular" &&
  cycleMode !== "hormonal";
```

When `isPeriodDelayed` is true:

| Screen | What changes |
|---|---|
| **Home** | Title: "Your period is X days late" / "X days late". Subtitle: reassurance based on irregular vs regular. CTA: "Log how you're feeling" |
| **Insights** | `physicalInsight` overridden: ≤3 days gentle, >3 days mentions doctor. `emotionalInsight` overridden with uncertainty validation. `whyThisIsHappening` overridden with explanation. `tomorrowPreview` overridden with "keep logging" message. |
| **Calendar** | Days past expected period: `isPeriodDelayed: true`. Today's insight card shows late period messaging. |
| **Forecast** | Not directly affected (forecasts use effectiveCycleLength). |

**BUG — CYCLE DAY WRAPPING (MUST FIX):**

The phase calculation uses modulo arithmetic:
```typescript
// cycleEngine.ts calculateCycleInfoForDate()
const normalized = ((diffDays % cycleLength) + cycleLength) % cycleLength;
const currentDay = normalized + 1;
```

On day 29 of a 28-day cycle, `currentDay` wraps to **1**. On day 30, it wraps to **2**. The `isPeriodDelayed` flag is set correctly, but:
- `phase` returns `"menstrual"` (day 1-5 = menstrual) — WRONG, she is NOT menstruating
- `cycleDay` returns `1` — confusing when combined with `isPeriodDelayed: true`
- Calendar shows "Day 1 · Period" while also showing "Your period is 2 days late"

**REQUIRED FIX:**
File: `src/services/cycleEngine.ts` → `calculateCycleInfoForDate()`
When `diffDays >= cycleLength`, don't wrap. Keep `currentDay = diffDays + 1` and `phase = "luteal"` (last known phase before expected period).
Verify: User on day 31 of 28-day cycle → `cycleDay: 31`, `phase: "luteal"`, `isPeriodDelayed: true`

**GAP — NO ESCALATION FOR VERY LATE PERIODS:**

Current behavior: same messaging whether 1 day late or 30 days late.

**REQUIRED FIX:**
File: `src/controllers/insightController.ts` (delayed period override block), `src/controllers/homeController.ts` (buildContent delayed block)
Add tiered messaging:
- 1-3 days late: "This can happen — stress, travel, diet can shift things"
- 4-7 days late: "If you're concerned, a pregnancy test or doctor visit might help"
- 8-14 days late: "Your period is significantly late. Consider a pregnancy test or checking in with your doctor."
- 15+ days late: "Your period is more than two weeks late. We'd recommend seeing a doctor."
Verify: User 15 days late → messaging mentions doctor, not just "stress can cause this"

**GAP — NO "PERIOD ARRIVED" PROMPT:**

When period is late, no prominent "Has your period started?" action. User has to navigate to period-started themselves.

**REQUIRED FIX:**
File: `src/controllers/homeController.ts`, `src/controllers/insightController.ts`
When `isPeriodDelayed: true`, response includes:
```json
{ "periodAction": { "show": true, "label": "Has your period started?", "ctaText": "Log period" } }
```

---

### SCENARIO B: USER SELECTS IRREGULAR PERIOD

**What the user experiences:** During registration or profile update, she selects `cycleRegularity: "irregular"`. Her cycles might range from 21-45 days.

**How the code currently handles it:**

```typescript
// cycleEngine.ts getCycleMode()
if (user.cycleRegularity === "irregular") return "irregular";
```

When `cycleMode === "irregular"`:

| Feature | Behavior |
|---|---|
| Phase calculation | Still runs using `effectiveCycleLength` (avg of past cycles or user-reported) |
| Confidence | `detectCycleIrregularity()` returns `"variable"` or `"irregular"` |
| Delayed period | DISABLED — `isPeriodDelayed` always false when confidence is `"irregular"` |
| Insight language | Softened: "this phase" → "this part of your cycle", "today" → "around this time" |
| Home subtitle | `isIrregular: true` → "Your cycle tends to vary — this is an estimate" |
| Calendar | Phases shown with `cyclePredictionConfidence: "irregular"` |
| Hormone state | `confidence: "approximated"` with caveat |
| Anticipation | Completely suppressed (returns null) |

**BUG — PHASE PREDICTIONS STILL SHOWN FOR IRREGULAR USERS:**

Even with `cycleRegularity: "irregular"`, phases are calculated and displayed. For a user whose cycles range 21-45 days, "Day 14 · Ovulation" could be completely wrong — her ovulation might be on day 7 or day 31.

**REQUIRED FIX (Conservative approach):**
File: All controllers that display phase labels
When `cyclePrediction.confidence === "irregular"`, suppress specific phase labels:
- Instead of "Day 14 · Ovulation", show "Day 14"
- Instead of phase-specific home content, show pattern-based content (same path as hormonal users)
- Calendar: show cycle days but no phase colors
Verify: Irregular user → no "Ovulation" or "Follicular phase" labels shown

**GAP — NO "LEARNING" STATE FOR IRREGULAR USERS WITH 0-1 CYCLES:**

Irregular user with 0 completed cycles sees phase predictions based on self-reported length with no data backing.

**REQUIRED FIX:**
File: All controllers
Add `isLearning` flag: `(cycleMode === "irregular" || confidence === "irregular") && completedCycleCount < 2`
When `isLearning`:
- Home: "We're learning your cycle — keep logging and predictions will sharpen"
- Insights: Pattern-based (like hormonal path) instead of phase-based
- Calendar: Cycle days shown, no phase colors or labels
- Forecast: Locked with "Log 2 full cycles and we'll build your forecast"
Verify: Irregular user, 0 cycles → "learning" messaging, no phase labels

**GAP — NO EXTENDED CYCLE NOTICE FOR IRREGULAR USERS:**

Delayed period detection is disabled for irregular users. But an irregular user on day 50+ gets NO notice at all.

**REQUIRED FIX:**
File: `src/controllers/homeController.ts`, `src/controllers/insightController.ts`
Add: `const isExtendedCycle = cycleMode === "irregular" && rawDiffDays > 45;`
When true: "It's been a while since your last period — has it started?" with period action prompt.
Verify: Irregular user, day 50 → sees extended cycle notice

---

### SCENARIO C: CONTRACEPTIVE METHOD — AT REGISTRATION OR MID-CYCLE

**Sub-scenario C1: User registers WITH hormonal contraception**

User selects `contraceptiveMethod: "pill"` (or `iud_hormonal`, `implant`, `injection`, `patch`, `ring`, `mini_pill`).

`getCycleMode()` returns `"hormonal"`. Every endpoint checks `getContraceptionBehavior()`:
- `useNaturalCycleEngine: false`
- `showOvulationPrediction: false`
- `showHormoneCurves: false`
- `showPmsForecast: false`
- `showPeriodForecast: false`

**What changes across ALL screens:**

| Screen | Natural user | Hormonal user |
|---|---|---|
| Home title | "On your period" / "Energy rising" | "Your day, your patterns" |
| Home subtitle | Fertility info | contextMessage explaining why phase predictions don't apply |
| Phase label | "Day 14 · Ovulation" | "Day 14" (no phase) |
| Quick log fields | Phase-specific (flow for menstrual, etc.) | Pattern-based: mood, energy, fatigue, pain — same every day |
| Calendar phases | Color-coded | `phase: null`, no colors, `phaseTimeline: null` |
| Insights tone | "cycle-based" with hormone context | "pattern-based" — all hormone language stripped (60+ regex) |
| Forecast | Phase-based with PMS | `forecastMode: "pattern"`, no phase/PMS/period forecast |

**BUG — `lastPeriodStart` REQUIRED BUT MEANINGLESS FOR HORMONAL USERS:**

Registration requires `lastPeriodStart` even for users on pill for years who don't have natural periods.

**REQUIRED FIX:**
File: `src/controllers/authController.ts`
Make `lastPeriodStart` optional for hormonal users. Default to today if not provided.
Verify: Register with `contraceptiveMethod: "pill"`, no `lastPeriodStart` → succeeds

**BUG — HORMONAL USER `periodStarted` CREATES INVALID CYCLE DATA:**

`POST /api/cycle/period-started` doesn't check `cycleMode`. Hormonal user logs withdrawal bleed → CycleHistory entry with calculated cycleLength → pollutes `getCyclePredictionContext()`.

**REQUIRED FIX:**
File: `src/controllers/cycleController.ts` → `periodStarted()`
When `cycleMode === "hormonal"`: create CycleHistory with `cycleLength: null`, skip closing previous cycle with calculated length. Still update `lastPeriodStart` so day counter resets.
Verify: Hormonal user logs period → CycleHistory has `cycleLength: null`, prediction engine unaffected

---

**Sub-scenario C2: User switches to hormonal contraception MID-CYCLE**

She was tracking naturally (day 15), changes to "pill" via profile update.

`handleContraceptionTransition()` fires:
1. Clears ALL caches (InsightCache, HealthPatternCache)
2. Marks current CycleHistory as transitional (`cycleLength: null`)
3. Resets InsightMemory + InsightHistory
4. Sets `lastPeriodStart` to today
5. Sets `contraceptionChangedAt` to now
6. 14-day warmup begins

**GAP — CYCLE DAY CONFUSION AFTER SWITCH:**

Switching on day 15 resets `lastPeriodStart` to today → tomorrow shows "Day 2". But she hasn't started a new period.

**REQUIRED FIX:**
File: `src/controllers/homeController.ts`
During warmup: show "Day X since switching" not "Day X · [phase]"
Verify: User switches to pill → home shows "Day 2 since switching"

---

**Sub-scenario C3: User switches FROM hormonal to natural**

She stops the pill. Natural cycle may take 1-6 months to regulate.

Code handles: same full reset + 14-day warmup + contextMessage explaining transition.

**GAP — NO POST-HORMONAL IRREGULARITY EXPECTATION:**

After stopping hormonal contraception, cycles are almost always irregular for 3-6 months. App should force irregularity expectation.

**REQUIRED FIX:**
File: `src/services/contraceptionTransition.ts`
On `hormonal_to_natural` transition: set `cycleRegularity: "not_sure"`
Verify: User stops pill → `cycleRegularity` becomes `"not_sure"`, phase predictions hedged

---

**Sub-scenario C4: Copper IUD — non-hormonal exception**

`iud_copper` → `useNaturalCycleEngine: true`. All natural cycle features run. Only difference: heavier flow messaging. Correctly handled, no gaps.

---

## 6. ALL EDGE CASES CHECKLIST

### Registration / Onboarding
- [ ] Hormonal contraception → all phase/hormone language suppressed
- [ ] `cycleRegularity: "irregular"` → `cycleMode: "irregular"`, softened language
- [ ] Copper IUD → natural cycle engine runs
- [ ] `lastPeriodStart` in the future → **BUG: no validation. Must reject.**
- [ ] `lastPeriodStart` not provided for hormonal user → **BUG: required but meaningless.**
- [ ] `cycleLength` outside 21-45 → rejected
- [ ] Email already exists → 409

### Logging
- [ ] First log → "fallback" mode, no trends
- [ ] 1-2 logs → no interaction flags
- [ ] 3+ logs → "personalized" mode
- [ ] 7+ logs → forecast unlocks
- [ ] Duplicate log → **BUG: no uniqueness constraint**
- [ ] Heavy bleeding (pads >= 7) → `bleeding_heavy` driver
- [ ] Log invalidates caches

### Regular User Cycle
- [ ] Period started → closes CycleHistory, creates new, updates lastPeriodStart
- [ ] Period started twice same day → **BUG: duplicate, no guard**
- [ ] 1-3 days late → gentle reassurance
- [ ] 4-7 days late → pregnancy test/doctor suggestion
- [ ] 8-14 days late → stronger doctor recommendation
- [ ] 15+ days late → firm doctor recommendation
- [ ] Cycle day wraps via modulo → **BUG: shows "Day 1 · Period" when period is late**
- [ ] "Has your period started?" prompt → **GAP: not implemented**

### Irregular User Cycle
- [ ] 0 completed cycles → **GAP: shows phase predictions with no data**
- [ ] 2+ cycles → phases with "estimated" caveat
- [ ] Day 50+ → **GAP: no "it's been a while" notice**
- [ ] Phase labels → **GAP: still shown despite being unreliable**
- [ ] Anticipation suppressed → HANDLED
- [ ] Hormone confidence downgraded → HANDLED

### Hormonal User
- [ ] `periodStarted` → **BUG: creates invalid CycleHistory with calculated length**
- [ ] Day counter during warmup → **GAP: confusing without "since switching" label**
- [ ] Quick log fields → HANDLED (pattern-based)
- [ ] Calendar phases → HANDLED (`phase: null`)
- [ ] Hormone language stripped → HANDLED (60+ regex)
- [ ] Forecast → HANDLED (pattern/symptom mode)

### Contraception Transitions
- [ ] Natural → hormonal → full reset, pattern mode
- [ ] Hormonal → natural → full reset, **GAP: should force irregularity**
- [ ] Hormonal → hormonal → full reset, stays pattern-based
- [ ] Natural → natural → caches cleared, no baseline reset
- [ ] 14-day warmup → HANDLED
- [ ] All caches cleared → HANDLED
- [ ] Memory/history reset → HANDLED
- [ ] CycleHistory marked transitional → HANDLED

### Insights
- [ ] Zero logs → fallback only, NO data fabrication
- [ ] Chat zero logs → CRITICAL: no invented metrics
- [ ] Sleep primary cause → blame sleep not hormones
- [ ] Stress primary cause → blame stress not sleep
- [ ] Stable state → calm messaging, no false alarms
- [ ] Peak positive → enabling, not cautionary
- [ ] Forbidden language → rejected
- [ ] Sentence/length guards → enforced

### Chat
- [ ] Casual → lightweight path
- [ ] Health → full pipeline
- [ ] Zero logs + health question → no fabrication
- [ ] Message length → **BUG: no limit**

### Forecast
- [ ] < 7 logs → locked
- [ ] Span < 5 days → locked
- [ ] Confidence < 0.4 → locked
- [ ] Hormonal `forecastMode: "disabled"` → unavailable

---

## 7. BUGS TO FIX — PRIORITIZED

### P0 — MUST FIX (breaks user trust)

1. **Cycle day wraps via modulo** — shows "Day 1 · Period" when period is late
   - File: `src/services/cycleEngine.ts` → `calculateCycleInfoForDate()`
   - Verify: Day 31 of 28-day cycle → `cycleDay: 31`, `phase: "luteal"`

2. **Hormonal user `periodStarted` creates invalid CycleHistory**
   - File: `src/controllers/cycleController.ts` → `periodStarted()`
   - Verify: Hormonal user → CycleHistory `cycleLength: null`

3. **Error middleware leaks stack traces**
   - File: `src/middleware/errorHandler.ts`
   - Verify: `NODE_ENV=production` → generic error only

4. **No `lastPeriodStart` future validation**
   - Files: `authController.ts`, `userController.ts`
   - Verify: Future date → 400

5. **No duplicate log prevention**
   - File: `logController.ts`
   - Verify: Rapid double POST → one log

6. **Chat no length limit**
   - File: `chatController.ts`
   - Verify: 5000 chars → 400

7. **`HORMONAL_CONTRACEPTIVE_METHODS` incomplete**
   - File: `src/types/cycleUser.ts`
   - Verify: `isHormonalContraceptiveMethod("combined_pill")` → true

### P1 — SHOULD FIX (degrades experience)

8. **No tiered delayed period messaging**
9. **No "Has your period started?" prompt**
10. **Irregular user with 0 cycles sees phase predictions**
11. **No extended cycle notice for irregular users (day 50+)**
12. **Hormonal → natural transition doesn't force irregularity**
13. **No rate limiting on most endpoints**
14. **Missing `@@index` on InsightHistory for emotional memory query**
15. **Google auth no rate limiter**

### P2 — NICE TO HAVE

16. **`lastPeriodStart` required for hormonal users at registration**
17. **Day counter confusing after hormonal switch**
18. **No log update endpoint**
19. **`user.cycleLength` never updated from observed cycles**
20. **Period started no duplicate guard**
21. **`InsightMonitorLog` table not in schema**

---

## 8. VERIFICATION PROTOCOL

After EVERY code change:

### 8a. Compile
```bash
npx tsc --noEmit
```

### 8b. Prisma
```bash
npx prisma validate
```

### 8c. Three-scenario spot check

**Scenario A:** User 4 days late → `isPeriodDelayed: true`, `cycleDay` > 28, `phase: "luteal"`, messaging mentions doctor/pregnancy test

**Scenario B:** Irregular user, 0 cycles → no phase labels, "learning" messaging

**Scenario C:** Hormonal user → `phase: null` everywhere, no hormone language, `periodStarted` creates `cycleLength: null`

### 8d. Test suite
```bash
npx ts-node src/testRunner/runTestCases.ts --source generated --batch 50 --out test-results-quick.json
npx ts-node src/testRunner/validateResults.ts --in test-results-quick.json
```

---

## 9. QUALITY GATES

- **No fabrication**: Zero-log users never get invented metrics
- **No misleading phases**: Irregular users don't see specific phase labels without data. Overdue users don't see "Day 1 · Period" when not menstruating.
- **Cause attribution**: Sleep crash → blame sleep. Stress → blame stress. Never wrong attribution.
- **Complete hormonal suppression**: Zero phase/hormone language for hormonal users
- **Clean transitions**: Method switches clear ALL stale data
- **Tiered delayed period**: Escalating messaging from reassurance to doctor recommendation
- **Withdrawal bleed handling**: Hormonal period logging doesn't pollute predictions

---

## 10. FILE CHANGE RULES

1. Never modify migration SQL files
2. Always `npx prisma validate` after schema changes
3. Always `npx tsc --noEmit` after TypeScript changes
4. When changing insight/cycle logic, run 50+ test cases
5. When changing contraception logic, verify hormonal AND natural paths
6. New endpoints → update routes AND this document
7. New Prisma models → add appropriate indexes

---

## 11. COMPETITORS TO BEAT

| App | Strength | Vyana advantage |
|---|---|---|
| **Flo** | Large userbase, period prediction | Flo shows same generic phase text to everyone. Vyana adapts to YOUR data. |
| **Clue** | Clean design, science-backed | Clue doesn't connect signals (sleep × stress). Clue treats hormonal users same as natural. |
| **Natural Cycles** | FDA-cleared fertility prediction | Fertility-focused. Vyana is wellness-focused. No contraception transition handling. |

**Vyana differentiators:** Cross-signal correlation, cross-cycle memory, emotional memory, contraception intelligence, health pattern detection, confidence-calibrated language, tiered delayed period handling, post-hormonal transition intelligence.

---

## 12. TESTING GAPS

Add to test generator:
1. Delayed period at 1, 5, 10, 20 days → tiered messaging
2. Cycle day 29, 30, 35 of 28-day cycle → no wrapping, phase stays luteal
3. Hormonal user periodStarted → CycleHistory.cycleLength null
4. Irregular user 0 cycles → phase labels suppressed
5. Irregular user day 50 → extended cycle notice
6. Contraception transitions (all 4 types)
7. Hormonal user + 7 logs → no hormone language
8. Copper IUD → natural cycle runs
9. Post-hormonal transition → irregularity forced
10. Chat zero logs → no fabrication
11. Forecast: 7 logs same day → locked

---

## 13. DEPLOYMENT CHECKLIST

- [ ] `NODE_ENV=production`
- [ ] Error handler safe
- [ ] Rate limiters active
- [ ] PgBouncer configured
- [ ] Backend colocated with Supabase region
- [ ] `OPENAI_API_KEY` set
- [ ] `JWT_SECRET` strong
- [ ] Cycle day wrapping fixed
- [ ] Hormonal periodStarted fixed
- [ ] Delayed period tiered messaging
- [ ] 500-case suite > 95% all metrics
- [ ] All three scenarios verified