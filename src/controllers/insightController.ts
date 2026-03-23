import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { calculateCycleInfo, calculateCycleInfoForDate } from "../services/cycleEngine";
import { buildInsightContext, generateRuleBasedInsights } from "../services/insightService";
import { generateInsightsWithGpt } from "../services/aiService";

export async function getInsights(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const recentLogs = await prisma.dailyLog.findMany({
    where: { userId: req.userId },
    orderBy: { date: "desc" },
    take: 5,
  });
  const baselineLogs = await prisma.dailyLog.findMany({
    where: { userId: req.userId },
    orderBy: { date: "desc" },
    take: 30,
  });

  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, user.cycleLength);
  const phaseBaselineLogs = baselineLogs.filter((log) => {
    const logPhase = calculateCycleInfoForDate(user.lastPeriodStart, new Date(log.date), user.cycleLength).phase;
    return logPhase === cycleInfo.phase;
  });
  const hasPhaseBaseline = phaseBaselineLogs.length >= 7;
  const baselineForComparison = hasPhaseBaseline ? phaseBaselineLogs : baselineLogs;
  const baselineScope = hasPhaseBaseline
    ? "phase"
    : baselineForComparison.length >= 7
    ? "global"
    : "none";
  const context = buildInsightContext(cycleInfo.phase, recentLogs, baselineForComparison, baselineScope);
  const draftInsights = generateRuleBasedInsights(context);
  const logsCount = recentLogs.length;
  const isNewUser = logsCount < 3;
  const nextMilestone = logsCount < 3 ? 3 : logsCount < 7 ? 7 : logsCount < 14 ? 14 : 30;

  let insights = draftInsights;
  let aiEnhanced = false;
  try {
    insights = await generateInsightsWithGpt(context, draftInsights, user.name);
    aiEnhanced = JSON.stringify(insights) !== JSON.stringify(draftInsights);
  } catch {
    insights = draftInsights;
  }

  res.json({
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
  });
}

export async function getInsightsForecast(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const recentLogs = await prisma.dailyLog.findMany({
    where: { userId: req.userId },
    orderBy: { date: "desc" },
    take: 5,
  });
  const baselineLogs = await prisma.dailyLog.findMany({
    where: { userId: req.userId },
    orderBy: { date: "desc" },
    take: 30,
  });

  const todayCycle = calculateCycleInfo(user.lastPeriodStart, user.cycleLength);
  const phaseBaselineLogs = baselineLogs.filter((log) => {
    const logPhase = calculateCycleInfoForDate(user.lastPeriodStart, new Date(log.date), user.cycleLength).phase;
    return logPhase === todayCycle.phase;
  });
  const hasPhaseBaseline = phaseBaselineLogs.length >= 7;
  const baselineForComparison = hasPhaseBaseline ? phaseBaselineLogs : baselineLogs;
  const baselineScope = hasPhaseBaseline
    ? "phase"
    : baselineForComparison.length >= 7
    ? "global"
    : "none";

  const context = buildInsightContext(todayCycle.phase, recentLogs, baselineForComparison, baselineScope);
  const logsCount = recentLogs.length;
  const isNewUser = logsCount < 3;
  const nextMilestone = logsCount < 3 ? 3 : logsCount < 7 ? 7 : logsCount < 14 ? 14 : 30;
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowCycle = calculateCycleInfoForDate(user.lastPeriodStart, tomorrowDate, user.cycleLength);

  const hasStressIncrease = context.trends.some((t) => t === "Stress increasing");
  const hasSleepDecrease = context.trends.some((t) => t === "Sleep decreasing");
  const hasSleepIncrease = context.trends.some((t) => t === "Sleep increasing");
  const hasMoodDecrease = context.trends.some((t) => t === "Mood decreasing");
  const hasHighVariability = context.sleep_variability === "high" || context.mood_variability === "high";

  let tomorrowOutlook: string;
  if (context.priorityDrivers[0] === "sleep_variability_high") {
    tomorrowOutlook = "Recovery may still feel uneven tomorrow unless sleep timing stabilizes tonight.";
  } else if (context.priorityDrivers[0] === "stress_above_baseline" || context.priorityDrivers[0] === "sleep_stress_amplification") {
    tomorrowOutlook = "Mental load may remain elevated tomorrow; short reset breaks can reduce carry-over strain.";
  } else if (context.priorityDrivers[0] === "bleeding_heavy") {
    tomorrowOutlook = "Energy may stay lower tomorrow while bleeding remains high; keep activity gentle and prioritize recovery.";
  } else if (hasStressIncrease && hasSleepDecrease) {
    tomorrowOutlook = "If current trends continue, tomorrow may feel heavier with lower recovery and higher stress sensitivity.";
  } else if (hasSleepIncrease && !hasStressIncrease) {
    tomorrowOutlook = "Recovery may improve slightly tomorrow if your current sleep trend continues.";
  } else if (hasMoodDecrease) {
    tomorrowOutlook = "Emotional load may remain sensitive tomorrow, so a lighter schedule can help stability.";
  } else {
    tomorrowOutlook = `Tomorrow is likely to feel ${context.confidenceScore >= 0.65 ? "fairly predictable" : "somewhat variable"} based on current trends.`;
  }

  if (hasHighVariability) {
    tomorrowOutlook += " Recent variability suggests parts of the day may still feel unpredictable.";
  }

  const nextPhaseInDays = todayCycle.daysUntilNextPhase;
  const nextPhasePreview =
    nextPhaseInDays <= 2
      ? `Your next phase transition is expected in about ${nextPhaseInDays} day(s), so energy and mood patterns may start shifting soon.`
      : `Your current phase may continue for about ${nextPhaseInDays} day(s), with gradual changes expected near transition.`;

  const forecastConfidence =
    context.confidenceScore >= 0.75 ? "high" : context.confidenceScore >= 0.5 ? "medium" : "low";
  const confidenceMessage =
    forecastConfidence === "low"
      ? "Forecast confidence is low due to limited or unstable recent data; this outlook may change as more logs are added."
      : forecastConfidence === "medium"
      ? "Forecast confidence is moderate; recent signals are useful but may still shift over the next day."
      : "Forecast confidence is high; recent trends and signals are relatively consistent.";

  res.json({
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
  });
}
