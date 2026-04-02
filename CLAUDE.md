# CLAUDE.md — Vyana Test Gap Coverage Sprint

## INSTRUCTIONS FOR CLAUDE CODE

You are starting an autonomous test-writing sprint. Read this entire file, then execute every task in order. Do not ask the human for clarification — everything you need is here. If you hit an ambiguity, make the conservative choice and move on.

**Workflow:**
1. Read this file completely
2. Execute tasks in order (GAP 1 → GAP 6)
3. For each task: write the test file → run it → fix until green → commit → move to next
4. Use TDD: write the test, verify it fails or compiles correctly against real code, then confirm it passes
5. After all 6 gaps, run the full combined suite and report results

**Commit convention:** `test: add <gap description>` (e.g., `test: add chat intent classifier tests`)

---

## PROJECT CONTEXT

**Stack:** Node.js / TypeScript / Express / Prisma ORM / PostgreSQL (Supabase) / OpenAI GPT-4o-mini
**Test framework:** Jest
**Existing tests location:** `tests/` (unit tests), `src/testRunner/` (integration runner)
**Factories:** `tests/helpers/factories.ts` — use `makeUser`, `makeLog`, `makeLogs`, `makeBaseline`, preset profiles
**tsconfig for tests:** `tests/tsconfig.json` (extends `../tsconfig.tests.json`)

### Key architecture facts you MUST know

- `insightGuard.applyAllGuards` takes `InsightGuardInput` = `{ insights, cycleDay, cycleLength, phase, logsCount }` — it is an object, NOT positional args
- `classifyIntent(message, history)` lives in `src/services/chatService.ts`, returns `"casual" | "health" | "ambiguous"`
- `handleContraceptionTransition` lives in `src/services/contraceptionTransition.ts`
- `buildVyanaContext` lives in `src/services/vyanaContext.ts`
- `getInsights`, `getInsightsContext`, `getInsightsForecast` live in `src/controllers/insightController.ts`
- `getHomeScreen` lives in `src/controllers/homeController.ts`
- `getCalendar` lives in `src/controllers/calendarController.ts`
- `calculateCycleInfo`, `getCycleMode`, `utcDayDiff`, `calculatePhaseFromCycleLength` live in `src/services/cycleEngine.ts`
- `resolveContraceptionType`, `getContraceptionBehavior`, `checkForecastEligibility` live in `src/services/contraceptionengine.ts`
- `getCyclePredictionContext` lives in `src/services/insightData.ts`
- `buildHormoneState` lives in `src/services/hormoneengine.ts`
- `buildInsightContext`, `generateRuleBasedInsights` live in `src/services/insightService.ts`
- `buildTransitionWarmup` lives in `src/services/transitionWarmup.ts`
- GPT barrel re-export: `src/services/aiService.ts` re-exports from `chatService.ts` and `insightGptService.ts`
- DB client: `import { prisma } from "../lib/prisma"` or `"../../src/lib/prisma"` from tests
- All integration tests MUST mock GPT — never call real OpenAI in tests

### GPT mock pattern (copy this exactly for all integration tests)

```typescript
jest.mock("../../src/services/aiService", () => {
  const original = jest.requireActual("../../src/services/aiService");
  return {
    ...original,
    generateInsightsWithGpt: jest.fn().mockResolvedValue({
      insights: {
        physicalInsight: "Mocked physical insight.",
        mentalInsight: "Mocked mental insight.",
        emotionalInsight: "Mocked emotional insight.",
        whyThisIsHappening: "Mocked reason.",
        solution: "Mocked solution.",
        recommendation: "Mocked recommendation.",
        tomorrowPreview: "Mocked preview.",
      },
      status: "accepted",
    }),
    generateForecastWithGpt: jest.fn().mockImplementation(
      (_ctx: unknown, draft: unknown) => Promise.resolve(draft),
    ),
  };
});
```

### Integration test user lifecycle (copy this pattern)

