import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  calculateCycleInfo,
  calculateCycleInfoForDate,
} from "../services/cycleEngine";
import {
  buildInsightContext,
  generateRuleBasedInsights,
} from "../services/insightService";
import { generateInsightsWithGpt, sanitizeInsights } from "../services/aiService";
import { getUserInsightData, getPreviousCycleDriverHistory } from "../services/insightData";
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

  // Bug 4 fix: read from daily cache before recomputing
  const cached = await prisma.insightCache.findUnique({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
  });
  if (cached?.payload && isInsightsPayloadCached(cached.payload)) {
    res.json(cached.payload);
    return;
  }

  const data = await getUserInsightData(req.userId!);
  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { user, recentLogs, baselineLogs } = data;

  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, user.cycleLength);
  const cycleNumber = getCycleNumber(user.lastPeriodStart, user.cycleLength);
  const variantIndex = (cycleNumber % 3) as 0 | 1 | 2;

  const phaseBaselineLogs = baselineLogs.filter((log) => {
    const logPhase = calculateCycleInfoForDate(
      user.lastPeriodStart,
      new Date(log.date),
      user.cycleLength,
    ).phase;
    return logPhase === cycleInfo.phase;
  });
  const hasPhaseBaseline = phaseBaselineLogs.length >= 7;
  const baselineForComparison = hasPhaseBaseline
    ? phaseBaselineLogs
    : baselineLogs;
  const baselineScope = hasPhaseBaseline
    ? "phase"
    : baselineForComparison.length >= 7
      ? "global"
      : "none";

  const context = buildInsightContext(
    cycleInfo.phase,
    cycleInfo.currentDay,
    recentLogs,
    baselineForComparison,
    baselineScope,
    cycleNumber,
  );

  const ruleBasedInsights = generateRuleBasedInsights(context);

  // Replace basic tomorrowPreview with trend-adjusted version (Sprint 4)
  const tomorrowPreview = buildTomorrowPreview(
    context,
    cycleInfo.daysUntilNextPhase,
    variantIndex,
  );
  let draftInsights = { ...ruleBasedInsights, tomorrowPreview };

  // Run correlation engine (Sprints 3 + 5)
  // Fetch 90 days of historical driver data for recurring pattern detection
  const previousCycleDrivers = context.mode === "personalized"
    ? await getPreviousCycleDriverHistory(req.userId!)
    : [];

  const correlation = runCorrelationEngine(context, recentLogs, previousCycleDrivers);

  // Inject correlation pattern into primary card if high enough confidence
  if (correlation.patternKey && correlation.confidence >= 0.7 && context.mode === "personalized") {
    const patternResult = correlation.patterns[correlation.patternKey]!;
    draftInsights = {
      ...draftInsights,
      // Use pattern headline as the primary insight (physical unless pattern points elsewhere)
      physicalInsight: patternResult.headline,
      solution: patternResult.action,
    };
  }

  const logsCount = recentLogs.length;
  const isNewUser = logsCount < 3;
  const nextMilestone =
    logsCount < 3 ? 3 : logsCount < 7 ? 7 : logsCount < 14 ? 14 : 30;

  let insights = draftInsights;
  let aiEnhanced = false;
  const canUseAI =
    logsCount >= 3 &&
    context.mode === "personalized" &&
    context.confidence !== "low";
  if (canUseAI) {
    try {
      const raw = await generateInsightsWithGpt(context, draftInsights, user.name);
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

  // Bug 1 fix: only read insightHistory when mode === "personalized" (saves a DB query for fallback users)
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
    insights = {
      ...insights,
      physicalInsight: `Sleep has been below your usual baseline for several days.\nThis can compound fatigue and slow recovery.`,
      solution: `Prioritize an earlier wind-down tonight and protect tomorrow morning for lighter tasks.`,
    };
  }

  // Critical drivers: never suppress physical insight as primary
  if (driverForMemory === "bleeding_heavy" || driverForMemory === "high_strain") {
    primaryKeyOverride = null;
  }

  const view = buildInsightView(context, insights, { primaryKeyOverride });

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
  };

  if (driverForMemory && context.mode === "personalized") {
    await recordInsightMemoryOccurrence({
      userId: req.userId!,
      driver: driverForMemory,
      now,
    });
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

  // Bug 4 fix: write to daily cache so subsequent same-day requests are served from cache
  const payloadJson = JSON.parse(JSON.stringify(responsePayload)) as Prisma.InputJsonValue;
  await prisma.insightCache.upsert({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
    update: { payload: payloadJson },
    create: { userId: req.userId!, date: dayStart, payload: payloadJson },
  });

  res.json(responsePayload);
}

