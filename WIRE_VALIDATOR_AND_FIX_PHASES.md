# WIRE_VALIDATOR_AND_FIX_PHASES.md
# Claude Code Execution File — 3 Tasks

## Context

Read `VYANA_COMPLETE_REFERENCE.md` and `IMPLEMENT_INSIGHT_ENGINE_V2.md` for full context.

The V2 Insight Engine was implemented across 7 tasks. Three critical gaps remain:

1. **`insightValidator.ts` exists but is NOT wired into `insightController.ts`.** GPT output is never validated post-generation. Banned phrases, phase-first openings, missing signal reflection, and conflict acknowledgment failures reach the user uncaught.

2. **Phase strings in `interactionRules.ts` and `narrativeSelector.ts` reference phases that don't exist.** `cycleEngine.ts` produces exactly 4 phases: `menstrual`, `follicular`, `ovulation`, `luteal`. But the V2 code checks for `mid_luteal`, `late_luteal`, `early_luteal` — strings that are never produced. This silently disables conflict detection and interaction rules for the entire luteal phase.

3. **The validator's `checkNotPhaseFirst` only checks the first characters of output.** Phase-framing language mid-text (e.g., "This is typical for day 4 of the cycle") passes uncaught.

## Files you WILL modify

- `src/controllers/insightController.ts` — wire validator + fallback into post-GPT step
- `src/services/interactionRules.ts` — fix phase string checks
- `src/services/narrativeSelector.ts` — fix phase string checks in `detectConflict`
- `src/services/insightValidator.ts` — strengthen `checkNotPhaseFirst`, add `checkNoIncompleteSentences`

## Files you MUST NOT touch

- cycleEngine, insightGuard, insightCause, insightMemory, insightView
- hormoneengine, contraceptionengine
- routes, auth, Prisma schema
- vyanaContext.ts, insightGptService.ts (V2 changes are final)

---

## Task 1: Fix phase string mismatches

### 1A: `src/services/interactionRules.ts`

**Problem:** Rule 2 (stress-luteal amplification) checks `['mid_luteal', 'late_luteal'].includes(input.phase)`. These strings never exist. `cycleEngine` only produces `"luteal"`.

**Fix:** Replace the phase string check with `input.phase === 'luteal'` combined with cycle day math to distinguish mid vs late luteal.

Find this block (Rule 2):
```typescript
// Rule 2: STRESS-LUTEAL AMPLIFICATION
if (
  stress !== undefined &&
  stress >= 4 &&
  ['mid_luteal', 'late_luteal'].includes(input.phase)
) {
  result.amplifyMoodSensitivity = true;
}
```

Replace with:
```typescript
// Rule 2: STRESS-LUTEAL AMPLIFICATION
// cycleEngine only produces "luteal" — use cycleDay to distinguish mid/late
// Mid-luteal starts ~7 days before period, late luteal ~4 days before
if (
  stress !== undefined &&
  stress >= 4 &&
  input.phase === 'luteal'
) {
  result.amplifyMoodSensitivity = true;
}
```

This is correct because the original intent was "stress amplification during luteal phase" — both mid and late luteal qualify, so checking `input.phase === 'luteal'` covers the full intended range.

### 1B: `src/services/narrativeSelector.ts`

**Problem:** `detectConflict()` checks for `phase === 'late_luteal'` and `phase === 'early_luteal'`. These strings never come from `cycleEngine`.

**Additional problem:** `detectConflict` doesn't receive `cycleLength`, so we can't compute cycle-relative thresholds. We need to thread `cycleLength` through the call chain.

**Step 1 — Update `detectConflict` signature:**

Find:
```typescript
function detectConflict(
  log: NonNullable<NarrativeSelectorInput['latestLog']>,
  phase: string,
  cycleDay: number
): string | null {
```

Replace with:
```typescript
function detectConflict(
  log: NonNullable<NarrativeSelectorInput['latestLog']>,
  phase: string,
  cycleDay: number,
  cycleLength: number
): string | null {
```

**Step 2 — Update the call site in `selectNarrative`:**

Find where `detectConflict` is called (inside `selectNarrative`):
```typescript
const conflictDescription = detectConflict(latestLog, phase, cycleDay);
```