```typescript
import { randomUUID } from "crypto";
import { prisma } from "../../src/lib/prisma";

async function createTestUser(overrides = {}): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `test-${randomUUID().slice(0, 8)}@test.vyana`,
      name: "Test User",
      age: 28, height: 165, weight: 58,
      cycleLength: 28,
      lastPeriodStart: periodStartForDay(14),
      cycleRegularity: "regular",
      cycleMode: "natural",
      ...overrides,
    },
  });
  return user.id;
}

async function cleanupUser(userId: string): Promise<void> {
  await prisma.insightCache.deleteMany({ where: { userId } });
  await prisma.insightMemory.deleteMany({ where: { userId } });
  await prisma.insightHistory.deleteMany({ where: { userId } });
  await prisma.chatMessage.deleteMany({ where: { userId } });
  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.dailyLog.deleteMany({ where: { userId } });
  await prisma.cycleHistory.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.healthPatternCache.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } });
}

function mockRes(): { json: jest.Mock; status: jest.Mock; _data: unknown } {
  const res = {
    _data: null as unknown,
    json: jest.fn((data: unknown) => { res._data = data; }),
    status: jest.fn((_code: number) => ({
      json: jest.fn((data: unknown) => { res._data = { error: data, status: _code }; }),
    })),
  };
  return res;
}
```

### What already has test coverage (DO NOT duplicate)

- Cycle engine math (phase calc, boundaries, irregularity) → `tests/units/cycleEngine.test.ts`
- Guard layer (28-day sweep, direction, peak limiter, edge cases) → `tests/insightGuard.test.ts` + `insightGuard.edge.test.ts`
- Confidence language (forbidden phrases, softening, tone) → `tests/units/confidenceLanguage.test.ts`
- Contraception engine (type resolution, behavior rules, forecast eligibility) → `tests/units/contraceptionEngine.test.ts`
- Insight cause detection (sleep/stress/stable/cycle) → `tests/units/insightCause.test.ts`
- GPT output sanitization → `tests/units/aiServiceGuard.test.ts`
- Fuzz testing (200 random timelines) → `tests/units/fuzz.test.ts`
- Trust breakers (dangerous outputs, tone mismatch) → `tests/units/trustBreakers.test.ts`
- Narrative consistency across days → `tests/units/narrativeConsistency.test.ts`
- Performance thresholds → `tests/integration/performance.test.ts`
- 500-case integration runner → `src/testRunner/`

---

## TASK QUEUE — EXECUTE IN ORDER

---

### TASK 1: Chat Intent Classifier Tests

**Create file:** `tests/units/chatIntentClassifier.test.ts`

**Import:**
```typescript
import { classifyIntent, type ChatIntent, type ChatHistoryItem } from "../../src/services/chatService";
```

**Why this matters:** `classifyIntent` routes ALL chat traffic. If a health question gets classified as "casual", the user gets a lightweight response with no VyanaContext, no zero-data guards, no safety net. This is the chat fabrication bug class.

**Write these test groups:**

**Group 1: Pure casual → "casual"** (minimum 15 cases)
Test every pattern in the `casualPatterns` regex array in `chatService.ts`:
- `"hi"`, `"hello"`, `"hey"`, `"hii"`, `"hola"`, `"yo"`
- `"good morning"`, `"good afternoon"`, `"good evening"`, `"good night"`
- `"how are you"`, `"how's it going"`, `"what's up"`, `"sup"`
- `"thanks"`, `"thank you"`, `"thx"`, `"ty"`
- `"ok"`, `"okay"`, `"sure"`, `"cool"`, `"nice"`, `"great"`, `"awesome"`, `"haha"`, `"lol"`
- `"bye"`, `"goodbye"`, `"see you"`, `"good night"`, `"gn"`
- `"tell me about yourself"`, `"who are you"`, `"what are you"`, `"what can you do"`
- `"nothing"`, `"nm"`, `"not much"`, `"just chilling"`, `"bored"`

