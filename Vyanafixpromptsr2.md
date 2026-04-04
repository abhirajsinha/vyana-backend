# Vyana Insight Pipeline — Fix Prompts Round 2 (Post-Fix Audit)

## Context

Round 1 fixed: cycle day (93%), template splice (100%), grammar bug (100%), population framing (100%).
Round 2 addresses three issues that didn't land properly.

Run these prompts IN ORDER via Claude Code with Superpowers.

---

## Prompt R2-1: Fix Newlines in Deterministic Templates

```
TASK: Remove newline characters from deterministic insight templates.

CONTEXT: 150 test cases STILL have \n in the middle of insight text.
All 150 are in deterministic output (validator_hard_fail / aiDebug).
The Round 1 fix only cleaned the GPT path.

The newlines are INSIDE the template strings themselves. Examples:
- "Your recent entry suggests stress has been higher than your normal.\nIt's starting to stack up and make everything feel heavier."
- "Stress and fatigue have been building up.\nThis is why focusing feels harder than it should right now."

The problem is that the source template strings in the codebase use
multi-line string literals or explicit \n characters.

STEPS:

1. Search ALL files in src/ for template strings that contain \n:
   grep -rn '\\n' src/services/cycleInsightLibrary.ts
   grep -rn '\\n' src/services/insightData.ts
   grep -rn '\\n' src/controllers/insightController.ts
   Also search for backtick template literals that span multiple lines.

2. For every template string found that produces user-facing insight text,
   replace the \n with a space. The insight should be one continuous paragraph.

3. ALSO ensure cleanupInsightText() in insightController.ts runs on the
   deterministic path AFTER the draft is fully assembled. Check the pipeline:
   - If cleanupInsightText() is called BEFORE some templates are concatenated,
     move the call to AFTER all assembly is complete.
   - The cleanup should include: text.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ').trim()

4. Verify cleanupInsightText() is called on ALL 7 insight fields for BOTH paths:
   - GPT rewrite path
   - Deterministic/fallback path (when validator hard-fails)

DO NOT modify insightValidator.ts, insightGuard.ts, vyanaContext.ts,
narrativeSelector.ts, interactionRules.ts.

VERIFY:
- npx tsc --noEmit
- npm test
- grep -rn '\\n' src/services/cycleInsightLibrary.ts — should return 0 user-facing template hits
All must pass.
```

---

## Prompt R2-2: Validator Calibration (Verify and Complete)

```
TASK: Verify the Round 1 validator fix was applied, and complete it if not.

CONTEXT: The validator fallback rate barely moved (60% → 55.6%).
Round 1 Prompt 6 asked for 4 specific fixes. We need to verify each one landed.

DIAGNOSTIC STEPS (do all of these FIRST before changing anything):

1. Show me the CURRENT acknowledgesConflict regex in insightValidator.ts.
   What exact pattern does it match right now?
   Expected: should include "however|but your|but today|although|while your|
   instead of|rather than|doesn't match|not typical|contrary" in addition to
   the original "even though|despite|usually|normally|override|unexpected"

2. Show me the CURRENT reflectsLogSignals check — which fields is it a
   HARD check on, and which fields is it a SOFT check on?
   Expected: HARD only on physicalInsight and whyThisIsHappening.
   SOFT on all other fields.

3. Show me the CURRENT hasTemporalAnchor regex — what does it match?
   Expected: should include trend language like "has been|over the last|
   recently|for the past|dropping|rising|shifting"

4. Is tomorrowPreview EXEMPT from the notPhaseFirst check?
   Expected: yes

THEN FIX whatever was not applied:

5. If acknowledgesConflict regex was NOT expanded:
   Replace the regex with:
   /even though|despite|usually|normally|override|unexpected|however|but your|but today|but this|but the|but right now|although|while your|while the|instead of|rather than|doesn't match|not typical|contrary|working against|pulling against|competing with|at odds/i

6. If reflectsLogSignals is still HARD on all fields:
   Make it HARD only on physicalInsight and whyThisIsHappening.
   Make it SOFT (warning, not failure) on mentalInsight, emotionalInsight,
   solution, recommendation, tomorrowPreview.

7. If hasTemporalAnchor was NOT broadened:
   Expand the regex to also match:
   has been|have been|over the last|over the past|recently|for the past|
   dropping|rising|shifting|trending|getting|becoming|worsening|improving|
   started to|beginning to|noticing|this week|these past|last few

8. If tomorrowPreview is NOT exempt from notPhaseFirst:
   Add the exemption.

9. ADDITIONAL FIX — Stable state exception:
   When the test case has NO conflict detected (detectConflict returns false
   or narrative type is not 'conflict'), the acknowledgesConflict check
   should be SKIPPED entirely. It should only fire when a conflict IS detected.
   Check: is acknowledgesConflict running on ALL cases, or only conflict cases?
   If it runs on all cases, add a condition:
   if (narrativeType === 'conflict' || hasDetectedConflict) {
     // run acknowledgesConflict check
   } else {
     // skip — no conflict to acknowledge
   }

This item 9 is likely the BIGGEST remaining issue. If acknowledgesConflict
runs on every case regardless of whether a conflict exists, it will fail
on every non-conflict case (which is the majority).

DO NOT remove any check entirely. Only expand regexes, adjust field application,
and add the conflict-detection gate.

TARGET: Fallback rate should drop to ≤25%.

VERIFY:
- npx tsc --noEmit
- npm test
Both must pass.
```

