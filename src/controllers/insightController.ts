import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  calculateCycleInfo,
  calculateCycleInfoForDate,
  getCycleMode,
} from "../services/cycleEngine";
import {
  buildInsightContext,
  buildCoreInsight,
  buildPatternReassurance,
  generateHook,
  generateRuleBasedInsights,
  type DailyInsightV2,
} from "../services/insightService";
import {
  generateForecastWithGpt,
  generateInsightsWithGpt,
  sanitizeInsights,
} from "../services/aiService";
import {
  getCyclePredictionContext,
  getUserInsightData,
  getPreviousCycleDriverHistory,
} from "../services/insightData";
import {
  buildInsightView,
  resolvePrimaryInsightKey,
  shouldSuppressPrimary,
  pickNovelPrimaryKey,
} from "../services/insightView";
import {
  getInsightMemoryCount,
  recordInsightMemoryOccurrence,
} from "../services/insightMemory";
import { getCycleNumber } from "../services/cycleInsightLibrary";
import { runCorrelationEngine } from "../services/correlationEngine";
import { buildTomorrowPreview } from "../services/tomorrowEngine";
import { buildPmsSymptomForecast } from "../services/pmsEngine";

function isInsightsPayloadCached(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "cycleDay" in payload &&
    "insights" in payload &&
    "view" in payload
  );
}

