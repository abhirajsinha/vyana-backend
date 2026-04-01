# INSIGHT_LANGUAGE_FIX.md — Zero-Data & Low-Data Language Rules

> **Problem**: Insights for zero-data users assert the user's state ("Energy is lower today")
> when we have no behavioral data to support that claim.
> 
> **Principle**: Phase → suggest tendencies (with uncertainty), NOT Phase → assert state
> 
> **Rule**: The less data we have, the more hedged and phase-general the language must be.

---

## THE THREE CONFIDENCE TIERS

Every insight field must be written differently based on how much data we have:

### Tier 1: ZERO DATA (0 logs)
- We know: cycle day, phase, cycle length
- We do NOT know: how she actually feels, her sleep, stress, mood, energy
- Voice: "This phase tends to..." / "Many people notice..." / "You may find..."
- NEVER: "You feel..." / "Energy is lower" / "Focus is lower" / "Your body is doing..."
- Frame as: educational about the phase, not descriptive of her experience

### Tier 2: LOW DATA (1-4 logs)
- We know: cycle day, phase + a few data points
- Voice: "Based on your recent log..." / "Your latest entry suggests..."
- Can reference specific logged values but NOT extrapolate trends
- NEVER: "Your pattern shows..." / "Over the last few days..." (not enough days)

### Tier 3: PERSONALIZED (5+ logs)
- We know: trends, baselines, deviations, interactions
- Voice: "Your sleep has been..." / "Stress is running higher than your usual..."
- CAN assert state because we have evidence
- This is where the current language is appropriate

---

## TIER 1 LANGUAGE RULES (ZERO DATA)

### What to say vs. what not to say:

| Field | ❌ Current (assertive) | ✅ Fixed (suggestive) |
|---|---|---|
| physicalInsight | "Energy is noticeably lower today" | "Energy can still feel lower toward the end of your period — your body is still recovering, even if things are starting to settle" |
| mentalInsight | "Focus is lower today — your body is prioritizing recovery" | "Focus might not be at its peak yet — this part of the cycle is more about recovery than sharp productivity" |
| emotionalInsight | "Small things feel easier today" | "Compared to the earlier days of your period, things may start to feel a bit lighter emotionally" |
| whyThisIsHappening | "Estrogen and progesterone are at their lowest point, which triggers bleeding" | "Around this time, hormone levels are still low but beginning to stabilize — that shift is what slowly brings energy and clarity back" |
| solution | "Take it slow today — your body is doing real work" | "Keep things light if you can — this is a transition phase, not a push phase" |
| recommendation | "Follicular energy starts returning sooner than expected" | "You're close to the shift into the next phase, where energy and motivation usually begin to return more noticeably" |
| tomorrowPreview | "Tomorrow is Day 6, your next phase begins — you should notice a shift" | "Tomorrow (Day 6) typically marks the start of the follicular phase, where many people begin to feel more clear-headed and physically lighter" |

### Key language patterns for Tier 1:

**Use these openers:**
- "This part of your cycle can bring..."
- "Many people notice..."
- "You may find that..."
- "It's common to feel..."
- "Energy can still feel..."
- "Focus might not be..."
- "Things may start to..."
- "Around this time..."
- "...typically..."
- "...usually..."
- "...tends to..."

