# FINAL_QUALITY_FIXES.md
# Claude Code Execution File — 8 Tasks

## Context

HARD RULES:
IMPORTANT Please Read `VYANA_COMPLETE_REFERENCE.md` for full context. The V2 Insight Engine is implemented and the validator is wired. These are the remaining quality fixes before launch.

**Priority order matters.** Tasks 1–4 are pre-launch critical. Tasks 5–8 are quality polish. Execute in order.

## Files you WILL modify

- `src/services/insightGuard.ts` — add missed zero-data assertion patterns (Task 1)
- `src/services/insightGptService.ts` — harden zero-data blocked phrases + add banned population phrases + tune zero-data prompt specificity (Tasks 2, 6, 7, 8)
- `src/controllers/insightController.ts` — fix cramps severity extraction + bleeding detection (Tasks 3, 4)
- `src/services/insightValidator.ts` — add population framing soft check (Task 6)

## Files you MUST NOT touch

- cycleEngine, insightCause, insightMemory, insightView
- hormoneengine, contraceptionengine
- vyanaContext.ts, narrativeSelector.ts, interactionRules.ts (just fixed in previous sprint)
- routes, auth, Prisma schema

---

## Task 1: Add missed bleeding assertion patterns to insightGuard.ts

**Problem:** GPT generates `"as you continue to bleed"` for zero-data users. The guard's `ZERO_DATA_SPECIFIC_PATTERNS` array doesn't catch this phrasing. The guard catches `"You are bleeding"` and `"Bleeding is"` but misses verb-phrase constructions around bleeding.

**Fix:** Add new patterns to the `ZERO_DATA_SPECIFIC_PATTERNS` array in `insightGuard.ts`.

Find the section with bleeding-related patterns (near the top of ZERO_DATA_SPECIFIC_PATTERNS). There should be entries like:
```typescript
[/\b[Bb]leeding is lighter\b/gi, "Bleeding can start to ease"],
```

Add these NEW patterns in the same bleeding section:
```typescript
// Bleeding verb-phrase assertions (GPT generates these for zero-data users)
[/\bas you continue to bleed\b/gi, "while your body is still in the menstrual phase"],
[/\bcontinue to bleed\b/gi, "are still in the menstrual phase"],
[/\bstill bleeding\b/gi, "still in the menstrual phase"],
[/\bbleeding continues\b/gi, "the menstrual phase continues"],
[/\bwhile you bleed\b/gi, "during the menstrual phase"],
[/\bas you bleed\b/gi, "during the menstrual phase"],
[/\byou are bleeding\b/gi, "bleeding may be occurring"],
[/\byou're bleeding\b/gi, "bleeding may be occurring"],
```

Also add symptom continuation assertions GPT commonly generates:
```typescript
// Symptom continuation assertions (GPT assumes ongoing symptoms without data)
[/\bas cramps continue\b/gi, "if cramping is present"],
[/\bcramps continue\b/gi, "cramping can continue"],
[/\bas pain continues\b/gi, "if pain is present"],
[/\byour cramps are getting\b/gi, "cramping can get"],
[/\byour bleeding is getting\b/gi, "bleeding can get"],
[/\byou're still cramping\b/gi, "cramping may still be present"],
[/\bstill cramping\b/gi, "cramping may still be present"],
```

**Test:** Run existing insightGuard tests to ensure no regressions:
```bash
npx jest tests/units/insightGuard.test.ts --verbose --forceExit
```

Then add 2 new tests:

```
Test: "zero-data guard catches 'as you continue to bleed'"
  Input: { insights: { physicalInsight: "Energy is low as you continue to bleed" }, logsCount: 0, cycleDay: 3, cycleLength: 28, phase: "menstrual" }
  Assert: output physicalInsight does NOT contain "continue to bleed"
  Assert: output physicalInsight contains "menstrual phase"

Test: "zero-data guard catches 'still bleeding'"
  Input: { insights: { physicalInsight: "You are still bleeding heavily today" }, logsCount: 0, cycleDay: 2, cycleLength: 28, phase: "menstrual" }
  Assert: output physicalInsight does NOT contain "still bleeding"
```

---

## Task 2: Harden zero-data blocked phrases in GPT prompt

**Problem:** The `zeroDataInstruction` in `insightGptService.ts` has a BLOCKED phrases list, but it doesn't include bleeding continuation assertions. GPT generates these because it infers bleeding from cycle day without being told not to.

**Fix:** Find the `zeroDataInstruction` block in `insightGptService.ts`. Inside the zero-data instruction, find the BLOCKED phrases line:

```typescript
BLOCKED phrases: "your cramps", "your flow", "you are bleeding heavily", "you feel", "you are feeling", "you notice", "energy is", "focus is", "mood is"
```

Replace with:
```typescript
BLOCKED phrases: "your cramps", "your flow", "you are bleeding heavily", "you are bleeding", "continue to bleed", "as you bleed", "still bleeding", "bleeding continues", "you feel", "you are feeling", "you notice", "energy is", "focus is", "mood is", "cramps are", "pain is getting"
```

**No test needed** — this is a prompt string change. The integration tests from the previous sprint cover GPT output validation.

---

## Task 3: Fix cramps severity extraction

**Problem:** In `insightController.ts`, cramps are hardcoded to 5 when the `symptoms` array includes "cramps":
```typescript
cramps: latestRawLog.symptoms?.includes("cramps") ? 5 : undefined,
```

This means:
- `severe_symptom` narrative (requires `cramps >= 7`) NEVER fires
- Day-over-day cramp change detection (requires `Math.abs(diff) >= 3`) NEVER fires between two days that both have cramps
- The narrative selector's entire cramp-based intelligence is dead

**Fix:** Extract cramp severity from the `pain` field, which stores actual severity labels. The `symptoms` array only stores boolean presence.

Find BOTH occurrences of the cramps extraction (one for `latestLogSignals`, one for `previousDaySignals`).

**For latestLogSignals**, find:
```typescript
cramps: latestRawLog.symptoms?.includes("cramps") ? 5 : undefined,
```

Replace with:
```typescript
cramps: extractCrampSeverity(latestRawLog),
```

**For previousDaySignals**, find:
```typescript
cramps: previousRawLog.symptoms?.includes("cramps") ? 5 : undefined,
```

Replace with:
```typescript
cramps: extractCrampSeverity(previousRawLog),
```

**Add the helper function** near the top of `insightController.ts` (after the imports, before `GUARD_VERSION`):

```typescript
/** Extract numeric cramp severity from log's pain field + symptoms array.
 *  pain field carries severity labels; symptoms array is boolean presence only. */
function extractCrampSeverity(log: { pain?: string | null; symptoms?: string[] | null }): number | undefined {
  const pain = log.pain?.trim().toLowerCase();
  if (pain) {
    if (pain === 'severe' || pain === 'very_severe') return 8;
    if (pain === 'moderate') return 5;
    if (pain === 'mild') return 3;
    if (pain === 'none') return 0;
  }
  // Fallback: if symptoms array mentions cramps but pain field is empty, use moderate default
  if (log.symptoms?.includes('cramps')) return 5;
  return undefined;
}
```

**Test:** Add to the narrative selector test file or create a new unit test:

```
Test: "severe pain maps to cramps=8, triggers severe_symptom narrative"
  Setup: Create a log with pain="severe", pass through extractCrampSeverity
  Assert: returns 8
  Then: pass cramps=8 to selectNarrative
  Assert: primaryNarrative = 'severe_symptom'

Test: "moderate pain maps to cramps=5"
  Setup: pain="moderate"
  Assert: returns 5

Test: "mild pain maps to cramps=3"
  Setup: pain="mild"
  Assert: returns 3

Test: "no pain field but symptoms includes cramps → default 5"
  Setup: pain=null, symptoms=["cramps"]
  Assert: returns 5

Test: "no pain, no cramps symptom → undefined"
  Setup: pain=null, symptoms=[]
  Assert: returns undefined

Test: "cramp change detection fires when severity drops from 8 to 3"
  Setup: today cramps=3 (mild), yesterday cramps=8 (severe) → diff=5
  Pass to selectNarrative
  Assert: primaryNarrative = 'signal_change' (Math.abs(8-3)=5, threshold is 3)
```

Run: `npx jest tests/units/insightController.test.ts --verbose --forceExit` (or wherever you place these)

---

## Task 4: Fix bleeding detection robustness

**Problem:** In `insightController.ts`, bleeding days are counted only via `padsChanged > 0`:
```typescript
let bleedingDays = 0;
for (const log of sortedLogs) {
  if (log.padsChanged && log.padsChanged > 0) bleedingDays++;
  else break;
}
```

If a user logs bleeding through the `symptoms` array, `flow` field, or any other field without setting `padsChanged`, `bleedingDays` stays 0 and the `HEAVY_BLEEDING`/`escalation` narratives won't trigger.

**Fix:** Replace the bleeding detection with a multi-source check.