**Group 2: Pure health → "health"** (minimum 20 cases)
Test every pattern in the `healthPatterns` regex array:
- Cycle: `"why is my period late"`, `"what phase am I in"`, `"when will I ovulate"`
- Symptoms: `"I feel tired today"`, `"my cramps are bad"`, `"I have a headache"`, `"I'm bloated"`
- Feelings: `"I'm feeling really low lately"`, `"I felt anxious today"`, `"I feel so tired recently"`
- Why questions: `"why do I feel so low"`, `"why am I so tired"`, `"what is wrong with me"`
- Tracking: `"should I log this"`, `"what does my data say"`, `"show me my insights"`, `"predict my next period"`
- Medical: `"is it normal to bleed this much"`, `"should I see a doctor"`, `"can I exercise on my period"`
- Body: `"my sleep is terrible"`, `"stress is killing me"`, `"my energy is so low"`
- Hormones: `"is my estrogen high"`, `"what are my hormone levels"`
- Specific: `"I'm spotting between periods"`, `"my flow is heavier than usual"`

**Group 3: Ambiguous → "ambiguous"** (minimum 8 cases)
- `"I don't feel great"`, `"not my best day"`, `"could be better"`
- `"help"`, `"what do you think"`, `"tell me something"`
- `"hmm"`, `"I don't know"`

**Group 4: History-dependent** (minimum 5 cases)
- Health assistant message in history + user says `"yes"` → should return `"health"` (not casual)
- Health assistant message in history + user says `"tell me more"` → `"health"`
- Casual assistant message in history + user says `"ok"` → stays `"casual"`
- Empty history + ambiguous message → `"ambiguous"`
- Health history + `"thanks"` → could be casual (this tests the boundary)

**Group 5: Edge cases** (minimum 5 cases)
- Empty string: should not crash
- Very long message (500+ chars with health keywords buried in it): should detect health
- ALL CAPS: `"WHY IS MY PERIOD LATE"` → should still be `"health"`
- Leading/trailing whitespace: `"  hello  "` → casual
- Mixed: `"hey I'm not feeling well"` — has greeting AND symptom

**Critical assertion to verify:** No health keyword message should EVER return `"casual"`. Write a parametric test:
```typescript
const HEALTH_MESSAGES = [/* all health cases */];
it.each(HEALTH_MESSAGES)("health message '%s' is never classified as casual", (msg) => {
  expect(classifyIntent(msg, [])).not.toBe("casual");
});
```

**After writing:** Run `npx jest --testPathPattern=chatIntentClassifier`. Fix until green. Commit.

---

### TASK 2: Contraception Transition Integration Tests

**Create file:** `tests/integration/contraceptionTransition.test.ts`

**Imports:**
```typescript
import { randomUUID } from "crypto";
import { prisma } from "../../src/lib/prisma";
import { handleContraceptionTransition } from "../../src/services/contraceptionTransition";
import { getInsights } from "../../src/controllers/insightController";
import { getHomeScreen } from "../../src/controllers/homeController";
import { resolveContraceptionType, getContraceptionBehavior } from "../../src/services/contraceptionengine";
import { getCycleMode } from "../../src/services/cycleEngine";
```

Mock GPT using the pattern from the PROJECT CONTEXT section above.

**Test cases:**

**Group 1: Transition mechanics** (test `handleContraceptionTransition` directly)