Replace with:
```typescript
const safeCycleLength = input.cycleLength ?? 28;
const conflictDescription = detectConflict(latestLog, phase, cycleDay, safeCycleLength);
```

**Step 3 — Add `cycleLength` to `NarrativeSelectorInput`:**

Find the `NarrativeSelectorInput` interface and add `cycleLength` as an optional field:
```typescript
export interface NarrativeSelectorInput {
  cycleDay: number;
  phase: string;
  // ... existing fields ...
  bleedingDays?: number;
  cycleLength?: number;  // ADD THIS — defaults to 28 if not provided
}
```

**Step 4 — Update the caller in `insightController.ts`:**

Find where `selectNarrative` is called and add `cycleLength`:
```typescript
const narrativeResult = selectNarrative({
  cycleDay: cycleInfo.currentDay,
  phase: cycleInfo.phase,
  // ... existing fields ...
  bleedingDays,
  cycleLength: effectiveCycleLength,  // ADD THIS
});
```

**Step 5 — Fix the three conflict checks using cycle-relative thresholds:**

Late luteal = last 4 days of cycle (`cycleDay >= cycleLength - 4`)
Early luteal = first 6 days of luteal phase (`cycleDay <= cycleLength - 8`)

**Fix 1 — "High mood during late luteal":**
Find:
```typescript
if (log.mood !== undefined && log.mood >= 4 && phase === 'late_luteal') {
  return 'High mood during late luteal \u2014 mood usually dips';
}
```
Replace with:
```typescript
if (log.mood !== undefined && log.mood >= 4 && phase === 'luteal' && cycleDay >= (cycleLength - 4)) {
  return 'High mood during late luteal \u2014 mood usually dips';
}
```

**Fix 2 — "Poor sleep in early luteal":**
Find:
```typescript
if (log.sleep !== undefined && log.sleep <= 2 && phase === 'early_luteal') {
  return 'Poor sleep in early luteal \u2014 progesterone should aid sleep';
}
```
Replace with:
```typescript
if (log.sleep !== undefined && log.sleep <= 2 && phase === 'luteal' && cycleDay <= (cycleLength - 8)) {
  return 'Poor sleep in early luteal \u2014 progesterone should aid sleep';
}
```

**Fix 3 — "High energy during late luteal":**
Find:
```typescript
if (log.energy !== undefined && log.energy >= 4 && phase === 'late_luteal') {
  return 'High energy during late luteal \u2014 energy usually drops with hormone withdrawal';
}
```
Replace with:
```typescript
if (log.energy !== undefined && log.energy >= 4 && phase === 'luteal' && cycleDay >= (cycleLength - 4)) {
  return 'High energy during late luteal \u2014 energy usually drops with hormone withdrawal';
}
```

### 1C: Tests

Add tests to the existing test files to verify phase string fixes work:

**In the narrative selector test file**, add these test cases (all use `cycleLength: 28` unless noted):

```
Test: "conflict detected for low mood at ovulation (phase='ovulation')"
  Input: mood=1, phase='ovulation', cycleDay=14, cycleLength=28
  Expected: primaryNarrative = 'conflict', conflictDescription contains "mood"

Test: "conflict detected for high mood in late luteal (phase='luteal', cycleDay=25, cycleLength=28)"
  Input: mood=5, phase='luteal', cycleDay=25, cycleLength=28
  Expected: primaryNarrative = 'conflict', conflictDescription contains "mood"
  (25 >= 28-4=24 ✓ — late luteal)

Test: "conflict detected for poor sleep in early luteal (phase='luteal', cycleDay=18, cycleLength=28)"
  Input: sleep=1, phase='luteal', cycleDay=18, cycleLength=28
  Expected: primaryNarrative = 'conflict', conflictDescription contains "sleep"
  (18 <= 28-8=20 ✓ — early luteal)

Test: "NO conflict for high mood in early luteal (phase='luteal', cycleDay=18, cycleLength=28)"
  Input: mood=5, phase='luteal', cycleDay=18, cycleLength=28
  Expected: primaryNarrative is NOT 'conflict'
  (18 < 28-4=24 — not late luteal, high mood is normal here)

Test: "late luteal conflict adapts to longer cycle (cycleLength=35)"
  Input: mood=5, phase='luteal', cycleDay=31, cycleLength=35
  Expected: primaryNarrative = 'conflict', conflictDescription contains "mood"
  (31 >= 35-4=31 ✓ — late luteal for a 35-day cycle)

Test: "day 25 is NOT late luteal for a 35-day cycle"
  Input: mood=5, phase='luteal', cycleDay=25, cycleLength=35
  Expected: primaryNarrative is NOT 'conflict'
  (25 < 35-4=31 — not late luteal for this cycle length)
```