export async function getInsightsForecast(
  req: Request,
  res: Response,
): Promise<void> {
  const now = new Date();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const cached = await prisma.insightCache.findUnique({
    where: {
      userId_date: {
        userId: req.userId!,
        date: dayStart,
      },
    },
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
  const { user, recentLogs, baselineLogs } = data;

  const todayCycle = calculateCycleInfo(user.lastPeriodStart, user.cycleLength);
  const cycleNumber = getCycleNumber(user.lastPeriodStart, user.cycleLength);
  const variantIndex = (cycleNumber % 3) as 0 | 1 | 2;

  const phaseBaselineLogs = baselineLogs.filter((log) => {
    const logPhase = calculateCycleInfoForDate(
      user.lastPeriodStart,
      new Date(log.date),
      user.cycleLength,
    ).phase;
    return logPhase === todayCycle.phase;
  });
  const hasPhaseBaseline = phaseBaselineLogs.length >= 7;
  const baselineForComparison = hasPhaseBaseline
    ? phaseBaselineLogs
    : baselineLogs;
  const baselineScope = hasPhaseBaseline
    ? "phase"
    : baselineForComparison.length >= 7
      ? "global"
      : "none";

  const context = buildInsightContext(
    todayCycle.phase,
    todayCycle.currentDay,
    recentLogs,
    baselineForComparison,
    baselineScope,
    cycleNumber,
  );

  const logsCount = recentLogs.length;
  const isNewUser = logsCount < 3;
  const nextMilestone =
    logsCount < 3 ? 3 : logsCount < 7 ? 7 : logsCount < 14 ? 14 : 30;

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowCycle = calculateCycleInfoForDate(
    user.lastPeriodStart,
    tomorrowDate,
    user.cycleLength,
  );

  // Use tomorrowEngine for the outlook (Sprint 4)
  const tomorrowOutlook = buildTomorrowPreview(
    context,
    todayCycle.daysUntilNextPhase,
    variantIndex,
  );

  const nextPhaseInDays = todayCycle.daysUntilNextPhase;
  const nextPhasePreview =
    nextPhaseInDays <= 2
      ? `Your next phase transition is expected in about ${nextPhaseInDays} day(s), so energy and mood patterns may start shifting soon.`
      : `Your current phase may continue for about ${nextPhaseInDays} day(s), with gradual changes expected near transition.`;

  const forecastConfidence =
    context.confidenceScore >= 0.75
      ? "high"
      : context.confidenceScore >= 0.5
        ? "medium"
        : "low";
  const confidenceMessage =
    forecastConfidence === "low"
      ? "Forecast confidence is low due to limited or unstable recent data; this outlook may change as more logs are added."
      : forecastConfidence === "medium"
        ? "Forecast confidence is moderate; recent signals are useful but may still shift over the next day."
        : "Forecast confidence is high; recent trends and signals are relatively consistent.";

  const forecastPayload = {
    isNewUser,
    progress: {
      logsCount,
      nextMilestone,
      logsToNextMilestone: Math.max(0, nextMilestone - logsCount),
    },
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
      nextPhase: {
        inDays: nextPhaseInDays,
        preview: nextPhasePreview,
      },
      confidence: {
        level: forecastConfidence,
        score: context.confidenceScore,
        message: confidenceMessage,
      },
    },
  };

  const forecastJson = JSON.parse(
    JSON.stringify(forecastPayload),
  ) as Prisma.InputJsonValue;

  await prisma.insightCache.upsert({
    where: {
      userId_date: {
        userId: req.userId!,
        date: dayStart,
      },
    },
    update: { forecast: forecastJson },
    create: {
      userId: req.userId!,
      date: dayStart,
      payload: {},
      forecast: forecastJson,
    },
  });

  res.json(forecastPayload);
}
