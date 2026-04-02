# Vyana — Claude Code Context

> Last updated: April 2026
> Repo: github.com/abhirajsinha/vyana-backend

## What this product is

Vyana is a women's cycle wellness app. It tracks menstrual cycles, generates
personalized daily insights, and provides an AI chat companion. The goal is to
help women understand their body — not just track periods.

The app must feel warm, personal, and trustworthy. Users are sharing sensitive
health data. Every response from the system — insight text, recommendations,
error messages — must feel like it came from someone who cares.

Core design principle: **"this app knows me"** — every insight must feel specific
to the individual user rather than generic.

---

## Stack

- Node.js + TypeScript + Express
- Prisma ORM + PostgreSQL (Supabase)
- JWT auth (access + refresh tokens)
- Email/password + Google Sign-In
- OpenAI GPT-4o-mini (insight rewriting + chat)

---

## Project structure

```
src/
  controllers/
    authController.ts        — register, login, googleAuth, refresh
    calendarController.ts    — monthly calendar grid + day insight cards
    chatController.ts        — AI chat with intent classification
    cycleController.ts       — getCurrentCycle, periodStarted, undoPeriodStarted
    healthController.ts      — health pattern detection (PCOS, PMDD, endo, iron)
    homeController.ts        — home screen content builder
    insightController.ts     — GET /api/insights, /context, /forecast
    logController.ts         — daily log CRUD + quick check-in + quick log config
    notificationController.ts — FCM token management + admin batch send
    userController.ts        — getMe + updateProfile with contraception transitions

  services/
    aiService.ts             — barrel re-export (chatService + insightGptService)
    chatService.ts           — askVyanaWithGpt, classifyIntent
    insightGptService.ts     — GPT rewrite for insights + forecast
    insightService.ts        — rule-based insight engine, buildInsightContext
    insightGuard.ts          — POST-GENERATION guard layer (13 guards)
    insightView.ts           — view composition, insightBasis, primary key rotation
    insightData.ts           — getUserInsightData, crossCycleNarrative, predictions
    insightMemory.ts         — driver persistence tracking
    insightMonitor.ts        — production shadow monitoring
    insightCause.ts          — primary cause detection (sleep/stress/cycle/stable)
    cycleEngine.ts           — phase calculation, cycle info, irregularity detection
    cycleInsightLibrary.ts   — 28-day × 3-variant insight library
    contraceptionengine.ts   — contraception types, behaviors, forecast eligibility
    contraceptionTransition.ts — method switch handling, cache reset
    correlationEngine.ts     — 7 cross-signal pattern detectors
    hormoneengine.ts         — phase→hormone state mapping
    healthPatternEngine.ts   — PCOS/PMDD/endo/iron detection + progressive watching
    pmsEngine.ts             — PMS symptom forecast + warmup
    tomorrowEngine.ts        — trend-adjusted tomorrow preview
    transitionWarmup.ts      — 14-day warmup after contraception switch
    vyanaContext.ts          — VyanaContext v5 (humanization layer for GPT)
    notificationScheduler.ts — scheduled notification queries
    notificationService.ts   — Firebase push notification delivery
    notificationTemplates.ts — phase-aware notification content
    openaiClient.ts          — OpenAI client + circuit breaker
    googleAuthService.ts     — Google ID token verification

  middleware/
    auth.ts                  — requireAuth (JWT)
    rateLimit.ts             — rate limiters (auth, chat, insight, log, general)
    errorHandler.ts          — 404 + 500 handlers
    requestLogger.ts         — structured JSON request logging

  routes/                    — Express routers (auth, user, cycle, logs, insights,
                               chat, health, home, calendar, admin)

  testRunner/
    generateTestCases.ts     — 500 systematic + edge + random test cases
    generateEdgeCases.ts     — ~400 targeted edge cases (NEW)
    runTestCases.ts          — test runner (creates users, calls pipeline, saves results)
    validateResults.ts       — structural validation (phase, drivers, bleeding)
    validateInsightText.ts   — text quality validation (NEW)
    testCases.ts             — 10 manual test cases

  types/
    cycleUser.ts             — cycle length, contraception method types
    express.ts               — Express.Request userId extension

  utils/
    confidencelanguage.ts    — forbidden phrases, softening, cleanup
    homeScreen.ts            — home screen day content generation
    jwt.ts                   — token signing/verification
    password.ts              — bcrypt hashing
    userPublic.ts            — strip passwordHash from user

  cron/
    notificationCron.ts      — hourly notification batch job
```

