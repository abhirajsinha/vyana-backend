# SPRINT_LAUNCH.md — 14-Day Launch Sprint (20 Tasks)

> **Purpose**: Execute all fixes from CLAUDE.md, EDGE_CASES_MASTER.md, EDGE_CASES_ADVANCED.md, and INSIGHT_LANGUAGE_FIX.md.
> 
> **Rule**: One task at a time → verify → commit → next task. Never batch.
> **Rule**: After EVERY task: `npx tsc --noEmit`. If it fails, fix before moving on.

---

## PRE-SPRINT CHECKLIST

```bash
npx tsc --noEmit          # zero errors
npx prisma validate       # passes
npx prisma generate       # client up to date
```
If any fail, fix first.

---

## PHASE 1: P0 BUG FIXES (Tasks 1-8) — Days 1-4

---

### TASK 1: Fix cycle day modulo wrapping

**Bug**: Day 29 of 28-day cycle → cycleDay wraps to 1, phase = "menstrual". User isn't menstruating.
**Refs**: CLAUDE.md Scenario A, EDGE_CASES_MASTER #88-90, #195
**File**: `src/services/cycleEngine.ts` → `calculateCycleInfoForDate()`

**Claude Code prompt**:
```
Read CLAUDE.md section "SCENARIO A" and EDGE_CASES_MASTER.md cases #88-90.

In src/services/cycleEngine.ts, fix calculateCycleInfoForDate():

When diffDays >= cycleLength (period is overdue), do NOT wrap via modulo.
Instead:
- currentDay = diffDays + 1 (actual day count, e.g., 31 for day 31 of 28-day cycle)
- phase = "luteal" (last phase before expected period — NOT "menstrual")
- daysUntilNextPeriod = 0 (period is overdue)
- daysUntilNextPhase = 0

For normal cycles (diffDays < cycleLength): keep existing modulo logic unchanged.

Also check calculateCycleInfo() since it calls calculateCycleInfoForDate().

Verify: npx tsc --noEmit
Test: user with lastPeriodStart 31 days ago, cycleLength 28 → cycleDay: 31, phase: "luteal"
```

---

### TASK 2: Clear InsightCache on periodStarted

**Bug**: Period logged mid-day → insights serve stale cache showing old phase.
**Refs**: EDGE_CASES_MASTER #76, ADVANCED T1
**File**: `src/controllers/cycleController.ts` → `periodStarted()`

**Claude Code prompt**:
```
In src/controllers/cycleController.ts → periodStarted():

Add cache invalidation AFTER the prisma.user.update call:
  await prisma.insightCache.deleteMany({ where: { userId: req.userId! } });

Also: compute fresh cycleInfo and return it in the response so frontend updates immediately:
  const freshCycleInfo = calculateCycleInfo(startDate, user.cycleLength, cycleMode);
  
Add to response json: cycleDay: freshCycleInfo.currentDay, phase: freshCycleInfo.phase

Verify: npx tsc --noEmit
```

---

### TASK 3: Fix hormonal user periodStarted

**Bug**: Hormonal user logs withdrawal bleed → CycleHistory gets calculated cycleLength → pollutes predictions.
**Refs**: CLAUDE.md Scenario C, EDGE_CASES_MASTER #85, #134
**File**: `src/controllers/cycleController.ts` → `periodStarted()`

**Claude Code prompt**:
```
In src/controllers/cycleController.ts → periodStarted():

After fetching the user and computing cycleMode, add an early-return path for hormonal users:

if (cycleMode === "hormonal") {
  // Create CycleHistory WITHOUT closing previous cycle or calculating cycleLength
  await prisma.cycleHistory.create({
    data: { userId: req.userId!, startDate },
  });
  
  // Update lastPeriodStart (day counter resets)
  await prisma.user.update({
    where: { id: req.userId! },
    data: { lastPeriodStart: startDate, cycleMode },
  });
  
  // Clear caches
  await prisma.insightCache.deleteMany({ where: { userId: req.userId! } });
  
  res.status(201).json({
    success: true,
    startDate: startDate.toISOString(),
    cycleMode,
    cycleDay: 1,
    phase: "menstrual",
    note: "Withdrawal bleed logged. Cycle length not tracked for hormonal contraception.",
  });
  return;
}

The existing code after this block handles natural/irregular users — leave that unchanged.

Verify: npx tsc --noEmit
```

---

### TASK 4: Validate lastPeriodStart not in future

