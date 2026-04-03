# IMPLEMENT_INSIGHT_ENGINE_V2.md

> Read this entire file first. Then execute each TASK in order.
> For each task: implement → write test → run test → fix until green → move to next task.
> Do NOT skip testing. Do NOT move to the next task until the current task's tests pass.
> If you hit an ambiguity, make the conservative choice.

---

## CONTEXT

You are upgrading Vyana's insight engine from phase-first to signal-first architecture.

**The reference document** `VYANA_COMPLETE_REFERENCE.md` is in the repo root. Read it if you need medical/architectural context, but DO NOT get lost in it. This file tells you exactly what to build.

**The core problem**: Right now, the insight pipeline thinks "User is on Day X → show Day X insight." Even when the user logs bad sleep + high stress on a high-energy phase day, the insight talks about estrogen rising. This breaks trust.

**The fix**: Signals first, phase second. Every insight must reflect what the user actually logged, acknowledge trends, detect conflicts between signals and phase, and follow a strict output contract.

**Stack**: Node.js / TypeScript / Express / Prisma / PostgreSQL / OpenAI GPT-4o-mini
**Test framework**: Jest
**Test location**: `tests/`
**Key files you'll modify**:
- `src/services/insightService.ts` — signal processing, insight context building
- `src/services/vyanaContext.ts` — VyanaContext builder (add new fields)
- `src/services/insightGptService.ts` — GPT prompt + system prompt
- `src/controllers/insightController.ts` — pipeline orchestration

---

## TASK 1: Build the Narrative Selector

**What**: A pure function that examines today's signals, phase, and recent history, then returns the primary narrative type. This runs BEFORE GPT is called. It is deterministic — no AI.

**Where**: Create new file `src/services/narrativeSelector.ts`

**Interface**:

```typescript
export type PrimaryNarrative = 
  | 'severe_symptom'    // any logged symptom >= 7/10
  | 'conflict'          // signals contradict phase expectations
  | 'signal_change'     // significant change from yesterday
  | 'pattern_shift'     // deviation from personal baseline (2+ cycles)
  | 'escalation'        // red flag threshold met
  | 'phase';            // default fallback — describe the phase

export interface NarrativeSelectorInput {
  cycleDay: number;
  phase: string;        // 'menstrual' | 'follicular' | 'ovulation' | 'early_luteal' | 'mid_luteal' | 'late_luteal'
  latestLog: {
    mood?: number;      // 1-5
    energy?: number;    // 1-5
    sleep?: number;     // 1-5
    stress?: number;    // 1-5
    cramps?: number;    // 0-10
    bleeding?: string;  // 'none' | 'light' | 'medium' | 'heavy'
    headache?: boolean;
    breastTenderness?: boolean;
  } | null;
  previousDayLog: {
    mood?: number;
    energy?: number;
    cramps?: number;
    sleep?: number;
  } | null;
  personalBaseline: {
    avgCrampsSameDay?: number;
    avgEnergySameDay?: number;
    avgMoodSameDay?: number;
  } | null;
  logsCount: number;
  bleedingDays?: number; // consecutive days of bleeding
}

export interface NarrativeSelectorOutput {
  primaryNarrative: PrimaryNarrative;
  conflictDetected: boolean;
  conflictDescription: string | null;
  trend: {
    cramps?: 'improving' | 'worsening' | 'stable';
    energy?: 'improving' | 'worsening' | 'stable';
    mood?: 'improving' | 'worsening' | 'stable';
    sleep?: 'improving' | 'worsening' | 'stable';
  };
}

export function selectNarrative(input: NarrativeSelectorInput): NarrativeSelectorOutput;
```

**Logic (implement in this priority order)**:

```
1. SEVERE SYMPTOM: if latestLog.cramps >= 7 → 'severe_symptom'

2. ESCALATION: if bleedingDays > 7 → 'escalation'

3. CONFLICT: check signal-phase mismatch:
   - energy <= 2 AND phase is 'follicular' (day 6+) → conflict ("Low energy during follicular — expected to rise")
   - mood >= 4 AND phase is 'late_luteal' → conflict ("High mood during late luteal — mood usually dips")
   - energy >= 4 AND phase is 'menstrual' (days 1-3) → conflict ("High energy during menstruation — fatigue expected")
   - sleep <= 2 AND phase is 'early_luteal' → conflict ("Poor sleep in early luteal — progesterone should aid sleep")
   - cramps >= 5 AND phase is 'follicular' (day 8+) → conflict ("Cramps during mid-follicular — not prostaglandin-driven")
   - stress >= 4 AND phase is 'follicular' → conflict ("High stress during follicular — may suppress expected energy rise")
   - mood <= 2 AND phase is 'ovulation' → conflict ("Low mood at ovulation — estrogen peak usually lifts mood")
   - energy >= 4 AND phase is 'late_luteal' → conflict ("High energy during late luteal — energy usually drops with hormone withdrawal")

4. SIGNAL CHANGE: if previousDayLog exists, check:
   - |cramps_today - cramps_yesterday| >= 3 → 'signal_change'
   - |energy_today - energy_yesterday| >= 2 → 'signal_change'
   - |mood_today - mood_yesterday| >= 2 → 'signal_change'

5. PATTERN SHIFT: if personalBaseline exists (logsCount >= 14, meaning 2+ cycles):
   - |cramps - avgCrampsSameDay| > 3 → 'pattern_shift'
   - |energy - avgEnergySameDay| > 1.5 → 'pattern_shift'

6. DEFAULT: 'phase'
```

**Trend computation**: For each metric where both today and yesterday exist:
- today > yesterday → 'worsening' (for cramps/stress) or 'improving' (for energy/mood/sleep)
- today < yesterday → 'improving' (for cramps/stress) or 'worsening' (for energy/mood/sleep)
- equal or within 1 → 'stable'

(Note: for cramps and stress, higher = worse. For energy, mood, sleep, higher = better.)

**Conflict detection**: Set `conflictDetected = true` and populate `conflictDescription` with a human-readable string when any conflict rule fires. This string will be passed to GPT.

### TEST for Task 1

Create `tests/unit/narrativeSelector.test.ts`:

```
Test cases to write (at minimum):

1. "returns severe_symptom when cramps >= 7"
   Input: cramps=8, phase=menstrual, day 2
   Expected: primaryNarrative = 'severe_symptom'

2. "returns conflict when energy is low during follicular"
   Input: energy=1, phase=follicular, day 9, no severe symptoms
   Expected: primaryNarrative = 'conflict', conflictDetected = true

3. "returns signal_change when cramps jump significantly"
   Input: cramps=6 today, cramps=2 yesterday, phase=menstrual
   Expected: primaryNarrative = 'signal_change' (unless severe triggers first — cramps < 7)

4. "returns phase as default when no signals logged"
   Input: latestLog = null
   Expected: primaryNarrative = 'phase'

5. "returns phase as default when everything is normal"
   Input: energy=3, mood=3, cramps=2, phase=follicular, day 8
   Expected: primaryNarrative = 'phase'

6. "returns escalation when bleeding > 7 days"
   Input: bleedingDays=8, phase=menstrual
   Expected: primaryNarrative = 'escalation'

7. "computes trend correctly — cramps worsening"
   Input: cramps=6 today, cramps=3 yesterday
   Expected: trend.cramps = 'worsening'

8. "computes trend correctly — energy improving"
   Input: energy=4 today, energy=2 yesterday
   Expected: trend.energy = 'improving'

9. "severe_symptom takes priority over conflict"
   Input: cramps=8, energy=1, phase=follicular, day 10
   Expected: primaryNarrative = 'severe_symptom' (not conflict)

10. "conflict takes priority over signal_change"
    Input: energy=2 (was 4 yesterday), phase=follicular, day 9
    Expected: primaryNarrative = 'conflict' (not signal_change)

11. "conflict detected for high stress during follicular"
    Input: stress=5, energy=3, phase=follicular, day 10
    Expected: primaryNarrative = 'conflict', conflictDescription contains "stress"

12. "conflict detected for low mood at ovulation"
    Input: mood=1, phase=ovulation, day 14
    Expected: primaryNarrative = 'conflict', conflictDescription contains "mood"

13. "conflict detected for high energy during late luteal"
    Input: energy=5, phase=late_luteal, day 26
    Expected: primaryNarrative = 'conflict', conflictDescription contains "energy"
```

**Run**: `npx jest tests/unit/narrativeSelector.test.ts --verbose`
**Fix until all pass. Then move to Task 2.**

---

## TASK 2: Build Interaction Rules Engine

**What**: A set of deterministic rules that detect multi-signal interactions and return override instructions for the insight. These are hardcoded if/else rules — no ML, no AI.

**Where**: Create new file `src/services/interactionRules.ts`

**Interface**:

```typescript
export interface InteractionRuleInput {
  latestLog: {
    mood?: number;
    energy?: number;
    sleep?: number;
    stress?: number;
    cramps?: number;
    bleeding?: string;
  } | null;
  phase: string;
  cycleDay: number;
  trend: {
    energy?: 'improving' | 'worsening' | 'stable';
    cramps?: 'improving' | 'worsening' | 'stable';
  };
  consecutiveLowEnergyDays: number; // how many days in a row energy <= 2
  bleedingActive: boolean;
}

export interface InteractionRuleOutput {
  overrideExplanation: string | null;   // if set, GPT must use this as the primary explanation
  amplifyMoodSensitivity: boolean;      // tell GPT to emphasize mood vulnerability
  mechanismRequired: boolean;           // tell GPT to include biological explanation
  reinforcePositive: boolean;           // tell GPT to affirm what the user is feeling
}

export function evaluateInteractionRules(input: InteractionRuleInput): InteractionRuleOutput;
```

**Rules to implement**:

```
1. SLEEP-FATIGUE OVERRIDE (strongest predictor of next-day energy):
   IF sleep <= 2 → overrideExplanation = "Your low sleep is likely the biggest factor in how you're feeling today — it overrides most hormonal effects"

2. STRESS-LUTEAL AMPLIFICATION:
   IF stress >= 4 AND phase in ['mid_luteal', 'late_luteal'] → amplifyMoodSensitivity = true

3. PAIN ESCALATION:
   IF cramps trend is 'worsening' AND cycleDay <= 3 → mechanismRequired = true (prostaglandin narrative needed)

4. ENERGY-PHASE POSITIVE REINFORCEMENT:
   IF energy >= 4 AND phase is 'follicular' → reinforcePositive = true

5. CUMULATIVE FATIGUE:
   IF consecutiveLowEnergyDays >= 3 AND bleedingActive → overrideExplanation = "You've had low energy for several days during your period — persistent fatigue during bleeding can sometimes relate to iron levels. Worth noting if this is a recurring pattern."

6. STRESS-SLEEP COMPOUND:
   IF stress >= 4 AND sleep <= 2 → overrideExplanation = "High stress combined with poor sleep creates a compounding effect — your body is working harder to recover, which can make everything feel heavier today"
```

**Priority**: If multiple rules fire, the one listed first wins for `overrideExplanation`. Boolean flags (amplifyMoodSensitivity, mechanismRequired, reinforcePositive) can all be true simultaneously.

### TEST for Task 2

Create `tests/unit/interactionRules.test.ts`:

```
Test cases:

1. "sleep-fatigue override fires when sleep <= 2"
   Input: sleep=1, phase=follicular
   Expected: overrideExplanation contains "low sleep"

2. "stress-luteal amplification fires"
   Input: stress=4, phase=late_luteal
   Expected: amplifyMoodSensitivity = true

3. "pain escalation requires mechanism"
   Input: cramps trend worsening, cycleDay=2
   Expected: mechanismRequired = true

4. "positive reinforcement when energy high in follicular"
   Input: energy=5, phase=follicular
   Expected: reinforcePositive = true

5. "cumulative fatigue fires after 3 low-energy days during bleeding"
   Input: consecutiveLowEnergyDays=3, bleedingActive=true
   Expected: overrideExplanation contains "iron" or "persistent fatigue"

6. "stress-sleep compound fires"
   Input: stress=5, sleep=1
   Expected: overrideExplanation contains "compounding"

7. "sleep override takes priority over stress-sleep compound"
   Input: sleep=1, stress=5
   Expected: overrideExplanation is the sleep-fatigue one (first rule wins)

8. "returns all nulls/false when signals are normal"
   Input: sleep=4, stress=2, energy=3, cramps=1
   Expected: overrideExplanation = null, all booleans false

9. "no crash when latestLog is null"
   Input: latestLog = null
   Expected: all nulls/false, no error
```

**Run**: `npx jest tests/unit/interactionRules.test.ts --verbose`
**Fix until all pass. Then move to Task 3.**

---

## TASK 3: Extend VyanaContext with New Fields

**What**: Add the new fields from Section 8.8 of the reference doc to the existing VyanaContext. This is NOT a rewrite — it's adding fields to the existing builder.

**Where**: Modify `src/services/vyanaContext.ts`

**What to add to the VyanaContext type** (add these fields alongside existing ones — do NOT remove anything):

