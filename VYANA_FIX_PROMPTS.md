# Vyana Insight Pipeline — Fix Prompts (Post 500-Case Audit)

## Execution Order

Run these prompts IN ORDER. Each prompt depends on the previous one being complete.
Feed each prompt to Claude Code with Superpowers active.
Approve the plan before execution. Move to the next only after tests pass.

After ALL prompts are done:
1. Run `npx tsc --noEmit` — must pass
2. Run `npm test` — must pass
3. Clear InsightCache: `DELETE FROM "InsightCache";`
4. Re-run the full 500-case test suite
5. Bring results back for comparison

---

## Prompt 1: Fix Cycle Day Off-By-One

```
TASK: Diagnose and fix the cycle day off-by-one error.

CONTEXT: Every single test case (499/499) shows output.cycleDay = expect.cycleDay + 1.
The test runner creates users with specific lastPeriodStart dates and expects specific cycle days.
The output always shows one day MORE than expected.

STEPS:
1. Read src/testRunner/runTestCases.ts — find how it sets lastPeriodStart and what cycleDay it expects
2. Read the cycleEngine function that computes cycleDay from lastPeriodStart
3. Trace the exact calculation: if lastPeriodStart = today - 0 days, does cycleEngine return 1 or 2?
4. The bug is either:
   a. cycleEngine counts inclusively (day 0 = day 1) but test runner expects exclusive
   b. Test runner sets lastPeriodStart one day too early
   c. cycleEngine adds 1 somewhere it shouldn't
5. Fix the ROOT CAUSE — either in cycleEngine or test runner, whichever is wrong
6. Verify by checking: if a user's period started TODAY, what cycle day should they be on? (Answer: day 1)

DO NOT change insightController.ts, insightValidator.ts, insightGuard.ts, or any insight pipeline files.
Only fix the cycle day calculation or test runner seeding.

VERIFY:
- npx tsc --noEmit
- npm test
Both must pass.
```

---

## Prompt 2: Fix Broken Template Splice

```
TASK: Fix the broken template concatenation that produces garbled text.

CONTEXT: 25 test cases produce text like:
"Your physical energy looks stable for this phase.\nAdjust activity based on how Based on your recent log, you may feel..."

This is TWO templates concatenated with a broken splice. The phrase
"Adjust activity based on how Based on your recent log" is clearly
two separate strings merged incorrectly.

STEPS:
1. Search the codebase for "stable for this phase" — find which file contains this template
2. Search for "Adjust activity based on how" — find where this fragment comes from
3. Search for "Based on your recent log" — find where this fragment comes from
4. The bug is in the deterministic draft builder (likely cycleInsightLibrary or
   the softening/rule-based generation in insightController.ts) where two template
   strings are being concatenated without proper separation
5. Fix the concatenation logic so templates don't splice into each other
6. While you're in this file, also check for any other templates that could splice similarly

DO NOT modify insightValidator.ts, insightGuard.ts, vyanaContext.ts, narrativeSelector.ts,
or interactionRules.ts.

VERIFY:
- npx tsc --noEmit
- npm test
- grep -r "stable for this phase" across all source files to confirm the fix
Both must pass.
```

---

## Prompt 3: Fix Newlines in Mid-Insight Text

```
TASK: Remove newline characters from the middle of insight text.

CONTEXT: 230 out of 499 test cases have \n characters in the middle of insight fields.
Example: "Your recent signal suggests a relatively balanced mental state.\nNo strong strain signals detected."

These should be continuous text without line breaks. The newlines come from
the deterministic template library where multi-line template strings are used.

STEPS:
1. Find where insight text is assembled in the deterministic path
   (likely cycleInsightLibrary.ts or the rule-based generation in insightController.ts)
2. Add a cleanup step that replaces \n with a space in all 7 insight fields
3. The best place for this is in cleanupInsightText() in insightController.ts —
   add a line that normalizes newlines: text.replace(/\n/g, ' ').replace(/\s{2,}/g, ' ')
4. This should apply to BOTH GPT and deterministic paths (it's already called for both)

DO NOT modify insightValidator.ts, insightGuard.ts, vyanaContext.ts.

VERIFY:
- npx tsc --noEmit
- npm test
Both must pass.
```