**Bug**: Future dates accepted → negative cycle days, broken calculations.
**Refs**: EDGE_CASES_MASTER #13, #80, #138
**Files**: `src/controllers/authController.ts`, `src/controllers/userController.ts`

**Claude Code prompt**:
```
In src/controllers/authController.ts → register():

After the existing field validation, add lastPeriodStart validation:
  const parsedPeriodDate = new Date(lastPeriodStart);
  if (Number.isNaN(parsedPeriodDate.getTime())) {
    res.status(400).json({ error: "Invalid lastPeriodStart date" });
    return;
  }
  if (parsedPeriodDate > new Date()) {
    res.status(400).json({ error: "lastPeriodStart cannot be in the future" });
    return;
  }

Add same validation in googleAuth() for lastPeriodStart.

In src/controllers/userController.ts → updateProfile():
The existing block already parses the date. Add the future check:
  if (parsed > new Date()) {
    res.status(400).json({ error: "lastPeriodStart cannot be in the future" });
    return;
  }

Verify: npx tsc --noEmit
```

---

### TASK 5: Prevent duplicate logs

**Bug**: No uniqueness → user can create multiple logs for same day.
**Refs**: EDGE_CASES_MASTER #56, #185
**File**: `src/controllers/logController.ts`

**Claude Code prompt**:
```
In src/controllers/logController.ts → saveLog():

Before creating a new log, check if one already exists today:

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);
  
  const existing = await prisma.dailyLog.findFirst({
    where: { userId: req.userId!, date: { gte: todayStart, lte: todayEnd } },
  });

If existing: UPDATE it with the new fields (only overwrite fields that are provided and non-null in the request body). Use prisma.dailyLog.update().

If not existing: CREATE as before.

The rest of the function (cache invalidation, response) stays the same.

Verify: npx tsc --noEmit
```

---

### TASK 6: Error handler production safety

**Bug**: Error middleware returns err.message in production → leaks internals.
**Refs**: EDGE_CASES_MASTER #178
**File**: `src/middleware/errorHandler.ts`

**Claude Code prompt**:
```
In src/middleware/errorHandler.ts → errorHandler():

Replace the current implementation with:

  const isProd = process.env.NODE_ENV === "production";
  const message = isProd
    ? "Internal server error"
    : (err instanceof Error ? err.message : "Internal server error");
  res.status(500).json({ error: message });

Verify: npx tsc --noEmit
```

---

### TASK 7: Chat message length limit

**Bug**: No limit → user can send 100KB to GPT.
**Refs**: EDGE_CASES_MASTER #45
**File**: `src/controllers/chatController.ts`

**Claude Code prompt**:
```
In src/controllers/chatController.ts → chat():

After the existing message validation ("message is required"), add:
  if (message.length > 2000) {
    res.status(400).json({ error: "Message must be under 2000 characters" });
    return;
  }

Verify: npx tsc --noEmit
```

---

### TASK 8: Zero-data insight language tier system

**Bug**: Zero-log users see assertive language like "Energy is lower today" when we have no data.
**Refs**: INSIGHT_LANGUAGE_FIX.md (READ FULLY BEFORE IMPLEMENTING)
**Files**: `src/services/insightService.ts`, `src/services/insightGptService.ts`, `src/controllers/insightController.ts`

