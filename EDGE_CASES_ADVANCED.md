# EDGE_CASES_ADVANCED.md — The Elite Layer

> This document covers what EDGE_CASES_MASTER.md doesn't:
> not "does the system break?" but "does the system feel consistently right?"
> 
> Four sections:
> 1. User Trust Breakers — contradictions that make users doubt the app
> 2. Recovery Scenarios — what happens when things go wrong
> 3. System Stress & Failure Modes — what happens under real production load
> 4. Learning System Integrity — does the system stay accurate over months

---

## SECTION 1: USER TRUST BREAKERS

These aren't bugs. The code runs. The response is 200. But the user thinks: "this app doesn't understand me" and uninstalls.

### 1.1 — Cross-Screen Contradictions

| # | Scenario | What happens now | What user feels | Fix needed |
|---|---|---|---|---|
| T1 | Home says "Day 1 · Period" but insights say "Day 28 · Luteal" (mid-day period logging) | InsightCache not cleared by periodStarted | "This app is broken" | Clear InsightCache on periodStarted |
| T2 | Home says "You might feel confident today" (ovulation phase) but insights say "Stress has been building" (signal-driven) | Home uses phase-only content, insights use logged data | "Which one is true?" | Home should incorporate signal data when available. If 5+ logs exist, home headline should reflect actual signals, not just phase. |
| T3 | Calendar shows phase colors but quick-log-config shows different phase fields | Both read lastPeriodStart independently — timing shouldn't differ. But if user logs period between two screen loads... | "The app is confused" | Both derive from same cycleInfo calculation — ensure consistency by sharing or invalidating together. |
| T4 | Chat says "your sleep has been low" but insights don't mention sleep | Chat builds context fresh from DB. Insights may be cached from morning when sleep data wasn't yet logged. | "Vyana contradicts herself" | Insights should always be the freshest source. Chat should reference cached insights when available, or insights should never be stale. |
| T5 | Yesterday's insight said "energy should improve tomorrow" but today's insight says "energy is low" | tomorrowPreview is a prediction. Reality can differ. | "The prediction was wrong" — trust in forecasting drops | When today contradicts yesterday's tomorrowPreview, acknowledge it: "We expected improvement but your logs show otherwise — here's why." This requires storing yesterday's tomorrowPreview and comparing. |
| T6 | Forecast says "next phase in 3 days" but calendar shows phase change in 5 days | Forecast uses effectiveCycleLength (averaged). Calendar uses same. But rounding differences or cache staleness can cause 1-2 day mismatches. | "Can't even agree on dates" | Both must use identical effectiveCycleLength from same computation. |
| T7 | Home says "Day 14 · Ovulation" but health patterns page says nothing about ovulation | Health patterns only surfaces alerts/watching states. No connection to current phase. | Not a contradiction per se, but missed opportunity | Health patterns could surface phase-relevant tips: "Since you're in ovulation, here's what we're watching for in the luteal phase ahead." |

### 1.2 — Sudden State Changes