---

## Insight pipeline (critical path)

The insight pipeline runs on every `GET /api/insights` call. Understanding this
flow is essential for any changes:

```
1. Cache check (insightCache by userId + date)
2. getUserInsightData() → user, recentLogs (7), baselineLogs (7+), numericBaseline, crossCycleNarrative
3. buildInsightContext() → signals, trends, drivers, phase deviation, confidence
4. isStableInsightState() → if true, flatten to stable baseline
5. detectPrimaryInsightCause() → sleep_disruption | stress_led | cycle | stable
6. generateRuleBasedInsights() → draft insights from context + cycleInsightLibrary
7. softenForConfidenceTier() → tier 1 (0 logs), tier 2 (1-4), tier 3 (5+)
8. Correlation engine → cross-signal patterns (sleep-stress amp, pre-period mood, etc.)
9. Cross-cycle narrative overlay
10. Primary cause narrative (sleep/stress/stable overrides)
11. softendeterministic() → forbidden language removal
12. GPT rewrite (generateInsightsWithGpt) → VyanaContext + system prompt
13. sanitizeInsights() → JSON shape, length, sentence count guards
14. softenDailyInsights() → post-GPT certainty softening
15. cleanupInsightText() → dedup, contradiction resolution
16. *** applyAllGuards() *** → 13-layer deterministic guard pipeline
17. buildInsightView() → primary/supporting/action composition
18. Cache write + respond
```

### Key principle: GPT is a rewriter, not an inventor

GPT runs on every request (even 0 logs). But GPT can only rephrase and smooth
tone — it cannot introduce new facts, convert "can" to "is", or personalize
without data. The guard layer (step 16) enforces this deterministically.

---

## insightGuard.ts — Post-generation guard layer

This is the final enforcement layer. It runs AFTER GPT and BEFORE the response
is sent to the client. It's deterministic string processing — it never fails.

### Guard pipeline (13 guards, in order):

1. **Zero-data assertion guard** — converts all hard assertions to phase-based
   tendencies when logsCount === 0. Uses a 3-layer strategy:
   - ~130 specific patterns (best replacements): flow, cramping, energy, focus,
     mood, confidence, clarity, motivation, cravings, bloating, irritability,
     anxiety, fatigue, sleep, body state, medical/hormone assertions
   - 4 broad catch patterns: `[noun] is`, `[nouns] are`, `Your [noun] is`,
     `You are [verbing]` across dozens of nouns/verbs
   - 1 generic last-resort catch: `[Capitalized word] is [adjective]` with
     negative lookahead whitelist

2. **Direction guard** — prevents wrong-direction assertions (e.g., "harder"
   during an improving phase direction for zero-data users)

3. **Intensity limiter** — caps emotional intensity for zero/low-data users
   ("completely drained" → "a bit low on energy")

4. **Hallucination filter** — removes physical claims that can't be known
   without data (pelvic, tingling, pressure, sensation)

5. **Technical language guard** — replaces hormone jargon for low-data users
   (LH surge → hormonal shift, cervical mucus → removed)

6. **Tomorrow preview softener** — converts "will" → "may", "should" → "may",
   "lifts soon" → "can lift soon" for zero-data users. Includes ~20 patterns.

7. **Clinical language guard** — replaces academic phrasing for all users
   (emotional regulation → handling things emotionally)

8. **Energy language guard** — caps energy exaggeration for low-data users
   (energy boost → gradual return of energy, peak energy → higher energy)

9. **Directive language guard** — softens directive language for low-data users.
   Includes ~25 patterns covering all "will [verb]" constructions:
   "resting will support" → "resting can help support",
   "will ease/lift/return/shift/feel/bring/start/come" → "can/may" versions

10. **Capitalize fix** — fixes broken capitalization from replacements

11. **Cross-field consistency** — detects contradictions between fields and
    resolves them (only for zero/low-data users)

### Known guard gaps — 3 remaining fixes (PENDING):

These are small targeted changes inside `insightGuard.ts`. Apply in order.

#### Fix 1: Fuzzy verb patterns ("feels" instead of "is")