**Claude Code prompt**:
```
Read INSIGHT_LANGUAGE_FIX.md completely before making any changes.

THREE CHANGES NEEDED:

1. In src/services/insightService.ts, add two new functions:

   softenForConfidenceTier(insights, logsCount, phase, cycleDay):
   - logsCount >= 5: return insights unchanged (Tier 3 — personalized)
   - logsCount >= 1: apply softendeterministic() with confidenceScore 0.3 (Tier 2)
   - logsCount === 0: call rewriteForZeroData() (Tier 1)

   rewriteForZeroData(insights, phase, cycleDay):
   - Replace all state assertions with suggestions:
     "Energy is lower" → "Energy can still feel lower"
     "Focus is lower today" → "Focus might not be at its peak yet"
     "You feel" → "You may feel"
     "Your body is doing" → "Your body may be doing"
     "today" → "around this time"
     "right now" → "during this phase"
     "hormone floor" → "lowest hormone levels"
   - See INSIGHT_LANGUAGE_FIX.md for the full replacement list
   
   Export softenForConfidenceTier.

2. In src/controllers/insightController.ts → getInsights():
   After generating draftInsights (line: let draftInsights = { ...ruleBasedInsights, tomorrowPreview }),
   add:
     draftInsights = softenForConfidenceTier(draftInsights, logsCount, cycleInfo.phase, cycleInfo.currentDay);
   
   This ensures even the GPT draft uses suggestive language for zero-data users.

3. In src/services/insightGptService.ts → generateInsightsWithGpt():
   When ctx.recentLogsCount === 0, add to the userPrompt:
   
   const zeroDataInstruction = ctx.recentLogsCount === 0
     ? `\nZERO-DATA USER (CRITICAL): This user has logged ZERO days. DO NOT assert her current state. DO NOT say "you feel", "energy is lower", "focus is lower". Describe what this PHASE typically brings, framed as tendencies: "can feel", "may notice", "tends to", "many people find". Each field must describe a DIFFERENT aspect — do not repeat the same idea across fields.`
     : "";
   
   Append zeroDataInstruction to the userPrompt string.

Verify: npx tsc --noEmit
Test: Zero-log user, cycle day 5 → GET /api/insights → physicalInsight contains "can" or "may" or "tends to", NOT "is lower today"
```

---

**PHASE 1 CHECKPOINT:**
```bash
npx tsc --noEmit
npx prisma validate
```

**Test all four scenarios:**
- A: User 32 days into 28-day cycle → cycleDay: 32, phase: "luteal", isPeriodDelayed: true
- B: Irregular user, 0 cycles → isIrregular: true, softened language
- C: Hormonal user → no phase language, periodStarted → CycleHistory.cycleLength: null
- D: Zero-log user → "Energy can still feel lower" NOT "Energy is lower today"

---

## PHASE 2: RECOVERY ENDPOINTS (Tasks 9-11) — Days 5-6

---

### TASK 9: Log edit endpoint

**Refs**: ADVANCED R1
**Files**: `src/controllers/logController.ts`, `src/routes/logs.ts`

**Claude Code prompt**:
```
Add PUT /api/logs/:id endpoint.

In src/controllers/logController.ts, add:

export async function updateLog(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  
  const log = await prisma.dailyLog.findUnique({ where: { id } });
  if (!log || log.userId !== req.userId) {
    res.status(404).json({ error: "Log not found" });
    return;
  }
  
  // Accept same fields as saveLog
  const { mood, energy, sleep, stress, diet, exercise, activity, symptoms,
          focus, motivation, pain, social, cravings, fatigue, padsChanged } = req.body;
  
  const updatedLog = await prisma.dailyLog.update({
    where: { id },
    data: {
      ...(mood !== undefined && { mood }),
      ...(energy !== undefined && { energy }),
      ...(sleep !== undefined && { sleep }),
      ...(stress !== undefined && { stress }),
      ...(diet !== undefined && { diet }),
      ...(exercise !== undefined && { exercise }),
      ...(activity !== undefined && { activity }),
      ...(symptoms !== undefined && { symptoms }),
      ...(focus !== undefined && { focus }),
      ...(motivation !== undefined && { motivation }),
      ...(pain !== undefined && { pain }),
      ...(social !== undefined && { social }),
      ...(cravings !== undefined && { cravings }),
      ...(fatigue !== undefined && { fatigue }),
      ...(padsChanged !== undefined && { padsChanged }),
    },
  });
  
  await prisma.insightCache.deleteMany({ where: { userId: req.userId! } });
  await prisma.healthPatternCache.deleteMany({ where: { userId: req.userId! } }).catch(() => {});
  
  res.json({ success: true, log: updatedLog });
}

In src/routes/logs.ts: add router.put("/:id", requireAuth, updateLog);
Import updateLog from logController.

Verify: npx tsc --noEmit
```

---

### TASK 10: Period-started undo endpoint

**Refs**: ADVANCED R2
**Files**: `src/controllers/cycleController.ts`, `src/routes/cycle.ts`

