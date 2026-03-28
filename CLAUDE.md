# TASK: Apply All Remaining Bug Fixes (Post-Chat-Split)

## STATUS AFTER LAST SESSION

The chat split was applied correctly:
- ✅ aiService.ts → barrel re-export
- ✅ chatService.ts with classifyIntent + lightMode
- ✅ insightGptService.ts with all guards
- ✅ openaiClient.ts shared client
- ✅ chatController casual/health intent routing
- ✅ insightController expanded stripHormonalLanguage (good addition)
- ✅ isIrregular now gated by cycleMode !== "hormonal" across all controllers

But ALL fixes from FIX_INSIGHT_BUGS.md and FIX_CONTRACEPTION_GAPS.md are still pending.
This task applies them all.

---

## BLOCK A: chatController.ts — bring to parity with insightController

**File:** `src/controllers/chatController.ts`

The "health" path in chatController (lines ~65–120) still has 5 bugs from the audit. Apply ALL of these changes to the full-pipeline path (the `else` block after the casual intent check):

### A1: Add missing imports

Add these imports at the top of chatController.ts (some may already be there, only add missing ones):

```typescript
import { calculateCycleInfo, getCycleMode, utcDayDiff } from "../services/cycleEngine";
import { getCyclePredictionContext, getUserInsightData } from "../services/insightData";
import { resolveContraceptionType } from "../services/contraceptionengine";
```

### A2: Add effectiveCycleLength, isPeriodDelayed, isIrregular, contraceptionType

Replace the full-pipeline section (after `const { user, recentLogs, baselineLogs, numericBaseline, crossCycleNarrative } = data;`) with this flow:

```typescript
const cycleMode = getCycleMode(user);

// FIX: Use prediction-adjusted cycle length (was user.cycleLength)
const cyclePrediction = await getCyclePredictionContext(req.userId!, user.cycleLength);
const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;

const cycleInfo = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);

// FIX: Compute delayed period (was hardcoded false)
const rawDiffDays = utcDayDiff(new Date(), user.lastPeriodStart);
const daysOverdue = Math.max(0, rawDiffDays - effectiveCycleLength);
const isPeriodDelayed =
  daysOverdue > 0 &&
  cyclePrediction.confidence !== "irregular" &&
  cycleMode !== "hormonal";
const isIrregular = cycleMode !== "hormonal" && cyclePrediction.isIrregular;

const totalLogCount = recentLogs.length + baselineLogs.length;

// FIX: Pass cyclePredictionConfidence as 9th arg (was missing)
const context = buildInsightContext(
  cycleInfo.phase,
  cycleInfo.currentDay,
  recentLogs,
  baselineLogs,
  baselineLogs.length >= 7 ? "global" : "none",
  getCycleNumber(user.lastPeriodStart, effectiveCycleLength),
  effectiveCycleLength,
  cycleMode,
  cyclePrediction.confidence,
);

// FIX: Use actual contraception type (was hardcoded "none")
const contraceptionType = resolveContraceptionType(user.contraceptiveMethod);

const hormoneState = buildHormoneState(
  cycleInfo.phase,
  cycleInfo.currentDay,
  effectiveCycleLength,
  cycleMode,
  contraceptionType,
);

const primaryInsightCause = detectPrimaryInsightCause({
  baselineDeviation: context.baselineDeviation,
  trends: context.trends,
  sleepDelta: numericBaseline.sleepDelta,
  priorityDrivers: context.priorityDrivers,
});

const vyanaCtx = buildVyanaContextForInsights({
  ctx: context,
  baseline: numericBaseline,
  crossCycleNarrative,
  hormoneState,
  hormoneLanguage: buildHormoneLanguage(hormoneState, 0.5),
  phase: cycleInfo.phase,
  cycleDay: cycleInfo.currentDay,
  phaseDay: cycleInfo.phaseDay,
  cycleLength: effectiveCycleLength,
  cycleMode,
  daysUntilNextPhase: cycleInfo.daysUntilNextPhase,
  daysUntilNextPeriod: cycleInfo.daysUntilNextPeriod,
  isPeriodDelayed,
  daysOverdue,
  isIrregular,
  memoryDriver: context.priorityDrivers[0] ?? null,
  memoryCount: 0,
  userName: user.name ?? null,
  userId: req.userId!,
  primaryInsightCause,
});
```