**Problem:** GPT sometimes says "flow feels lighter" instead of "flow is lighter".
The specific patterns catch "flow is lighter" but miss "flow feels lighter".
The broad catches don't cover "feels" as an assertion verb.

**Where:** Add to `ZERO_DATA_SPECIFIC_PATTERNS` array, after the existing
flow/cramping/energy/mood/symptom sections. Also add a new broad catch.

**Patterns to add (specific):**
```typescript
// ── Fuzzy "feels" verb patterns (GPT uses "feels" instead of "is") ───
[/\b[Ff]low feels lighter\b/gi, "Flow can start to ease"],
[/\b[Ff]low feels heavier\b/gi, "Flow can feel heavier"],
[/\b[Cc]ramping feels softer\b/gi, "Cramping can start to ease"],
[/\b[Cc]ramping feels worse\b/gi, "Cramping can feel more intense"],
[/\b[Ee]nergy feels low\b/gi, "Energy can feel lower"],
[/\b[Ee]nergy feels high\b/gi, "Energy can feel higher"],
[/\b[Ee]nergy feels drained\b/gi, "Energy can feel lower"],
[/\b[Ff]ocus feels scattered\b/gi, "Focus can feel scattered"],
[/\b[Ff]ocus feels sharp\b/gi, "Focus can feel sharper"],
[/\b[Mm]ood feels heavy\b/gi, "Mood can feel heavier"],
[/\b[Mm]ood feels lighter\b/gi, "Mood can start to lift"],
[/\b[Mm]ood feels low\b/gi, "Mood can feel lower"],
[/\b[Ss]leep feels disrupted\b/gi, "Sleep can feel disrupted"],
[/\b[Ss]leep feels restless\b/gi, "Sleep can feel restless"],
[/\b[Bb]ody feels heavy\b/gi, "Your body can feel heavier"],
[/\b[Bb]ody feels sluggish\b/gi, "Your body can feel sluggish"],
[/\b[Bb]ody feels tired\b/gi, "Your body can feel tired"],
[/\b[Bb]ody feels drained\b/gi, "Your body can feel drained"],
```

**Broad catch to add** (new constant + addition to `applyBroadCatches()`):
```typescript
const BROAD_NOUN_FEELS_PATTERN =
  /\b(energy|focus|mood|flow|cramping|sleep|body|fatigue|motivation|confidence|clarity|drive|stamina|concentration)\s+feels\b/gi;

// In applyBroadCatches(), add after existing replacements:
result = result.replace(BROAD_NOUN_FEELS_PATTERN, (_match, noun: string) => {
  return `${noun} can feel`;
});
```

**Test validation (add to validateInsightText.ts ZERO_DATA_FORBIDDEN array):**
```typescript
{ pattern: /\b(?:flow|cramping|energy|focus|mood|sleep|body)\s+feels\s+(?:lighter|heavier|softer|worse|low|high|drained|scattered|sharp|heavy|sluggish|tired|restless|disrupted)\b/i, label: "fuzzy 'feels' assertion" },
```

#### Fix 2: Context-aware "today" replacement

**Problem:** Replacing every "today" breaks natural advice language.
"It's okay to take it easier today" becomes "It's okay to take it easier
around this time" which sounds unnatural in solution/recommendation fields.

**Where:** Replace the blanket `today` pattern in `ZERO_DATA_SPECIFIC_PATTERNS`
with a context-aware function called at the end of `applyZeroDataGuard()`.

**Step 1 — Remove from ZERO_DATA_SPECIFIC_PATTERNS:**
```typescript
// REMOVE this line:
[/\btoday\b/gi, "around this time"],
```

**Step 2 — Add this function:**
```typescript
function applySmartTodayReplacement(text: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const assertionVerbs = /\b(is|are|feels?|notice|experiencing|showing|having)\b/i;

  return sentences.map(sentence => {
    if (assertionVerbs.test(sentence)) {
      return sentence.replace(/\btoday\b/gi, "around this time");
    }
    return sentence;
  }).join(" ");
}
```

**Step 3 — Call in applyZeroDataGuard after step 3 (generic catch), before cleanup:**
```typescript
// Step 4: Smart "today" replacement (context-aware)
result = applySmartTodayReplacement(result);

// Step 5: Clean up double spaces
result = result.replace(/\s{2,}/g, " ").trim();
```

