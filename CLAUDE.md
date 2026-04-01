# CLAUDE.md — Vyana Backend Context

## Repository
github.com/abhirajsinha/vyana-backend

## Stack
TypeScript / Node.js / Express / Prisma ORM / PostgreSQL (Supabase) / OpenAI GPT-4o-mini

---

## CURRENT TASK: Verify & Fix insightGuard Integration

### What was done
A new file `src/services/insightGuard.ts` was added — a post-generation guard layer that catches zero-data overconfidence, direction errors, contradictions, peak exaggeration, and hallucinations in insight text AFTER GPT rewrites.

The file `src/controllers/insightController.ts` was patched to call `applyAllGuards()` after `cleanupInsightText()` and before `buildInsightView()`.

### What needs verification

Run these checks IN ORDER. Fix anything that fails before moving to the next step.

---

#### Step 1: Verify insightGuard.ts exists and compiles

```bash
# Check file exists
ls -la src/services/insightGuard.ts

# Check it compiles standalone (no Prisma dependency — pure functions only)
npx tsc --noEmit src/services/insightGuard.ts
```

If the file is missing, it needs to be created. The file exports:
- `applyAllGuards(input)` — main pipeline, returns `{ insights, guardsApplied }`
- `getPhaseDirection(cycleDay, cycleLength)` — maps day to directional intent
- `validateZeroDataSafety(insights)` — test helper
- `validateDirectionCorrectness(insights, direction)` — test helper
- `validateConsistency(insights)` — test helper

It imports only from `./cycleEngine` (for the `Phase` type). No Prisma, no async, no side effects.

---

#### Step 2: Verify insightController.ts integration

Check these 4 things in `src/controllers/insightController.ts`:

**2a. Import exists (in the import section, near other service imports):**
```typescript
import { applyAllGuards } from "../services/insightGuard";
```

**2b. Guard call exists AFTER `cleanupInsightText` and BEFORE `buildInsightView`:**
```typescript
  insights = cleanupInsightText(insights);

  // ── Post-generation guard layer ──────────────────────────────────────────
  const guardResult = applyAllGuards({
    insights,
    cycleDay: cycleInfo.currentDay,
    cycleLength: effectiveCycleLength,
    phase: cycleInfo.phase,
    logsCount,
  });
  insights = guardResult.insights;

  const view = buildInsightView(context, insights, { primaryKeyOverride });
```

**2c. Guard logging exists (after cache upsert, before `res.json`):**
```typescript
  if (guardResult.guardsApplied.length > 0) {
    console.log(
      JSON.stringify({
        type: "insight_guard",
        userId: req.userId,
        cycleDay: cycleInfo.currentDay,
        phase: cycleInfo.phase,
        logsCount,
        guardsApplied: guardResult.guardsApplied,
        timestamp: new Date().toISOString(),
      }),
    );
  }
```

**2d. Guard is NOT in getInsightsForecast or getInsightsContext** (those have separate pipelines).

If any of these are wrong, fix them. The guard call must be exactly between `cleanupInsightText` and `buildInsightView` — nowhere else.

---

#### Step 3: Full compilation check

```bash
npx tsc --noEmit
```

Fix any type errors. The `insightGuard.ts` file uses a `DailyInsightsShape` interface that mirrors `DailyInsights` from `insightService.ts`. If there's a type mismatch, the guard's interface should match exactly:

```typescript
export interface DailyInsightsShape {
  physicalInsight: string;
  mentalInsight: string;
  emotionalInsight: string;
  whyThisIsHappening: string;
  solution: string;
  recommendation: string;
  tomorrowPreview: string;
}
```

If `DailyInsights` in `insightService.ts` has the same shape, you can either:
- Import `DailyInsights` from `insightService` in the guard file, OR
- Keep the separate interface (avoids circular dependency)

---

#### Step 4: Test with zero-data user

Start the server locally and hit the insights endpoint with a user who has 0 logs:

```bash
# Start server
npm run dev

# Hit insights for a zero-log user (use Priya or create a test user)
curl -s -H "Authorization: Bearer <token>" http://localhost:3000/api/insights | jq '.insights'
```

Check the output for these violations (NONE should be present after the guard):
- ❌ "Your energy is" (should be "Energy can feel" or "Energy can be")
- ❌ "Focus is lower today" (should be "Focus can feel lower")
- ❌ "at their peak" / "at its peak" (should be "tends to peak around this time")
- ❌ "at its fullest" / "effortless" (should be softened)
- ❌ "hit their monthly high" (should be "can reach their cycle high")
- ❌ "pelvic" / "tingling" (should be removed entirely)
- ❌ "hormone floor" (should be "lowest hormone levels")
- ❌ "LH surge" (should be "hormonal shift")
- ❌ "will" in tomorrowPreview (should be "may")