This fixes bugs 1–4 from FIX_INSIGHT_BUGS.md all at once.

---

## BLOCK B: Forecast endpoint — pass VyanaContext to GPT

**File:** `src/controllers/insightController.ts` → `getInsightsForecast()` function

### B1: Build VyanaContext for forecast

Inside `getInsightsForecast()`, AFTER the `context` is built and BEFORE the `canUseAIForecast` check, add:

```typescript
// Build VyanaContext for forecast GPT (was missing — forecast missed identity/anticipation layers)
const forecastContraceptionType = resolveContraceptionType(user.contraceptiveMethod);
const forecastHormoneState = buildHormoneState(
  todayCycle.phase,
  todayCycle.currentDay,
  effectiveCycleLength,
  cycleMode,
  forecastContraceptionType,
);
const forecastHormoneLanguage = contraceptionBehavior.showHormoneCurves
  ? buildHormoneLanguage(forecastHormoneState, cyclePrediction.confidence === "reliable" ? 0.8 : 0.5)
  : null;

const forecastPrimaryInsightCause = detectPrimaryInsightCause({
  baselineDeviation: context.baselineDeviation,
  trends: context.trends,
  sleepDelta: numericBaseline.sleepDelta,
  priorityDrivers: context.priorityDrivers,
});

const forecastVyanaCtx = buildVyanaContextForInsights({
  ctx: context,
  baseline: numericBaseline,
  crossCycleNarrative,
  hormoneState: forecastHormoneState,
  hormoneLanguage: forecastHormoneLanguage,
  phase: todayCycle.phase,
  cycleDay: todayCycle.currentDay,
  phaseDay: todayCycle.phaseDay,
  cycleLength: effectiveCycleLength,
  cycleMode,
  daysUntilNextPhase: todayCycle.daysUntilNextPhase,
  daysUntilNextPeriod: todayCycle.daysUntilNextPeriod,
  isPeriodDelayed: false,
  daysOverdue: 0,
  isIrregular: cycleMode !== "hormonal" && cyclePrediction.isIrregular,
  memoryDriver: context.priorityDrivers[0] ?? null,
  memoryCount: 0,
  userName: user.name ?? null,
  userId: req.userId!,
  primaryInsightCause: forecastPrimaryInsightCause,
});
```

### B2: Pass it to generateForecastWithGpt

Change:
```typescript
const rewritten = await generateForecastWithGpt(
  context,
  draftForecastPayload,
  numericBaseline,
  crossCycleNarrative,
  user.name,
);
```

to:
```typescript
const rewritten = await generateForecastWithGpt(
  context,
  draftForecastPayload,
  numericBaseline,
  crossCycleNarrative,
  user.name,
  forecastVyanaCtx,
);
```

### B3: Verify imports

`detectPrimaryInsightCause` is already imported in insightController.ts. `buildHormoneState` and `buildHormoneLanguage` are already imported. `resolveContraceptionType` is already imported. No new imports needed.

---

## BLOCK C: Contraception transition — reset lastPeriodStart

**File:** `src/services/contraceptionTransition.ts`

### C1: Reset lastPeriodStart on natural→hormonal

Find:
```typescript
if (needsFullReset) {
  cycleHistoryMarked = await markCycleAsTransitional(userId);
  await resetBaselineData(userId);
  baselineReset = true;
}
```

Replace with:
```typescript
if (needsFullReset) {
  cycleHistoryMarked = await markCycleAsTransitional(userId);
  await resetBaselineData(userId);
  baselineReset = true;

  // Reset period start to transition date for natural→hormonal
  // so cycle day counter restarts from "Day 1" of new method.
  // Without this, the day counter drifts from the old natural period.
  if (transitionType === "natural_to_hormonal") {
    await prisma.user.update({
      where: { id: userId },
      data: { lastPeriodStart: new Date() },
    });
  }
}
```