**NEVER use these for Tier 1:**
- "You feel..." / "You are feeling..."
- "Energy is lower" / "Focus is lower" (asserting current state)
- "Your body is doing..." (claiming to know her body's state)
- "This is what's happening..." (too certain)
- "Your hormone floor" (too technical)
- "Your sleep has been..." (no sleep data)
- Any sentence that reads as if we observed her today

### Additional Tier 1 rules:

1. **No repetition of the same idea across fields.** If physicalInsight mentions low energy, mentalInsight should NOT also mention low energy. Each field must add a DIFFERENT dimension.

2. **No technical hormone language.** "Estrogen" and "progesterone" are fine in whyThisIsHappening but should be framed as context ("hormone levels tend to be low around this time") not as personal measurement ("your estrogen is low").

3. **whyThisIsHappening should tie to the specific day.** Not just "hormones are low" but "Day 5 is typically the tail end of the period — hormone levels are beginning to stabilize, which is why the next few days often feel noticeably different."

4. **tomorrowPreview should be forward-looking and encouraging.** This is the one place you CAN be slightly more definitive because you're describing what day 6 of a cycle typically brings — you're not claiming to know her future state, you're describing the phase transition.

5. **recommendation should avoid "most people" more than once.** One "many people find..." per response is fine. Two feels like you're hiding behind generalities.

---

## WHERE TO IMPLEMENT THIS

### Change 1: New function in `insightService.ts`

Add `softenForConfidenceTier()` that wraps the output of `generateRuleBasedInsights()`:

```typescript
function softenForConfidenceTier(
  insights: DailyInsights,
  logsCount: number,
  phase: Phase,
  cycleDay: number,
): DailyInsights {
  // Tier 3: 5+ logs — return as-is (already personalized)
  if (logsCount >= 5) return insights;
  
  // Tier 2: 1-4 logs — light softening
  if (logsCount >= 1) {
    return softendeterministic(insights, 0.3); // use low-confidence softener
  }
  
  // Tier 1: 0 logs — full suggestive rewrite
  return rewriteForZeroData(insights, phase, cycleDay);
}
```

### Change 2: `rewriteForZeroData()` function

This function takes the assertive library text and transforms it into suggestive language:

```typescript
function rewriteForZeroData(
  insights: DailyInsights,
  phase: Phase,
  cycleDay: number,
): DailyInsights {
  const soften = (text: string): string => {
    return text
      // State assertions → suggestions
      .replace(/\bYou feel\b/gi, "You may feel")
      .replace(/\bYou are feeling\b/gi, "You might be feeling")
      .replace(/\bEnergy is\b/gi, "Energy can feel")
      .replace(/\bFocus is\b/gi, "Focus might be")
      .replace(/\bMood is\b/gi, "Mood may be")
      .replace(/\bYour body is doing\b/gi, "Your body may be doing")
      .replace(/\bYou might feel low energy today\b/gi, "Energy can still feel lower toward the end of your period")
      .replace(/\bYou might feel more stable today\b/gi, "Things may start to feel more stable around this time")
      .replace(/\bYou might feel more active today\b/gi, "Many people start to feel more active around this time")
      .replace(/\bYou might feel confident today\b/gi, "Confidence and energy tend to build around this time")
      .replace(/\bYou might feel more sensitive today\b/gi, "Sensitivity can increase around this part of the cycle")
      // Remove "today" specificity for zero-data users (we don't know about today)
      .replace(/\btoday\b/gi, "around this time")
      .replace(/\bright now\b/gi, "during this phase")
      // Technical → accessible
      .replace(/\bhormone floor\b/gi, "lowest hormone levels")
      .replace(/\bhormone floor recedes\b/gi, "hormone levels begin stabilizing")
      .trim();
  };

  return {
    physicalInsight: soften(insights.physicalInsight),
    mentalInsight: soften(insights.mentalInsight),
    emotionalInsight: soften(insights.emotionalInsight),
    whyThisIsHappening: soften(insights.whyThisIsHappening),
    solution: soften(insights.solution),
    recommendation: soften(insights.recommendation),
    tomorrowPreview: soften(insights.tomorrowPreview),
  };
}
```

### Change 3: GPT system prompt addition for zero-data users

In `insightGptService.ts`, when `ctx.mode === "fallback"` OR `ctx.recentLogsCount === 0`, add to the user prompt:

```
ZERO-DATA USER (CRITICAL):
This user has logged ZERO days. You have NO behavioral data.
DO NOT assert her current state. DO NOT say "you feel", "energy is lower", "focus is lower".
Instead: describe what this PHASE typically brings, framed as tendencies, not facts.
Use: "can feel", "may notice", "tends to", "many people find", "it's common to"
Each insight field must describe a DIFFERENT aspect — do not repeat "energy is low" across multiple fields.
Keep whyThisIsHappening tied to the specific day number, not generic hormone explanation.
```

### Change 4: Apply in the pipeline

In `insightController.ts` → `getInsights()`, after generating `draftInsights` and before GPT call:

```typescript
// Soften language for low-data users before GPT sees the draft
draftInsights = softenForConfidenceTier(
  draftInsights,
  logsCount,
  cycleInfo.phase,
  cycleInfo.currentDay,
);
```

This ensures even the draft (which GPT uses as a quality floor) already uses suggestive language for zero-data users.

### Change 5: Update the 28-day library (optional but high-impact)

In `cycleInsightLibrary.ts`, consider adding a second variant set for each day that uses suggestive language. The current library is written for data-confirmed users. A zero-data variant would use "can feel", "may notice", etc.

This is a larger change (28 days × 7 fields × 2 variants) but would make the fallback path feel genuinely different from the personalized path.

---

## WHAT THE OUTPUT SHOULD LOOK LIKE

### Day 5, Menstrual phase, ZERO logs:

```json
{
  "physicalInsight": "Energy can still feel lower toward the end of your period — your body is still in recovery mode, even as things start to settle.",
  "mentalInsight": "Focus might not be at its sharpest yet. This part of the cycle tends to be more about winding down than pushing through.",
  "emotionalInsight": "Compared to the earlier days of your period, the emotional weight may start to ease a little — less heaviness, more stability returning.",
  "whyThisIsHappening": "Day 5 is typically the tail end of the menstrual phase. Hormone levels are still low but beginning to stabilize, which is what gradually brings energy and clarity back over the next couple of days.",
  "solution": "Keep things light if you can — this is a transition phase, not a push phase.",
  "recommendation": "You're close to the shift into the follicular phase, where energy and motivation usually begin to return more noticeably.",
  "tomorrowPreview": "Tomorrow (Day 6) typically marks the start of the follicular phase, where many people begin to feel more clear-headed and physically lighter."
}
```

### Compare to current output:

```json
{
  "physicalInsight": "Energy is noticeably lower today as your period comes to an end...",
  "mentalInsight": "Focus is lower today — your body is prioritizing recovery over clarity...",
  "emotionalInsight": "You find that small things feel easier today...",
}
```

The difference: the new version sounds like a knowledgeable friend who knows about cycles. The old version sounds like a system that's pretending it observed you today.

---

## TESTING CHECKLIST

After implementing, verify these cases:

1. **Zero logs, menstrual day 1**: No assertion of pain/cramping state. Should say "Cramping and heavier flow are common on day 1" not "You're experiencing cramping"
2. **Zero logs, ovulation day 14**: No assertion of high energy. Should say "This is often a higher-energy window" not "Your energy is at its peak"
3. **Zero logs, luteal day 25**: No assertion of PMS symptoms. Should say "Sensitivity can increase around this time" not "You feel more sensitive today"
4. **1 log with mood: "good"**: Can reference the log: "Your latest log shows positive mood" but should NOT extrapolate: "Your mood has been improving"
5. **5 logs with clear sleep decline**: CAN assert: "Your sleep has dropped from 7h to 5h" — this is evidence-based
6. **Zero logs, hormonal user**: Should use pattern-based suggestive language. No phase references at all.
7. **Verify no field repeats the same idea**: If physical mentions energy, mental should NOT also mention energy. Each field must add something new.

---

## THE PRINCIPLE

```
Zero data → "This phase tends to bring..."
Low data  → "Your recent log suggests..."
Rich data → "Your sleep has dropped and stress is rising..."
```

The voice gets more specific and assertive as data increases.
This is what makes a user think: "The more I log, the more this app understands me."
That's the retention loop.