| Test | From | To | Assertions |
|------|------|-----|------------|
| natural → pill | `null` | `"pill"` | `transitionType === "natural_to_hormonal"`, `baselineReset === true`, `cachesCleared === true`, `periodStartReset === true` |
| pill → natural | `"pill"` | `null` | `transitionType === "hormonal_to_natural"`, `baselineReset === true`, new `cycleRegularity === "not_sure"` |
| pill → iud_hormonal | `"pill"` | `"iud_hormonal"` | `transitionType === "hormonal_to_hormonal"`, `baselineReset === true` |
| natural → iud_copper | `null` | `"iud_copper"` | `transitionType === "natural_to_natural"`, `baselineReset === false` |
| natural → condom | `null` | `"condom"` | `transitionType === "natural_to_natural"`, `baselineReset === false` |
| pill → pill (same) | `"pill"` | `"pill"` | `transitionType === "same_method"`, `cachesCleared === false` |

**Group 2: End-to-end insight output after transition**

For the `null → pill` transition:
1. Create user with `contraceptiveMethod: null`, seed 10 logs
2. Call `getInsights` → capture response
3. Update user: `contraceptiveMethod: "pill"`, call `handleContraceptionTransition`
4. Call `getInsights` again → capture response
5. Assert the SECOND response:
   - Does NOT contain "ovulation" in any insight text field
   - Does NOT contain "fertile window" in any insight text field
   - Does NOT contain "LH surge" in any insight text field
   - Does NOT contain "follicular phase" or "luteal phase" in insight text
6. Verify caches were cleared: `prisma.insightCache.findMany({ where: { userId } })` returns empty
7. Verify `contraceptionChangedAt` is set on the user record

**Group 3: Home screen reflects transition**

After `null → pill` transition:
1. Call `getHomeScreen` with the updated user
2. Assert: response does NOT contain phase-specific content like "Ovulation day" or "Luteal phase"

**Group 4: Transition warmup**

After any hormonal transition:
1. Verify `buildTransitionWarmup(user.contraceptionChangedAt)` returns `{ active: true, ... }`
2. Verify warmup message is present
3. Verify `daysRemaining` is correct (should be 14 - daysSinceTransition)

**Cleanup:** Delete all created users/logs/caches in `afterEach`.

**After writing:** Run `npx jest --testPathPattern=contraceptionTransition`. Fix until green. Commit.

---

### TASK 3: Forecast Endpoint Integration Tests

**Create file:** `tests/integration/forecastEndpoint.test.ts`

**Imports:**
```typescript
import { randomUUID } from "crypto";
import { prisma } from "../../src/lib/prisma";
import { getInsightsForecast } from "../../src/controllers/insightController";
```

Mock GPT using the standard pattern.

**Test cases:**

1. **< 7 logs → warmup response**
   - Create user with 3 logs spread across 3 days
   - Call `getInsightsForecast`
   - Assert: `available === false`, `reason === "insufficient_logs"`, `warmupMessage` is a non-empty string, `progressPercent` is roughly `Math.round((3/7) * 100)`

2. **7 logs on same day → insufficient spread**
   - Create user, seed 7 logs all with the same date
   - Assert: `available === false`, `reason === "insufficient_spread"`

3. **Eligible user (10 logs, 10 days) → full forecast**
   - Create user with 10 logs across 10 different days
   - Assert: `available === true`
   - Assert: `forecast.tomorrow.outlook` is a non-empty string
   - Assert: `forecast.confidence.level` is one of `"low" | "medium" | "high"`
   - Assert: no forbidden deterministic language in `forecast.tomorrow.outlook` (import `containsForbiddenLanguage` from `../../src/utils/confidencelanguage`)

4. **Hormonal user → restricted forecast mode**
   - Create user with `contraceptiveMethod: "pill"`, 10 logs across 10 days
   - Assert: `forecast.nextPhase === null` (no phase predictions)
   - Assert: `contraceptionContext.forecastMode` is `"pattern"` not `"phase"`

5. **Cached forecast → second call returns cache**
   - Call `getInsightsForecast` twice for the same user
   - Assert: both responses have same `forecast.tomorrow.date`

6. **Zero logs → warmup (not crash)**
   - Create user with 0 logs
   - Assert: response exists, `available === false`, no error status

**After writing:** Run `npx jest --testPathPattern=forecastEndpoint`. Fix until green. Commit.