**Test validation (update in validateInsightText.ts):**
Replace the blanket `"today"` pattern in ZERO_DATA_FORBIDDEN with:
```typescript
// Only flag "today" when paired with assertion verbs — not in advice sentences
{ pattern: /\b(?:energy|focus|mood|flow|cramping|sleep|body|fatigue)\s+(?:is|are|feels)\b[^.]*\btoday\b/i, label: "'today' with assertion verb" },
```

#### Fix 3: Replace instead of delete in hallucination filter

**Problem:** `applyHallucinationFilter` deletes entire sentences containing
"pelvic", "tingling", etc. This breaks paragraph flow and removes context.

**Where:** Replace the `applyHallucinationFilter` function body.

**New implementation:**
```typescript
function applyHallucinationFilter(text: string, phase: Phase, logsCount: number): string {
  if (logsCount > 0) return text;

  let result = text;

  const HALLUCINATION_REPLACEMENTS: Array<[RegExp, string]> = [
    [/\bpelvic\s+(?:discomfort|pressure|pain|sensation|heaviness|tension)\b/gi, "discomfort"],
    [/\bpelvic\b/gi, "lower body"],
    [/\btingling\s+(?:sensation|feeling)?\b/gi, "mild sensation"],
    [/\bpressure in your\s+\w+\b/gi, "some discomfort"],
    [/\bsensation in your\s+\w+\b/gi, "some changes"],
  ];

  if (phase !== "menstrual") {
    HALLUCINATION_REPLACEMENTS.push([/\bcramping\b/gi, "discomfort"]);
  }

  for (const [pattern, replacement] of HALLUCINATION_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }

  return result.replace(/\s{2,}/g, " ").trim();
}
```

**Test validation (add to validateInsightText.ts ZERO_DATA_FORBIDDEN array):**
```typescript
{ pattern: /\bpelvic\b/i, label: "hallucinated 'pelvic' claim" },
{ pattern: /\btingling\b/i, label: "hallucinated 'tingling' claim" },
{ pattern: /\bpressure in your\b/i, label: "hallucinated 'pressure in your' claim" },
{ pattern: /\bsensation in your\b/i, label: "hallucinated 'sensation in your' claim" },
```

### What the guard does NOT do:

- Does not modify insights for users with 5+ logs (personalized data)
- Does not change the pipeline structure or flow
- Does not affect the GPT prompt or system instructions
- Does not interfere with VyanaContext or signal composition

---

## Data tiers (epistemic authority)

The system's language confidence scales with data depth:

| Tier | Logs | Source | Language allowed |
|------|------|--------|-----------------|
| phase_only | 0 | cycle day + phase | "can", "may", "often", "around this time" |
| early_signals | 1-4 | recent logs | "Based on your recent log", no patterns |
| emerging_patterns | 5 | interaction flags unlock | can describe trends |
| personal_patterns | 6-13 | personalized | "your", direct experience verbs |
| baseline_intelligence | 14+ | baseline comparison | "lower than your usual" |
| cross_cycle_identity | 14+ & 2+ cycles | multi-cycle | "for you", "your cycles tend to" |

### Zero-data contract (STRICT):

When logsCount === 0:
- ✅ Allowed: "can", "may", "often", "around this time", "tends to"
- ❌ Forbidden: "is", "are", "your flow", "your cramps", "you feel", "today"
- ❌ No possessive symptom claims ("your pain", "your fatigue")
- ❌ No biological event assertions ("you are ovulating")
- ❌ No medical assertions ("iron levels are low")
- ❌ No intensity words ("noticeably", "definitely", "clearly")

---

## Contraception system

The contraception engine controls what insights are shown based on method:

| Method | useNaturalCycleEngine | insightTone | forecastMode |
|--------|----------------------|-------------|--------------|
| none / barrier / natural | true | cycle-based | phase |
| iud_copper | true | cycle-based | phase |
| combined_pill / patch / ring | false | pattern-based | pattern |
| mini_pill | false | pattern-based | pattern |
| iud_hormonal / implant / injection | false | symptom-based | symptom |

### Key rules for hormonal users:
- No phase-based language ("follicular phase", "luteal phase", "this phase")
- No ovulation references ("ovulation", "ovulatory", "fertile window", "LH surge")
- No hormone assertions ("estrogen is rising", "progesterone is dominant")
- Insights based on logged patterns, not cycle-phase predictions
- "Period" is a withdrawal bleed, not a natural period