Find:
```typescript
// Count consecutive bleeding days (from latest backward)
let bleedingDays = 0;
for (const log of sortedLogs) {
  if (log.padsChanged && log.padsChanged > 0) bleedingDays++;
  else break;
}
```

Replace with:
```typescript
// Count consecutive bleeding days (from latest backward)
// Check multiple signals: padsChanged, symptoms array, pain during menstrual
let bleedingDays = 0;
for (const log of sortedLogs) {
  const hasPadData = log.padsChanged != null && log.padsChanged > 0;
  const hasBleedingSymptom = Array.isArray(log.symptoms) && (
    log.symptoms.includes('bleeding') ||
    log.symptoms.includes('spotting') ||
    log.symptoms.includes('heavy_flow')
  );
  if (hasPadData || hasBleedingSymptom) bleedingDays++;
  else break;
}
```

Also update the `latestLogSignals` bleeding field to use the same multi-source logic. Find where `bleeding` is set in `latestLogSignals` (if it exists — check the current code). If `bleeding` is not currently extracted, add it:

In the `latestLogSignals` object, after the `breastTenderness` line, ensure there's a bleeding field:
```typescript
bleeding: (latestRawLog.padsChanged != null && latestRawLog.padsChanged > 0)
  ? (latestRawLog.padsChanged >= 7 ? 'heavy' : latestRawLog.padsChanged >= 4 ? 'moderate' : 'light')
  : (Array.isArray(latestRawLog.symptoms) && latestRawLog.symptoms.includes('bleeding') ? 'present' : undefined),
```

**Test:**

```
Test: "bleeding detected from symptoms array when padsChanged is null"
  Setup: log with padsChanged=null, symptoms=["bleeding"]
  Assert: counts as a bleeding day

Test: "bleeding detected from padsChanged"
  Setup: log with padsChanged=5, symptoms=[]
  Assert: counts as a bleeding day

Test: "no bleeding when neither padsChanged nor symptoms"
  Setup: log with padsChanged=null, symptoms=["headache"]
  Assert: does NOT count as bleeding day

Test: "consecutive bleeding days stop at first non-bleeding log"
  Setup: 3 logs — log[0] has padsChanged=3, log[1] has symptoms=["bleeding"], log[2] has neither
  Assert: bleedingDays = 2
```

---

## Task 5: Fix "You notice" assertion leak for zero-data users

**Problem:** The guard has a pattern `[/\b[Yy]ou notice\b/gi, "You may notice"]` in `ZERO_DATA_SPECIFIC_PATTERNS`. But GPT output for zero-data users still contains `"You notice"` in the final response. This suggests the guard's zero-data path may not be running when `aiEnhanced = true`.

**Investigation step:** Before fixing, verify:
1. Does `applyAllGuards` receive `logsCount: 0` for the zero-data user?
2. Does the `isZeroData` check (`logsCount === 0`) evaluate to true?
3. Does the `applyZeroDataGuard` function actually run on the text?

Add a temporary debug log at the top of `applyAllGuards`:
```typescript
if (logsCount === 0) {
  console.log(JSON.stringify({ type: 'guard_debug_zero_data', logsCount, phase, cycleDay, timestamp: new Date().toISOString() }));
}
```

If the guard IS running but the pattern isn't matching, the issue is likely that GPT capitalizes it differently or wraps it in a longer phrase. Check the exact GPT output string against the regex pattern.

**Most likely fix:** The pattern `[/\b[Yy]ou notice\b/gi, "You may notice"]` should match. But if it's inside a phrase like `"You notice that"`, the replacement produces `"You may notice that"` which is correct. If you're still seeing `"You notice"` in output, the guard may be running BEFORE GPT (wrong order) instead of after. Check the pipeline ordering in `insightController.ts`:

The correct order is:
```
GPT rewrite → cleanupInsightText → V2 validator → applyAllGuards → validateZeroDataSafety → response
```

Verify this ordering. If the guard runs before GPT, that's the bug — GPT rewrites the guard's softened language back to assertions.

**Fix (if ordering is correct but pattern still misses):** Add these additional catch patterns to `ZERO_DATA_SPECIFIC_PATTERNS`:
```typescript
[/\b[Yy]ou notice that\b/gi, "You may notice that"],
[/\b[Yy]ou find that\b/gi, "You may find that"],
[/\b[Yy]ou start to notice\b/gi, "You may start to notice"],
[/\b[Yy]ou begin to feel\b/gi, "You may begin to feel"],
[/\b[Yy]ou start to feel\b/gi, "You may start to feel"],
```