If ANY of these still appear, the guard is either not running or not in the right position. Check step 2b again.

---

#### Step 5: Test with high-data user (5+ logs)

Hit insights for a user with 7+ logs. The output should be ASSERTIVE and SPECIFIC:
- ✅ "Your sleep has dropped from 7h to 4.5h" — specific numbers preserved
- ✅ "Focus is harder than usual" — data-backed assertions preserved
- ✅ "Everything takes more effort" — kept when backed by logged data

The guard should NOT soften personalized insights. If it does, the `logsCount` parameter is being passed as 0 instead of the actual count. Check that `logsCount` in the guard call uses the variable already declared earlier in getInsights() as `const logsCount = recentLogs.length`.

---

#### Step 6: Run the 500-case test suite (if available)

```bash
npx ts-node src/testRunner/runTestCases.ts --source generated --batch 500
```

After completion, validate:
```bash
npx ts-node src/testRunner/validateResults.ts
```

Check that:
- No crash rate increase
- Phase correctness unchanged
- Forbidden language rate should DROP (the guard catches what GPT missed)

---

### Architecture Reference

#### Insight Pipeline (critical path)
```
GET /api/insights
  → getUserInsightData()           # Parallel fetch: user + logs
  → buildInsightContext()          # Signal processing, trends, drivers
  → generateRuleBasedInsights()    # Deterministic draft
  → softenForConfidenceTier()      # Pre-GPT zero-data softening
  → [GPT rewrite]                  # insightGptService.generateInsightsWithGpt()
  → softenDailyInsights()          # Post-GPT deterministic softening
  → cleanupInsightText()           # Dedup, contradiction check
  → applyAllGuards()              # ★ Post-generation enforcement layer
  → buildInsightView()            # View composition
  → cache + respond
```

#### insightGuard.ts — Guards (in execution order)
1. **Zero-data assertion guard** — "Energy is lower" → "Energy can feel lower" (logsCount=0 only)
2. **Direction guard** — blocks negatives during improving phases, positives during declining (logsCount=0 only)
3. **Intensity limiter** — caps "everything feels", "completely drained" (logsCount<3)
4. **Hallucination filter** — removes "pelvic", "tingling" sentences (logsCount=0 only)
5. **Technical language guard** — "hormone floor" → "lowest hormone levels", "LH surge" → "hormonal shift" (logsCount<3)
6. **Tomorrow softener** — "will" → "may", "hit" → "reach" (logsCount=0 only)
7. **Capitalization fix** — fixes broken caps from regex replacements (always)
8. **Consistency validator** — resolves contradictions between fields (logsCount<3 only)

Key design: HIGH-DATA USERS (5+ logs) pass through with minimal interference.

---

### Service Modules (quick reference)

| Module | Purpose |
|--------|---------|
| `insightGuard.ts` | Post-generation enforcement (NEW) |
| `insightService.ts` | Signal processing, rule-based insights, context building |
| `insightGptService.ts` | GPT rewrite, sanitization, guard checks |
| `insightCause.ts` | Primary cause detection (sleep/stress/stable/cycle) |
| `vyanaContext.ts` | 4-layer signal composition for GPT prompt |
| `cycleEngine.ts` | Phase calculation, cycle info |
| `contraceptionengine.ts` | Per-method behavioral rules |
| `hormoneengine.ts` | Phase→hormone approximation |
| `correlationEngine.ts` | Cross-signal pattern detection |
| `insightData.ts` | Data fetching, numeric baseline, cross-cycle narrative |
| `insightView.ts` | View composition (primary/supporting/action) |
| `insightMemory.ts` | Driver persistence tracking |
| `tomorrowEngine.ts` | Tomorrow preview with trend adjustment |
| `confidencelanguage.ts` | Deterministic softening, forbidden phrase detection |

### Key Conventions
- Frontend consumes `v2` response field; `view` is legacy
- All insight text: max 2 sentences per field
- Hormone language ONLY in `whyThisIsHappening`
- Zero-data: probabilistic framing only ("can", "may", "often", "typically")
- Test user: Priya (priya@vyana-test.com, ID priya-test-001)

### Production Optimizations
- PgBouncer pooled connection (port 6543)
- Colocate backend with Supabase region
- InsightCache with day-level TTL
- GPT circuit breaker (5 failures → 5min cooldown)