### Contraception transitions:
- natural → hormonal: reset lastPeriodStart, clear baselines, 14-day warmup
- hormonal → natural: force cycleRegularity to "not_sure", clear baselines
- hormonal → hormonal: clear baselines, 14-day warmup
- natural → natural: no reset needed

---

## VyanaContext (v5) — Humanization layer

VyanaContext pre-humanizes all signals before GPT sees them. GPT never sees raw
numbers or driver codes — only natural language like "sleep around 5.5h —
lower than your usual".

### Signal composition layers (in order):
1. **Core** — highest-weight factual signals (delayed period, persistent driver, interaction stories)
2. **Narrative** — identity patterns, cross-cycle trends, sleep/stress/mood deviations
3. **Enhancement** — max 1: surprise insight OR anticipation (mutually exclusive)
4. **Emotional** — max 1: emotional memory recall OR delight moment (emotional memory takes priority)

### Key features:
- User-specific hashing for variant rotation (not globally predictable)
- Delight gating for high-severity states (validation only, not relief/normalcy)
- Surprise insights shortened — observation first, explanation lighter
- Emotional memory — "last time sleep dropped like this, you logged feeling exhausted"
- Primary insight cause steers GPT attribution (sleep_disruption → blame sleep, not hormones)

---

## Testing infrastructure

### Test case generators:

1. **generateTestCases.ts** — 500 cases: 140 systematic (all 28 days × 5 profiles) +
   80 edge (boundaries, bleeding, delayed, contradictions) + 280 random (seeded)

2. **generateEdgeCases.ts** — ~400 targeted cases covering:
   - Zero logs × all 28 cycle days (28 cases)
   - 1-2 logs × 4 phases × 3 signal profiles (24 cases)
   - 3-4 logs × 4 phases × 4 profiles (32 cases)
   - 7 logs × 4 phases × 6 profiles (24 cases)
   - 14 logs × 4 phases × 4 profiles (16 cases)
   - Momentum break: 4 good days + 1 bad day (5 cases)
   - Hormonal contraception: 7 methods × 2 log counts × 3 days (42 cases)
   - Non-hormonal methods: copper IUD, barrier, natural (12 cases)
   - Irregular cycle: day 5-60 × 0-7 logs (12 cases)
   - Variable cycle lengths: 21-45 days × 0-7 logs (20 cases)
   - Delayed period: 30-50 days overdue × 0-5 logs (12 cases)
   - Heavy bleeding: 6-10 pads × days 1-3 (12 cases)
   - Positive signals on negative phase (6 cases)
   - Contradictory signals (4 cases)

### Validators:

1. **validateResults.ts** — structural validation: phase correctness, cycle day,
   driver detection, GPT gating, stable state, sleep disruption, bleeding, delayed period

2. **validateInsightText.ts** — text quality validation:

   **Negative rules** (things that should NOT appear):
   - ~35 zero-data assertion patterns (symptoms, possessives, state claims, "today")
   - 6 low-data overclaim patterns (pattern/baseline/cycle claims)
   - 7 directive language patterns ("you should", "will support")
   - 9 deterministic language patterns ("you will feel", clinical terms)
   - 5 hormone assertion patterns (possessive hormone claims)
   - 7 hormonal contraception patterns (ovulation, phase names, LH surge)
   - Structural checks (empty, length > 400, > 3 sentences)
   - Cross-field contradiction detection

   **Positive rules** (things that SHOULD appear):
   - Sleep disruption → sleep attribution in whyThisIsHappening
   - Stable state → calm/steady language, no invented problems
   - Delayed period → delay mentioned
   - Heavy bleeding → reflected in insights
   - Hormonal user with data → pattern-based language
   - Zero-data → hedging language present (can/may/often)

### Running tests:

```bash
# Edge case tests (fast — ~400 cases)
npx ts-node src/testRunner/runTestCases.ts --source edge --out test-results-edge.json
npx ts-node src/testRunner/validateInsightText.ts --in test-results-edge.json

# Full suite (slower — 500 cases)
npx ts-node src/testRunner/runTestCases.ts --source generated --out test-results-500.json
npx ts-node src/testRunner/validateInsightText.ts --in test-results-500.json
```

Output is a report broken down by phase, log count, field, and rule.
Exit code 1 if critical violations found.

---