export async function getInsights(req: Request, res: Response): Promise<void> {
  const now = new Date();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const cached = await prisma.insightCache.findUnique({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
  });
  if (cached?.payload && isInsightsPayloadCached(cached.payload)) {
    res.json(cached.payload);
    return;
  }

  // ── Fetch rich data (upgraded: 90-day baseline + cross-cycle narrative) ──
  const data = await getUserInsightData(req.userId!);
  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { user, recentLogs, baselineLogs, numericBaseline, crossCycleNarrative } = data;

  const cycleMode = getCycleMode(user);
  const cyclePrediction = await getCyclePredictionContext(req.userId!, user.cycleLength);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;

  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);
  const cycleNumber = getCycleNumber(user.lastPeriodStart, effectiveCycleLength);
  const variantIndex = (cycleNumber % 3) as 0 | 1 | 2;

  const phaseBaselineLogs = baselineLogs.filter((log) => {
    const logPhase = calculateCycleInfoForDate(
      user.lastPeriodStart,
      new Date(log.date),
      effectiveCycleLength,
      cycleMode,
    ).phase;
    return logPhase === cycleInfo.phase;
  });
  const hasPhaseBaseline = phaseBaselineLogs.length >= 7;
  const baselineForComparison = hasPhaseBaseline ? phaseBaselineLogs : baselineLogs;
  const baselineScope = hasPhaseBaseline ? "phase" : baselineForComparison.length >= 7 ? "global" : "none";

  const context = buildInsightContext(
    cycleInfo.phase,
    cycleInfo.currentDay,
    recentLogs,
    baselineForComparison,
    baselineScope,
    cycleNumber,
    effectiveCycleLength,
    cycleMode,
    cyclePrediction.confidence,
  );

  const ruleBasedInsights = generateRuleBasedInsights(context);
  const tomorrowPreview = buildTomorrowPreview(context, cycleInfo.daysUntilNextPhase, variantIndex);
  let draftInsights = { ...ruleBasedInsights, tomorrowPreview };

  const previousCycleDrivers = context.mode === "personalized"
    ? await getPreviousCycleDriverHistory(req.userId!)
    : [];

  const correlation = runCorrelationEngine(context, recentLogs, previousCycleDrivers);

  if (correlation.patternKey && correlation.confidence >= 0.7 && context.mode === "personalized") {
    const patternResult = correlation.patterns[correlation.patternKey]!;
    const physicallyProtected =
      context.priorityDrivers.includes("bleeding_heavy") ||
      context.priorityDrivers.includes("high_strain");

    const cycleRecurrenceWhy = correlation.patternKey === "cycle_recurrence"
      ? (() => {
          const n = Math.max(2, Math.round((correlation.patterns.cycle_recurrence.confidence - 0.5) / 0.15));
          return `Your last ${n} cycles show the same pattern in this window — sleep drops and stress rise together around this time.`;
        })()
      : `Your past cycles show this pattern: ${patternResult.headline.toLowerCase().replace(/\.$/, "")}.`;

    if (!physicallyProtected) {
      draftInsights = {
        ...draftInsights,
        physicalInsight: patternResult.headline,
        solution: patternResult.action,
        whyThisIsHappening: cycleRecurrenceWhy,
      };
    } else {
      draftInsights = {
        ...draftInsights,
        solution: patternResult.action,
        whyThisIsHappening: cycleRecurrenceWhy,
      };
    }
  }

  // ── Inject cross-cycle narrative into whyThisIsHappening if available ──
  if (crossCycleNarrative?.narrativeStatement && context.mode === "personalized") {
    const narrativeSuffix = crossCycleNarrative.trend === "worsening"
      ? " This window has been getting harder across your recent cycles."
      : crossCycleNarrative.trend === "improving"
      ? " The good news: this window has been getting easier across your recent cycles."
      : "";
    draftInsights = {
      ...draftInsights,
      whyThisIsHappening: draftInsights.whyThisIsHappening.includes("last")
        ? draftInsights.whyThisIsHappening
        : `${draftInsights.whyThisIsHappening} ${crossCycleNarrative.narrativeStatement}${narrativeSuffix}`.trim(),
    };
  }

  const logsCount = recentLogs.length;
  const isNewUser = logsCount < 3;
  const nextMilestone = logsCount < 3 ? 3 : logsCount < 7 ? 7 : logsCount < 14 ? 14 : 30;

  let insights = draftInsights;
  let aiEnhanced = false;
  const canUseAI = logsCount >= 3 && context.mode === "personalized" && context.confidence !== "low";

  if (canUseAI) {
    try {
      // ── Pass real user numbers and cross-cycle narrative to GPT ──
      const raw = await generateInsightsWithGpt(
        context,
        draftInsights,
        numericBaseline,
        crossCycleNarrative,
        user.name,
      );
      insights = sanitizeInsights(raw, draftInsights);
      aiEnhanced = JSON.stringify(insights) !== JSON.stringify(draftInsights);
    } catch {
      insights = draftInsights;
    }
  }

  const driverForMemory = context.priorityDrivers[0] || null;
  const memory = driverForMemory && context.mode === "personalized"
    ? await getInsightMemoryCount({ userId: req.userId!, driver: driverForMemory })
    : { count: 0, lastSeen: null };
  const existingMemoryCount = memory.count;

  const currentPrimaryKey = resolvePrimaryInsightKey(context);

  const recentHistory = context.mode === "personalized"
    ? await prisma.insightHistory.findMany({
        where: { userId: req.userId! },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { primaryKey: true },
      })
    : [];

  let primaryKeyOverride: typeof currentPrimaryKey | null = null;
  if (context.mode === "personalized" && shouldSuppressPrimary(currentPrimaryKey, recentHistory)) {
    primaryKeyOverride = pickNovelPrimaryKey(currentPrimaryKey, recentHistory, driverForMemory);
  }

  // ── Memory-based insight escalation (unchanged) ──
  if (driverForMemory === "stress_above_baseline" && context.mode === "personalized") {
    if (existingMemoryCount <= 1) {
      insights = {
        ...insights,
        mentalInsight: `Stress levels appear elevated today.\nThis may make focusing harder than usual.`,
        solution: `Stress may be affecting you today.\nShort breaks can help.`,
        recommendation: `This week, keep a steady routine and add brief stress resets when you notice overload.`,
      };
    } else if (existingMemoryCount <= 3) {
      insights = {
        ...insights,
        mentalInsight: `Stress has been consistent across recent days.\nMental load may be building up.`,
        solution: `Stress has been consistent recently.\nReducing your workload slightly may help.`,
        recommendation: `Consider lighter pacing this week and protect recovery time so stress doesn't carry over.`,
      };
    } else {
      insights = {
        ...insights,
        mentalInsight: `Stress has been persistent over several days.\nThis may be increasing overall mental load.`,
        solution: `Stress has been persistent for several days.\nStepping back and prioritizing recovery can help.`,
        recommendation: `For the next few days, prioritize recovery anchors (sleep consistency, gentle movement, and reduced decision load).`,
      };
    }
  }

  if (driverForMemory === "sleep_below_baseline" && context.mode === "personalized" && existingMemoryCount > 3) {
    const sleepNote = numericBaseline.recentSleepAvg !== null && numericBaseline.baselineSleepAvg !== null
      ? `Sleep has dropped to ${numericBaseline.recentSleepAvg}h — ${Math.abs(numericBaseline.sleepDelta ?? 0)}h below your usual ${numericBaseline.baselineSleepAvg}h.`
      : `Sleep has been below your usual baseline for several days.`;
    insights = {
      ...insights,
      physicalInsight: `${sleepNote}\nThis can compound fatigue and slow recovery.`,
      solution: `Prioritize an earlier wind-down tonight and protect tomorrow morning for lighter tasks.`,
    };
  }

  if (driverForMemory === "bleeding_heavy" || driverForMemory === "high_strain") {
    primaryKeyOverride = null;
  }

  const view = buildInsightView(context, insights, { primaryKeyOverride });
  const hook = generateHook(driverForMemory, context, correlation.patternKey);
  const core = buildCoreInsight(insights, context);
  const pattern = buildPatternReassurance(context, correlation.patternKey);
  const v2: DailyInsightV2 = {
    hook,
    core,
    pattern,
    why: insights.whyThisIsHappening,
    action: insights.solution,
    guidance: insights.recommendation,
    tomorrow: insights.tomorrowPreview,
    confidenceLabel: view.confidenceLabel,
  };

  const pmsForecastForWarning = cycleInfo.currentDay >= 18 && context.mode === "personalized"
    ? buildPmsSymptomForecast(
        cycleInfo.phase,
        cycleInfo.currentDay,
        cycleInfo.daysUntilNextPhase,
        previousCycleDrivers,
      )
    : null;
  const pmsWarning = pmsForecastForWarning?.available
    ? {
        headline: pmsForecastForWarning.headline,
        action: pmsForecastForWarning.action,
        likelySymptoms: pmsForecastForWarning.likelySymptoms,
        confidence: pmsForecastForWarning.confidence,
      }
    : null;

  const responsePayload = {
    cycleDay: cycleInfo.currentDay,
    home: {
      phase: cycleInfo.phase,
      currentDay: cycleInfo.currentDay,
      isNewUser,
      primaryDriver: context.priorityDrivers[0] || null,
      logsToNextMilestone: Math.max(0, nextMilestone - logsCount),
      confidence: context.confidence,
    },
    isNewUser,
    progress: {
      logsCount,
      nextMilestone,
      logsToNextMilestone: Math.max(0, nextMilestone - logsCount),
    },
    mode: context.mode,
    confidence: context.confidence,
    cycleContext: {
      cycleMode,
      cyclePredictionConfidence: cyclePrediction.confidence,
      nextPeriodEstimate: cycleInfo.nextPeriodDate.toISOString().split("T")[0],
      nextPeriodRange:
        cyclePrediction.confidence === "variable" || cyclePrediction.confidence === "irregular"
          ? {
              earliest: new Date(cycleInfo.nextPeriodDate.getTime() - cyclePrediction.stdDev * 86400000)
                .toISOString().split("T")[0],
              latest: new Date(cycleInfo.nextPeriodDate.getTime() + cyclePrediction.stdDev * 86400000)
                .toISOString().split("T")[0],
            }
          : undefined,
    },
    // ── New: expose numeric baseline so frontend can show real numbers ──
    numericSummary: {
      recentSleepAvg: numericBaseline.recentSleepAvg,
      baselineSleepAvg: numericBaseline.baselineSleepAvg,
      sleepDelta: numericBaseline.sleepDelta,
      recentStressLabel: numericBaseline.recentStressAvg !== null
        ? (numericBaseline.recentStressAvg >= 2.4 ? "elevated" : numericBaseline.recentStressAvg >= 1.6 ? "moderate" : "calm")
        : null,
      recentMoodLabel: numericBaseline.recentMoodAvg !== null
        ? (numericBaseline.recentMoodAvg >= 2.4 ? "positive" : numericBaseline.recentMoodAvg <= 1.6 ? "low" : "neutral")
        : null,
    },
    // ── New: expose cross-cycle narrative ──
    crossCycleNarrative: crossCycleNarrative ? {
      matchingCycles: crossCycleNarrative.matchingCycles,
      totalCyclesAnalyzed: crossCycleNarrative.totalCyclesAnalyzed,
      narrativeStatement: crossCycleNarrative.narrativeStatement,
      trend: crossCycleNarrative.trend,
    } : null,
    aiEnhanced,
    correlationPattern: correlation.patternKey,
    basedOn: {
      phase: cycleInfo.phase,
      recentLogsCount: logsCount,
      confidenceScore: context.confidenceScore,
      baselineDeviation: context.baselineDeviation,
      baselineScope: context.baselineScope,
      priorityDrivers: context.priorityDrivers,
      interactionFlags: context.interaction_flags,
      trends: context.trends,
      reasoning: context.reasoning,
    },
    insights,
    view,
    v2,
    pmsWarning,
  };

  if (driverForMemory && context.mode === "personalized") {
    await recordInsightMemoryOccurrence({ userId: req.userId!, driver: driverForMemory, now });
  }

  if (context.mode === "personalized") {
    const resolvedPrimaryKey = primaryKeyOverride ?? currentPrimaryKey;
    await prisma.insightHistory.create({
      data: {
        userId: req.userId!,
        primaryKey: resolvedPrimaryKey,
        driver: driverForMemory,
        cycleDay: cycleInfo.currentDay,
        phase: cycleInfo.phase,
      },
    });
  }

  const payloadJson = JSON.parse(JSON.stringify(responsePayload)) as Prisma.InputJsonValue;
  await prisma.insightCache.upsert({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
    update: { payload: payloadJson },
    create: { userId: req.userId!, date: dayStart, payload: payloadJson },
  });

  res.json(responsePayload);
}

