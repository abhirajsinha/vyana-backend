# TASK: Fix transitionWarmup Missing on Cache Hit

## CONTEXT

After applying all previous fixes, verification found 2 cache-hit bugs where `transitionWarmup` is returned on fresh computation but lost when the response comes from cache.

---

## BUG 1 (🔴): GET /api/insights — cache hit misses transitionWarmup

**File:** `src/controllers/insightController.ts` → `getInsights()`

**Problem:** The early cache-hit return at the top of `getInsights()` returns the cached payload directly without computing `transitionWarmup`. But the non-cached path includes it in `responsePayload`. So the first call of the day returns `transitionWarmup`, but all subsequent cached calls that day return nothing.

**Current code (broken):**
```typescript
if (cached?.payload && isInsightsPayloadCached(cached.payload)) {
  const full = cached.payload as Record<string, unknown>;
  res.json({
    cycleDay: full.cycleDay,
    isNewUser: full.isNewUser,
    progress: full.progress,
    confidence: full.confidence,
    isPeriodDelayed: full.isPeriodDelayed,
    daysOverdue: full.daysOverdue,
    isIrregular: full.isIrregular,
    insights: full.insights,
    view: full.view,
    aiEnhanced: full.aiEnhanced,
    // ← transitionWarmup MISSING
  });
  return;
}
```

**Fix:** Fetch the user and compute transitionWarmup before returning cached response. Since we need the user's `contraceptionChangedAt`, we need a lightweight user fetch:

```typescript
if (cached?.payload && isInsightsPayloadCached(cached.payload)) {
  const full = cached.payload as Record<string, unknown>;

  // transitionWarmup is time-sensitive (14-day window) — compute fresh, don't cache it
  const cachedUser = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { contraceptionChangedAt: true },
  });
  const cachedTransitionWarmup = cachedUser
    ? buildTransitionWarmup(cachedUser.contraceptionChangedAt ?? null)
    : null;

  res.json({
    cycleDay: full.cycleDay,
    isNewUser: full.isNewUser,
    progress: full.progress,
    confidence: full.confidence,
    isPeriodDelayed: full.isPeriodDelayed,
    daysOverdue: full.daysOverdue,
    isIrregular: full.isIrregular,
    insights: full.insights,
    view: full.view,
    aiEnhanced: full.aiEnhanced,
    transitionWarmup: cachedTransitionWarmup,
  });
  return;
}
```

---

## BUG 2 (🔴): GET /api/insights/forecast — cache hit misses transitionWarmup

**File:** `src/controllers/insightController.ts` → `getInsightsForecast()`

**Problem:** Same pattern — the cache-hit return sends `cached.forecast` directly, but `transitionWarmup` was appended after the payload was cached.

**Current code (broken):**
```typescript
if (cached?.forecast) {
  res.json(cached.forecast);
  return;
}
```

**Fix:**
```typescript
if (cached?.forecast) {
  const cachedUser = await prisma.user.findUnique({
    where: { id: req.userId! },
    select: { contraceptionChangedAt: true },
  });
  const cachedTransitionWarmup = cachedUser
    ? buildTransitionWarmup(cachedUser.contraceptionChangedAt ?? null)
    : null;

  res.json({ ...(cached.forecast as object), transitionWarmup: cachedTransitionWarmup });
  return;
}
```

---

## ALSO VERIFY: Prisma schema has contraceptionChangedAt

Make sure `prisma/schema.prisma` User model includes:
```prisma
contraceptionChangedAt DateTime?
```

And that the migration exists. If not, run:
```bash
npx prisma migrate dev --name add_contraception_changed_at
```

2 new bugs found — both are cache-hit issues with transitionWarmup:
The problem is that transitionWarmup is computed fresh and added to the response when insights/forecast are generated for the first time. But when the cache is hit on subsequent calls, the early-return path sends the cached payload directly — which doesn't include transitionWarmup. So the first call of the day shows the warmup message, but every call after that (from cache) silently drops it.
The fix is straightforward — do a lightweight select: { contraceptionChangedAt: true } user fetch in both cache-hit paths and compute the warmup before returning. The task file has the exact code for both locations.
One thing to verify on your end: make sure the Prisma schema actually has contraceptionChangedAt DateTime? on the User model and the migration has been run. The code references it in 4 places, so if the column doesn't exist in the database, you'll get a runtime crash.

---

## FILES TO MODIFY

1. `src/controllers/insightController.ts` — both cache-hit paths in getInsights() and getInsightsForecast()

## TESTING

1. Call `GET /api/insights` twice → verify `transitionWarmup` is present in BOTH responses (not just the first)
2. Call `GET /api/insights/forecast` twice → same check
3. For a user who recently changed contraception → verify warmup message appears on cached calls
4. For a user with no contraception change → verify `transitionWarmup: null` on both cached and fresh calls