**Claude Code prompt**:
```
Add DELETE /api/cycle/period-started/:id endpoint.

In src/controllers/cycleController.ts, add:

export async function undoPeriodStarted(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  
  const entry = await prisma.cycleHistory.findUnique({ where: { id } });
  if (!entry || entry.userId !== req.userId) {
    res.status(404).json({ error: "Cycle history entry not found" });
    return;
  }
  
  // Find the previous cycle entry
  const previous = await prisma.cycleHistory.findFirst({
    where: { userId: req.userId!, startDate: { lt: entry.startDate } },
    orderBy: { startDate: "desc" },
  });
  
  if (previous) {
    // Reopen previous cycle
    await prisma.cycleHistory.update({
      where: { id: previous.id },
      data: { endDate: null, cycleLength: null },
    });
    // Restore lastPeriodStart
    await prisma.user.update({
      where: { id: req.userId! },
      data: { lastPeriodStart: previous.startDate },
    });
  }
  
  // Delete the erroneous entry
  await prisma.cycleHistory.delete({ where: { id } });
  
  // Clear caches
  await prisma.insightCache.deleteMany({ where: { userId: req.userId! } });
  await prisma.healthPatternCache.deleteMany({ where: { userId: req.userId! } }).catch(() => {});
  
  res.json({
    success: true,
    restoredLastPeriodStart: previous?.startDate?.toISOString() ?? null,
  });
}

In src/routes/cycle.ts: add router.delete("/period-started/:id", requireAuth, undoPeriodStarted);
Import undoPeriodStarted.

Verify: npx tsc --noEmit
```

---

### TASK 11: Quick check-in endpoint

**Files**: `src/controllers/logController.ts`, `src/routes/logs.ts`

**Claude Code prompt**:
```
Add POST /api/logs/quick-check-in endpoint.

In src/controllers/logController.ts, add:

export async function quickCheckIn(req: Request, res: Response): Promise<void> {
  const { mood, sleep, stress, energy, padsChanged, pain, fatigue, cravings } = req.body;
  
  // At least one field required
  if (!mood && sleep === undefined && !stress && !energy && padsChanged === undefined && !pain && !fatigue && !cravings) {
    res.status(400).json({ error: "At least one field is required" });
    return;
  }
  
  // Validate ranges
  if (sleep !== undefined && (typeof sleep !== "number" || sleep < 0 || sleep > 24)) {
    res.status(400).json({ error: "sleep must be between 0 and 24" });
    return;
  }
  if (padsChanged !== undefined && (typeof padsChanged !== "number" || padsChanged < 0 || padsChanged > 50)) {
    res.status(400).json({ error: "padsChanged must be between 0 and 50" });
    return;
  }
  
  // Find today's log
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);
  
  const existing = await prisma.dailyLog.findFirst({
    where: { userId: req.userId!, date: { gte: todayStart, lte: todayEnd } },
  });
  
  // Build update data — only set provided fields
  const data: Record<string, unknown> = {};
  if (mood !== undefined) data.mood = mood;
  if (sleep !== undefined) data.sleep = sleep;
  if (stress !== undefined) data.stress = stress;
  if (energy !== undefined) data.energy = energy;
  if (padsChanged !== undefined) data.padsChanged = padsChanged;
  if (pain !== undefined) data.pain = pain;
  if (fatigue !== undefined) data.fatigue = fatigue;
  if (cravings !== undefined) data.cravings = cravings;
  
  let log;
  let isNew: boolean;
  
  if (existing) {
    log = await prisma.dailyLog.update({
      where: { id: existing.id },
      data: data as any,
    });
    isNew = false;
  } else {
    log = await prisma.dailyLog.create({
      data: { userId: req.userId!, ...data } as any,
    });
    isNew = true;
  }
  
  await prisma.insightCache.deleteMany({ where: { userId: req.userId! } });
  await prisma.healthPatternCache.deleteMany({ where: { userId: req.userId! } }).catch(() => {});
  
  res.status(isNew ? 201 : 200).json({
    success: true,
    fieldsLogged: Object.keys(data),
    isNew,
  });
}

In src/routes/logs.ts: add router.post("/quick-check-in", requireAuth, quickCheckIn);
Import quickCheckIn.

Verify: npx tsc --noEmit
```

---

## PHASE 3: TRUST PROTECTION (Tasks 12-14) — Days 7-9

---

### TASK 12: Single-day spike protection

**Refs**: ADVANCED T8
**File**: `src/services/insightCause.ts`

**Claude Code prompt**:
```
Read EDGE_CASES_ADVANCED.md T8.

In src/services/insightCause.ts → detectPrimaryInsightCause():

Add optional parameter: recentLogs?: Array<{ sleep?: number | null; stress?: string | null }>

Before returning "sleep_disruption":
- Count how many of the last 3 logs have sleep < 6.0
- If fewer than 2: return "cycle" instead (single bad night, don't panic)

Before returning "stress_led":
- Count how many of the last 3 logs have stress "high" or "very_high"
- If fewer than 2: return "cycle" instead (single stressful day)

Update callers in insightController.ts and chatController.ts to pass recentLogs.

Verify: npx tsc --noEmit
```