### C2: Add periodStartReset to return type and result

Add `periodStartReset: boolean` to the `ContraceptionTransitionResult` interface:
```typescript
export interface ContraceptionTransitionResult {
  // ... existing fields ...
  periodStartReset: boolean;
}
```

Add it to both return statements:
- In the `same_method` early return: `periodStartReset: false`
- In the main return: `periodStartReset: transitionType === "natural_to_hormonal" && needsFullReset`

### C3: Update userController to include periodStartReset

In `src/controllers/userController.ts`, in the `updateProfile` function, add `periodStartReset` to the transition response:
```typescript
response.contraceptionTransition = {
  // ... existing fields ...
  periodStartReset: transitionResult.periodStartReset,
};
```

---

## BLOCK D: Transition warmup system

### D1: Add contraceptionChangedAt to User schema

**File:** `prisma/schema.prisma`

Add to the User model after `fcmToken`:
```prisma
contraceptionChangedAt DateTime?
```

Then run: `npx prisma migrate dev --name add_contraception_changed_at`

### D2: Set contraceptionChangedAt during transition

**File:** `src/services/contraceptionTransition.ts`

In the `needsFullReset` block (after the lastPeriodStart reset from C1), set the timestamp:

```typescript
if (needsFullReset) {
  cycleHistoryMarked = await markCycleAsTransitional(userId);
  await resetBaselineData(userId);
  baselineReset = true;

  if (transitionType === "natural_to_hormonal") {
    await prisma.user.update({
      where: { id: userId },
      data: { lastPeriodStart: new Date(), contraceptionChangedAt: new Date() },
    });
  } else {
    // hormonal_to_natural or hormonal_to_hormonal
    await prisma.user.update({
      where: { id: userId },
      data: { contraceptionChangedAt: new Date() },
    });
  }
}
```

For `natural_to_natural` (non-full-reset), also set it after the `clearAllCaches` call:
```typescript
if (transitionType === "natural_to_natural") {
  await prisma.user.update({
    where: { id: userId },
    data: { contraceptionChangedAt: new Date() },
  });
}
```

### D3: Create transitionWarmup.ts

**File:** Create `src/services/transitionWarmup.ts`

```typescript
export interface TransitionWarmup {
  active: boolean;
  daysSinceTransition: number;
  daysRemaining: number;
  message: string;
  tip: string;
}

const WARMUP_DURATION_DAYS = 14;

export function buildTransitionWarmup(
  contraceptionChangedAt: Date | null,
): TransitionWarmup | null {
  if (!contraceptionChangedAt) return null;

  const daysSince = Math.floor(
    (Date.now() - contraceptionChangedAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysSince >= WARMUP_DURATION_DAYS) return null;

  const daysRemaining = WARMUP_DURATION_DAYS - daysSince;

  let message: string;
  let tip: string;

  if (daysSince <= 3) {
    message =
      "Your insights are resetting to match your new contraception. " +
      "Keep logging daily — personalized patterns will return within 1–2 weeks.";
    tip =
      "The more you log right now, the faster your insights will feel like yours again.";
  } else if (daysSince <= 7) {
    message =
      "We're learning your new patterns. " +
      "Your insights will get more personal over the next week.";
    tip =
      "Logging mood, sleep, and stress daily gives us the strongest signal to work with.";
  } else {
    message =
      "Your personalized insights are almost ready. " +
      "A few more days of logging and we'll have a clear picture.";
    tip =
      "You're close — consistency now makes a real difference in accuracy.";
  }

  return {
    active: true,
    daysSinceTransition: daysSince,
    daysRemaining,
    message,
    tip,
  };
}
```

### D4: Wire warmup into GET /api/insights

**File:** `src/controllers/insightController.ts` → `getInsights()`

1. Add import:
```typescript
import { buildTransitionWarmup } from "../services/transitionWarmup";
```

2. After `getUserInsightData` returns the user, build warmup:
```typescript
const transitionWarmup = buildTransitionWarmup(
  (user as any).contraceptionChangedAt ?? null,
);
```