```typescript
// Add to VyanaContext interface:
latestLogSignals: {
  mood?: number;
  energy?: number;
  sleep?: number;
  stress?: number;
  cramps?: number;
  bleeding?: string;
  headache?: boolean;
  breastTenderness?: boolean;
} | null;

recentTrend: {
  mood?: 'improving' | 'worsening' | 'stable';
  energy?: 'improving' | 'worsening' | 'stable';
  cramps?: 'improving' | 'worsening' | 'stable';
  sleep?: 'improving' | 'worsening' | 'stable';
} | null;

previousDaySignals: {
  mood?: number;
  energy?: number;
  cramps?: number;
  sleep?: number;
} | null;

primaryNarrative: string;       // from narrativeSelector
conflictDetected: boolean;
conflictDescription: string | null;

interactionOverride: string | null;     // from interactionRules
amplifyMoodSensitivity: boolean;
mechanismRequired: boolean;
reinforcePositive: boolean;
```

**What to add to `buildVyanaContext` params**: Accept the new fields as optional params (so existing callers don't break):

```typescript
// Add to buildVyanaContext params:
latestLogSignals?: { ... } | null;
recentTrend?: { ... } | null;
previousDaySignals?: { ... } | null;
primaryNarrative?: string;
conflictDetected?: boolean;
conflictDescription?: string | null;
interactionOverride?: string | null;
amplifyMoodSensitivity?: boolean;
mechanismRequired?: boolean;
reinforcePositive?: boolean;
```

Default all new params to null/false/'phase' so the existing callers in insightController.ts and chatController.ts don't break.

**What to add to `serializeVyanaContext`**: Add a new block in the serialized output:

```
=== SIGNAL CONTEXT (HIGHEST PRIORITY — READ THIS FIRST) ===
Primary narrative: {primaryNarrative}
{if conflictDetected: "⚠️ CONFLICT: " + conflictDescription}
{if interactionOverride: "OVERRIDE: " + interactionOverride}
{if latestLogSignals: "Today's logged signals: " + JSON.stringify(latestLogSignals)}
{if recentTrend: "Recent trend: " + JSON.stringify(recentTrend)}
{if previousDaySignals: "Yesterday's signals: " + JSON.stringify(previousDaySignals)}
{if amplifyMoodSensitivity: "Note: Amplify mood sensitivity in this insight"}
{if mechanismRequired: "Note: Include biological mechanism explanation"}
{if reinforcePositive: "Note: Reinforce and affirm the positive state"}
```

This block should appear BEFORE the existing phase/hormone context in the serialized output, so GPT reads signals first.

### TEST for Task 3

Create `tests/unit/vyanaContextV2.test.ts`:

```
Test cases:

1. "existing VyanaContext fields still work when new fields not provided"
   Call buildVyanaContext with existing params only (no new fields)
   Expected: builds successfully, new fields default to null/false/'phase'

2. "new fields are included when provided"
   Call buildVyanaContext with latestLogSignals, primaryNarrative='conflict', conflictDetected=true
   Expected: context object has those fields set correctly

3. "serializeVyanaContext includes signal context block"
   Build context with primaryNarrative='severe_symptom', latestLogSignals={cramps:8}
   Call serializeVyanaContext
   Expected: output string contains "Primary narrative: severe_symptom" 
   Expected: output string contains "cramps" and "8"

4. "signal context appears BEFORE phase context in serialized output"
   Build context with both signal and phase data
   Call serializeVyanaContext
   Expected: indexOf("SIGNAL CONTEXT") < indexOf("=== IDENTITY") or indexOf("Phase:")

5. "conflict description appears when conflict detected"
   Build with conflictDetected=true, conflictDescription="Low energy during follicular"
   Expected: serialized output contains "CONFLICT: Low energy during follicular"

6. "backward compatibility — calling without new fields doesn't crash"
   Call buildVyanaContext with only the original required params
   Run serializeVyanaContext on result
   Expected: no errors, output is valid string
```

**Run**: `npx jest tests/unit/vyanaContextV2.test.ts --verbose`

**IMPORTANT**: Also run the existing VyanaContext tests to make sure nothing is broken:
`npx jest tests/ --grep "vyanaContext\|vyana" --verbose`

**Fix until all pass. Then move to Task 4.**

---

## TASK 4: Wire It All Together in insightController

**What**: In the `getInsights` function, call the narrative selector and interaction rules before building VyanaContext, then pass the results through.

**Where**: Modify `src/controllers/insightController.ts`

**Changes** (apply in order):

1. **Add imports at top**:
```typescript
import { selectNarrative } from "../services/narrativeSelector";
import { evaluateInteractionRules } from "../services/interactionRules";
```

2. **After `buildInsightContext` and `getUserInsightData` calls, before `buildVyanaContext` call**, add:

```typescript
// --- Narrative Selection (signal-first logic) ---
const latestLog = /* extract from the most recent log in the user's logs array */;
const previousDayLog = /* extract from the second-most-recent log */;

const narrativeResult = selectNarrative({
  cycleDay: cycleInfo.currentDay,
  phase: cycleInfo.phase,
  latestLog,
  previousDayLog,
  personalBaseline: numericBaseline ? {
    avgCrampsSameDay: numericBaseline.avgCramps ?? undefined,
    avgEnergySameDay: numericBaseline.avgEnergy ?? undefined,
    avgMoodSameDay: numericBaseline.avgMood ?? undefined,
  } : null,
  logsCount: context.logsCount,
  bleedingDays: /* count consecutive bleeding days from recent logs */,
});

// --- Interaction Rules ---
const interactionResult = evaluateInteractionRules({
  latestLog,
  phase: cycleInfo.phase,
  cycleDay: cycleInfo.currentDay,
  trend: narrativeResult.trend,
  consecutiveLowEnergyDays: /* count from recent logs where energy <= 2 */,
  bleedingActive: latestLog?.bleeding !== 'none' && latestLog?.bleeding !== undefined,
});
```

3. **Pass to buildVyanaContext** (add to the existing call's params):
```typescript
latestLogSignals: latestLog,
recentTrend: narrativeResult.trend,
previousDaySignals: previousDayLog,
primaryNarrative: narrativeResult.primaryNarrative,
conflictDetected: narrativeResult.conflictDetected,
conflictDescription: narrativeResult.conflictDescription,
interactionOverride: interactionResult.overrideExplanation,
amplifyMoodSensitivity: interactionResult.amplifyMoodSensitivity,
mechanismRequired: interactionResult.mechanismRequired,
reinforcePositive: interactionResult.reinforcePositive,
```

**IMPORTANT NOTES**:
- To extract `latestLog` and `previousDayLog`: look at how `insightData.ts` already fetches logs. The logs should already be available in the pipeline. Use the most recent day's log and the day before.
- To count `bleedingDays`: count backwards from today through consecutive days where bleeding is not 'none'.
- To count `consecutiveLowEnergyDays`: count backwards through logs where energy <= 2.
- If logs are empty (new user), `latestLog` = null and everything degrades gracefully.

### TEST for Task 4

Create `tests/integration/insightPipelineV2.test.ts`:

This is an integration test that calls the actual `getInsights` controller (with GPT mocked) and verifies the new fields flow through.

```
Mock GPT (same pattern as existing integration tests):
jest.mock("../../src/services/aiService", () => {
  const original = jest.requireActual("../../src/services/aiService");
  return {
    ...original,
    generateInsightsWithGpt: jest.fn().mockResolvedValue({
      insights: { /* standard mock insights */ },
      status: "success",
    }),
    generateForecastWithGpt: jest.fn().mockResolvedValue("Mocked forecast"),
  };
});

Test cases:

1. "getInsights succeeds with no logs (new user) — narrative defaults to phase"
   Create user with period start, no logs
   Call getInsights
   Expected: 200 response, insights present, no crash

2. "getInsights succeeds with logs — narrative selector runs"
   Create user with period start + 3 days of logs (including cramps=8 on day 2)
   Call getInsights  
   Expected: 200 response, insights present

3. "VyanaContext passed to GPT includes signal context"
   Create user with logs
   Call getInsights
   Inspect what was passed to generateInsightsWithGpt mock
   Expected: the vyanaCtx parameter has latestLogSignals populated, primaryNarrative set

4. "Pipeline doesn't crash when all new components return defaults"
   Create user with minimal data
   Expected: 200, no error, graceful degradation
```

**Run**: `npx jest tests/integration/insightPipelineV2.test.ts --verbose`
**Also run ALL existing tests to check for regressions**: `npx jest --verbose 2>&1 | tail -30`
**Fix until all pass. Then move to Task 5.**

---

## TASK 5: Update GPT System Prompt with Prompt Contract

**What**: Modify the system prompt in `insightGptService.ts` to enforce the 10 hard rules from Section 8.9 of the reference doc. This is where GPT gets told "signals first, no generic phrases."

**Where**: Modify `src/services/insightGptService.ts` — find the existing `VYANA_SYSTEM_PROMPT` constant or the system prompt string.

**What to add** (prepend to the existing system prompt, so it's the first thing GPT reads):

```
=== HARD OUTPUT RULES — VIOLATING ANY IS UNACCEPTABLE ===

1. SIGNAL-FIRST: Do NOT begin any insight with phase or hormone context. Begin with the user's actual state — what they logged, how they're trending, what changed.

2. NARRATIVE LOCK: This insight is primarily about: {primaryNarrative}. 
   All content must support this primary narrative. Do not introduce unrelated themes.

3. REFLECTION REQUIRED: You MUST reference at least one specific signal from today's logged data. If the user logged cramps=7, that must appear in the output.

4. TEMPORAL ANCHOR: Every insight MUST include either a comparison to yesterday/recent days OR a projection of what to expect next.

5. MAX LENGTH: 3-6 sentences total. ONE primary idea. No filler.

6. BANNED PHRASES — never use these:
   - "Many people find..."
   - "It's common to..."  
   - "The body is..." (use "Your body is...")
   - "Some women experience..."
   - Any sentence that could apply to any user on this cycle day

7. CONFLICT MODE: If conflict is flagged in the signal context, you MUST:
   - Lead with the user's actual experience
   - Acknowledge what the phase would normally predict
   - Explain WHY the override is happening
   
8. CONFIDENCE MATCHING:
   - If user has < 2 cycles: use "you might notice..." / "around this time..."
   - If 2-3 cycles: use "your logs suggest..." / "based on what you've shared..."  
   - If 3+ cycles: use "your pattern shows..." / "across your cycles..."

9. When an OVERRIDE is provided in signal context, use it as the primary explanation.

10. Only reference symptoms the user has actually logged. Never invent patterns.

ENFORCEMENT: If any of the above rules are violated, your output will be automatically rejected and you will be asked to regenerate. Comply fully on the first attempt.
```

**How to inject dynamic values**: The `{primaryNarrative}` placeholder should be replaced with the actual value from VyanaContext when building the prompt. Same for confidence level.

**ALSO**: In the function that builds the user message / context for GPT, make sure the serialized VyanaContext (which now includes the signal context block) is passed in full.

### TEST for Task 5

Create `tests/unit/promptContract.test.ts`:

This test verifies the prompt is constructed correctly — it doesn't call GPT, just checks the string.

```
Test cases:

1. "system prompt contains HARD OUTPUT RULES section"
   Build the prompt with a sample VyanaContext
   Expected: prompt string includes "HARD OUTPUT RULES"

2. "system prompt contains BANNED PHRASES section"
   Expected: prompt includes "Many people find"

3. "primaryNarrative is injected into prompt"
   Build with primaryNarrative='conflict'
   Expected: prompt includes "This insight is primarily about: conflict"

4. "conflict description appears in prompt when conflict detected"
   Build with conflictDetected=true, conflictDescription="Low energy during follicular"
   Expected: prompt includes "Low energy during follicular"

5. "signal context appears before phase context in prompt"
   Build full prompt
   Expected: indexOf("SIGNAL CONTEXT") < indexOf of phase/hormone context
```

**Run**: `npx jest tests/unit/promptContract.test.ts --verbose`
**Fix until all pass. Then move to Task 6.**

---

## TASK 6: Build Insight Validator

**What**: A post-GPT validation function that checks the generated insight against the hard rules. If it fails, the insight is regenerated (max 2 retries) or a safe fallback is used.

**Where**: Create new file `src/services/insightValidator.ts`

**Interface**:

```typescript
export interface InsightValidationInput {
  output: string;              // the raw GPT output text (any single insight field)
  primaryNarrative: string;
  latestLogSignals: Record<string, any> | null;
  conflictDetected: boolean;
  confidenceLevel: 'low' | 'medium' | 'high';
}

export interface ValidationResult {
  valid: boolean;
  hardFails: string[];     // names of failed hard checks
  softFails: string[];     // names of failed soft checks
}

export function validateInsightField(input: InsightValidationInput): ValidationResult;
```

**Hard checks** (any failure = invalid):

```
1. reflectsLogSignals: if latestLogSignals is not null, the output must contain 
   at least one SPECIFIC reference to a logged signal. For each signal in latestLogSignals:
   - Build a keyword set: e.g., cramps → ["cramps", "pain", "cramping", the numeric value as string]
   - energy → ["energy", "drained", "tired", "fatigue", the numeric value]
   - sleep → ["sleep", "rest", "slept", the numeric value]
   - stress → ["stress", "stressed", "tense", the numeric value]
   - mood → ["mood", "feeling", "felt", the numeric value]
   - headache → ["headache", "head"]
   - bleeding → ["bleeding", "flow", "period"]
   The output must match at least ONE keyword from at least ONE logged signal's set.
   Generic phrases like "not feeling great" do NOT count — must be signal-specific.

2. noBannedPhrases: output must NOT match:
   /many people find|it's common to|some women|the body is[^a-z]/i

3. notPhaseFirst: output must NOT start with phase/hormone phrasing:
   /^(your estrogen|your progesterone|in the .* phase|during this phase|this phase)/i

4. withinLength: output split by sentence-ending punctuation (.!?) must have <= 6 sentences

5. acknowledgesConflict: if conflictDetected = true, output must contain at least one of:
   /even though|despite|usually|normally|override|unexpected/i
```

**Soft checks** (log warning only):

```
1. hasTemporalAnchor: output contains /tomorrow|next .* days|yesterday|compared to|easing|building|improving|worsening/i

2. matchesConfidence: 
   - if 'low': should NOT contain "your pattern shows" or "across your cycles"
   - if 'high': should NOT contain "you might notice" or "around this time"

3. tooBroad: count distinct theme keywords in output.
   Theme sets: pain=["cramps","pain","ache"], sleep=["sleep","rest","tired"], 
   mood=["mood","feeling","irritable","anxious"], energy=["energy","drained","fatigue"],
   hormones=["estrogen","progesterone","hormone"]
   If output matches keywords from > 3 different theme sets → softFail: 'tooBroad'
```

**Fallback Insight Generator**:

Also create a `generateFallbackInsight` function in the same file. This is used when GPT fails validation after max retries.

```typescript
export function generateFallbackInsight(
  primaryNarrative: string,
  latestLogSignals: Record<string, any> | null,
  cycleDay: number,
  phase: string
): string;
```

Logic:
```
- If latestLogSignals has cramps >= 5:
  "Your cramps are high today. Day {cycleDay} often brings peak intensity, and this usually eases within a day or two."

- If latestLogSignals has energy <= 2:
  "Your energy is low right now. Your body is working through this phase, and things typically start shifting in the next couple of days."

- If latestLogSignals has sleep <= 2:
  "Your sleep was rough last night, and that's likely affecting how everything feels today. Rest when you can — tomorrow may be different."

- If conflictDetected:
  "What you're feeling today doesn't match what this phase usually brings — that's okay. Sleep, stress, and other factors can override hormonal patterns."

- Default fallback:
  "You're on day {cycleDay} of your cycle. {phase-appropriate single sentence}. Logging how you feel helps build a clearer picture over time."
```

The fallback must ALWAYS:
- Be 2-3 sentences max
- Reference a logged signal if one exists
- Never contain banned phrases
- Include a temporal anchor

### TEST for Task 6

Create `tests/unit/insightValidator.test.ts`:

```
Test cases:

1. "passes when all checks satisfied"
   Input: output="Your cramps are intense today at 7/10. This is typical for Day 2 as prostaglandins peak. Tomorrow should feel easier."
   latestLogSignals={cramps:7}, primaryNarrative='severe_symptom', conflictDetected=false
   Expected: valid=true, hardFails=[], softFails=[]

2. "fails when banned phrase present"
   Input: output="Many people find that Day 2 is the hardest."
   Expected: valid=false, hardFails includes 'noBannedPhrases'

3. "fails when output starts with phase context"
   Input: output="During this phase, your hormones are low..."
   Expected: valid=false, hardFails includes 'notPhaseFirst'

4. "fails when conflict not acknowledged"
   Input: conflictDetected=true, output="Your energy is great today." (no conflict language)
   Expected: valid=false, hardFails includes 'acknowledgesConflict'

5. "fails when log signals not reflected"
   Input: latestLogSignals={cramps:8}, output="Today is a good day for rest." (no mention of cramps)
   Expected: valid=false, hardFails includes 'reflectsLogSignals'

6. "passes when latestLogSignals is null (new user)"
   Input: latestLogSignals=null, output="Around this time, energy tends to be lower."
   Expected: valid=true (reflectsLogSignals check skipped)

7. "soft fail for missing temporal anchor"
   Input: output="Your cramps are at 7/10." (no yesterday/tomorrow reference)
   Expected: valid=true (soft fails don't block), softFails includes 'hasTemporalAnchor'

8. "fails when output exceeds 6 sentences"
   Input: output with 8 sentences
   Expected: valid=false, hardFails includes 'withinLength'

9. "soft fail when output is too broad (4+ themes)"
   Input: output="Your cramps are high, sleep was poor, mood is low, energy is drained, and estrogen is dropping."
   Expected: valid=true (soft), softFails includes 'tooBroad'

10. "reflection check rejects vague output that doesn't name any signal"
    Input: latestLogSignals={cramps:8, energy:1}, output="Today might feel a bit off. Take it easy."
    Expected: valid=false, hardFails includes 'reflectsLogSignals'
    (output says nothing about cramps, pain, energy, drained, fatigue, or any numeric value)

11. "reflection check accepts output with semantic synonym"
    Input: latestLogSignals={cramps:8}, output="The pain you're feeling is intense today."
    Expected: valid=true (reflectsLogSignals passes — "pain" maps to cramps)

12. "generateFallbackInsight returns valid output for cramps"
    Input: latestLogSignals={cramps:8}, cycleDay=2, phase='menstrual'
    Expected: output mentions "cramps", is 2-3 sentences, has temporal anchor

13. "generateFallbackInsight returns valid output for null signals (new user)"
    Input: latestLogSignals=null, cycleDay=5, phase='menstrual'
    Expected: output mentions cycle day, is 2-3 sentences, no banned phrases

14. "generateFallbackInsight never contains banned phrases"
    Run fallback for all 5 scenarios (cramps, energy, sleep, conflict, default)
    Expected: none match /many people find|it's common to|some women/i
```

**Run**: `npx jest tests/unit/insightValidator.test.ts --verbose`
**Fix until all pass.**

---

## PERFORMANCE NOTE

The new pipeline adds: narrativeSelector (pure sync function, <1ms) + interactionRules (pure sync function, <1ms) + validator (regex checks, <5ms) + max 2 GPT retries (worst case: 3 GPT calls instead of 1).

**Constraints to enforce**:
- narrativeSelector and interactionRules must be pure synchronous functions — no DB calls, no async
- Validator must use only regex and string checks — no external calls
- Max 2 retries, then fallback — never 3+ GPT calls
- Log all retry/fallback events for monitoring
- Total pipeline target: <3 seconds for 95th percentile (GPT call is the bottleneck, not your code)

---

## TASK 7: Run Full Test Suite & Report

After all 6 tasks are complete and their individual tests pass:

1. Run the complete test suite:
```bash
npx jest --verbose 2>&1 | tail -50
```

2. Run TypeScript compilation check:
```bash
npx tsc --noEmit 2>&1 | tail -20
```

3. Report:
   - Total tests passing
   - Any regressions in existing tests
   - Any TypeScript errors
   - Summary of files created/modified

**If there are regressions**: Fix them before considering this done. The new code must not break existing functionality.

---

## FILES CREATED / MODIFIED SUMMARY

**New files**:
- `src/services/narrativeSelector.ts` (Task 1)
- `src/services/interactionRules.ts` (Task 2)
- `src/services/insightValidator.ts` (Task 6) — includes `validateInsightField` + `generateFallbackInsight`
- `tests/unit/narrativeSelector.test.ts` (Task 1)
- `tests/unit/interactionRules.test.ts` (Task 2)
- `tests/unit/vyanaContextV2.test.ts` (Task 3)
- `tests/unit/promptContract.test.ts` (Task 5)
- `tests/unit/insightValidator.test.ts` (Task 6)
- `tests/integration/insightPipelineV2.test.ts` (Task 4)

**Modified files**:
- `src/services/vyanaContext.ts` — new fields added (Task 3)
- `src/controllers/insightController.ts` — narrative selector + interaction rules wired in (Task 4)
- `src/services/insightGptService.ts` — prompt contract added (Task 5)

**NOT modified** (these must remain untouched):
- `src/services/cycleEngine.ts`
- `src/services/insightData.ts`
- `src/services/insightGuard.ts`
- `src/services/insightCause.ts`
- `src/services/insightMemory.ts`
- `src/services/insightView.ts`
- `src/services/hormoneengine.ts`
- `src/services/contraceptionengine.ts`
- All route files
- Auth middleware
- Prisma schema