---

### TASK 4: Cross-Endpoint Consistency Tests

**Create TWO files.**

#### Part A: `tests/units/crossEndpointConsistency.test.ts`

Pure function tests — no DB needed.

**Imports:**
```typescript
import { calculateCycleInfo, getCycleMode, utcDayDiff, calculatePhaseFromCycleLength } from "../../src/services/cycleEngine";
import { resolveContraceptionType, getContraceptionBehavior } from "../../src/services/contraceptionengine";
```

**Test cases:**

1. **`getCycleMode` consistency** — for 10+ user configurations, verify the same `(contraceptiveMethod, cycleRegularity)` always returns the same mode:
   - `(null, "regular")` → `"natural"`
   - `("pill", "regular")` → `"hormonal"`
   - `("pill", "irregular")` → `"hormonal"` (hormonal overrides irregular)
   - `("iud_copper", "regular")` → `"natural"` (copper IUD = non-hormonal)
   - `("condom", "regular")` → `"natural"`
   - `(null, "irregular")` → `"irregular"`
   - `("implant", "regular")` → `"hormonal"`
   - `("iud_hormonal", "irregular")` → `"hormonal"`

2. **Delayed period detection parity** — write the detection logic as a pure function and verify it for 5+ configs:
   ```typescript
   function detectDelayed(rawDiffDays: number, effectiveCycleLength: number, confidence: string, cycleMode: string): boolean {
     const daysOverdue = Math.max(0, rawDiffDays - effectiveCycleLength);
     return daysOverdue > 0 && confidence !== "irregular" && cycleMode !== "hormonal";
   }
   ```
   Test: `(35, 28, "reliable", "natural")` → true; `(35, 28, "reliable", "hormonal")` → false; `(28, 28, "reliable", "natural")` → false; `(35, 28, "irregular", "natural")` → false

3. **Phase + contraception behavior alignment** — for each contraception type, verify `getContraceptionBehavior(resolveContraceptionType(method)).useNaturalCycleEngine` matches whether `getCycleMode` returns `"hormonal"`:
   - If `getCycleMode` returns `"hormonal"`, `useNaturalCycleEngine` MUST be `false`
   - If `getCycleMode` returns `"natural"`, `useNaturalCycleEngine` MUST be `true`

4. **`calculateCycleInfo` determinism** — same inputs always produce same outputs:
   - Call twice with identical `(lastPeriodStart, cycleLength, cycleMode)` → assert `phase`, `currentDay`, `daysUntilNextPeriod` are identical

#### Part B: `tests/integration/crossEndpointIntegration.test.ts`

Integration test — needs DB. Mock GPT.

**Test cases:**

For each of these user configs, create user → call all 3 endpoints → assert agreement:

| Config | contraceptiveMethod | cycleDay | Expected phase |
|--------|-------------------|----------|---------------|
| Natural regular day 14 | `null` | 14 | ovulation |
| Natural regular day 35 (overdue) | `null` | 35 | luteal (delayed) |
| Hormonal (pill) day 14 | `"pill"` | 14 | follicular (NOT ovulation) |
| Natural irregular day 22 | `null` (cycleRegularity: "irregular") | 22 | luteal |
| Natural day 1 | `null` | 1 | menstrual |

For each config:
1. Call `getInsights` → extract `cycleDay` from response
2. Call `getHomeScreen` → extract phase info from response  
3. Call `getCalendar` with current month → find today's entry → extract `cycleDay`, `phase`
4. Assert: all three endpoints agree on `cycleDay`
5. Assert: all three endpoints agree on phase (where applicable — hormonal users may have `null` phase in some responses, which is correct)
6. For the overdue config: assert all three show `isPeriodDelayed === true`

**After writing:** Run `npx jest --testPathPattern=crossEndpoint`. Fix until green. Commit.

---

### TASK 5: VyanaContext Gating Tests