**In the interaction rules test file**, add:

```
Test: "stress-luteal amplification fires for phase='luteal'"
  Input: stress=5, phase='luteal', cycleDay=22
  Expected: amplifyMoodSensitivity = true

Test: "stress-luteal amplification does NOT fire for phase='follicular'"
  Input: stress=5, phase='follicular', cycleDay=9
  Expected: amplifyMoodSensitivity = false
```

Run: `npx jest tests/units/narrativeSelector.test.ts tests/units/interactionRules.test.ts --verbose --forceExit`

All existing + new tests must pass.

---

## Task 2: Strengthen insightValidator.ts

### 2A: Strengthen `checkNotPhaseFirst`

**Problem:** Current regex only checks if the output *starts with* phase language. But phase-framing mid-text like "This is typical for day 4 of the cycle" passes through.

Find:
```typescript
const PHASE_FIRST_RE = /^(your estrogen|your progesterone|in the .* phase|during this phase|this phase)/i;

function checkNotPhaseFirst(output: string): boolean {
  return !PHASE_FIRST_RE.test(output.trim());
}
```

Replace with:
```typescript
const PHASE_FIRST_RE = /^(your estrogen|your progesterone|in the .* phase|during this phase|this phase)/i;

// Also catch phase-framing language anywhere in the first sentence
const PHASE_FRAME_RE = /\b(this is typical for day \d|typical for this phase|common (?:at|for|during) (?:this|the) (?:phase|day|point)|normal for (?:this|the) (?:phase|day|stage))\b/i;

function checkNotPhaseFirst(output: string): boolean {
  const trimmed = output.trim();
  if (PHASE_FIRST_RE.test(trimmed)) return false;
  // Check first sentence for phase-framing
  const firstSentence = trimmed.split(/[.!?]/)[0] ?? '';
  if (PHASE_FRAME_RE.test(firstSentence)) return false;
  return true;
}
```

### 2B: Add `checkNoIncompleteSentences` hard check

**Problem:** GPT sometimes truncates mid-sentence (e.g., "FSH is beginning its gradual rise to start"). This should be a hard fail.

Add this function after the existing hard check functions:

```typescript
function checkNoIncompleteSentences(output: string): boolean {
  const trimmed = output.trim();
  if (trimmed.length === 0) return true;
  // Must end with sentence-ending punctuation
  const lastChar = trimmed[trimmed.length - 1];
  return lastChar === '.' || lastChar === '!' || lastChar === '?';
}
```

Then add it to `validateInsightField`:

Find in `validateInsightField`:
```typescript
if (!checkAcknowledgesConflict(input.output, input.conflictDetected)) {
  hardFails.push("acknowledgesConflict");
}
```

Add after it:
```typescript
if (!checkNoIncompleteSentences(input.output)) {
  hardFails.push("incompleteSentence");
}
```

### 2C: Strengthen `checkNotPhaseFirst` to also catch phase framing in any sentence (soft check)

Add a new soft check:

```typescript
const PHASE_FRAME_ANY_RE = /\b(this is typical for|typical for this phase|common (?:at|for|during) this (?:phase|day)|normal for this (?:phase|day|stage)|this is expected (?:at|for|during) this (?:phase|time))\b/i;

function checkNoPhaseFraming(output: string): boolean {
  return !PHASE_FRAME_ANY_RE.test(output);
}
```

Add to the soft checks section of `validateInsightField`:

```typescript
if (!checkNoPhaseFraming(input.output)) {
  softFails.push("phaseFraming");
}
```

### 2D: Tests

Add to `tests/units/insightValidator.test.ts`:

```
Test: "hard fail on phase-first in first sentence (mid-sentence)"
  Input: output = "This is typical for day 4 of the cycle and energy is recovering."
  Expected: valid = false, hardFails includes "notPhaseFirst"

Test: "hard fail on incomplete sentence"
  Input: output = "FSH is beginning its gradual rise to start"
  Expected: valid = false, hardFails includes "incompleteSentence"

Test: "passes with complete sentences and no phase framing"
  Input: output = "Your energy is lower than yesterday. Things should start improving over the next couple of days."
  Expected: valid = true

Test: "soft fail on phase framing in any sentence"
  Input: output = "Energy is low right now. This is normal for this phase of your cycle."
  Expected: valid = true (soft fail only), softFails includes "phaseFraming"
```

Run: `npx jest tests/units/insightValidator.test.ts --verbose --forceExit`

---

## Task 3: Wire validator into insightController.ts

### 3A: Import the validator

Find the existing V2 imports at the top of `insightController.ts`:

```typescript
import { selectNarrative } from "../services/narrativeSelector";
import { evaluateInteractionRules } from "../services/interactionRules";
import { normMood, normEnergy, normStress } from "../services/insightData";
```

Add after them:
```typescript
import { validateInsightField } from "../services/insightValidator";
```

### 3B: Add validation step after GPT generation, before the existing guard layer

The validator must run AFTER the GPT rewrite (or draft fallback) but BEFORE `applyAllGuards`. This is because:
- The validator checks GPT-specific failures (banned phrases that GPT introduced, phase-first openings, missing signal reflection)
- The guard layer handles zero-data softening, direction enforcement, consistency — different concerns