---

## Prompt R2-3: Template Diversification (Verify and Complete)

```
TASK: Verify Round 1 template diversification was applied, and complete it if not.

CONTEXT: These phrases still appear far too often in post-fix output:
[46x] "Your physical energy looks stable for this phase. Adjust activity based on how you feel."
[47x] "recovery over clarity"
[33x] "Focus is lower today — your body is prioritizing recovery over clarity."

DIAGNOSTIC STEPS (do all FIRST):

1. Search for "stable for this phase" in ALL source files:
   grep -rn "stable for this phase" src/
   Show me every location and whether variants exist.

2. Search for "recovery over clarity" in ALL source files:
   grep -rn "recovery over clarity" src/
   Show me every location.

3. Search for "Focus is lower today" in ALL source files:
   grep -rn "Focus is lower today" src/
   Show me every location.

4. Check if cycleDay-based rotation is implemented anywhere.
   Search for: grep -rn "cycleDay.*%" src/services/cycleInsightLibrary.ts

THEN FIX:

5. For "stable for this phase. Adjust activity based on how you feel":
   Replace with 4 variants that rotate by cycleDay % 4:
   a. "Your physical energy looks stable for this phase. Adjust activity based on how you feel."
   b. "Physically, things are holding steady — no strong signals pulling you in either direction today."
   c. "Your energy is in a neutral zone right now. Match your activity to what feels right."
   d. "No major physical shifts today — your body is maintaining a steady baseline."

6. For "Focus is lower today — your body is prioritizing recovery over clarity":
   Replace with 4 driver-aware variants:
   IF primaryDriver contains "sleep":
     a. "Sleep loss is clouding your focus — your brain is running on less fuel than it needs."
     b. "Mental clarity takes a hit when sleep drops. Things that normally feel easy may require more effort."
   IF primaryDriver contains "stress":
     a. "Stress is scattering your focus — your mind is processing too many signals at once."
     b. "When stress stacks up, concentration narrows. Don't expect peak mental performance today."
   ELSE (fallback):
     a. "Focus may feel harder to hold today — your system is redirecting energy to recovery."
     b. "Mental sharpness dips when your body is under strain. This is temporary."

7. For any remaining "recovery over clarity" instances outside the above:
   Find and replace with driver-specific alternatives.

8. Implement the rotation function if it doesn't exist:
   function selectVariant(variants: string[], cycleDay: number): string {
     return variants[cycleDay % variants.length];
   }

DO NOT modify insightValidator.ts, insightGuard.ts, vyanaContext.ts,
narrativeSelector.ts, interactionRules.ts.

VERIFY:
- npx tsc --noEmit
- npm test
- grep -c "stable for this phase" src/services/cycleInsightLibrary.ts — should show variants, not a single instance
- grep -c "recovery over clarity" src/ — should be 0 or only inside variant arrays
Both must pass.
```

---

## Prompt R2-4: Fix Remaining 31 Cycle Day Mismatches

```
TASK: Fix the remaining 31 cycle day off-by-one errors in T_RND cases 249+.

CONTEXT: Round 1 fixed 93% of cycle day mismatches. 31 remain, ALL in
T_RND cases numbered 249-254, all with delta = +1 (same bug as before).

This means the Round 1 fix was applied to one code path but NOT to all.
Either:
a. The test runner has a separate seeding path for high-numbered random cases
b. The cycleEngine has a second calculation path that wasn't fixed
c. The test runner generates these cases differently after a certain index

STEPS:
1. Read src/testRunner/runTestCases.ts — find ALL places where lastPeriodStart
   is calculated or cycleDay is expected
2. Check if there's a different code path for T_RND cases vs T_SYS cases
3. Check if cases above index 248 use a different generation function
4. Apply the SAME fix from Round 1 to whichever path was missed
5. Verify: ALL test cases should have output.cycleDay === expect.cycleDay

VERIFY:
- npx tsc --noEmit
- npm test
Both must pass.
```

---

## Post Round 2 Verification

After ALL 4 prompts are complete:

1. `npx tsc --noEmit` — clean
2. `npm test` — all passing
3. `DELETE FROM "InsightCache";` — clear cache
4. Re-run: `npx ts-node src/testRunner/runTestCases.ts --source generated --batch 100`
   (use batch 100 to avoid pool exhaustion, run 5 times to get 500)
5. Drop results here for Round 2 comparison

Expected improvements after Round 2:
- Cycle day: 0 mismatches (from 31)
- Validator fallback: ≤25% (from 55.6%)
- Newlines in mid-insight: 0 cases (from 150)
- "stable for this phase": <15 cases (from 46)
- "recovery over clarity": <10 cases (from 47)
- Template diversity: >55% avg (from 41%)