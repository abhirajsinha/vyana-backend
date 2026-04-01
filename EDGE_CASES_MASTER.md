# EDGE_CASES_MASTER.md — Every Possible Edge Case in Vyana

> This document is the exhaustive edge case audit for Vyana Phase 1.
> Organized by user lifecycle stage. Each case includes: what happens, what SHOULD happen, and current status (✅ handled, ❌ bug, ⚠️ gap).

---

## STAGE 1: REGISTRATION & ONBOARDING

### 1.1 — Basic Registration

| # | Edge Case | Current Status |
|---|---|---|
| 1 | User enters email with mixed case ("User@Gmail.COM") | ✅ Normalized to lowercase in register() |
| 2 | User enters email with leading/trailing spaces | ✅ Trimmed in register() |
| 3 | User enters password exactly at minimum length (8 chars) | ✅ Accepted |
| 4 | User enters password with 7 chars | ✅ Rejected |
| 5 | User enters password with unicode characters (emoji, arabic, chinese) | ⚠️ Accepted — bcrypt handles it but no explicit test |
| 6 | User enters name with only spaces | ❌ Passes `!name` check because " " is truthy. Should trim and reject. |
| 7 | User enters name with HTML/script tags (`<script>alert(1)</script>`) | ❌ No sanitization. Stored as-is, returned in API responses. XSS risk if frontend renders raw. |
| 8 | User enters age as 0, negative, or 200 | ❌ No age validation. `Number(age)` accepts anything. |
| 9 | User enters height/weight as 0 or negative | ❌ No validation beyond existence check. |
| 10 | User enters cycleLength as 20 (below min 21) | ✅ Rejected by `isCycleLengthDays()` |
| 11 | User enters cycleLength as 46 (above max 45) | ✅ Rejected |
| 12 | User enters cycleLength as 28.5 (non-integer) | ✅ Rejected — `isCycleLengthDays` checks `Number.isInteger` |
| 13 | User enters lastPeriodStart as tomorrow (future date) | ❌ No validation. Accepted. All cycle calculations will be wrong (negative cycle day). |
| 14 | User enters lastPeriodStart as 5 years ago | ❌ No validation. Cycle day becomes 1800+ which wraps via modulo. |
| 15 | User enters lastPeriodStart as invalid string ("not-a-date") | ✅ `new Date("not-a-date")` → NaN, but no explicit check. Could cause runtime errors downstream. Actually: ❌ no NaN check on the Date object. |
| 16 | User registers with same email twice simultaneously (race condition) | ⚠️ Relies on DB unique constraint. Second request gets Prisma unique violation error, but error message may not be user-friendly. |
| 17 | User registers with contraceptiveMethod: "pill" | ✅ cycleMode becomes "hormonal", all phase features suppressed |
| 18 | User registers with contraceptiveMethod: "something_random" | ✅ resolveContraceptionType returns "none", natural cycle runs |
| 19 | User registers with contraceptiveMethod: null | ✅ Treated as "none" |
| 20 | User registers with cycleRegularity: "irregular" | ✅ cycleMode becomes "irregular" |
| 21 | User registers with cycleRegularity: "invalid_value" | ❌ No validation in register(). Only updateProfile validates against ["regular", "irregular", "not_sure"]. |
| 22 | User registers with both contraceptiveMethod: "pill" AND cycleRegularity: "irregular" | ✅ "hormonal" takes priority over "irregular" in getCycleMode() |
| 23 | User registers with contraceptiveMethod: "iud_copper" | ✅ Natural cycle engine runs (copper IUD is non-hormonal) |

### 1.2 — Google OAuth Registration

| # | Edge Case | Current Status |
|---|---|---|
| 24 | Google token is expired | ✅ Caught, returns 401 |
| 25 | Google email is not verified | ✅ Rejected with 400 |
| 26 | Google account email matches existing password-only account | ✅ Returns 409 with instruction to use email/password |
| 27 | Google account email matches existing Google-linked account | ✅ Returns existing user with tokens |
| 28 | GOOGLE_CLIENT_ID not configured on server | ✅ Returns 503 |
| 29 | Google user provides no name (name field empty in Google token) | ✅ Falls back to "User" |
| 30 | Two simultaneous Google auth requests with same new user | ⚠️ Race condition — both could try to create user. Second hits unique constraint on googleId. |
| 31 | Google auth has no rate limiter | ❌ Unlike login/register, google route has no authLoginRegisterLimiter |

---

## STAGE 2: FIRST DAY — ZERO DATA STATE

### 2.1 — Home Screen with Zero Logs

| # | Edge Case | Current Status |
|---|---|---|
| 32 | Brand new user opens home screen | ✅ Shows phase-based content from buildContent() using lastPeriodStart |
| 33 | Hormonal user opens home screen with zero logs | ✅ Shows "Your day, your patterns" |
| 34 | Irregular user opens home screen with zero logs | ⚠️ Shows phase-based content with softened language, but phases are based on self-reported cycleLength with zero validation data. Misleading. |
| 35 | User registered 1 minute ago, opens home | ✅ Works, but quick log fields are phase-based with no context about what logging does |