(Note: `User` type from Prisma will include `contraceptionChangedAt` after the migration. The `as any` is a safety cast in case types haven't regenerated yet — remove it after `npx prisma generate`.)

3. Add to `responsePayload`:
```typescript
const responsePayload = {
  cycleDay: cachePayload.cycleDay,
  isNewUser: cachePayload.isNewUser,
  progress: cachePayload.progress,
  confidence: cachePayload.confidence,
  isPeriodDelayed: cachePayload.isPeriodDelayed,
  daysOverdue: cachePayload.daysOverdue,
  isIrregular: cachePayload.isIrregular,
  insights: cachePayload.insights,
  view: cachePayload.view,
  aiEnhanced: cachePayload.aiEnhanced,
  transitionWarmup,
};
```

### D5: Wire warmup into GET /api/home

**File:** `src/controllers/homeController.ts` → `getHomeScreen()`

1. Add import:
```typescript
import { buildTransitionWarmup } from "../services/transitionWarmup";
```

2. After user fetch, build warmup:
```typescript
const transitionWarmup = buildTransitionWarmup(
  (user as any).contraceptionChangedAt ?? null,
);
```

3. Add to response:
```typescript
res.json({
  ...content,
  ctaLogPhase: cycleInfo.phase,
  quickLogFields: getQuickLogFields(cycleInfo.phase, isPeriodDelayed, isHormonalMode),
  isHormonalMode,
  transitionWarmup,
});
```

### D6: Wire warmup into GET /api/insights/forecast

**File:** `src/controllers/insightController.ts` → `getInsightsForecast()`

Same pattern — build warmup after user fetch, add to both the warmup payload and the full forecast payload.

---

## BLOCK E: Dead code removal

### E1: insightService.ts

Remove these exported functions and types:
- `DailyInsightV2` interface
- `generateHook()` function
- `buildCoreInsight()` function
- `buildPatternReassurance()` function

Before removing, verify with grep that nothing imports them:
```bash
grep -r "generateHook\|buildCoreInsight\|buildPatternReassurance\|DailyInsightV2" src/ --include="*.ts" | grep -v "insightService.ts"
```

### E2: insightView.ts

Remove `getRelevantKeysForDriver()`. Verify first:
```bash
grep -r "getRelevantKeysForDriver" src/ --include="*.ts" | grep -v "insightView.ts"
```

### E3: hormoneengine.ts

Remove `deriveExperienceFromHormones()` and `HormoneExperienceHints`. Verify first:
```bash
grep -r "deriveExperienceFromHormones\|HormoneExperienceHints" src/ --include="*.ts" | grep -v "hormoneengine.ts"
```

### E4: insightMemory.ts

Change `export function buildMemoryNarrative` to `function buildMemoryNarrative` (remove export, keep function — it's used internally by `buildMemoryContext`).

---

## EXECUTION ORDER

1. BLOCK D1 first — schema change + migration (`npx prisma migrate dev`)
2. BLOCK D3 — create transitionWarmup.ts
3. BLOCK C — contraceptionTransition.ts changes
4. BLOCK A — chatController.ts parity fixes
5. BLOCK B — forecast VyanaContext
6. BLOCK D4–D6 — wire warmup into endpoints
7. BLOCK E — dead code removal (last, to avoid confusion)
8. Run `npx prisma generate` then `npx tsc --noEmit` to verify

## TESTING

1. `npx tsc --noEmit` — no type errors
2. Register pill user → `GET /api/home` → verify "Day 1" after registration
3. `POST /api/chat` with `"is my period late?"` for a user 35 days since last period → should acknowledge delay
4. `POST /api/chat` with pill user + `"how's my cycle?"` → should NOT mention estrogen rising
5. `GET /api/insights/forecast` with 10+ logs → verify forecast text includes identity/anticipation layers
6. Existing natural user → `PUT /api/user/profile { contraceptiveMethod: "pill" }` → verify `periodStartReset: true` + `lastPeriodStart` = today
7. After pill switch → `GET /api/home` → verify `transitionWarmup.active: true`
8. After pill switch → `GET /api/insights` → verify `transitionWarmup` present