export async function getInsightsForecast(req: Request, res: Response): Promise<void> {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const cached = await prisma.insightCache.findUnique({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
  });
  if (cached?.forecast) {
    res.json(cached.forecast);
    return;
  }

  const data = await getUserInsightData(req.userId!);
  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { user, recentLogs, baselineLogs, numericBaseline, crossCycleNarrative } = data;

  const cycleMode = getCycleMode(user);
  const cyclePrediction = await getCyclePredictionContext(req.userId!, user.cycleLength);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;

  const todayCycle = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);
  const cycleNumber = getCycleNumber(user.lastPeriodStart, effectiveCycleLength);
  const variantIndex = (cycleNumber % 3) as 0 | 1 | 2;

  const phaseBaselineLogs = baselineLogs.filter((log) => {
    const logPhase = calculateCycleInfoForDate(
      user.lastPeriodStart,
      new Date(log.date),
      effectiveCycleLength,
      cycleMode,
    ).phase;
    return logPhase === todayCycle.phase;
  });
  const hasPhaseBaseline = phaseBaselineLogs.length >= 7;
  const baselineForComparison = hasPhaseBaseline ? phaseBaselineLogs : baselineLogs;
  const baselineScope = hasPhaseBaseline ? "phase" : baselineForComparison.length >= 7 ? "global" : "none";

  const context = buildInsightContext(
    todayCycle.phase,
    todayCycle.currentDay,
    recentLogs,
    baselineForComparison,
    baselineScope,
    cycleNumber,
    effectiveCycleLength,
    cycleMode,
    cyclePrediction.confidence,
  );

  const logsCount = recentLogs.length;
  const isNewUser = logsCount < 3;
  const nextMilestone = logsCount < 3 ? 3 : logsCount < 7 ? 7 : logsCount < 14 ? 14 : 30;

  const forecastPreviousCycleDrivers = context.mode === "personalized"
    ? await getPreviousCycleDriverHistory(req.userId!)
    : [];

  const pmsSymptomForecast = buildPmsSymptomForecast(
    todayCycle.phase,
    todayCycle.currentDay,
    todayCycle.daysUntilNextPhase,
    forecastPreviousCycleDrivers,
  );

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowCycle = calculateCycleInfoForDate(
    user.lastPeriodStart,
    tomorrowDate,
    effectiveCycleLength,
    cycleMode,
  );

  const tomorrowOutlook = buildTomorrowPreview(context, todayCycle.daysUntilNextPhase, variantIndex);

  const nextPhaseInDays = todayCycle.daysUntilNextPhase;
  const nextPhasePreview =
    nextPhaseInDays <= 2
      ? `Your next phase transition is expected in about ${nextPhaseInDays} day(s), so energy and mood patterns may start shifting soon.`
      : `Your current phase may continue for about ${nextPhaseInDays} day(s), with gradual changes expected near transition.`;

  const forecastConfidence =
    context.confidenceScore >= 0.75 ? "high" : context.confidenceScore >= 0.5 ? "medium" : "low";
  const confidenceMessage =
    forecastConfidence === "low"
      ? "Forecast confidence is low due to limited recent data; this outlook will sharpen as more logs are added."
      : forecastConfidence === "medium"
      ? "Forecast confidence is moderate; recent signals are useful but may still shift."
      : "Forecast confidence is high; recent trends and signals are consistent.";

  const draftForecastPayload = {
    isNewUser,
    progress: { logsCount, nextMilestone, logsToNextMilestone: Math.max(0, nextMilestone - logsCount) },
    today: {
      phase: todayCycle.phase,
      currentDay: todayCycle.currentDay,
      confidenceScore: context.confidenceScore,
      priorityDrivers: context.priorityDrivers,
    },
    forecast: {
      tomorrow: {
        date: tomorrowDate.toISOString().split("T")[0],
        phase: tomorrowCycle.phase,
        outlook: tomorrowOutlook,
      },
      nextPhase: { inDays: nextPhaseInDays, preview: nextPhasePreview },
      confidence: { level: forecastConfidence, score: context.confidenceScore, message: confidenceMessage },
    },
    pmsSymptomForecast,
    // Expose numeric summary in forecast too
    numericSummary: {
      recentSleepAvg: numericBaseline.recentSleepAvg,
      baselineSleepAvg: numericBaseline.baselineSleepAvg,
      sleepDelta: numericBaseline.sleepDelta,
    },
    crossCycleNarrative: crossCycleNarrative ? {
      narrativeStatement: crossCycleNarrative.narrativeStatement,
      trend: crossCycleNarrative.trend,
    } : null,
  };

  let forecastPayload: (typeof draftForecastPayload & { forecastAiEnhanced?: boolean }) | Record<string, unknown> =
    draftForecastPayload;
  let forecastAiEnhanced = false;

  const canUseAIForecast = logsCount >= 3 && context.mode === "personalized" && context.confidence !== "low";
  if (canUseAIForecast) {
    const rewritten = await generateForecastWithGpt(
      context,
      draftForecastPayload,
      numericBaseline,
      crossCycleNarrative,
      user.name,
    ) as typeof draftForecastPayload;
    forecastAiEnhanced = JSON.stringify(rewritten) !== JSON.stringify(draftForecastPayload);
    forecastPayload = { ...rewritten, forecastAiEnhanced };
  } else {
    forecastPayload = { ...draftForecastPayload, forecastAiEnhanced: false };
  }

  const forecastJson = JSON.parse(JSON.stringify(forecastPayload)) as Prisma.InputJsonValue;
  await prisma.insightCache.upsert({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
    update: { forecast: forecastJson },
    create: { userId: req.userId!, date: dayStart, payload: {}, forecast: forecastJson },
  });

  res.json(forecastPayload);
}