**Test:**
```
Test: "zero-data guard catches 'You notice that' and softens it"
  Input: { insights: { emotionalInsight: "You notice that small things feel easier" }, logsCount: 0, cycleDay: 4, cycleLength: 28, phase: "menstrual" }
  Assert: output emotionalInsight contains "may notice" NOT "You notice that"
```

Remove the debug log after confirming the fix works.

---

## Task 6: Eliminate population framing from GPT output

**Problem:** GPT generates phrases like `"most people notice"`, `"many users find"`, `"it's normal for most"`. These aren't in the banned phrases hard-reject list, but they violate the "this app knows me" product principle. The user should never feel like they're reading a Wikipedia article.

**Fix (two parts):**

### 6A: Add to GPT system prompt banned phrases list

In `insightGptService.ts`, find the VYANA_SYSTEM_PROMPT's banned phrases section (rule 6):

```
6. BANNED PHRASES — never use these:
   - "Many people find..."
   - "It's common to..."
   - "The body is..." (use "Your body is...")
   - "Some women experience..."
   - Any sentence that could apply to any user on this cycle day
```

Replace with:
```
6. BANNED PHRASES — never use these:
   - "Many people find..."
   - "Most people notice..."
   - "Most people experience..."
   - "It's common to..."
   - "It's normal for most..."
   - "The body is..." (use "Your body is...")
   - "Some women experience..."
   - "Some people find..."
   - "Research shows..."
   - "Studies suggest..."
   - Any sentence that could apply to any user on this cycle day
   - Any sentence that frames the user as part of a population rather than an individual
```

### 6B: Add population framing as a soft check in the validator

In `insightValidator.ts`, add a new soft check function:

```typescript
const POPULATION_RE = /\b(most people|many people|many users|some people|some women|research shows|studies suggest|it's normal for most|most users)\b/i;

function checkNoPopulationFraming(output: string): boolean {
  return !POPULATION_RE.test(output);
}
```

Add to the soft checks section of `validateInsightField`, after the existing soft checks:
```typescript
if (!checkNoPopulationFraming(input.output)) {
  softFails.push("populationFraming");
}
```

### 6C: Add guard-level replacement for population phrases

In `insightGuard.ts`, add to `ZERO_DATA_SPECIFIC_PATTERNS` (these should apply to ALL users, not just zero-data — but adding here for zero-data is the minimum):

```typescript
// Population framing — replace with individual framing
[/\bmost people notice\b/gi, "you may notice"],
[/\bmost people experience\b/gi, "you may experience"],
[/\bmost people feel\b/gi, "you may feel"],
[/\bmany people find\b/gi, "you may find"],
[/\bsome people find\b/gi, "you may find"],
[/\bsome women experience\b/gi, "you may experience"],
[/\bit's normal for most\b/gi, "it's normal"],
[/\bresearch shows\b/gi, ""],
[/\bstudies suggest\b/gi, ""],
```

**IMPORTANT:** These population replacements should apply to ALL users, not just zero-data. Add them as a NEW section in `applyAllGuards`, OUTSIDE the `if (isZeroData)` block. Create a small function:

```typescript
function applyPopulationFramingGuard(text: string): string {
  const replacements: Array<[RegExp, string]> = [
    [/\bmost people notice\b/gi, "you may notice"],
    [/\bmost people experience\b/gi, "you may experience"],
    [/\bmost people feel\b/gi, "you may feel"],
    [/\bmany people find\b/gi, "you may find"],
    [/\bsome people find\b/gi, "you may find"],
    [/\bsome women experience\b/gi, "you may experience"],
    [/\bit's normal for most\b/gi, "it's normal"],
    [/\bresearch shows that?\b/gi, ""],
    [/\bstudies suggest that?\b/gi, ""],
  ];
  let result = text;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s{2,}/g, " ").trim();
}
```

Call it in the per-field loop in `applyAllGuards`, after the clinical language guard and before grammar repair:

```typescript
// Guard N: Population framing (all users)
{
  const before = text;
  text = applyPopulationFramingGuard(text);
  if (text !== before) guardsApplied.push(`population:${key}`);
}
```

**Test:**
```
Test: "population framing guard replaces 'most people notice' for zero-data user"
  Input: { insights: { recommendation: "Most people notice a shift in energy" }, logsCount: 0, cycleDay: 5, cycleLength: 28, phase: "menstrual" }
  Assert: output recommendation contains "you may notice" NOT "most people"

Test: "population framing guard replaces 'most people notice' for 7-log user too"
  Input: { insights: { recommendation: "Most people notice improvement here" }, logsCount: 7, cycleDay: 14, cycleLength: 28, phase: "ovulation" }
  Assert: output recommendation contains "you may notice" NOT "most people"

Test: "validator soft-fails on population framing"
  Input: output = "Most people experience a lift in energy around ovulation."
  Assert: valid = true (soft fail only), softFails includes "populationFraming"
```