## Known edge cases and how they're handled

### Delayed period (days overdue > 0):
- Tiered messaging: ≤3 days (normal), ≤7 (suggest test), ≤14 (significantly late), >14 (see doctor)
- Cycle stays in "luteal" phase, doesn't wrap
- "Has your period started?" prompt shown
- Irregular users get softer messaging

### Extended cycle (irregular user, day 50+):
- "It's been a while since your last period — has it started?"
- No phase predictions shown

### Learning state (irregular + < 2 completed cycles):
- Phase labels suppressed
- "We're learning your cycle" messaging
- No phase-based insights until enough data

### Stable state (7+ flat logs):
- All drivers cleared, trends cleared
- "Your body feels steady" narrative
- No invented problems or cycle explanations

### Momentum break (4+ good days then 1 bad day):
- "Today feels rougher than your recent streak"
- Frames as contrast, not pattern break

### Signal-positive override:
- When logs show good mood + high energy but phase says negative,
  override phase messaging with actual logged state

---

## API endpoints

### Auth
- POST /api/auth/register — email/password registration
- POST /api/auth/login — email/password login
- POST /api/auth/google — Google Sign-In
- POST /api/auth/refresh — refresh access token

### User
- GET /api/user/me — current user profile
- PUT /api/user/profile — update profile (handles contraception transitions)
- PUT /api/user/fcm-token — update push notification token

### Cycle
- GET /api/cycle/current — current cycle info
- POST /api/cycle/period-started — log new period start
- DELETE /api/cycle/period-started/:id — undo period logging

### Logs
- POST /api/logs — save daily log
- GET /api/logs — get logs (optional ?date filter)
- PUT /api/logs/:id — edit existing log
- POST /api/logs/quick-check-in — quick check-in (subset of fields)
- GET /api/logs/quick-log-config — phase-aware log field configuration

### Insights
- GET /api/insights — daily insights (cached per day)
- GET /api/insights/context — internal debug context
- GET /api/insights/forecast — multi-day forecast

### Chat
- POST /api/chat — AI chat (intent classified: casual/health/ambiguous)
- GET /api/chat/history — chat history

### Home
- GET /api/home — home screen content

### Calendar
- GET /api/calendar?month=YYYY-MM — monthly calendar grid
- GET /api/calendar/day-insight?date=YYYY-MM-DD — day insight card

### Health
- GET /api/health/patterns — health pattern detection results

### Admin
- POST /api/admin/send-notifications — trigger notification batch (API key protected)

---

## Rate limiting

| Endpoint | Window | Max requests |
|----------|--------|-------------|
| /api/auth/register, /login | 15 min | 30 |
| /api/auth/google | 15 min | 20 |
| /api/chat | 1 min | 60 |
| /api/insights | 1 min | 10 |
| /api/logs (write) | 1 min | 30 |
| /api/* (general) | 1 min | 120 |

---

## Performance notes

- Primary bottleneck is network latency (India → Supabase cloud)
- Use pooled PgBouncer connection string (port 6543) for production
- Deploy colocated with database region
- Insight cache (per user per day) prevents redundant GPT calls
- Health pattern cache (1-day TTL)
- Parallel DB queries where possible (user + logs, cycle count + prediction)

---

## Pre-launch checklist

1. ✅ Rate limiting on auth/chat/insight endpoints
2. ✅ Contraception method alignment between cycleUser.ts and contraceptionengine.ts
3. ⬜ Switch to pooled PgBouncer connection string (port 6543)
4. ✅ insightGuard overhaul — 130+ specific patterns + broad catches
5. ⬜ Fix 1: Add fuzzy "feels" verb patterns to insightGuard.ts
6. ⬜ Fix 2: Context-aware "today" replacement (only in assertion sentences)
7. ⬜ Fix 3: Replace-not-delete in hallucination filter
8. ⬜ Add test patterns from Fix 1-3 to validateInsightText.ts
9. ⬜ Run full test suite (edge + 500) and verify 0 critical violations
10. ⬜ Deploy to production region colocated with Supabase

---

## Coding conventions

- All files are TypeScript with strict types
- Prisma for all DB access (no raw SQL)
- Controllers handle HTTP, services handle logic
- Fire-and-forget for non-critical background writes (memory, history)
- Structured JSON logging for all events
- Cache invalidation on every log save and period start
- No default exports except route files