### 2.2 — Insights with Zero Logs

| # | Edge Case | Current Status |
|---|---|---|
| 36 | GET /api/insights with zero logs | ✅ mode="fallback", uses day-specific library text from cycleInsightLibrary.ts |
| 37 | Zero logs — does GPT fire? | ✅ GPT fires (no gating) but context block includes "⚠ NO LOGGED DATA" warning |
| 38 | Zero logs — are trends shown? | ✅ No — buildTrends returns "insufficient" for all |
| 39 | Zero logs — is forecast available? | ✅ No — locked with warmup message (< 7 logs) |
| 40 | Zero logs — confidence score? | ✅ Returns 0 (logPortion = 0) |

### 2.3 — Chat with Zero Logs

| # | Edge Case | Current Status |
|---|---|---|
| 41 | User asks "how did I sleep?" with zero logs | ✅ CRITICAL guard in chat: noDataGuard says "ZERO DATA: this user has NOT logged a single day. Do NOT invent values." |
| 42 | User asks casual "hi" with zero logs | ✅ Lightweight path fires, no insight pipeline |
| 43 | User asks "what phase am I in?" with zero logs | ✅ Chat can answer from cycleInfo (phase is calculated from lastPeriodStart) |
| 44 | User sends empty string as message | ✅ Rejected — "message is required" |
| 45 | User sends message with 10,000 characters | ❌ No length limit. Entire message goes to GPT. Cost and timeout risk. |

### 2.4 — Calendar with Zero Logs

| # | Edge Case | Current Status |
|---|---|---|
| 46 | Calendar for current month with zero logs | ✅ Shows all days with cycle day + phase, hasLog: false for all |
| 47 | Calendar for month before user registered | ✅ Shows calculated cycle days (lastPeriodStart is before calendar month) |
| 48 | Calendar for month 6 months in future | ✅ Shows predicted cycle days (wraps via modulo) |
| 49 | Calendar month format "2026-4" instead of "2026-04" | ✅ Rejected by regex /^\d{4}-\d{2}$/ |
| 50 | Calendar month "2026-13" (invalid month) | ❌ Passes regex but creates invalid Date. new Date(Date.UTC(2026, 12, 1)) = Jan 2027. Returns wrong month silently. |
| 51 | Calendar month "2026-00" (zero month) | ❌ Same issue. Date.UTC(2026, -1, 1) = Dec 2025. |

---

## STAGE 3: FIRST WEEK — BUILDING DATA

### 3.1 — Logging Progression