---

## Task 7: Tune zero-data GPT prompt for day-specific anchoring

**Problem:** For zero-log users, GPT defaults to vague hedging like `"Your body may be going through a lot"` because there's no signal data to anchor on. The prompt needs to tell GPT to use the specific cycle day as the anchor instead.

**Fix:** In `insightGptService.ts`, find the `zeroDataInstruction` block. It starts with:
```typescript
const zeroDataInstruction =
  ctx.mode === "fallback" && ctx.recentLogsCount === 0
    ? `\nZERO-DATA USER (CRITICAL — STRICT ENFORCEMENT):
```

Find the end of the existing zero-data block (before the closing backtick/quote). Add this section BEFORE the closing:

```
DAY-SPECIFIC ANCHORING (REQUIRED for zero-data users):
Instead of generic body statements, anchor each insight on what day ${ctx.cycleDay} of ${ctx.phase} specifically means.

❌ WRONG: "Your body may be going through a lot right now"
✅ RIGHT: "Day ${ctx.cycleDay} of your period is typically when bleeding starts to lighten and recovery begins"

❌ WRONG: "Energy can feel lower during this phase"  
✅ RIGHT: "By day ${ctx.cycleDay}, energy often starts recovering compared to the first couple of days"

Every insight field must reference the specific day number or its position within the phase.
Do NOT use generic "your body" or "this phase" openings — be specific about WHAT is happening on THIS day.
```

**No unit test needed** — this is prompt content. The integration tests and manual testing cover GPT output quality.

---

## Task 8: Add zero-data prompt specificity examples

**Problem:** The zero-data prompt tells GPT what NOT to do but gives few examples of what TO do. GPT performs better with positive examples.

**Fix:** In the same `zeroDataInstruction` block, find the existing example line:
```
Example: "Flow and cramping can start to ease around this time" ✅ (NOT "Flow is lighter and cramping is softer" ❌)
```

Add more positive examples after it:
```
More examples by field:
- physicalInsight: "Day ${ctx.cycleDay} is typically when the body starts recovering — energy often begins to shift upward from here." ✅
- mentalInsight: "Focus can still feel slower at this point in the cycle, as recovery is the body's priority over mental sharpness." ✅
- emotionalInsight: "If things feel unsettled emotionally, that often starts stabilizing as bleeding tapers off over the next day or two." ✅
- whyThisIsHappening: "On day ${ctx.cycleDay}, hormone levels are still low, which is what drives this phase — but they're beginning the gradual rise that leads to recovery." ✅
- tomorrowPreview: "By day ${ctx.cycleDay + 1}, many of the heavier symptoms of this phase start to ease." ✅

Key pattern: [specific day reference] + [what typically happens] + [temporal anchor to next change]
```

---

## Task 9: Full regression

```bash
npx tsc --noEmit
npx jest --forceExit
```

All tests must pass. Zero regressions.

Report results in this format:

```
✔/✗ Task 1: Guard bleeding assertion patterns (X new patterns added)
✔/✗ Task 2: GPT zero-data blocked phrases hardened
✔/✗ Task 3: Cramps severity extraction (extractCrampSeverity helper)
✔/✗ Task 4: Bleeding detection multi-source
✔/✗ Task 5: "You notice" assertion leak diagnosed + fixed
✔/✗ Task 6: Population framing eliminated (prompt + validator + guard)
✔/✗ Task 7: Zero-data day-specific anchoring added to GPT prompt
✔/✗ Task 8: Zero-data positive examples added to GPT prompt
✔/✗ Task 9: Full regression — X/X tests, Y suites, tsc clean
```

---

## What NOT to do

- Do NOT modify `vyanaContext.ts` — V2 context is final
- Do NOT modify `narrativeSelector.ts` or `interactionRules.ts` — just fixed in previous sprint
- Do NOT add new DB queries — all fixes are string processing, prompt changes, or field extraction from existing data
- Do NOT add a GPT retry loop — monitor fallback rate first, add retry later if needed
- Do NOT build a certainty layer — the guard + validator already serves this purpose
- Do NOT add post-guard re-validation — guard is deterministic, test runner catches regressions
- Do NOT restructure existing test files — add new tests alongside existing ones