| # | Scenario | What happens now | What user feels | Fix needed |
|---|---|---|---|---|
| T8 | User logs one bad night (sleep: 3h). Insights shift from calm/stable to "sleep disruption driving everything" | detectPrimaryInsightCause uses recent weighted average. One extreme value can swing it. | "I had ONE bad night and the app panics" | Add minimum-days-for-disruption threshold. Single-day spikes should be acknowledged ("last night was rough") but not trigger full disruption narrative unless 2+ days confirm the pattern. |
| T9 | User on cycle day 27 — insights say "luteal, winding down." Next day logs period — suddenly "Day 1, menstrual, rest mode" | Correct behavior. But the tone shift is jarring — yesterday was "winding down" and today is "your body is doing hard work" | "Too dramatic" | Add phase-transition bridging language: "Your period just started — this is the shift we mentioned yesterday. Here's what to expect now." The `tomorrowPreview` from yesterday should seed today's opening context. |
| T10 | User's effectiveCycleLength was 28 (based on 3 cycles). She logs a 35-day cycle. Now average shifts to 30. All phase calculations change. | Correct behavior. Predictions adapt. | "Everything moved. My ovulation used to be day 14, now it's day 16?" | When effectiveCycleLength changes by 2+ days after a period log, show a one-time explanation: "Your cycle length has been updated based on your latest period. Predictions have shifted slightly to match your actual pattern." |
| T11 | User was "regular" (3 consistent cycles). 4th cycle is 40 days. detectCycleIrregularity now returns "variable" or "irregular" | Confidence drops. Language softens. Phase labels may change. | "Yesterday you were confident, today you're hedging everything" | Gradual confidence transitions. Don't jump from "reliable" to "irregular" on one anomaly. Use a buffer: if 1 out of 4 cycles is an outlier, stay at "variable" not "irregular". Only move to "irregular" if 2+ out of 6 cycles are anomalous. |
| T12 | User switches contraception. All insights become pattern-based. Phase labels disappear. | Correct behavior. Transition handled. | "Where did everything go? I liked seeing my phases." | Transition messaging needs to explicitly explain what changed and why: "Since you started [method], phase predictions aren't reliable for your body right now. We're switching to pattern-based insights that reflect how YOU actually feel, not what a textbook says." |

### 1.3 — Insights That Feel Wrong

| # | Scenario | What happens now | What user feels | Fix needed |
|---|---|---|---|---|
| T13 | User on period day 2, logged mood: "good", energy: "high", sleep: 8h. Insight says "You might feel low energy today" | buildPhysicalInsight checks for isPeakPositiveWindow — but that only fires for ovulation/follicular. Menstrual phase doesn't have a signal-positive path that overrides phase language with POSITIVE menstrual content. | "I feel great and you're telling me I feel bad?" | Actually, re-checking: isSignalPositive CAN fire during menstrual if priorityDrivers is empty AND physical_state is not high_strain AND mood is positive. This returns "Your body feels steady and well-supported right now." — that IS correct. But the home screen still says "On your period — You might feel low energy" from phase-only content. HOME is the problem, not insights. |
| T14 | User consistently sleeps 5h and says mood is "good". Insights say "sleep disruption" | The engine correctly identifies sleep below baseline. User genuinely feels fine. | "Stop telling me I have a problem. I function on 5 hours." | If mood is consistently "good" AND energy is not "low" despite low sleep, the insight should acknowledge: "Your sleep is below the usual average, but your mood and energy suggest you're handling it well." Don't override signal-positive data with sleep-based concern. |
| T15 | User in follicular phase, logs good data for 5 days. Insights say "Energy is building" / "Momentum building." Day 6, she logs stress: "high" (one bad day at work). Insights completely flip to "Stress has been higher than usual" | One day of high stress shouldn't override 5 days of positive signals. But the weighted average gives recent data higher weight. | "One bad day and you forgot how well I was doing?" | Add momentum protection: when previous 4+ days showed positive signals and current day shows a single negative signal, frame it as "Today is rougher than your recent streak" rather than overwriting the entire narrative. |
| T16 | Late luteal (day 25). User logs mood: "good", stress: "low", sleep: 8h. Insights say "You might feel more sensitive today" / "Pre-period phase" | Phase-based content assumes late luteal = PMS. But her actual data says she's fine. | "You're projecting PMS onto me when I'm doing well" | isSignalPositive should override late-luteal phase language. If her data is clearly positive, respect it. Don't force PMS narrative onto a user who isn't experiencing it. |
| T17 | User logs consistently: mood alternates good/low/good/low across days. Mood trend shows "stable" (averages cancel out). But user's EXPERIENCE is volatile. | Mood variability is "high" — this IS detected. But the insight narrative focuses on the average, not the variance. | "You say I'm stable but I feel like a rollercoaster" | When mood variability is "high", the insight should lead with that: "Your mood has been fluctuating a lot this week — good days and tough days alternating. That inconsistency itself is draining." |
| T18 | User has 3 cycles of data. Cross-cycle narrative says "around day 24 you typically had elevated stress." But this cycle, day 24, stress is low. | Narrative still says "your past cycles show stress here" even though she's bucking the trend. | "You're describing a past version of me, not who I am today" | When current data contradicts cross-cycle narrative, acknowledge the break: "Your past cycles show stress tends to rise around now — but this time you're handling it differently. That's worth noting." |

