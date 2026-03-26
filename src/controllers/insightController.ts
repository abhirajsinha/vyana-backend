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
import { getUserInsightData } from "../services/insightData";
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
  const data = await getUserInsightData(req.userId!);
  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { user, recentLogs, baselineLogs } = data;

  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, user.cycleLength);
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
  );
  const draftInsights = generateRuleBasedInsights(context);
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
  const memory = driverForMemory
    ? await getInsightMemoryCount({
        userId: req.userId!,
        driver: driverForMemory,
      })
    : { count: 0, lastSeen: null };
  const existingMemoryCount = memory.count;

  const currentPrimaryKey = resolvePrimaryInsightKey(context);

  const recentHistory = await prisma.insightHistory.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
    take: 3,
    select: { primaryKey: true },
  });

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
      },
    });
  }

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

  const hasStressIncrease = context.trends.some(
    (t) => t === "Stress increasing",
  );
  const hasSleepDecrease = context.trends.some((t) => t === "Sleep decreasing");
  const hasSleepIncrease = context.trends.some((t) => t === "Sleep increasing");
  const hasMoodDecrease = context.trends.some((t) => t === "Mood decreasing");
  const hasHighVariability =
    context.sleep_variability === "high" || context.mood_variability === "high";

  let tomorrowOutlook: string;
  if (context.priorityDrivers[0] === "sleep_variability_high") {
    tomorrowOutlook =
      "Recovery may still feel uneven tomorrow unless sleep timing stabilizes tonight.";
  } else if (
    context.priorityDrivers[0] === "stress_above_baseline" ||
    context.priorityDrivers[0] === "sleep_stress_amplification"
  ) {
    tomorrowOutlook =
      "Mental load may remain elevated tomorrow; short reset breaks can reduce carry-over strain.";
  } else if (context.priorityDrivers[0] === "bleeding_heavy") {
    tomorrowOutlook =
      "Energy may stay lower tomorrow while bleeding remains high; keep activity gentle and prioritize recovery.";
  } else if (hasStressIncrease && hasSleepDecrease) {
    tomorrowOutlook =
      "If current trends continue, tomorrow may feel heavier with lower recovery and higher stress sensitivity.";
  } else if (hasSleepIncrease && !hasStressIncrease) {
    tomorrowOutlook =
      "Recovery may improve slightly tomorrow if your current sleep trend continues.";
  } else if (hasMoodDecrease) {
    tomorrowOutlook =
      "Emotional load may remain sensitive tomorrow, so a lighter schedule can help stability.";
  } else {
    tomorrowOutlook = `Tomorrow is likely to feel ${context.confidenceScore >= 0.65 ? "fairly predictable" : "somewhat variable"} based on current trends.`;
  }

  if (hasHighVariability) {
    tomorrowOutlook +=
      " Recent variability suggests parts of the day may still feel unpredictable.";
  }

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