---

## Prompt 4: Fix "suggests a relatively balanced mental state" Grammar

```
TASK: Replace the awkward template phrase that appears 105 times.

CONTEXT: The phrase "Your recent signal suggests a relatively balanced mental state.
No strong strain signals detected." appears in 105/499 cases. It sounds robotic
and uses the word "signal" which is technical jargon, not user-facing language.

STEPS:
1. Search for "suggests a relatively" across all source files
2. Find the exact template in cycleInsightLibrary.ts or wherever the deterministic
   mental insight for balanced/stable states is defined
3. Replace with 3-4 VARIANTS that rotate based on cycleDay % N:
   - "Your mental state looks balanced right now — no strong strain showing."
   - "Focus and clarity feel steady today — nothing pulling your attention off track."
   - "Mentally, things are holding steady — no signs of extra strain."
   - "Your mind feels clear today — no strong pressure signals."
4. Implement the rotation so consecutive days don't repeat the same variant

Also fix "under some pressure mental state" (1 case) — find and rephrase to
natural language like "Your mental state is showing some pressure right now."

DO NOT modify insightValidator.ts, insightGuard.ts, vyanaContext.ts, narrativeSelector.ts.

VERIFY:
- npx tsc --noEmit
- npm test
- grep -r "suggests a relatively" src/ — should return 0 results
All must pass.
```

---

## Prompt 5: Diversify Top Repeated Templates

```
TASK: Add variants to the most repeated deterministic templates.

CONTEXT: The following phrases appear far too often:

[105x] "How you're feeling emotionally has been heavier than usual. Giving yourself space to decompress will help more"
[98x] "Your body is under more strain than usual today. Slowing down isn't optional right now"
[84x] "Your emotional state looks steady right now. No strong shifts in either direction."
[56x] "Your body feels steady right now — nothing is pulling it in either direction."
[56x] "Focus is stable — things feel manageable without extra effort or strain."
[56x] "Your mood is balanced — nothing feels too heavy or too elevated."

STEPS:
1. Find each of these templates in the source code (likely cycleInsightLibrary.ts
   or the rule-based generation logic)
2. For EACH one, add 3-4 alternative phrasings that:
   - Convey the same meaning
   - Use different sentence structures
   - Feel fresh on consecutive days
3. Implement rotation using cycleDay % variants.length so the same user
   doesn't see the same phrasing on consecutive days
4. Keep the same emotional tone and clinical accuracy — just vary the wording

EXAMPLE for "Your body feels steady right now — nothing is pulling it in either direction":
  Variant 1: "Your body feels steady right now — nothing is pulling it in either direction."
  Variant 2: "Physically, things are settled today — no strong signals in any direction."
  Variant 3: "Your body is in a balanced state right now — energy isn't being pulled anywhere specific."
  Variant 4: "No major physical shifts today — your system is holding steady."

DO NOT modify insightValidator.ts, insightGuard.ts, vyanaContext.ts, narrativeSelector.ts,
interactionRules.ts.

VERIFY:
- npx tsc --noEmit
- npm test
Both must pass.
```

---

## Prompt 6: Validator Calibration (Root Cause Known)