### 1.4 — The "App Doesn't Know Me" Feeling

| # | Scenario | What happens now | What user feels | Fix needed |
|---|---|---|---|---|
| T19 | User logged 30 days of data. Insights still feel generic. | If her data has been stable (neutral mood, moderate stress, 7h sleep), the insight engine falls into "stable state" → generic stable messaging every day. | "I've been logging for a month and you're still giving me canned responses" | Stable state insights should still be personalized: "Your sleep has been consistent around 7h — that's YOUR normal and it's working well for you." Reference her specific numbers, not generic "things are stable." |
| T20 | User with 50 days of data. Insights reference "based on your patterns" but the actual content doesn't feel specific to HER patterns. | Identity layer (vyanaContext) only fires if cross-cycle narrative exists AND identity rotation allows it. For users with data within a single long cycle, no cross-cycle narrative exists. | "You claim to know my patterns but you're guessing" | Within-cycle identity should emerge at 14+ days of consistent data: "Over the past two weeks, your energy tends to dip when sleep drops below 6.5h — that's your pattern." This doesn't require multi-cycle data. |
| T21 | Two users with identical cycle day + phase but different log data get the same home screen content | Home screen buildContent() is purely phase-based. Does not incorporate logged data. | "My friend uses the app and we see the same things" | Home screen should pull at least the headline from the insight engine when 3+ logs exist. The differentiation is the entire value proposition. |

---

## SECTION 2: RECOVERY SCENARIOS

What happens when things go wrong — and how gracefully does the system handle it?

### 2.1 — Wrong Data Entered

| # | Scenario | Current handling | What should happen |
|---|---|---|---|
| R1 | User accidentally logs sleep: 1h (meant 10h, fat-fingered) | Stored as-is. Immediately shifts weighted averages. Sleep disruption may fire. Insights change dramatically. Cache cleared on next log but damage is in recentLogs. | Need a log EDIT endpoint (PUT /api/logs/:id). When a log is edited, re-invalidate caches. Frontend should show recent logs with edit option. |
| R2 | User logs period on wrong date (meant next week, tapped by accident) | New CycleHistory created. Previous cycle closed with wrong length. lastPeriodStart updated. All downstream calculations wrong. | Need period-started UNDO endpoint (DELETE /api/cycle/period-started/:id). Reopens previous cycle, deletes erroneous entry, restores lastPeriodStart. |
| R3 | User registers with wrong cycleLength (said 21, actually 28) | All phase calculations wrong until she logs 2+ periods and effectiveCycleLength overrides. | Profile update (PUT /api/user/profile) already handles this. But user might not know to update it. After 2 completed cycles where observed length differs from stored by 3+ days, proactively suggest: "Your actual cycles average 28 days, but your profile says 21. Want us to update?" |
| R4 | User registers with wrong lastPeriodStart | All cycle day calculations wrong. Phase labels wrong. | Same as R3 — proactive correction after first observed period. |
| R5 | User logged mood: "low" for 5 days because she thought "low" was the scale for good (misunderstood UI) | Engine detects mood trend declining. Emotional state "loaded". All insights push concern narrative. | Need an explicit reversal mechanism: user marks logs as incorrect → system recalculates without those entries. Or: frontend confirmation on unusual patterns: "You've logged low mood for 5 days — is this accurate?" |

### 2.2 — User Inactivity & Return