---

### TASK 13: Momentum protection

**Refs**: ADVANCED T15
**File**: `src/services/insightService.ts`

**Claude Code prompt**:
```
Read EDGE_CASES_ADVANCED.md T15.

In src/services/insightService.ts, add:

export function detectMomentumBreak(recentLogs: DailyLog[]): boolean {
  if (recentLogs.length < 5) return false;
  
  // Check previous 4 days (index 1-4): are 3+ positive?
  const previous4 = recentLogs.slice(1, 5);
  const positiveCount = previous4.filter(log => {
    const moodOk = ["good", "happy", "positive", "calm", "great"].some(m =>
      (log.mood ?? "").toLowerCase().includes(m));
    const stressOk = ["low", "calm", "moderate"].some(s =>
      (log.stress ?? "").toLowerCase().includes(s));
    return moodOk && stressOk;
  }).length;
  
  if (positiveCount < 3) return false;
  
  // Check today (index 0): is it negative?
  const today = recentLogs[0];
  if (!today) return false;
  const todayNegative =
    ["low", "anxious", "irritable", "very_low", "sad"].some(m =>
      (today.mood ?? "").toLowerCase().includes(m)) ||
    ["high", "very_high"].some(s =>
      (today.stress ?? "").toLowerCase().includes(s));
  
  return todayNegative;
}

In generateRuleBasedInsights(), at the top:
  const isMomentumBreak = detectMomentumBreak(recentLogs);
  
If isMomentumBreak:
  Override physicalInsight: "Today is rougher than your recent streak — the last few days were strong, and one harder day doesn't erase that."
  Override whyThisIsHappening: "After several good days, a dip can feel more pronounced. See how tomorrow goes before reading too much into today."

Note: the function needs access to recentLogs — add it as a parameter to generateRuleBasedInsights or build it from the context.

Verify: npx tsc --noEmit
```

---

### TASK 14: Signal-aware home screen

**Refs**: ADVANCED T2, T13, T16, T21
**File**: `src/controllers/homeController.ts`

**Claude Code prompt**:
```
Read EDGE_CASES_ADVANCED.md T2, T13, T16, T21.

In src/controllers/homeController.ts → getHomeScreen():

After computing cycleInfo and before calling buildContent():

1. Count recent logs:
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentLogs = await prisma.dailyLog.findMany({
    where: { userId: req.userId!, date: { gte: sevenDaysAgo } },
    orderBy: { date: "desc" },
    take: 7,
  });

2. If recentLogs.length >= 3 AND contraceptionBehavior.useNaturalCycleEngine:
   Compute a lightweight signal check:
   - Are recent moods mostly positive? (3+ of last 5 logs have mood "good"/"positive"/"calm")
   - Is recent stress elevated? (3+ of last 5 logs have stress "high"/"very_high")
   
   If signals contradict phase expectations:
   - Phase says low energy (menstrual) but mood is positive → override cardHeadline:
     "You're feeling good right now — listen to your body over the calendar"
   - Phase says peak energy (ovulation) but stress is high → override cardHeadline:
     "Stress is running higher than usual — take it easier even though this is typically a stronger window"

3. Pass the override into buildContent or override the result after buildContent returns.

4. For users with < 3 logs: keep existing phase-only content (no change).

Verify: npx tsc --noEmit
```

---

## PHASE 4: OBSERVABILITY (Task 15) — Day 10

### TASK 15: Production monitoring

**Files**: New `src/middleware/requestLogger.ts`, updates to `src/index.ts`, `src/services/insightGptService.ts`, `src/controllers/insightController.ts`, `src/controllers/cycleController.ts`

**Claude Code prompt**:
```
1. Create src/middleware/requestLogger.ts:

import { Request, Response, NextFunction } from "express";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      userId: req.userId ?? null,
    }));
  });
  next();
}

2. In src/index.ts: import and add app.use(requestLogger) BEFORE routes.

3. In src/services/insightGptService.ts → generateInsightsWithGpt():
   After the GPT call, log:
   console.log(JSON.stringify({ event: "gpt_insight", durationMs, status: result.status, model: OPENAI_MODEL }));

4. In src/controllers/insightController.ts → getInsights():
   After cache check, log:
   console.log(JSON.stringify({ event: "insight_cache", hit: !!cached, userId: req.userId }));

5. In src/controllers/cycleController.ts → periodStarted():
   After computing the actual cycle length from the closed CycleHistory, log prediction accuracy:
   const predicted = effectiveCycleLength; // what we would have predicted
   const actual = cycleLen; // what actually happened
   console.log(JSON.stringify({ event: "period_accuracy", predicted, actual, errorDays: actual - predicted, userId: req.userId }));

Verify: npx tsc --noEmit
```