Find this section in the `getInsights` function (it's the post-generation guard layer comment):

```typescript
  insights = cleanupInsightText(insights);

  // ── Post-generation guard layer ──────────────────────────────────────────
```

Insert the validator block BETWEEN `cleanupInsightText` and the guard layer:

```typescript
  insights = cleanupInsightText(insights);

  // ── V2: Post-GPT insight validation ──────────────────────────────────────
  // Runs AFTER GPT rewrite, BEFORE deterministic guards.
  // Validates signal reflection, banned phrases, phase-first, length, conflict acknowledgment.
  // On hard fail: replace with deterministic fallback (no GPT dependency).
  if (aiEnhanced && latestLogSignals) {
    const validationInput = {
      output: '', // placeholder — checked per field
      primaryNarrative: narrativeResult.primaryNarrative,
      latestLogSignals: latestLogSignals as Record<string, unknown>,
      conflictDetected: narrativeResult.conflictDetected,
      confidenceLevel: (context.confidence === 'high' ? 'high' : context.confidence === 'medium' ? 'medium' : 'low') as 'low' | 'medium' | 'high',
    };

    const fieldsToValidate: (keyof typeof insights)[] = [
      'physicalInsight', 'mentalInsight', 'emotionalInsight',
      'whyThisIsHappening', 'solution', 'recommendation', 'tomorrowPreview',
    ];

    let anyHardFail = false;
    const validationFailures: string[] = [];

    for (const field of fieldsToValidate) {
      const result = validateInsightField({
        ...validationInput,
        output: insights[field],
      });

      if (!result.valid) {
        anyHardFail = true;
        validationFailures.push(`${field}: [${result.hardFails.join(', ')}]`);
      }

      if (result.softFails.length > 0) {
        console.log(JSON.stringify({
          type: 'insight_validator_soft',
          userId: req.userId,
          field,
          softFails: result.softFails,
          timestamp: new Date().toISOString(),
        }));
      }
    }

    if (anyHardFail) {
      console.error(JSON.stringify({
        type: 'insight_validator_hard_fail',
        userId: req.userId,
        cycleDay: cycleInfo.currentDay,
        phase: cycleInfo.phase,
        failures: validationFailures,
        timestamp: new Date().toISOString(),
      }));

      // Full deterministic fallback — draft insights are rule-based and consistent
      // Do NOT mix fallback + GPT output (creates tone inconsistency)
      insights = draftInsights;
      aiEnhanced = false;
      aiDebug = 'validator_hard_fail' as typeof aiDebug;
    }
  }

  // ── Post-generation guard layer ──────────────────────────────────────────
```

**Important:** The `aiDebug` value `'validator_hard_fail'` needs to be added to the union type. Find the `aiDebug` declaration:

```typescript
let aiDebug:
  | "gated"
  | "client_missing"
  ...
  | "stable_state" = "gated";
```

Add `| "validator_hard_fail"` to this union.

### 3C: Also validate for zero-log users (GPT still runs for them)

The current wiring uses `if (aiEnhanced && latestLogSignals)` which skips zero-log users (they have no `latestLogSignals`). But GPT still runs for them and can produce banned phrases.

Add a second validation block for zero-log users immediately after the first:

```typescript
  // V2: Zero-log user validation (no signal reflection check, but still check banned phrases + phase-first + completeness)
  if (aiEnhanced && !latestLogSignals) {
    const zeroLogValidationInput = {
      output: '',
      primaryNarrative: 'phase',
      latestLogSignals: null,
      conflictDetected: false,
      confidenceLevel: 'low' as const,
    };

    // Checks to skip for zero-log users (no signals to reflect, no conflict to acknowledge)
    const SKIP_FOR_ZERO_LOG = new Set(['reflectsLogSignals', 'acknowledgesConflict']);

    const fieldsToCheck: (keyof typeof insights)[] = [
      'physicalInsight', 'mentalInsight', 'emotionalInsight',
      'whyThisIsHappening', 'solution', 'recommendation', 'tomorrowPreview',
    ];

    let zeroLogHardFail = false;

    for (const field of fieldsToCheck) {
      const result = validateInsightField({
        ...zeroLogValidationInput,
        output: insights[field],
      });

      // For zero-log users, only enforce: banned phrases, phase-first, incomplete sentences, length
      const relevantHardFails = result.hardFails.filter(
        f => !SKIP_FOR_ZERO_LOG.has(f)
      );

      if (relevantHardFails.length > 0) {
        zeroLogHardFail = true;
        console.error(JSON.stringify({
          type: 'insight_validator_zero_log_fail',
          userId: req.userId,
          field,
          hardFails: relevantHardFails,
          timestamp: new Date().toISOString(),
        }));
      }
    }

    if (zeroLogHardFail) {
      insights = draftInsights;
      aiEnhanced = false;
      aiDebug = 'validator_hard_fail' as typeof aiDebug;
    }
  }
```

### 3D: Integration test

Create `tests/integration/insightValidatorWiring.test.ts`:

```
Test 1: "validator rejects GPT output with banned phrase and falls back to draft"
  Setup: Mock GPT to return insights containing "It's common to feel..."
  Call: getInsights pipeline
  Assert: output does NOT contain "It's common to"
  Assert: aiEnhanced = false OR insights match draft

Test 2: "validator passes clean GPT output through unchanged"
  Setup: Mock GPT to return clean insights (no banned phrases, signal reflection present, complete sentences)
  Call: getInsights pipeline
  Assert: aiEnhanced = true
  Assert: insights match GPT output (not draft)

Test 3: "validator catches incomplete sentence from GPT"
  Setup: Mock GPT to return insights where whyThisIsHappening ends without punctuation
  Call: getInsights pipeline
  Assert: output whyThisIsHappening ends with . or ! or ?
```

Run: `npx jest tests/integration/insightValidatorWiring.test.ts --verbose --forceExit`

---

## Task 4: Full regression

```bash
npx tsc --noEmit
npx jest --forceExit
```

All tests must pass. Zero regressions.

Report results in this format:

```
✔/✗ Task 1: Phase string fixes (narrative selector + interaction rules)
✔/✗ Task 2: Validator strengthening (phase-frame check + incomplete sentence check)
✔/✗ Task 3: Validator wired into insightController
✔/✗ Task 4: Full regression — X/X tests, Y suites, tsc clean
```

---

## What NOT to do

- Do NOT modify `vyanaContext.ts` or `insightGptService.ts` — V2 changes there are final
- Do NOT add new DB queries — the validator is pure string processing
- Do NOT change the `insightGuard` layer — it handles different concerns (zero-data softening, direction enforcement)
- Do NOT touch cycleEngine phase output — the fix is in the consumer code, not the producer
- Do NOT rename or restructure existing test files — add new tests to existing files or create new ones alongside them