| # | Scenario | Current handling | What should happen |
|---|---|---|---|
| R6 | User doesn't log for 3 days | recentLogs still has her last 7 entries (now 3-10 days old). Insights generated from stale data. | After 2 days of no logs: insights should acknowledge it: "We haven't heard from you in a few days — your insights are based on your last log from [date]." Notification cadence could increase slightly (if enabled). |
| R7 | User doesn't log for 2 weeks | recentLogs are 14-21 days old. Trends calculated from ancient data. Stable state may fire because old data was stable. | After 7 days: switch to phase-only mode (like a new user). Show: "It's been a while since you last logged. Your insights are based on your cycle phase for now — log today and we'll personalize again." |
| R8 | User doesn't log for 3 months | lastPeriodStart is 3 months old. Cycle day wraps multiple times. isPeriodDelayed fires. Insights are meaningless. | After 30 days of inactivity: full "welcome back" flow. Prompt: "A lot has changed since we last heard from you. Let's get back on track." Ask: "Has your period come since [lastPeriodStart]?" "Have you changed contraception?" Essentially a soft re-onboarding. |
| R9 | User doesn't log for 6 months, then logs period | CycleHistory gets a new entry. Previous cycle closed with cycleLength = 180 days. This massive outlier skews predictions. | Guard against unreasonable cycle lengths: if observed cycleLength > 60 days, mark as anomalous (don't include in prediction average). Or treat as a new baseline: "It's been a while — we're treating this as a fresh start for predictions." |
| R10 | User returns after app update that changed insight logic | InsightCache from before the update may have different structure. | isInsightsPayloadCached checks for required fields. If structure changed, cache miss → recomputation. Should be fine. But any new fields added to the response that aren't in old caches would be missing. |

### 2.3 — Data Correction Cascading

| # | Scenario | Current handling | What should happen |
|---|---|---|---|
| R11 | User edits a log from 3 days ago (currently no edit endpoint) | N/A — no edit endpoint | When implemented: edit should invalidate InsightCache for that day AND all subsequent days (because trends are computed from chronological data). Also invalidate HealthPatternCache. |
| R12 | User deletes a log (currently no delete endpoint) | N/A — no delete endpoint | When implemented: same cascade invalidation. Also: if the deleted log was the only log for that day, recentLogs shrinks. If it drops below thresholds (3 for personalized, 7 for forecast), user should be notified that insight quality may temporarily decrease. |
| R13 | Admin fixes a user's lastPeriodStart directly in DB | No cache invalidation. All cached data stale until natural expiry. | Any direct DB modification should be followed by cache flush. Document this as an operations procedure. |

---

## SECTION 3: SYSTEM STRESS & FAILURE MODES

What happens when the system is under real production load or components fail.

### 3.1 — Load Scenarios

| # | Scenario | Current handling | What should happen |
|---|---|---|---|
| S1 | 10,000 users open app at 9 AM → all hit GET /api/insights | No rate limiting on insights. Each cache-miss user triggers: 5-8 DB queries + 1 GPT call. At ~2s per request, server is overwhelmed. GPT cost: ~$0.005/call × 10,000 = $50 in one minute. | Rate limit: max 2 insight requests per user per minute. For cache-miss users, queue GPT calls with concurrency limit (e.g., 50 concurrent GPT calls max). Return draft insights immediately, enhance with GPT asynchronously (update cache when GPT returns). |
| S2 | Cache stampede: cache expires for many users simultaneously (all at UTC midnight) | All users' caches expire at same time → thundering herd to DB + GPT | Stagger cache expiry: add random jitter (0-60 minutes) to cache TTL. Or: use "stale-while-revalidate" — serve slightly stale cache while computing fresh one in background. |
| S3 | GPT latency spikes to 15 seconds | No timeout configured. User waits 15s. Request may timeout at load balancer level. | Add 8-second timeout on OpenAI calls. If timeout: serve draft immediately, log for monitoring. Never make the user wait more than 3 seconds total (DB queries + cache check should be < 500ms, GPT is the variable). |
| S4 | GPT is completely down for 30 minutes | Every request tries GPT, waits for timeout, catches error, falls back to draft. That's 8 seconds of wasted time per request. | Circuit breaker: after 5 consecutive GPT failures within 60 seconds, stop calling GPT for 5 minutes. Serve draft directly. Auto-retry after cooldown. Log alert. |
| S5 | Database connection pool exhausted | Prisma throws connection error. All endpoints fail with 500. | Monitor active connections. Use PgBouncer in transaction mode. Set Prisma connection pool size explicitly. Add DB health check to /health endpoint. |
| S6 | Supabase has a brief outage (30 seconds) | All DB operations fail. All endpoints return 500. | Add retry logic for transient DB errors (connection reset, timeout). Max 2 retries with 500ms backoff. If still failing, return cached data where available (InsightCache, HealthPatternCache). |

