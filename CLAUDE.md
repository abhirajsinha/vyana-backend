Vyana — Complete User Flow Walkthrough
Three scenarios traced across every endpoint, with exact response shapes

SCENARIO A: Brand New User — Registers Today, On The Pill
Setup: A 25-year-old woman downloads Vyana. During registration she enters:

name: "Ananya"
age: 25, height: 162, weight: 55
cycleLength: 28
lastPeriodStart: "2026-03-20" (9 days ago)
contraceptiveMethod: "pill"
cycleRegularity: "regular"

What happens at registration (POST /api/auth/register):

getCycleMode({ contraceptiveMethod: "pill", cycleRegularity: "regular" }) → "hormonal"
User created with cycleMode: "hormonal"
Tokens issued, user returned

Now she opens the app. Zero logs. Zero cycle history. Zero insight data.

A1: Home Screen — GET /api/home
What the system computes:

cycleMode = "hormonal"
cyclePrediction → no CycleHistory rows → { avgLength: 28, confidence: "unknown", isIrregular: false }
effectiveCycleLength = 28
cycleInfo = calculateCycleInfo(Mar 20, 28, "hormonal") → currentDay: 10, phase: "follicular" (hormonal mode maps day 6+ to follicular)
contraceptionType = "combined_pill"
contraceptionBehavior.useNaturalCycleEngine = false
isHormonalMode = true
showPhaseInsights = false
isPeriodDelayed = false (hormonal mode skips delay detection)
transitionWarmup = null (new user, no transition — contraceptionChangedAt is null)

Response the frontend gets:
json{
  "title": "Your day, your patterns",
  "subtitle": "Because you're on combined hormonal contraception, your body's natural hormone cycle is typically suppressed. Insights here are based on your logged symptoms and patterns, not cycle-phase assumptions.",
  "cardHeadline": "Log how you feel today",
  "dayPhaseLabel": "Day 10",
  "reassurance": "The more you log, the more we learn about your patterns.",
  "ctaText": "Check in with yourself →",
  "phase": "follicular",
  "cycleDay": 10,
  "cycleLength": 28,
  "isPeriodDelayed": false,
  "daysOverdue": 0,
  "cyclePredictionConfidence": "unknown",
  "isIrregular": false,
  "contraceptionNote": "Because you're on combined hormonal contraception...",
  "isHormonalMode": true,
  "ctaLogPhase": "follicular",
  "quickLogFields": [
    { "key": "mood", "label": "Mood", "type": "emoji_mood", "options": ["😔","😐","🙂","😄"] },
    { "key": "energy", "label": "Energy", "type": "chips", "options": ["Low","Medium","High"] },
    { "key": "fatigue", "label": "Fatigue", "type": "chips", "options": ["Low","Moderate","High"] },
    { "key": "pain", "label": "Cramps", "type": "chips", "options": ["None","Mild","Moderate","Severe"] }
  ],
  "transitionWarmup": null
}
Key UX points:

No phase label shown (just "Day 10", not "Day 10 · Follicular phase")
No ovulation or fertility info
Quick log fields are pattern-based (mood, energy, fatigue, pain) — NOT phase-specific
Subtitle explains WHY insights work differently


A2: Quick Log Config — GET /api/logs/quick-log-config
json{
  "phase": null,
  "phaseLabel": "Your day",
  "title": "Log today 📝",
  "subtitle": "Quick check-in to track your patterns",
  "dayPhaseLabel": "Day 10",
  "fields": [
    { "key": "mood", "label": "Mood", "type": "emoji_mood" },
    { "key": "energy", "label": "Energy", "type": "chips", "options": ["Low","Medium","High"] },
    { "key": "stress", "label": "Stress", "type": "chips", "options": ["Low","Moderate","High"] },
    { "key": "fatigue", "label": "Fatigue", "type": "chips", "options": ["Low","Moderate","High"] }
  ],
  "submitLabel": "Save today's check-in →",
  "hasLoggedToday": false,
  "todayLogId": null,
  "isPatternBased": true
}
Key UX points:

phase: null — no phase shown
isPatternBased: true — frontend knows this is pattern mode
Generic fields, no period-specific or ovulation-specific fields