```
TASK: Fix the two validator checks causing 60% false rejection of GPT output.

CONTEXT: insightValidator.ts rejects 299/499 GPT outputs. Root cause analysis
shows the exact checks responsible:

HARD FAIL BREAKDOWN:
- acknowledgesConflict: 799 failures (DOMINANT cause)
- reflectsLogSignals: 192 failures
- notPhaseFirst: 9 failures
- incompleteSentence: 3 failures

SOFT FAIL BREAKDOWN:
- hasTemporalAnchor: 2473 failures (fires on nearly every test)
- reflectsLogSignals: 644
- tooBroad: 42
- populationFraming: 25

THE ROOT CAUSE for acknowledgesConflict:
The regex at insightValidator.ts (around line 94-99) only matches:
  even though|despite|usually|normally|override|unexpected

But GPT naturally uses: "however", "but", "instead", "rather",
"contrary", "doesn't match", "not typical", "while", "although"
— ALL valid conflict acknowledgments that fail the regex.

FIXES (in order):

1. FIX acknowledgesConflict regex — expand to include natural conflict language:
   even though|despite|usually|normally|override|unexpected|however|but your|but today|but this|although|while your|instead of|rather than|doesn't match|not typical|contrary|working against|pulling against|competing with

   IMPORTANT: Do NOT just match bare "but" — that would match anything.
   Match "but your", "but today", "but this", "but the", "but right now"
   to ensure "but" is used in a conflict-acknowledging context.

2. FIX reflectsLogSignals — this check is too strict on fields that
   naturally discuss advice/focus rather than raw signals:
   - It should be a HARD check ONLY on physicalInsight and whyThisIsHappening
   - It should be a SOFT check (not hard) on mentalInsight, emotionalInsight,
     solution, recommendation, tomorrowPreview
   - Check current implementation and verify this demotion was applied correctly
     (it was attempted in a previous sprint but may not have stuck)

3. FIX hasTemporalAnchor — this soft check fires 2473 times, meaning it's
   essentially useless as a quality signal. Either:
   a. Broaden the regex to include trend language ("has been", "over the last",
      "recently", "for the past", "dropping", "rising", "shifting"), OR
   b. Demote it to info-level (not warning) so it doesn't pollute soft fail counts

4. EXEMPT tomorrowPreview from notPhaseFirst — tomorrowPreview legitimately
   mentions phase when describing upcoming transitions. It should not be
   checked for phase-first framing.

DO NOT remove any hard check entirely. Only expand regexes and adjust
field-level application.

TARGET: Fallback rate should drop to ≤25% (from 60%).

VERIFY:
- npx tsc --noEmit
- npm test
Both must pass.
```

---

## Prompt 7: GPT Prompt Improvements (Conflict Structure + Confidence Gating)

```
TASK: Add three rules to the GPT system prompt to improve output quality.

CONTEXT: The GPT prompt in insightGptService.ts currently has 10 hard output rules.
We need to add 3 more based on the 500-case audit findings.

STEPS:
1. Read src/services/insightGptService.ts — find the hard output rules section

2. Add rule 11 — CONFLICT STRUCTURE:
   "When the user's signals contradict what their cycle phase would normally predict
   (e.g., high energy in luteal, low mood in follicular), structure the insight as:
   (a) Acknowledge what this phase would typically bring,
   (b) State what is actually happening based on their signals,
   (c) Explain why the override is happening.
   Use natural conflict connectors like 'however', 'despite', 'even though',
   'although', 'but'. Do NOT use rigid phrasing — vary the structure."

3. Add rule 12 — CONFIDENCE GATING:
   "When confidence is medium or low, never claim one factor dominates another.
   Use additive framing ('alongside', 'on top of', 'combined with') rather than
   comparative framing ('more than', 'rather than', 'instead of'). You do not
   have enough data to rank causes."

4. Add rule 13 — TREND EVIDENCE:
   "When logsCount is less than 5, do not describe trends as 'steady', 'consistent',
   or 'improving' — you cannot establish a trend from fewer than 5 data points.
   Use hedged language ('early signs suggest', 'so far it looks like')."

DO NOT modify insightValidator.ts, insightGuard.ts, vyanaContext.ts, narrativeSelector.ts,
interactionRules.ts, insightController.ts.

VERIFY:
- npx tsc --noEmit
- npm test
Both must pass.
```

---

## Post-Fix Verification

After ALL 7 prompts are complete:

1. `npx tsc --noEmit` — clean
2. `npm test` — all passing
3. `DELETE FROM "InsightCache";` — clear cache
4. Re-run full 500-case test suite
5. Drop results here for before/after comparison

Expected improvements:
- Cycle day: 0 mismatches (from 499)
- Validator fallback: ≤25% (from 60%)
- acknowledgesConflict hard fails: <50 (from 799)
- Template splice: 0 cases (from 25)
- "suggests a relatively": 0 cases (from 105)
- Newlines in mid-insight: 0 cases (from 230)
- Template diversity: >60% (from 34%)
- tomorrowPreview with future reference: >90% (from 85%)