**Create file:** `tests/units/vyanaContextGating.test.ts`

**Imports:**
```typescript
import { buildVyanaContext, type VyanaContext, type EmotionalMemoryInput, type AnticipationFrequencyState } from "../../src/services/vyanaContext";
import { buildInsightContext } from "../../src/services/insightService";
import { buildHormoneState } from "../../src/services/hormoneengine";
import { makeBaseline, makeLogs, stableLogs, goodLogs, sleepDeprivedLogs, highStressLogs } from "../helpers/factories";
import type { NumericBaseline, CrossCycleNarrative } from "../../src/services/insightData";
import type { Phase } from "../../src/services/cycleEngine";
```

You will call `buildVyanaContext(params)` directly with constructed inputs. No DB, no GPT.

**Helper to build params:**
```typescript
function buildTestParams(overrides: Partial<Parameters<typeof buildVyanaContext>[0]> = {}) {
  const logs = overrides.ctx ? [] : stableLogs(7);
  const ctx = overrides.ctx ?? buildInsightContext("follicular", 10, logs, [], "none", 0, 28, "natural");
  const baseline = makeBaseline();
  return {
    ctx,
    baseline,
    crossCycleNarrative: null as CrossCycleNarrative | null,
    hormoneState: buildHormoneState("follicular", 10, 28, "natural", "none"),
    hormoneLanguage: null as string | null,
    phase: "follicular" as Phase,
    cycleDay: 10,
    phaseDay: 5,
    cycleLength: 28,
    cycleMode: "natural" as const,
    daysUntilNextPhase: 4,
    daysUntilNextPeriod: 19,
    isPeriodDelayed: false,
    daysOverdue: 0,
    isIrregular: false,
    memoryDriver: null as string | null,
    memoryCount: 0,
    userName: "Test User",
    userId: "test-user-123",
    anticipationFrequencyState: { lastShownCycleDay: null, lastShownType: null } as AnticipationFrequencyState,
    emotionalMemoryInput: null as EmotionalMemoryInput | null,
    primaryInsightCause: "cycle" as const,
    ...overrides,
  };
}
```

**Test groups:**