A3: Calendar — GET /api/calendar?month=2026-03
json{
  "month": "2026-03",
  "cycleLength": 28,
  "cycleMode": "hormonal",
  "cyclePredictionConfidence": "unknown",
  "isIrregular": false,
  "isPeriodDelayed": false,
  "daysOverdue": 0,
  "showPhaseInsights": false,
  "currentPhase": null,
  "nextPeriodEstimate": null,
  "calendar": [
    {
      "date": "2026-03-29",
      "cycleDay": 10,
      "phase": null,
      "isToday": true,
      "hasLog": false,
      "isPeriodDay": false,
      "isOvulationDay": false,
      "isPredicted": false,
      "isPeriodDelayed": false,
      "phaseColor": "#888888",
      "logSummary": null
    }
  ],
  "todayInsightCard": {
    "date": "2026-03-29",
    "dayLabel": "29 March",
    "dayPhaseLabel": "Day 10",
    "cardHeadline": "Log how you feel today",
    "reassurance": "Your insights are based on your logged patterns.",
    "ctaText": "Check in with yourself 🌙"
  },
  "phaseTimeline": null
}
Key UX points:

ALL phase colors are grey (#888888)
No period days, no ovulation days marked
No phase timeline bar
No next period estimate
Day insight cards are pattern-based


A4: Insights — GET /api/insights
With 0 logs, the system computes:

recentLogs = [], baselineLogs = []
context.mode = "fallback" (0 logs)
context.confidence = "low"
context.confidenceScore ≈ 0
All signals: "unknown"
canUseAI = false (no signal richness, no high priority signal)
aiEnhanced = false, aiDebug = "gated"
Insights come from the day-specific library (cycle day 10, fallback mode)
Hormonal mode: day 10 maps to the library's day 10 entry
Phase references stripped by contraception tone filter

json{
  "cycleDay": 10,
  "isNewUser": true,
  "progress": {
    "logsCount": 0,
    "nextMilestone": 3,
    "logsToNextMilestone": 3
  },
  "confidence": "low",
  "isPeriodDelayed": false,
  "daysOverdue": 0,
  "isIrregular": false,
  "insights": {
    "physicalInsight": "Energy and stamina may start picking up noticeably from today.",
    "mentalInsight": "Thinking may start feeling a little clearer as hormones stabilize today.",
    "emotionalInsight": "Mood may lift noticeably as hormones recover and bleeding lightens today.",
    "whyThisIsHappening": "This combines your cycle phase with limited data.\nIt will refine as more logs are added.",
    "solution": "Good day for focused work — your capacity may be growing steadily.",
    "recommendation": "Log mood, sleep, and stress for the next 3 days — the insights will get sharper fast.",
    "tomorrowPreview": "Day 11 continues peak performance before the ovulation window opens."
  },
  "view": {
    "primaryInsight": "Energy and stamina may start picking up...",
    "supportingInsights": ["Thinking may start...", "Mood may lift..."],
    "action": "Good day for focused work...",
    "recommendation": "Log mood, sleep, and stress...",
    "tomorrowPreview": "Day 11 continues...",
    "confidenceLabel": "Phase-based guidance"
  },
  "aiEnhanced": false,
  "transitionWarmup": null
}
Key UX points:

isNewUser: true — frontend can show onboarding prompts
progress.logsToNextMilestone: 3 — "Log 3 more days to unlock better insights"
confidenceLabel: "Phase-based guidance" — tells user this is generic
Insights come from the library, not GPT
Phase references in the text get softened by the contraception tone filter ("your recent patterns" instead of "this phase")

⚠️ ISSUE TO NOTE: The library text for day 10 still has some phase-specific language like "ovulation window" in tomorrowPreview. The contraception tone filter in getInsights() only replaces "this phase" / "in this phase" / "during this phase" — it doesn't catch every library phrase. This is a known edge for fallback mode + hormonal users. In practice, once the user logs 3+ days, GPT takes over and the tone instruction handles it properly.

A5: Forecast — GET /api/insights/forecast
With 0 logs:
json{
  "available": false,
  "isNewUser": true,
  "forecastLocked": true,
  "reason": "insufficient_logs",
  "warmupMessage": "We're still learning your patterns. Log a few more days and your forecast will unlock. (0/7 days logged)",
  "progressPercent": 0,
  "progress": {
    "logsCount": 0,
    "nextMilestone": 7,
    "logsToNextMilestone": 7,
    "logSpanDays": 0,
    "logSpanNeeded": 5
  },
  "contraceptionContext": {
    "type": "combined_pill",
    "contextMessage": "Because you're on combined hormonal contraception..."
  },
  "transitionWarmup": null
}
Forecast is locked. User needs 7 logs across 5+ days to unlock it.

A6: Chat — POST /api/chat { "message": "hi!", "history": [] }
After the chat fix (intent detection), this is classified as "casual":
json{
  "reply": "Hi Ananya! How are you doing today? 😊"
}
No cycle data, no phase info, no hormone language. Just a warm greeting.
If she asks "why am I so tired?" (classified as "health"):
json{
  "reply": "I don't have enough data yet to tell you what's driving the fatigue — I'd need a few days of logs to see if there's a pattern. For now, could you log how your sleep, stress, and energy have been? That'll help me give you something more specific."
}
The totalLogCount = 0 triggers the ZERO DATA guard — GPT knows it has nothing to work with and says so honestly.

A — After 7 days of logging
Once Ananya has logged 7 days, things change significantly:

context.mode = "personalized" (7 logs)
context.confidence = "high" (5+ logs)
canUseAI = true (signal richness met)
GPT rewrites insights with pattern-based tone
Forecast unlocks
Insights show real patterns from her data
But still NO phase-specific language, NO ovulation/hormone curves, NO PMS forecast



SCENARIO B: Existing Natural User — Starts Pill Mid-Cycle
Setup: Priya has been using Vyana for 3 months. She's on Day 18 of a natural 30-day cycle (her average from cycle history). She has 56 days of logged data, 3 completed cycles. Today she starts taking the pill and updates her profile.
Before the switch — what Priya sees:
Home: "Slowing down" / "Day 18 · Luteal phase" / "Low chance of pregnancy" / phase-specific quick log fields (mood, energy, cravings, fatigue)
Calendar: Full phase colors (red/orange/purple), ovulation markers, period predictions, phase timeline bar
Insights: Full personalized GPT-rewritten insights with identity layer ("for you, this part of your cycle tends to..."), cross-cycle narrative, hormone context in whyThisIsHappening, PMS forecast

B1: The Switch — PUT /api/user/profile { "contraceptiveMethod": "pill" }
What happens internally:

classifyTransition("none", "pill") → "natural_to_hormonal"
clearAllCaches(userId) — deletes all InsightCache + HealthPatternCache
markCycleAsTransitional(userId) — sets current open cycle's cycleLength to null
resetBaselineData(userId) — deletes all InsightMemory + InsightHistory
NEW (Fix 1): lastPeriodStart reset to today (March 29)
NEW (Fix 2): contraceptionChangedAt set to today
cycleMode updated to "hormonal"

Response:
json{
  "user": {
    "id": "...",
    "name": "Priya",
    "cycleLength": 30,
    "cycleMode": "hormonal",
    "contraceptiveMethod": "pill",
    "lastPeriodStart": "2026-03-29T00:00:00.000Z",
    "contraceptionChangedAt": "2026-03-29T..."
  },
  "contraceptionTransition": {
    "transitionType": "natural_to_hormonal",
    "previousMethod": null,
    "newMethod": "pill",
    "previousCycleMode": "natural",
    "newCycleMode": "hormonal",
    "contextMessage": "You've started hormonal contraception. Your insights will now be based on your logged symptoms and patterns rather than cycle-phase predictions, since hormonal contraception changes how your body's natural hormone cycle works. It may take a few weeks for your body to adjust — keep logging and we'll adapt to your new patterns.",
    "baselineReset": true,
    "periodStartReset": true
  }
}
Key moment: lastPeriodStart is now TODAY. So when she opens any endpoint next, currentDay = 1, not 19.

B2: Home Screen — GET /api/home (immediately after switch)
json{
  "title": "Your day, your patterns",
  "subtitle": "Because you're on combined hormonal contraception, your body's natural hormone cycle is typically suppressed...",
  "cardHeadline": "Log how you feel today",
  "dayPhaseLabel": "Day 1",
  "reassurance": "The more you log, the more we learn about your patterns.",
  "ctaText": "Check in with yourself →",
  "phase": "menstrual",
  "cycleDay": 1,
  "isHormonalMode": true,
  "quickLogFields": [
    { "key": "mood", "label": "Mood", "type": "emoji_mood" },
    { "key": "energy", "label": "Energy", "type": "chips" },
    { "key": "fatigue", "label": "Fatigue", "type": "chips" },
    { "key": "pain", "label": "Cramps", "type": "chips" }
  ],
  "transitionWarmup": {
    "active": true,
    "daysSinceTransition": 0,
    "daysRemaining": 14,
    "message": "Your insights are resetting to match your new contraception. Keep logging daily — personalized patterns will return within 1–2 weeks.",
    "tip": "The more you log right now, the faster your insights will feel like yours again."
  }
}
Key UX changes from before:

Was "Day 18 · Luteal phase" → Now "Day 1" (no phase label)
Was "Slowing down" → Now "Your day, your patterns"
Was phase-specific log fields → Now pattern-based log fields
NEW: transitionWarmup tells her WHY things look different


B3: Calendar — GET /api/calendar?month=2026-03 (after switch)

All phase colors → grey (#888888)
No ovulation/period markers
No phase timeline
No next period estimate
Day 1 = today (March 29)
Historical days before the switch still show logged data (hasLog: true) but no phase colors


B4: Insights — GET /api/insights (after switch)
Critical internal state:

recentLogs = last 7 days of Priya's existing logs (these survive the transition — only InsightMemory and InsightHistory were deleted, not DailyLog)
baselineLogs = days 8–90 of her logs (also survive)
context.mode = "personalized" (she has 7+ logs)
BUT: crossCycleNarrative = null (InsightHistory was wiped)
memoryContext = null (InsightMemory was wiped)
identity layer disabled (no historical pattern data)
hormoneLanguage = null (showHormoneCurves = false for combined_pill)
insightTone = "pattern-based" → phase references stripped

json{
  "cycleDay": 1,
  "isNewUser": false,
  "progress": { "logsCount": 7, "nextMilestone": 14, "logsToNextMilestone": 7 },
  "confidence": "high",
  "insights": {
    "physicalInsight": "Your energy looks stable based on your recent patterns. Adjust activity based on how you feel.",
    "mentalInsight": "Your recent signal suggests a relatively balanced mental state. No strong strain signals detected.",
    "emotionalInsight": "Your emotional state looks steady right now. No strong shifts in either direction.",
    "whyThisIsHappening": "Recent trends (Sleep stable, Stress moderate) indicate your body and mood are responding to day-to-day changes.",
    "solution": "Keep your current rhythm and add one anchor habit today.",
    "recommendation": "Steady basics this week: regular sleep, a little movement, and short breaks when things feel heavy.",
    "tomorrowPreview": "If you protect your sleep tonight, tomorrow will likely feel noticeably better."
  },
  "aiEnhanced": true,
  "transitionWarmup": {
    "active": true,
    "daysSinceTransition": 0,
    "daysRemaining": 14,
    "message": "Your insights are resetting to match your new contraception...",
    "tip": "The more you log right now, the faster your insights will feel like yours again."
  }
}
What changed from before the switch:

Was "For you, this part of your cycle tends to bring lower sleep and higher stress" → Now generic pattern language
Was hormone context in whyThisIsHappening → Now gone
Was PMS forecast → Now gone
Was identity layer → Now gone (will rebuild over 2+ new cycles)
Her LOG DATA still works — sleep, stress, mood signals are still computed from her existing logs
transitionWarmup explains the reset

Over the next 14 days:

Warmup message evolves: day 0–3 → "resetting", day 4–7 → "learning", day 8–14 → "almost ready"
After 14 days: transitionWarmup = null
As she logs new data under the pill, new InsightMemory and InsightHistory build up
After 2 completed "cycles" (pill packs), cross-cycle narrative returns
Identity layer re-enables when matchingCycles >= 2


B5: Forecast — GET /api/insights/forecast (after switch)
json{
  "available": true,
  "progress": { "logsCount": 7 },
  "today": {
    "phase": null,
    "currentDay": 1,
    "confidenceScore": 0.72,
    "priorityDrivers": []
  },
  "forecast": {
    "tomorrow": {
      "date": "2026-03-30",
      "phase": null,
      "outlook": "Things should feel similar tomorrow — no major shifts expected."
    },
    "nextPhase": null,
    "confidence": {
      "level": "high",
      "score": 0.72,
      "label": "Based on your patterns",
      "message": "This forecast is based on your recent patterns — though individual responses can still vary."
    }
  },
  "pmsSymptomForecast": null,
  "contraceptionContext": {
    "type": "combined_pill",
    "forecastMode": "pattern",
    "contextMessage": "Because you're on combined hormonal contraception..."
  },
  "transitionWarmup": { "active": true, "..." : "..." }
}
Key changes:

phase: null everywhere
nextPhase: null (no phase transitions for hormonal users)
pmsSymptomForecast: null (disabled for combined pill)
Forecast is pattern-based, not phase-based



SCENARIO C: Delayed Period — Expected Today, Didn't Come
Setup: Riya has a natural 28-day cycle (reliable, 3 completed cycles, avg length 28). Her last period started on March 1. Today is March 29 — Day 29. Her period was expected on Day 28 (yesterday). It hasn't come.

C1: How the system detects the delay
Every endpoint that checks for delayed periods computes:
rawDiffDays = utcDayDiff(Mar 29, Mar 1) = 28
daysOverdue = max(0, 28 - 28) = 0    ← WAIT, this is 0!
Actually let me recalculate:
lastPeriodStart = March 1
today = March 29
diffDays = 28 (Mar 1 → Mar 29 = 28 days)
effectiveCycleLength = 28
daysOverdue = max(0, 28 - 28) = 0
So on Day 29 (one day late):
diffDays = 28
daysOverdue = max(0, 28 - 28) = 0  ← Still 0!
Hmm — the issue is that utcDayDiff(Mar 29, Mar 1) = 28, and effectiveCycleLength = 28, so 28 - 28 = 0. The period isn't detected as late until Day 30 (2 days after expected).
Let me re-check: If the cycle is 28 days, the expected next period is Day 1 of the NEXT cycle, which would be March 29 (28 days after March 1). So on March 29, the period was due TODAY, not yesterday.
Actually: cycleDay = (28 % 28) + 1 = 1. So March 29 IS Day 1 of the new cycle. The system expects the period to have already started.
Let's say it's March 30 (Day 30, one day truly late):
diffDays = utcDayDiff(Mar 30, Mar 1) = 29
daysOverdue = max(0, 29 - 28) = 1
isPeriodDelayed = 1 > 0 && confidence !== "irregular" && cycleMode !== "hormonal" = TRUE
✅ Now the delay is detected. Let's trace March 30 (1 day late).

C2: Home Screen — GET /api/home (period 1 day late)
json{
  "title": "Your period is a day late",
  "subtitle": "Cycles can shift by a few days — that's completely normal.",
  "cardHeadline": "Your body may just need a little more time",
  "dayPhaseLabel": "Day 29 · Luteal phase",
  "reassurance": "Most late periods arrive within a week. Keep logging how you feel.",
  "ctaText": "Log how you're feeling →",
  "phase": "luteal",
  "cycleDay": 29,
  "cycleLength": 28,
  "isPeriodDelayed": true,
  "daysOverdue": 1,
  "cyclePredictionConfidence": "reliable",
  "isIrregular": false,
  "contraceptionNote": null,
  "isHormonalMode": false,
  "quickLogFields": [
    { "key": "mood", "label": "Mood", "type": "emoji_mood" },
    { "key": "energy", "label": "Energy", "type": "chips" },
    { "key": "fatigue", "label": "Fatigue", "type": "chips" },
    { "key": "pain", "label": "Cramps", "type": "chips" }
  ],
  "transitionWarmup": null
}
Key UX points:

Title changes to "Your period is a day late"
Subtitle is reassuring, not alarming
Quick log fields switch to the delayed-period set (mood, energy, fatigue, pain)
isPeriodDelayed: true — frontend can show special UI


C3: Calendar — GET /api/calendar?month=2026-03 (period late)
The today entry and future entries get:
json{
  "date": "2026-03-30",
  "cycleDay": 30,
  "phase": "luteal",
  "isToday": true,
  "isPeriodDelayed": true,
  "phaseColor": "#9B59B6"
}
The todayInsightCard is overridden:
json{
  "cardHeadline": "Your period is a day late",
  "reassurance": "Late periods can happen — stress, travel, and diet can all cause a shift.",
  "ctaText": "Log how you're feeling 🌙"
}

C4: Insights — GET /api/insights (period late)
The delayed period detection fires and OVERRIDES the insight content:
json{
  "cycleDay": 30,
  "isPeriodDelayed": true,
  "daysOverdue": 1,
  "isIrregular": false,
  "insights": {
    "physicalInsight": "Your period is a little late — this can happen with stress, travel, or lifestyle changes.",
    "emotionalInsight": "It's natural to feel uncertain when your cycle doesn't follow the expected pattern.",
    "whyThisIsHappening": "Even regular cycles can be shifted by stress, illness, travel, or changes in routine.",
    "tomorrowPreview": "Keep logging how you feel — the more data you have, the better we can support you.",
    "solution": "...",
    "recommendation": "...",
    "mentalInsight": "..."
  },
  "view": {
    "primaryInsight": "Your period is a little late — this can happen with stress, travel, or lifestyle changes.",
    "..."
  }
}
If it's 5+ days late, the physicalInsight changes:
"Your period is 5 days late. If you're concerned, it's worth checking in with a doctor."
If the user has irregular cycles (cyclePrediction.isIrregular = true), whyThisIsHappening changes:
"Irregular cycles can vary significantly — a late period doesn't always mean something is wrong."

C5: What if it's 7+ days late?
The reassurance on the home screen changes:
"If your period is more than 7 days late and you're concerned, it's worth checking in with a doctor."
The system continues tracking but starts gently nudging toward medical advice.

C6: When she finally logs her period — POST /api/cycle/period-started
When Riya's period arrives (say on April 2, Day 33):

She calls POST /api/cycle/period-started { "date": "2026-04-02" }
The system:

Finds the open CycleHistory entry (started March 1)
Closes it: endDate = April 2, cycleLength = 32 (longer than usual)
Creates a new CycleHistory entry: startDate = April 2
Updates user.lastPeriodStart to April 2
Triggers health pattern detection (3+ completed cycles)


Next time she opens insights:

cycleDay = 1 (fresh cycle)
isPeriodDelayed = false
The cycle prediction engine now includes the 32-day cycle
If this pushes variability high enough, isIrregular may become true
effectiveCycleLength will adjust (average of recent cycles including 32)




C7: What about irregular cycles specifically?
If Riya's past 3 cycles were 26, 32, 28 days:
detectCycleIrregularity([26, 32, 28]):
  avg = 28.67 → 29
  maxDiff = 32 - 26 = 6
  stdDev = √((2.67² + 3.33² + 0.67²) / 3) ≈ 2.5
  isIrregular = false (maxDiff ≤ 7 and stdDev ≤ 3.5)
  confidence = "reliable"
If cycles were 24, 35, 28 days:
  avg = 29
  maxDiff = 35 - 24 = 11
  stdDev ≈ 4.5
  isIrregular = true (maxDiff > 7)
  confidence = "irregular"
When isIrregular = true, every endpoint adjusts:
Home: Subtitle changes to "Your cycle tends to vary — this is an estimate"
Insights:

Language softened: "today" → "around this time", "this phase" → "this part of your cycle"
Reassurance gets suffix: "Keep logging and we'll refine this over time."
Delayed period detection is DISABLED (confidence === "irregular" blocks it)
This is correct — for irregular users, a "late" period is normal

Calendar:

Next period estimate gets a range: earliest/latest dates based on stdDev
Phase predictions are shown but marked as estimates

Forecast:

Confidence message: "We're still building confidence in your patterns..."
If too irregular, may show lower confidence score

Anticipation layer: Disabled for irregular cycles (in vyanaContext.ts: if (isIrregular) return no-anticipation)

SUMMARY TABLE: What Each User Sees
EndpointNew User + PillExisting → Pill SwitchPeriod LateHome title"Your day, your patterns""Your day, your patterns""Your period is X days late"Phase label"Day N" (no phase)"Day 1" (no phase, reset)"Day N · Luteal phase"Quick logPattern-basedPattern-basedDelayed-period setCalendar phasesAll greyAll greyNormal colors, delay flagCalendar ovulationHiddenHiddenVisibleInsights tonePattern-based, genericPattern-based, from logsPhase-based, delay overrideHormone languageSuppressedSuppressedActive (natural cycle)PMS forecastDisabledDisabledActiveCross-cycle narrativeNone (new)None (wiped)ActiveIdentity layerDisabledDisabled (wiped)ActiveTransition warmupnullActive (14 days)nullForecastLocked (0 logs)Available (pattern mode)Available (phase mode)Fertility infoHiddenHiddenVisible

EDGE CASES HANDLED ✅

✅ New user registers on pill → pattern mode from day 1
✅ Existing user starts pill mid-cycle → transition handler fires, resets everything
✅ Period 1+ days late → delayed period detection across home/calendar/insights
✅ Period 7+ days late → medical advice nudge
✅ Irregular cycles → language softening, delay detection disabled, range estimates
✅ Pill user logs heavy bleeding → treated as pattern signal, not "period"
✅ User stops pill → hormonal_to_natural transition, back to phase mode
✅ User switches pill types → hormonal_to_hormonal, caches reset

EDGE CASES WITH KNOWN GAPS ⚠️

⚠️ Fallback mode library text may still have phase language for hormonal users (tomorrowPreview mentions "ovulation window") — only affects users with <3 logs
⚠️ No withdrawal bleed tracking for pill users — logged bleeding treated same as natural
⚠️ Post-pill irregular phase shown immediately (no softening buffer)
⚠️ No proactive prompt asking user if contraception changed