---

## PHASE 5: DEFENSIVE HARDENING (Tasks 16-17) — Days 11-12

### TASK 16: Input validation

**Refs**: EDGE_CASES_MASTER #8, #59-63
**Files**: `src/controllers/logController.ts`, `src/controllers/authController.ts`

**Claude Code prompt**:
```
Add validation for all numeric and categorical inputs:

In src/controllers/logController.ts, add a validation helper:

const VALID_MOODS = ["very_low", "low", "anxious", "irritable", "neutral", "good", "happy", "positive", "calm", "great"];
const VALID_STRESS = ["low", "moderate", "high", "very_high", "calm", "elevated", "stressed"];
const VALID_ENERGY = ["low", "very_low", "moderate", "high", "very_high", "exhausted", "tired", "energized"];

function validateLogFields(body: Record<string, unknown>): string | null {
  if (body.sleep !== undefined) {
    if (typeof body.sleep !== "number" || body.sleep < 0 || body.sleep > 24) return "sleep must be 0-24";
  }
  if (body.padsChanged !== undefined) {
    if (typeof body.padsChanged !== "number" || body.padsChanged < 0 || body.padsChanged > 50) return "padsChanged must be 0-50";
  }
  if (body.mood !== undefined && typeof body.mood === "string" && !VALID_MOODS.includes(body.mood.toLowerCase())) {
    return "Invalid mood value";
  }
  if (body.stress !== undefined && typeof body.stress === "string" && !VALID_STRESS.includes(body.stress.toLowerCase())) {
    return "Invalid stress value";
  }
  if (body.energy !== undefined && typeof body.energy === "string" && !VALID_ENERGY.includes(body.energy.toLowerCase())) {
    return "Invalid energy value";
  }
  return null;
}

Call validateLogFields in saveLog(), quickCheckIn(), and updateLog().
If error: res.status(400).json({ error });

In src/controllers/authController.ts → register():
  if (typeof age !== "number" || age < 10 || age > 100) → 400
  if (typeof height !== "number" || height < 50 || height > 300) → 400
  if (typeof weight !== "number" || weight < 20 || weight > 500) → 400

Verify: npx tsc --noEmit
```

---

### TASK 17: Rate limiting + GPT timeout + circuit breaker

**Refs**: EDGE_CASES_MASTER #221-222, ADVANCED S1, S3, S4
**Files**: `src/middleware/rateLimit.ts`, route files, `src/services/insightGptService.ts`

**Claude Code prompt**:
```
THREE CHANGES:

1. In src/middleware/rateLimit.ts, add:
   export const insightLimiter = rateLimit({ windowMs: 60_000, max: 10, message: { error: "Too many requests" } });
   export const logLimiter = rateLimit({ windowMs: 60_000, max: 30, message: { error: "Too many requests" } });
   export const generalLimiter = rateLimit({ windowMs: 60_000, max: 60, message: { error: "Too many requests" } });

   Apply in route files:
   - insights.ts: insightLimiter
   - logs.ts: logLimiter on POST routes
   - home.ts, calendar.ts, health.ts, user.ts: generalLimiter
   - auth.ts: add authLoginRegisterLimiter to google route

2. In src/services/insightGptService.ts, add GPT timeout:
   Before each client.chat.completions.create call:
   const controller = new AbortController();
   const timeoutId = setTimeout(() => controller.abort(), 8000);
   
   In the call options, add: signal: controller.signal
   
   In the finally/catch: clearTimeout(timeoutId);
   If AbortError: return fallback with status "timeout"

3. In src/services/insightGptService.ts, add circuit breaker:
   At module level:
   let gptFailCount = 0;
   let circuitOpenUntil = 0;
   
   Before GPT calls:
   if (Date.now() < circuitOpenUntil) return { insights: draft, status: "circuit_open" as any };
   
   On success: gptFailCount = 0;
   On failure: gptFailCount++; if (gptFailCount >= 5) circuitOpenUntil = Date.now() + 300_000;

Verify: npx tsc --noEmit
```

