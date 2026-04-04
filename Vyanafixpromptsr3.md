# Vyana Insight Pipeline — Fix Prompts Round 3 (Final Validator + Explanation Fix)

## Context

Round 2 resolved: cycle day (100%), newlines (0), template splice (0), grammar bug (0),
"recovery over clarity" (0), DB errors (0), behavioral detection (perfect).

ONE issue remains: validator fallback at 54%. Root cause is now precisely identified:
1. acknowledgesConflict fires on non-conflict cases
2. Stable-state cases get rejected despite correct output
3. whyThisIsHappening defaults to hormones even when primaryDriver is signal-based

---

## Prompt R3-1: Validator — Gate acknowledgesConflict + Auto-Accept Stable State

```
TASK: Fix the two validator behaviors causing 54% false rejection.

CONTEXT: 272/500 cases are validator_hard_fail. The root causes are:

CAUSE 1: acknowledgesConflict runs on ALL cases, even when no conflict exists.
Most cases have no conflict (narrativeType is not 'conflict', detectConflict
returns false). These non-conflict cases fail because there's nothing to
acknowledge — but the check demands conflict language anyway.

CAUSE 2: stable_state cases produce perfect output like "No major physical shifts
today — your system is steady and balanced" but get rejected because the validator
expects driver references, signal intensity, or temporal anchors that don't exist
in a genuinely stable state.

STEPS:

1. Read src/services/insightValidator.ts — find the acknowledgesConflict check

2. Add a GATE: acknowledgesConflict should ONLY run when a conflict was detected.
   Check how conflict detection works:
   - narrativeSelector.ts detectConflict() returns a conflict object or null
   - The narrative type might be stored in the context or basedOn
   - If no conflict was detected, SKIP the acknowledgesConflict check entirely

   Implementation: the validator receives context about the case. Add a parameter
   or check the existing context to determine if conflict was detected. If not,
   skip the check. Example:
   
   if (hasConflict) {
     // run acknowledgesConflict
   }
   // else: skip — nothing to acknowledge

3. Add STABLE STATE auto-accept: when correlationPattern === "stable_state"
   OR primaryDriver is null/undefined AND all priorityDrivers are empty:
   - SKIP acknowledgesConflict (no conflict in stable state)
   - SKIP reflectsLogSignals hard check (stable = no strong signals to reflect)
   - KEEP noBannedPhrases (always enforce)
   - KEEP noIncompleteSentences (always enforce)
   - KEEP notPhaseFirst on physicalInsight (always enforce)

4. Verify the validator receives enough context to make these decisions.
   Check what parameters validateInsight() currently receives. If it doesn't
   receive correlationPattern or narrativeType, add them to the function signature
   and pass them from insightController.ts.

DO NOT modify insightGptService.ts, vyanaContext.ts, narrativeSelector.ts,
interactionRules.ts, cycleEngine, or any non-validator/controller files.

TARGET: Fallback rate should drop to ≤25% (from 54%).

VERIFY:
- npx tsc --noEmit
- npm test
Both must pass.
```

---

## Prompt R3-2: Explanation Source Enforcement

```
TASK: Force whyThisIsHappening to lead with the primary driver, not hormones.

CONTEXT: When primaryDriver is "stress_trend_spiking" or "sleep_variability_high",
the whyThisIsHappening field still defaults to hormonal explanations like
"Both estrogen and progesterone are at their lowest point..."

This happens because:
- The deterministic draft templates in cycleInsightLibrary/insightService use
  phase-based explanations as default
- GPT sometimes keeps the hormonal explanation even when the driver is non-phase
- The validator doesn't enforce driver-first explanations

STEPS:

1. In insightGptService.ts, find the existing hard output rules (should be 13 now).
   Add rule 14:
   "When a primaryDriver exists and is NOT phase-related (not bleeding_heavy,
   not hormonal_shift_expected), the whyThisIsHappening MUST lead with the
   primary driver as the main explanation. Hormonal context may be mentioned
   as secondary/contributing factor but NEVER as the lead explanation.
   Example — if primaryDriver is stress_trend_spiking:
   WRONG: 'Estrogen and progesterone are low, contributing to...'
   RIGHT: 'Rising stress is the main factor here — your cycle phase may be
   amplifying the effect, but stress is what's driving this.'"

2. In the deterministic draft path (cycleInsightLibrary or insightController),
   find where whyThisIsHappening is assembled for non-phase drivers.
   If primaryDriver is stress-related or sleep-related, the explanation
   should reference the driver first:
   - stress_trend_spiking → "Elevated stress is driving..."
   - sleep_below_baseline → "Your sleep decline is driving..."
   - sleep_variability_high → "Inconsistent sleep is driving..."
   - mood_trend_declining → "Your declining mood is the primary factor..."

3. Add a post-generation guard in insightController.ts (after GPT or draft):
   If primaryDriver contains "stress" or "sleep" or "mood", and
   whyThisIsHappening starts with hormone language ("estrogen", "progesterone",
   "Both estrogen", "hormonal"), prepend the driver explanation.

DO NOT modify insightValidator.ts, vyanaContext.ts, narrativeSelector.ts,
interactionRules.ts.

VERIFY:
- npx tsc --noEmit
- npm test
Both must pass.
```

---

## Prompt R3-3: Grammar Sanitizer

```
TASK: Add a post-processing grammar fix for two known patterns.

CONTEXT: Two grammar bugs still appear in output:
- "Everything feels more overwhelming than they should" → should be "it should"
- "with a under some pressure sense" → should be "an under-pressure sense" or rephrased

STEPS:

1. In cleanupInsightText() in insightController.ts, add these replacements
   AFTER the existing cleanup:
   
   .replace(/than they should/g, 'than it should')
   .replace(/a under/g, 'an under')
   .replace(/under some pressure sense/g, 'sense of pressure')
   .replace(/more overwhelming than they/g, 'more overwhelming than it')

2. Search the codebase for any template strings containing these patterns
   and fix them at the source too:
   grep -rn "than they should" src/
   grep -rn "a under" src/

DO NOT modify insightValidator.ts, vyanaContext.ts, narrativeSelector.ts.

VERIFY:
- npx tsc --noEmit
- npm test
Both must pass.
```

---

## Post Round 3 Verification

After ALL 3 prompts are complete:

1. `npx tsc --noEmit` — clean
2. `npm test` — all passing
3. `DELETE FROM "InsightCache";`
4. Re-run: `npx ts-node src/testRunner/runTestCases.ts --source generated --batch 100` (5 times)
5. Drop results here

Expected after Round 3:
- Validator fallback: ≤25% (from 54%)
- Stable state rejection: <5% (from 68%)
- Hormone-first explanation for stress driver: <10% (from ~50%)
- Grammar bugs: 0
- All other metrics maintained