| # | Edge Case | Current Status |
|---|---|---|
| 52 | First log ever — what mode? | ✅ If log has strong signal (e.g., stress: "very_high"), mode can be "personalized" even with 1 log |
| 53 | 1 log — interaction flags? | ✅ Disabled — requires 3+ logs |
| 54 | 2 logs — trend detection? | ✅ Returns "insufficient" (needs 3+ valid data points) |
| 55 | 3 logs — personalized mode activates | ✅ Interaction flags fire, trends may compute |
| 56 | User logs twice on same day | ❌ Creates two DailyLog entries. No uniqueness constraint. Both get fetched by getUserInsightData. |
| 57 | User logs at 11:59 PM, then again at 12:01 AM | ⚠️ Two different UTC days — two separate logs. This is correct behavior but user may perceive them as "same day" in their timezone. |
| 58 | User logs with all fields null (taps save without entering anything) | ❌ Creates empty log. Counts toward logsCount but provides zero signal. Wastes a cache invalidation. |
| 59 | User logs sleep as 0 | ⚠️ Stored as-is. normalizeSleep(0) returns "poor". Treated as actual 0 hours sleep. |
| 60 | User logs sleep as 24 | ⚠️ Stored as-is. normalizeSleep(24) returns "moderate" (> 9). No upper bound validation. |
| 61 | User logs sleep as -5 | ❌ No validation. Stored as negative. Breaks weighted averages. |
| 62 | User logs padsChanged as 100 | ❌ No validation. Stored as-is. bleeding_heavy driver fires (>= 7). |
| 63 | User logs padsChanged as -1 | ❌ No validation. Stored as negative. getBleedingLoad returns "light" (not >= 4). |
| 64 | User logs mood as "🤮" (emoji) | ⚠️ normalizeMood returns "unknown" — no match. Drops from averages. |
| 65 | User logs stress as "" (empty string) | ⚠️ normalizeStress("") returns "unknown". Treated as no data. |
| 66 | User logs on day 1 (menstrual) but doesn't log padsChanged | ✅ bleeding_load = "unknown", no bleeding driver fires |
| 67 | 5 logs all with mood: "good", sleep: 7.5, stress: "low" | ✅ Stable state detection fires. isStableInsightState returns true. |
| 68 | 7 logs — forecast unlocks | ✅ But only if log span >= 5 days (7 logs on same day doesn't count) |
| 69 | 7 logs across 7 days — all identical values | ✅ Trends all "stable". Sleep variability "low". Stable state fires. |
| 70 | User logs every day for a week then stops for 3 weeks | ⚠️ recentLogs still returns last 7 logs (now 3 weeks old). Baseline stale. No "you haven't logged recently" notice. |

### 3.2 — Insight Progression

| # | Edge Case | Current Status |
|---|---|---|
| 71 | 3 logs: sleep dropping from 8 → 6 → 4 | ✅ Sleep trend "decreasing". sleep_trend_declining driver fires. |
| 72 | 3 logs: stress low, low, very_high (single spike) | ✅ Stress trend "increasing" (first vs last). But only 1 high day — may overreact. |
| 73 | 5 logs with sleep: 4, 8, 4, 8, 4 (oscillating) | ✅ Sleep variability "high". sleep_variability_high driver fires (score 100). |
| 74 | 5 logs: all sleep null, mood "low" | ⚠️ No sleep data. Sleep trend "insufficient". But mood trend can still fire. |
| 75 | InsightCache exists from morning, user logs at 3 PM | ❌ Cache NOT invalidated by saveLog... wait, actually: ✅ saveLog DOES clear InsightCache. Next GET /api/insights recomputes. |
| 76 | InsightCache exists, user logs period at 3 PM | ❌ periodStarted does NOT clear InsightCache. Stale insights. |

---

## STAGE 4: FIRST CYCLE — PERIOD TRACKING

### 4.1 — Period Logging

| # | Edge Case | Current Status |
|---|---|---|
| 77 | User logs period on expected day (day 28 of 28-day cycle) | ✅ CycleHistory closed, new one created, lastPeriodStart updated |
| 78 | User logs period 3 days early (day 25 of 28-day cycle) | ✅ Works. CycleHistory records cycleLength as 25. Prediction adjusts. |
| 79 | User logs period 5 days late (day 33) | ✅ CycleHistory records cycleLength as 33. |
| 80 | User logs period with date in the future | ❌ No validation. Creates CycleHistory with future startDate. |
| 81 | User logs period with date before last period start | ❌ No validation. Creates negative cycleLength or overlapping cycles. Code does check `startDate > latestHistory.startDate` but only for closing the previous cycle. |
| 82 | User logs period twice on same day (double tap) | ❌ Creates two CycleHistory entries with same startDate. |
| 83 | User logs period, realizes it was wrong, wants to undo | ❌ No delete/undo endpoint for period-started. Data is permanent. |
| 84 | User logs period on day 1 (she's already on her period) | ⚠️ Creates a new CycleHistory with startDate = today. Closes previous cycle with cycleLength potentially = 1 day. |
| 85 | Hormonal user logs period (withdrawal bleed) | ❌ Creates CycleHistory with calculated cycleLength. Pollutes prediction engine. |
| 86 | User's period lasted 7 days (longer than assumed 5) | ⚠️ No period END date tracking. Phase calculation assumes menstrual = days 1-5. User on day 7 still bleeding but app says "Follicular phase". |
| 87 | User's period lasted only 2 days | ⚠️ Same issue. App shows "Period" for days 1-5 regardless of actual duration. |

### 4.2 — Delayed Period

| # | Edge Case | Current Status |
|---|---|---|
| 88 | Day 29 of 28-day cycle (1 day late) | ⚠️ isPeriodDelayed = true. But cycleDay wraps to 1, phase = "menstrual" via modulo. Contradictory. |
| 89 | Day 35 of 28-day cycle (7 days late) | ❌ Same wrapping bug. cycleDay = 7, phase = "follicular". Completely wrong. |
| 90 | Day 60 of 28-day cycle (32 days late) | ❌ Wraps to day 4. Shows "menstrual phase". She hasn't had a period in 2 months. |
| 91 | Irregular user on day 50 | ❌ isPeriodDelayed disabled for irregular users. No notice at all. |
| 92 | Delayed period user finally logs period | ✅ CycleHistory records actual observed length. Predictions adjust. But InsightCache not cleared. |
| 93 | User is 30 days late — could be pregnant | ❌ No pregnancy-related messaging. Same "stress can cause this" at day 1 and day 30. |
| 94 | User has confidence: "variable" (not "irregular") — period 3 days late | ✅ isPeriodDelayed fires (confidence !== "irregular" passes). |

### 4.3 — Cycle Length Variation

| # | Edge Case | Current Status |
|---|---|---|
| 95 | First cycle: 28 days. Second cycle: 35 days. Third cycle: 24 days. | ✅ detectCycleIrregularity: maxDiff = 11 > 7, returns "irregular" confidence. |
| 96 | All cycles exactly 28 days | ✅ stdDev = 0, confidence = "reliable" |
| 97 | Only 1 completed cycle | ✅ detectCycleIrregularity returns confidence = "unknown" |
| 98 | CycleHistory has a transitional cycle (cycleLength: null) | ✅ getCyclePredictionContext filters: `cycleLength: { not: null }`. Excluded from average. |
| 99 | All CycleHistory entries have cycleLength: null (all transitional) | ✅ Falls back to user.cycleLength |
| 100 | User manually set cycleLength to 21 but actual cycles average 35 | ⚠️ effectiveCycleLength uses CycleHistory average if available. But if no completed cycles, uses the wrong 21. |

---

## STAGE 5: MULTI-CYCLE — PATTERNS EMERGE

### 5.1 — Cross-Cycle Narrative

| # | Edge Case | Current Status |
|---|---|---|
| 101 | 2 completed cycles, same-window comparison | ✅ buildCrossCycleNarrative finds matching windows |
| 102 | 6 completed cycles, clear worsening trend | ✅ trend = "worsening", narrative injected |
| 103 | Cross-cycle windows have zero logs (user didn't log those days) | ✅ Returns null if no logs in any window |
| 104 | User's cycle lengths vary wildly (21, 35, 28) — same "day 14" is different phase each cycle | ⚠️ Cross-cycle comparison uses current cycleDay ± 3 window. But day 14 in a 21-day cycle is late luteal, while day 14 in a 35-day cycle is follicular. Apples-to-oranges comparison. |
| 105 | User switched contraception mid-data — old cycles under different hormonal context | ✅ handleContraceptionTransition clears InsightHistory. But CycleHistory entries remain. |

### 5.2 — Health Pattern Detection

| # | Edge Case | Current Status |
|---|---|---|
| 106 | Exactly 2 completed cycles — PMDD detection threshold met | ✅ MIN_CYCLES_FOR_ALERT.pmdd = 2 |
| 107 | 2 cycles but one has zero logs | ⚠️ groupLogsByCycle returns a bucket with 0 logs for that cycle. Pattern detectors may not find signals. |
| 108 | User has severe pain logged for 5 consecutive days across 3 cycles | ✅ detectEndometriosisIndicators fires if paired with heavy bleeding |
| 109 | User has severe pain but never logs padsChanged | ⚠️ Endometriosis needs both pain AND heavy bleeding. Missing flow data means no detection. |
| 110 | User has PCOS-like signals but is on hormonal contraception | ⚠️ Health pattern detection still runs on hormonal users. But cycle length irregularity is masked by pill-pack cycle. May false-positive or false-negative. |
| 111 | Early signal detected with 1 cycle — watching state shown | ✅ buildWatchingState returns progressPercent < 100 |
| 112 | User sees "watching" state for PCOS, then next cycle has no matching signals | ⚠️ Watching state persists in cache until next health pattern run. No mechanism to remove a watching state if signals disappear. |

### 5.3 — Insight Memory & Emotional Memory

| # | Edge Case | Current Status |
|---|---|---|
| 113 | Same driver fires 2 days in a row | ✅ InsightMemory count increments. Memory narrative: "2nd day" |
| 114 | Driver fires, then 3 days gap, then fires again | ✅ getInsightMemoryCount resets to 0 after 2-day gap |
| 115 | Driver fires every day for 10 days straight | ✅ Severity escalates: building → persistent. Messaging intensifies. |
| 116 | Emotional memory: past occurrences all have mood: null | ✅ buildEmotionalMemory returns hasMemory: false (filters to mood !== null) |
| 117 | Emotional memory: only 1 past occurrence | ✅ Returns hasMemory: false (needs >= 2) |
| 118 | User has 50 InsightMemory entries (many different drivers over months) | ⚠️ No cleanup mechanism. InsightMemory grows indefinitely. Not a problem at scale but no TTL. |

---

## STAGE 6: CONTRACEPTION CHANGES

### 6.1 — Switching Methods

| # | Edge Case | Current Status |
|---|---|---|
| 119 | Natural → pill mid-cycle | ✅ Full transition: caches cleared, baseline reset, lastPeriodStart reset, warmup starts |
| 120 | Pill → natural mid-cycle | ✅ Full transition. But cycleRegularity NOT forced to "not_sure". |
| 121 | Pill → IUD hormonal | ✅ hormonal_to_hormonal transition. Full reset. |
| 122 | None → condom (barrier) | ✅ natural_to_natural. Caches cleared, no baseline reset. |
| 123 | Pill → copper IUD | ✅ hormonal_to_natural (copper IUD is non-hormonal). Full reset. |
| 124 | User changes contraception twice in same day | ⚠️ Both transitions fire. Double cache clear, double baseline reset. contraceptionChangedAt set twice. No issue functionally but unnecessary work. |
| 125 | User changes contraception then immediately requests insights | ✅ InsightCache cleared. Fresh computation runs. |
| 126 | User sets contraceptiveMethod to "" (empty string) | ⚠️ resolveContraceptionType("") returns "none" via CONTRACEPTION_MAP lookup failure. Works but empty string stored in DB. |
| 127 | User sets contraceptiveMethod to null (removing it) | ✅ Treated as "none". |
| 128 | Transition warmup: user opens app on day 1 of transition | ✅ "Your insights are resetting..." message |
| 129 | Transition warmup: user opens app on day 15 (warmup expired) | ✅ buildTransitionWarmup returns null (daysSince >= 14) |
| 130 | Transition warmup: user changes contraception AGAIN during warmup | ⚠️ contraceptionChangedAt reset to new date. New 14-day warmup starts. Previous warmup messaging replaced. |

### 6.2 — Hormonal User Ongoing

| # | Edge Case | Current Status |
|---|---|---|
| 131 | Hormonal user opens calendar | ✅ phase: null for all days, no phase timeline |
| 132 | Hormonal user gets forecast | ✅ forecastMode: "pattern" or "symptom", no phase predictions |
| 133 | Hormonal user asks chat "when will I ovulate?" | ⚠️ Chat has cycle context but instruction not to reference phases. GPT may or may not handle this correctly. No explicit guard for this specific question. |
| 134 | Hormonal user has 10 cycles of CycleHistory (all withdrawal bleeds) | ❌ getCyclePredictionContext uses these. Returns "reliable" confidence based on pill-pack regularity. Meaningless. |

---

## STAGE 7: PROFILE UPDATES

| # | Edge Case | Current Status |
|---|---|---|
| 135 | User updates name only | ✅ No cache invalidation needed. |
| 136 | User updates cycleLength from 28 to 35 | ✅ Caches cleared. All endpoints use new cycleLength. |
| 137 | User updates lastPeriodStart to a different date | ✅ Caches cleared. Cycle day recalculates. |
| 138 | User updates lastPeriodStart to future | ❌ No validation. Negative cycle day via modulo. |
| 139 | User sends PUT /api/user/profile with empty body {} | ✅ Returns 400 "No valid fields to update" |
| 140 | User sends PUT /api/user/profile with unknown fields | ⚠️ Unknown fields silently ignored. No error. |
| 141 | User updates both cycleLength AND contraceptiveMethod in same request | ✅ Both processed. Contraception transition fires if method changed. |
| 142 | User changes age from 25 to 250 | ❌ No age validation in updateProfile. |

---

## STAGE 8: TIMING & TIMEZONE EDGE CASES

| # | Edge Case | Current Status |
|---|---|---|
| 143 | User in IST (UTC+5:30) logs at 11 PM IST = 5:30 PM UTC. InsightCache key is UTC date. | ⚠️ Cache is keyed by UTC date. User's "today" might span two UTC dates. Log at 11:30 PM IST → UTC date is still same day. Log at 12:30 AM IST → next UTC day. Could cause stale cache for IST users around midnight. |
| 144 | User travels from IST to PST (13.5 hour difference) | ⚠️ All dates are UTC. User's "today" shifts dramatically. Logs and insights may seem out of sync with their local perception. |
| 145 | User logs at 11:59 PM, cache generated for today. Logs again at 12:01 AM (new UTC day). | ✅ saveLog clears cache. New day's GET /api/insights generates fresh cache. But the 11:59 PM log is in yesterday's recentLogs, and the 12:01 AM log is today's. |
| 146 | Server clock is slightly off from Supabase DB clock | ⚠️ Date comparisons use `new Date()` in Node vs DB timestamps. Minor skew could cause cache mismatches. |
| 147 | Daylight saving time change — user's local time jumps forward or back | ⚠️ All dates stored as UTC. No issue in DB. But notification scheduling (future feature) would need timezone-aware logic. |
| 148 | User opens app exactly at UTC midnight — InsightCache for "yesterday" found but "today" is new | ✅ Cache keyed by UTC day start. New day = no cache = fresh computation. |

---

## STAGE 9: CONCURRENT & RACE CONDITIONS

| # | Edge Case | Current Status |
|---|---|---|
| 149 | Two simultaneous GET /api/insights requests (app opened on two devices) | ⚠️ Both run full pipeline, both write to InsightCache. Last-write-wins. No mutex/lock. Functionally okay but wasteful. |
| 150 | User logs period AND logs daily log simultaneously | ⚠️ Both clear caches independently. Race condition on cache state. Functionally okay — next read recomputes. |
| 151 | User sends POST /api/logs while GET /api/insights is mid-computation | ⚠️ saveLog clears cache. getInsights may have already read the old data and writes a stale cache. Next request will serve stale. |
| 152 | Two tabs/devices: one sends chat, other sends log | ⚠️ No issues — independent operations. Chat uses fresh DB read. |
| 153 | User rapidly taps "period started" 5 times | ❌ Creates 5 CycleHistory entries. First one closes previous cycle. Others create additional unclosed entries. |

---

## STAGE 10: GPT / AI EDGE CASES

| # | Edge Case | Current Status |
|---|---|---|
| 154 | OpenAI API is down | ✅ GPT call wrapped in try/catch. Falls back to draft insights. aiDebug = "api_error". |
| 155 | OpenAI returns empty response | ✅ safeParseInsightsDetailed returns draft with status "empty_response_fallback" |
| 156 | OpenAI returns malformed JSON | ✅ JSON.parse wrapped in try/catch. Falls back to draft. |
| 157 | OpenAI returns valid JSON but missing fields | ✅ Shape validation checks all 7 keys. Falls back if any missing. |
| 158 | OpenAI returns insights with "you will feel" (forbidden language) | ✅ containsForbiddenLanguage check. Rejects with draft. |
| 159 | OpenAI returns insight with 500 words per field | ✅ Length guard: output > 2.5x draft → rejected. Plus sentence guard: max 3 per field. |
| 160 | OpenAI takes 30 seconds to respond | ❌ No explicit timeout. Relies on OpenAI's default. User waits. |
| 161 | OpenAI returns insights identical to draft | ✅ aiEnhanced = false, aiDebug = "unchanged_output" |
| 162 | GPT "hallucinates" a sleep value that doesn't match actual data | ⚠️ No validation that GPT's numbers match actual data. Guards check format and tone but not factual accuracy. |
| 163 | GPT uses identity language when user has < 2 cycles | ✅ removeUnearnedIdentityLanguage strips "for you", "your cycles show" etc. |
| 164 | GPT uses emotional memory language when no memory data exists | ✅ removeUnearnedMemoryLanguage strips "you've felt this before" etc. |
| 165 | OPENAI_API_KEY not set | ✅ client = null. All GPT calls return draft immediately. |
| 166 | OpenAI rate limited (429) | ⚠️ Caught by generic try/catch. Falls back to draft. But no exponential backoff or circuit breaker. Every subsequent request still tries GPT. |

---

## STAGE 11: AUTH & SECURITY EDGE CASES

| # | Edge Case | Current Status |
|---|---|---|
| 167 | JWT token expired | ✅ verifyToken throws, middleware returns 401 |
| 168 | JWT token tampered (wrong signature) | ✅ jwt.verify throws, middleware returns 401 |
| 169 | Bearer token missing from request | ✅ Returns 401 "Missing auth token" |
| 170 | Refresh token used after being revoked | ✅ Checked against DB: stored.revokedAt |
| 171 | Refresh token used after expiration | ✅ Checked: stored.expiresAt < new Date() |
| 172 | Access token of deleted user | ⚠️ Token is valid (JWT doesn't check DB) but all endpoints call prisma.user.findUnique → returns null → 404. Works but token is technically "valid". |
| 173 | User tries to access another user's data by guessing userId | ✅ userId comes from JWT, not from request body/params. Can't forge. |
| 174 | JWT_SECRET is default "dev-secret" in production | ❌ No check that JWT_SECRET is set to something strong. App starts normally. |
| 175 | Request body is 100MB JSON | ❌ No request body size limit. express.json() defaults to 100kb, actually. Wait — ✅ Express default limit is 100kb. Requests > 100kb rejected with 413. |
| 176 | User sends request with Content-Type: text/plain | ⚠️ express.json() rejects non-JSON content types. Returns 400 or undefined body. |
| 177 | Expired refresh tokens accumulate in DB | ❌ No cleanup job. RefreshToken table grows indefinitely. |
| 178 | Error response in production includes stack trace | ❌ errorHandler returns err.message which may include internal info. |

---

## STAGE 12: DATA CONSISTENCY EDGE CASES

| # | Edge Case | Current Status |
|---|---|---|
| 179 | User deleted from DB but InsightCache/InsightMemory/InsightHistory remain | ✅ All relations have onDelete: Cascade. Deleting user cascades to all related records. |
| 180 | DailyLog with userId that doesn't exist | ✅ Foreign key constraint prevents this. |
| 181 | InsightCache.payload is malformed JSON | ✅ isInsightsPayloadCached checks for required fields before serving cache |
| 182 | InsightCache from yesterday still present | ✅ Cache keyed by UTC date. Today's request creates new entry, doesn't use yesterday's. |
| 183 | Two InsightCache entries for same userId + date | ✅ Prevented by @@unique([userId, date]) on InsightCache |
| 184 | CycleHistory has overlapping date ranges | ❌ No constraint prevents overlapping cycles. User could have cycles Jan 1-Jan 15 AND Jan 10-Jan 25. |
| 185 | DailyLog.date field — multiple logs with same userId and date | ❌ No unique constraint. Duplicates possible. |

---

## STAGE 13: SCREEN-SPECIFIC EDGE CASES

### 13.1 — Home Screen

| # | Edge Case | Current Status |
|---|---|---|
| 186 | Home screen during menstrual day 1 — heavy bleeding | ✅ Shows "On your period" with appropriate messaging |
| 187 | Home screen during ovulation — user logged stress: "very_high" | ⚠️ Home screen is phase-based, not signal-based. Shows "Ovulation day" with positive messaging even though user is stressed. Disconnect between home and insights. |
| 188 | Home screen for user with contraceptionChangedAt 10 days ago | ✅ transitionWarmup shows warmup messaging |
| 189 | Home screen for user who hasn't logged in 30 days | ⚠️ Shows phase-based content as if everything is normal. No "welcome back" or "we missed you" messaging. |

### 13.2 — Calendar

| # | Edge Case | Current Status |
|---|---|---|
| 190 | Calendar day tap for a day 3 months in the future | ✅ Returns predicted phase and forward-looking card |
| 191 | Calendar day tap for a day 1 year ago | ✅ Returns historical card. But no logs likely exist. |
| 192 | Calendar for month with 28 days (Feb non-leap) | ✅ daysInMonth calculated correctly |
| 193 | Calendar for month with 31 days | ✅ Correct |
| 194 | Calendar for Feb 29 in leap year | ✅ Date.UTC handles correctly |
| 195 | Calendar shows "period day" on day 29+ when period is delayed | ❌ Due to modulo wrapping, day 29 of 28-day cycle = day 1. isPeriodDay checks `cycleInfo.currentDay === 1 && (isFuture || isToday)` → true. Shows period marker AND isPeriodDelayed. Contradictory. |

### 13.3 — Forecast

| # | Edge Case | Current Status |
|---|---|---|
| 196 | Forecast with exactly 7 logs all on same day | ✅ computeLogSpanDays returns 1. Forecast locked (span < 5). |
| 197 | Forecast with 7 logs across 5 days, confidence 0.39 | ✅ Locked (confidence < 0.4) |
| 198 | Forecast for hormonal user with disabled forecastMode | ✅ Returns not-eligible with reason "forecast_disabled_contraception" |
| 199 | PMS forecast in follicular phase | ✅ Returns null (only surfaces in luteal phase) |
| 200 | PMS forecast with exactly 2 completed cycles | ✅ Threshold met. If late luteal signals found, forecast generated. |
| 201 | Forecast GPT returns "you will feel better tomorrow" | ✅ hasForbiddenInForecast checks for "you will feel" and other deterministic phrases. Rejected. |

---

## STAGE 14: LONG-TERM USAGE (3+ MONTHS)

| # | Edge Case | Current Status |
|---|---|---|
| 202 | User has 365 days of logs | ⚠️ getUserInsightData fetches last 90 days, max 120 logs. Older data not used for insights. Health pattern detection fetches ALL logs — could be slow. |
| 203 | User has 20 completed cycles | ✅ getCyclePredictionContext only uses last 6. detectCycleIrregularity uses those 6. |
| 204 | User's cycle has been steadily lengthening (25 → 26 → 27 → 28 → 29 → 30) | ⚠️ Average of last 6 = 27.5, rounded to 28. But the trend is lengthening. No trend detection on cycle length itself. |
| 205 | User stops using app for 6 months, comes back | ⚠️ lastPeriodStart is 6 months old. Cycle day = 180+. Wraps via modulo. isPeriodDelayed fires. No "welcome back" flow. |
| 206 | User has 500 InsightHistory entries | ⚠️ fetchEmotionalMemoryInput queries with take: 10. But no index on [userId, driver, cycleDay]. Could be slow. |
| 207 | User's contraceptionChangedAt is 2 years ago | ✅ buildTransitionWarmup returns null (daysSince >= 14). No issue. |
| 208 | InsightMemory table has 100 entries for one user (many different drivers over months) | ⚠️ Each getInsightMemoryCount queries by [userId, driver]. Indexed. Fine. |
| 209 | User changes phone, reinstalls app, logs in with same account | ✅ All data is server-side. Login returns user + tokens. Full data available. |
| 210 | User has never logged a period (uses app only for symptom tracking) | ⚠️ lastPeriodStart from registration is the only anchor. Cycle day keeps incrementing from registration date. After months, cycle day wraps repeatedly. Phase predictions drift further from reality. |

---

## STAGE 15: CORRELATION & INSIGHT ENGINE EDGE CASES

| # | Edge Case | Current Status |
|---|---|---|
| 211 | All 7 correlation patterns fire simultaneously | ✅ runCorrelationEngine picks highest-confidence pattern only |
| 212 | No correlation patterns fire | ✅ Returns patternKey: null. No correlation content injected. |
| 213 | Sleep-stress amplification + cycle recurrence both high confidence | ✅ Highest confidence wins. If equal, order in patterns object determines winner. |
| 214 | Stable state detected but user is on period day 1 | ✅ Code checks: effectiveStable = stableCandidate && !isPeriodDelayed && !isPeakPhaseWithPositiveSignals. Day 1 could be stable if logs show stability. |
| 215 | Signal-positive override on menstrual day 2 (positive logs during period) | ✅ isSignalPositive returns true. Insights don't inject negative phase language. "Your body feels steady" instead of "You might feel low energy." |
| 216 | Primary cause = sleep_disruption but user also has high stress | ✅ detectPrimaryInsightCause checks sleep first. If sleep qualifies, returns "sleep_disruption" even if stress is also high. |
| 217 | User has baseline of 7 logs. Recent 7 logs all have sleep: null | ⚠️ recentSleepAvg = null. sleepDelta = null. No sleep-based detection fires. All sleep-related drivers inactive. |
| 218 | Phase baseline logs < 7 but global baseline >= 7 | ✅ Falls back to global baseline. baselineScope = "global". |
| 219 | Both phase baseline AND global baseline < 7 | ✅ baselineScope = "none". No baseline comparison. |
| 220 | PhaseTone is "peak" but user has sleep_disruption | ✅ Primary cause overrides phase tone in GPT prompt. SLEEP-DISRUPTION PRIMARY instruction takes precedence. |

---

## STAGE 16: API ABUSE & ADVERSARIAL EDGE CASES

| # | Edge Case | Current Status |
|---|---|---|
| 221 | User calls GET /api/insights 1000 times in a minute | ❌ No rate limiter on insights endpoint. Each cache-miss triggers GPT call ($). |
| 222 | User calls POST /api/logs 1000 times in a minute | ❌ No rate limiter on logs endpoint. Each call clears cache + creates DB entry. |
| 223 | User calls POST /api/chat with automated messages | ⚠️ chatLimiter exists (60/minute). But 60 GPT calls/minute is still expensive. |
| 224 | User sends SQL injection in message field ("'; DROP TABLE users;--") | ✅ Prisma uses parameterized queries. SQL injection not possible. |
| 225 | User sends NoSQL injection in JSON body | ✅ Prisma with PostgreSQL. Not applicable. |
| 226 | User sends extremely long values for every field (each 10MB) | ⚠️ Express default body limit 100kb protects against this. But fields like `focus` (text_input) have no per-field length limit. |
| 227 | User sends valid JWT from one account but calls API for actions on another user | ✅ userId extracted from JWT, not from request. Can't cross-account. |
| 228 | User creates account, gets tokens, deletes account, uses old access token | ⚠️ JWT is still valid until expiry (1 day). But user.findUnique returns null → 404 on all endpoints. |

---

## STAGE 17: NOTIFICATION EDGE CASES (FUTURE)

| # | Edge Case | Current Status |
|---|---|---|
| 229 | User's FCM token expires | ⚠️ fcmToken field exists but no refresh logic. Stale tokens cause silent delivery failures. |
| 230 | User has no fcmToken (never granted notification permission) | ⚠️ fcmToken is nullable. Notification scheduler must check before sending. |
| 231 | User in DND mode | N/A — handled by OS, not backend |
| 232 | User uninstalled app but fcmToken still in DB | ⚠️ FCM returns error for invalid tokens. Need to handle and clear stale tokens. |

---

## SUMMARY: CRITICAL BUGS COUNT

| Severity | Count | Examples |
|---|---|---|
| **P0 — Breaks user trust** | 12 | Cycle day wrapping (#88-90, #195), InsightCache not cleared on periodStarted (#76), hormonal user invalid CycleHistory (#85, #134), no future date validation (#13, #80), no duplicate log guard (#56), duplicate period guard (#82, #153), error leak (#178) |
| **P1 — Degrades experience** | 15 | No tiered delayed messaging (#93), irregular user misleading phases (#34), no input validation on age/sleep/pads (#8, #61-63), no rate limiting (#221-222), no GPT timeout (#160), stale data for returning users (#70, #189, #205) |
| **P2 — Polish** | 10+ | Calendar month validation (#50-51), empty log prevention (#58), name sanitization (#7), cycleLength auto-update, period undo |
| **Gaps (missing features)** | 8+ | Period end date tracking (#86-87), "welcome back" flow (#189, #205), notification system, widget, quick log endpoint |

---

## TOP 12 FIXES — ORDERED BY IMPACT

1. **Cycle day modulo wrapping** — everything downstream breaks
2. **InsightCache not cleared on periodStarted** — stale insights after logging period
3. **Hormonal user periodStarted creates invalid CycleHistory** — pollutes predictions
4. **Future date validation on lastPeriodStart** — registration + profile update
5. **Duplicate log prevention** — unique constraint on [userId, date]
6. **Duplicate period-started guard** — check existing CycleHistory with same date
7. **Input validation on numeric fields** — sleep (0-24), padsChanged (0-50), age (10-100)
8. **Error handler production safety** — no stack traces
9. **Rate limiting on all endpoints** — especially insights and logs
10. **GPT timeout** — 10 second max on OpenAI calls
11. **Tiered delayed period messaging** — escalating 1-3 / 4-7 / 8-14 / 15+ days
12. **Chat message length limit** — max 2000 characters