**Group 1: Identity layer gating** (8+ cases)
- `crossCycleNarrative: null` → `identity.hasPersonalHistory === false`, `identity.useThisOutput === false`
- `crossCycleNarrative` with `matchingCycles: 1` → `identity.hasPersonalHistory === false`
- `crossCycleNarrative` with `matchingCycles: 3, typicalStress: "elevated"` → `identity.hasPersonalHistory === true`
- When `identity.useThisOutput === true`: `identity.userPatternNarrative` must be a non-empty string
- When `identity.useThisOutput === true`: `identity.patternCore` must be non-empty
- `crossCycleNarrative` with `matchingCycles: 3` but `shouldUseIdentityThisOutput` returns false (seed-dependent) → `identity.useThisOutput === false` (test multiple cycleDay values to find one where it's suppressed)

**Group 2: Emotional memory gating** (8+ cases)
- `emotionalMemoryInput: null` → `emotionalMemory.hasMemory === false`
- `emotionalMemoryInput` with 1 occurrence → `emotionalMemory.hasMemory === false` (needs 2+)
- `emotionalMemoryInput` with 3 occurrences, all with mood `"low"` → `emotionalMemory.hasMemory === true`, `recallNarrative` includes `"low"` or `"feeling low"`
- `emotionalMemoryInput` with occurrences but moods are null → `emotionalMemory.hasMemory === false`
- Unknown driver (e.g., `memoryDriver: "unknown_driver_xyz"`) → `emotionalMemory.hasMemory === false`
- Valid driver `"sleep_below_baseline"` with 3 matching occurrences → `recallNarrative` includes "sleep dropped"

**Group 3: Anticipation gating** (8+ cases)
- `isIrregular: true` → `anticipation.shouldSurface === false`
- Same anticipation type shown yesterday (set `anticipationFrequencyState.lastShownCycleDay` to `cycleDay - 1`, `lastShownType` to expected type) → `anticipation.shouldSurface === false`
- Follicular phase + `daysUntilNextPhase: 2` → anticipation fires with type `"encouragement"`
- Late luteal (`cycleDay: 26`, `cycleLength: 28`, `phase: "luteal"`) → period relief anticipation
- `interaction_flags` includes `"sleep_stress_amplification"` + `memoryCount: 3` → warning anticipation

**Group 4: Surprise + delight mutual exclusivity** (5+ cases)
- Find a seed combination where surprise fires (may need to try multiple `cycleDay`/`cycleLength`/`userId` combos since it's seed-based: `(cycleDay * 13 + cycleLength * 7 + userHash) % 40 < 10`)
- When surprise fires: `surpriseInsight.shouldSurface === true` AND `delight.shouldSurface === false`
- When surprise does NOT fire: delight CAN fire (depending on its own gating)

**Group 5: High severity delight gating** (5+ cases)
- `memoryDriver: "sleep_stress_amplification"`, `memoryCount: 4`, physical_state `"high_strain"`, mental_state `"fatigued_and_stressed"` → `isHighSeverity === true`
- When high severity: delight type must be `"validation"` or `null` — never `"relief"` or `"normalcy"`
- `isPeriodDelayed: true` → delight type is `"reassurance"` (never blocked by severity)
- `bleeding_heavy` in priority drivers → `isHighSeverity === true`

**Group 6: Stable pattern detection** (4+ cases)
- No core signals, no high-weight narrative signals → `isStablePattern === true`
- Any core signal (e.g., delayed period, persistence narrative with high weight) → `isStablePattern === false`

**Group 7: Primary insight cause in serialized context** (4+ cases)
- `primaryInsightCause: "sleep_disruption"` → call `serializeVyanaContext(result)` → output includes `"PRIMARY CAUSE"`
- `primaryInsightCause: "stable"` → serialized output includes `"STABLE STATE"`
- `primaryInsightCause: "cycle"` AND `hormones.surface === true` → serialized output includes `"Hormone context"`
- `primaryInsightCause: "sleep_disruption"` → serialized output does NOT include `"Hormone context"`

Import `serializeVyanaContext` from `../../src/services/vyanaContext`.

**After writing:** Run `npx jest --testPathPattern=vyanaContextGating`. Fix until green. Commit.

---

### TASK 6: Final Validation

After all 5 test files are written and passing individually:

```bash
npx jest --testPathPattern="chatIntentClassifier|vyanaContextGating|crossEndpointConsistency|contraceptionTransition|forecastEndpoint|crossEndpointIntegration" --verbose
```

Report:
- Total tests
- Total passing
- Any failures (with details)
- Execution time

If everything passes, make a final commit: `test: complete test gap coverage sprint (6 gaps, ~150 cases)`

---

## ANTI-PATTERNS — DO NOT DO THESE

1. **DO NOT** create a parallel pipeline wrapper or test runner. The existing `src/testRunner/` handles that.
2. **DO NOT** modify any existing test file.
3. **DO NOT** call real OpenAI/GPT in any test. Always mock.
4. **DO NOT** create new factory files. Use `tests/helpers/factories.ts`. If you need a new preset, ADD it to the existing factories file.
5. **DO NOT** import from paths that don't exist. Verify every import compiles before writing assertions.
6. **DO NOT** write tests for things already covered (cycle engine math, guard layer, confidence language, etc.).
7. **DO NOT** use positional args for `applyAllGuards` — it takes an object `{ insights, cycleDay, cycleLength, phase, logsCount }`.
8. **DO NOT** skip cleanup in integration tests. Every created user must be deleted in `afterAll` or `afterEach`.
9. **DO NOT** ask the human for clarification. Everything you need is in this file and in the source code. If unsure, read the source file referenced above.