---

## PHASE 6: NOTIFICATION BACKEND (Tasks 18-20) — Days 13-14

### TASK 18: Notification templates + scheduler

**Files**: New `src/services/notificationTemplates.ts`, `src/services/notificationScheduler.ts`

**Claude Code prompt**:
```
Create notification infrastructure:

1. src/services/notificationTemplates.ts:
   
   Define NotificationTemplate type and phase-aware templates.
   Export getNotificationForUser(phase, cycleDay, cycleLength, isPeriodDelayed):
   - menstrual day 1-2: title "How are you today?", body "Day [X] of your period", actions: ["Rough day", "Managing"]
   - menstrual day 3-5: title "How's your energy?", actions: ["Low", "Getting better"]
   - follicular: title "How's your energy today?", actions: ["Low", "Good", "Great"]
   - ovulation: title "How are you feeling?", actions: mood emojis
   - luteal early: title "How's your stress?", actions: ["Low", "Medium", "High"]
   - luteal late (day 22+): title "How are you holding up?", actions: ["Rough", "Managing", "Fine"]
   - delayed period: title "Has your period started?", actions: ["Yes", "Not yet"]

2. src/services/notificationScheduler.ts:
   Export getUsersDueForNotification():
   - Query users with fcmToken not null
   - Filter: lastNotificationSentAt is null OR > 20 hours ago
   - For each: compute phase, cycleDay, get template
   - Return array of { userId, fcmToken, template }

Verify: npx tsc --noEmit
```

---

### TASK 19: Notification service + FCM token endpoint

**Files**: New `src/services/notificationService.ts`, `src/controllers/notificationController.ts`, `src/routes/user.ts`

**Claude Code prompt**:
```
1. src/services/notificationService.ts:
   Import firebase-admin (npm install firebase-admin).
   Initialize with service account from environment.
   Export sendPushNotification(fcmToken, title, body, data):
   - Use admin.messaging().send()
   - Return { success, error }

2. src/controllers/notificationController.ts:
   Export updateFcmToken(req, res):
   - Validate fcmToken in body
   - prisma.user.update where id = req.userId, data: { fcmToken }
   - Return { success: true }

3. In src/routes/user.ts: add router.put("/fcm-token", requireAuth, updateFcmToken);

Verify: npx tsc --noEmit
```

---

### TASK 20: Notification cron + schema update

**Files**: New `src/cron/notificationCron.ts`, `prisma/schema.prisma`

**Claude Code prompt**:
```
1. Add to User model in prisma/schema.prisma:
   lastNotificationSentAt DateTime?

2. Run: npx prisma migrate dev --name add_notification_sent_at

3. Create src/cron/notificationCron.ts:
   Export runNotificationCron():
   - Call getUsersDueForNotification()
   - For each user (max 100 per batch):
     - Send notification via notificationService
     - Update lastNotificationSentAt
     - Log result
   - Return summary { sent, failed, skipped }

4. Add admin endpoint for manual triggering:
   In a new src/routes/admin.ts:
   POST /api/admin/send-notifications
   - Check for API key in header (X-Admin-Key matches process.env.ADMIN_API_KEY)
   - Call runNotificationCron()
   - Return summary

5. In src/index.ts: add app.use("/api/admin", adminRoutes);

Verify:
  npx prisma validate
  npx prisma generate
  npx tsc --noEmit
```

---

## POST-SPRINT VERIFICATION

```bash
npx tsc --noEmit
npx prisma validate
```

**Test all four scenarios:**

**A (delayed period):** lastPeriodStart 32 days ago, cycleLength 28 → cycleDay: 32, phase: "luteal", isPeriodDelayed: true

**B (irregular):** cycleRegularity: "irregular", 0 cycles → isIrregular: true, softened language

**C (hormonal):** contraceptiveMethod: "pill" → no phase language, periodStarted → cycleLength: null

**D (zero-data language):** 0 logs, cycle day 5 → "Energy can still feel lower" NOT "Energy is lower today"

**Run test suite:**
```bash
npx ts-node src/testRunner/runTestCases.ts --source generated --batch 50 --out test-results-final.json
npx ts-node src/testRunner/validateResults.ts --in test-results-final.json
```
Expected: 100% no-crash, >99% phase correctness, 100% no forbidden language.