### 3.2 — Partial Failure Scenarios

| # | Scenario | Current handling | What should happen |
|---|---|---|---|
| S7 | GET /api/insights: GPT succeeds but InsightCache write fails | GPT result returned to user. Cache not updated. Next request recomputes (wasteful but correct). | Catch cache write errors separately. Log but don't fail the response. The user got their insights — that's what matters. |
| S8 | GET /api/insights: InsightHistory write fails | No error caught for this specific write. Actually: it IS caught because the entire pipeline runs sequentially. If this fails, the response may have already been sent (res.json called before history write). | Make history/memory writes fire-and-forget (don't await, just catch errors). The user should never wait for metadata writes. |
| S9 | POST /api/logs: DailyLog created but InsightCache.deleteMany fails | Log is saved (good). Cache not cleared (bad — stale insights served). | Wrap cache invalidation in try/catch. If it fails, log error. On next insight request, check if any log exists with date > InsightCache.createdAt → force recomputation. |
| S10 | POST /api/cycle/period-started: CycleHistory created but user update fails | New cycle created but lastPeriodStart not updated. Cycle calculations use old date. Inconsistent state. | Wrap in a Prisma transaction: `prisma.$transaction([...])`. All-or-nothing. |
| S11 | PUT /api/user/profile: contraception transition fires but halfway through the transition the server crashes | handleContraceptionTransition does: clear caches → mark cycle → reset baseline → update user. If it crashes after clearing caches but before updating user, state is partially reset. | Use Prisma interactive transaction for the critical path: `prisma.$transaction(async (tx) => { ... })`. If any step fails, entire transition rolls back. |

### 3.3 — Data Integrity Under Concurrency

| # | Scenario | Current handling | What should happen |
|---|---|---|---|
| S12 | Two requests both check InsightCache, both find cache-miss, both compute fresh insights, both write to cache | Last write wins. One computation wasted. No data corruption. | Acceptable for now. At scale: use a distributed lock (Redis) or "compute once" pattern. |
| S13 | User logs daily log while insight computation is mid-flight | saveLog clears cache. Insight computation writes stale cache. | InsightCache upsert uses userId_date key. If saveLog cleared it and insight writes it back (with old data), next request finds cache but data is from before the log. Fix: in getInsights, before writing cache, check if any log exists with date > pipeline start timestamp. If yes, don't cache (data is already stale). |
| S14 | Two simultaneous period-started requests | Both try to close previous cycle. Both create new CycleHistory. | Add database-level guard: unique constraint on (userId, startDate) for CycleHistory. Or: check-and-create in a transaction. |

---

## SECTION 4: LEARNING SYSTEM INTEGRITY

Does the system stay accurate and trustworthy over months of use? This is where "best in industry" apps separate from good apps.

### 4.1 — Data Poisoning & Bad Inputs

| # | Scenario | Effect on system | Fix needed |
|---|---|---|---|
| L1 | User accidentally logs sleep: 1h for 3 consecutive days (actually slept 7h, UI confusion) | Sleep baseline shifts dramatically. Sleep disruption fires. All insights blame sleep. Cross-cycle narrative records "sleep crash" for this window. Future cycles will compare against this corrupted window. | Outlier detection: if a value is 3+ standard deviations from the user's baseline AND the user hasn't confirmed it, flag it. Show: "Your last 3 sleep entries are much lower than your usual — is this accurate?" Until confirmed, weight these entries at 0.5x in averages. |
| L2 | User logs period 10 days early (fat-fingered wrong date) | CycleHistory records an 18-day cycle. getCyclePredictionContext average drops. effectiveCycleLength shortens. Phase calculations shift for every future request. | After logging an unusually short cycle (< 21 days or > 45 days), prompt: "That cycle was unusually [short/long]. Was the date correct?" If user confirms wrong date, allow correction. If confirmed correct, mark as anomalous but include in average with reduced weight. |
| L3 | User consistently logs mood as "neutral" because she doesn't want to share real feelings | All mood data is flat. No mood trends detected. Emotional state always "stable". Cross-cycle narrative shows stable mood. PMDD never detected. | Can't force honest logging. But: if mood is "neutral" for 20+ consecutive days, insights could gently note: "Your mood has been consistently neutral — if things feel more varied than that, logging the ups and downs helps us give you better insights." |
| L4 | User logs stress: "high" every single day for 2 months because her life is actually very stressful | stress_above_baseline becomes meaningless — her baseline IS high. After enough time, high stress IS her baseline. Stress driver stops firing because recent = baseline. | Correct — baseline adapts. But: the system should recognize chronically elevated stress as a pattern itself: "Stress has been elevated for most of the past 2 months. This level of sustained stress can affect your cycle, sleep, and mood even when it feels normal." Need a "chronic elevation" detector separate from the deviation detector. |
| L5 | User's Apple Watch dies. She used to auto-import sleep. Now sleep field is null every day. | Weighted averages drop sleep data. Sleep trends become "insufficient". Sleep-related drivers stop firing. Insights lose a major signal source. | Detect signal dropout: if a field that was consistently present (20+ of last 30 days) suddenly becomes absent for 3+ days, note: "We noticed you haven't been logging sleep recently. Sleep is one of our strongest signals — would you like a reminder?" |

### 4.2 — Prediction Drift

| # | Scenario | Effect on system | Fix needed |
|---|---|---|---|
| L6 | User's cycles are slowly lengthening: 27, 28, 29, 30, 31, 32. Average = 29.5, rounded to 30. But actual NEXT cycle may be 33. | Prediction is always 2-3 days short. User's period is always "late" by the app's calculation. isPeriodDelayed fires every cycle. | Trend detection on cycle lengths: if 3+ consecutive cycles show lengthening, adjust prediction to extrapolate the trend, not just average. effectiveCycleLength = avg + trend_adjustment. |
| L7 | User's cycles were regular (28d) for a year. Then she moves to a new city, stress increases, cycles become irregular. | Historical data shows reliable 28-day pattern. Prediction engine uses last 6 cycles. Takes 3-6 months for average to shift. During transition, predictions are consistently wrong. | Weight recent cycles more heavily: last 2 cycles at 2x weight, cycles 3-4 at 1x, cycles 5-6 at 0.5x. This makes the average responsive to recent changes while maintaining stability. |
| L8 | User's cross-cycle narrative says "stress tends to rise around day 22" but she's gotten better at managing stress. Pattern no longer applies. | Narrative keeps surfacing a stale pattern. "Your past cycles show stress here" when she's actually fine. | Cross-cycle narrative should track recency and trend. If the most recent 2 cycles DON'T match the pattern but older cycles do, fade the narrative: "In earlier cycles, stress tended to rise around now — but recently, you've been managing this window better." Eventually, pattern drops off if not confirmed in 3 consecutive cycles. |
| L9 | Health pattern detection found early PCOS signals. User starts exercising, eating better. Signals decrease. | "Watching" state remains at same level. No mechanism to decrease watching progress or dismiss it. | Add signal regression detection: if the signals that triggered a watching state haven't been present in the last 2 completed cycles, reduce the watching state: "The signals we were monitoring seem to be improving. We'll keep an eye on it." |

### 4.3 — Confidence Calibration

| # | Scenario | Effect on system | Fix needed |
|---|---|---|---|
| L10 | User has 50 days of consistent data. confidenceScore is 0.85. But her recent cycle was unusual — predictions were wrong by 5 days. | Confidence score is based on log count + trend count + signal strength. It doesn't incorporate prediction accuracy. Score stays high even when predictions are wrong. | Prediction accuracy feedback loop: when a user logs a period, compare actual vs predicted date. If off by 3+ days, reduce confidence for next cycle by 0.1. If accurate (within 1 day), increase by 0.05. Confidence should reflect ACTUAL accuracy, not just data volume. |
| L11 | User has high confidence but GPT keeps producing insights that user doesn't engage with (never opens insight cards, never acts on recommendations) | No user engagement tracking. Confidence stays high. Same type of insights keep generating. | Future: track which insight cards are opened, which are dismissed, which recommendations are acted on. Use engagement as a signal for insight relevance. Low engagement on a specific insight type → reduce its priority. |
| L12 | Forecast confidence says "high" but the forecast has been wrong 3 times in a row | No forecast accuracy tracking. Confidence label is purely data-based. | Same as L10: track forecast accuracy over time. If tomorrow's outlook was "energy should improve" but next day's log shows energy: "low", record a miss. After 3 consecutive misses, reduce forecast confidence and show softer language. |

### 4.4 — Feedback & Self-Correction

| # | Scenario | Current handling | What should happen |
|---|---|---|---|
| L13 | User disagrees with insight: "this isn't how I feel" | No feedback mechanism. Insight stands. | Add thumbs up/down on insight cards. Thumbs down triggers: (1) acknowledge: "Thanks for letting us know. We'll adjust." (2) reduce weight of the primary driver that generated this insight for this user. (3) if same driver gets thumbs-down 3x, suppress it for 1 cycle. |
| L14 | User's phase prediction was wrong — she tells the app "I'm not in ovulation, I'm on my period" | No way to report phase mismatch (other than logging period-started) | The period-started action is the correction mechanism. But there's no way for a user to say "I'm NOT in the phase you think I'm in" without logging a period. Consider: "Is this phase right?" feedback on the home screen. |
| L15 | GPT produces an insight that references data the user didn't log | No factual accuracy check against actual logged data | Post-GPT validation: extract any specific numbers from GPT output (sleep hours, stress levels, day counts). Cross-reference against actual data. If GPT says "your sleep has been around 5h" but actual recentSleepAvg is 7.2h, reject and use draft. |
| L16 | User's insight memory says "stress elevated 5 days" but user feels it's been only 2 stressful days | InsightMemory counts based on driver firing, not user's subjective experience. Driver may fire due to baseline deviation even when user feels fine. | Show memory count to user with option to reset: "We've noticed elevated stress for 5 days. Does that feel right?" If user says no, reset the InsightMemory streak for that driver. |

---

## SECTION 5: IMPLEMENTATION PRIORITY

### Must have for launch (adds to P0 list):
1. **T1**: Clear InsightCache on periodStarted (already identified)
2. **T8**: Single-day spike protection (don't panic on one bad night)
3. **R1**: Log edit endpoint (users WILL enter wrong data)
4. **S3**: GPT timeout (8 seconds max)
5. **S4**: Circuit breaker for GPT failures
6. **S10**: Prisma transaction for periodStarted

### Should have for launch (adds to P1 list):
7. **T2/T21**: Home screen incorporates signal data (not just phase)
8. **T5**: Yesterday's prediction vs today's reality acknowledgment
9. **T15**: Momentum protection (don't overreact to single bad day)
10. **R6-R8**: Inactivity detection with graduated messaging
11. **R9**: Guard against unreasonable cycle lengths (> 60 days)
12. **L1**: Outlier detection on logged values
13. **L6**: Cycle length trend detection (not just average)

### Should have for v1.1:
14. **T9-T11**: Phase transition bridging language
15. **T13-T18**: All the "insights feel wrong" scenarios
16. **L10/L12**: Prediction accuracy feedback loop
17. **L13**: Thumbs up/down on insights
18. **L8**: Cross-cycle narrative staleness detection
19. **S1-S2**: Load handling (rate limiting, cache stampede prevention)
20. **L4**: Chronic elevation detection

### Nice to have (v2):
21. **L5**: Signal dropout detection
22. **L11**: Engagement-based insight prioritization
23. **L15**: GPT factual accuracy validation
24. **R2**: Period-started undo endpoint
25. **T19-T20**: Deep personalization within single cycle