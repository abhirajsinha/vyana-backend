// ─────────────────────────────────────────────────────────────────────────────
// This file shows the KEY CHANGES to insightController.ts.
// Replace/merge these sections into your existing insightController.ts.
// ─────────────────────────────────────────────────────────────────────────────
//
// New imports to add at the top of insightController.ts:
//
// import { buildHormoneState, buildHormoneLanguage } from "../services/hormoneEngine";
// import { getContraceptionBehavior, checkForecastEligibility, computeLogSpanDays, ContraceptionType } from "../services/contraceptionEngine";
// import { softendeterministic, CERTAINTY_RULES_FOR_GPT, getForecastConfidenceLabel } from "../services/confidenceLanguage";
//
// ─────────────────────────────────────────────────────────────────────────────

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
  buildMemoryContext,
} from "../services/insightMemory";
import { getCycleNumber } from "../services/cycleInsightLibrary";
import { runCorrelationEngine } from "../services/correlationEngine";
import { buildTomorrowPreview } from "../services/tomorrowEngine";
import { buildPmsSymptomForecast } from "../services/pmsEngine";
import { buildHormoneState, buildHormoneLanguage } from "../services/hormoneengine";
import {
  getContraceptionBehavior,
  checkForecastEligibility,
  computeLogSpanDays,
  type ContraceptionType,
} from "../services/contraceptionengine";
import {
  softendeterministic,
  CERTAINTY_RULES_FOR_GPT,
  getForecastConfidenceLabel,
  containsForbiddenLanguage,
} from "../utils/confidencelanguage";

function isInsightsPayloadCached(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "cycleDay" in payload &&
    "insights" in payload &&
    "view" in payload
  );
}

// ─── Helper: resolve contraception type from user ─────────────────────────────

function resolveContraceptionType(user: { contraceptiveMethod: string | null }): ContraceptionType {
  const method = user.contraceptiveMethod?.toLowerCase() ?? "none";

  const map: Record<string, ContraceptionType> = {
    pill: "combined_pill",
    combined_pill: "combined_pill",
    mini_pill: "mini_pill",
    iud_hormonal: "iud_hormonal",
    iud_copper: "iud_copper",
    implant: "implant",
    injection: "injection",
    patch: "patch",
    ring: "ring",
    condom: "barrier",
    barrier: "barrier",
    natural: "natural",
    none: "none",
  };

  return map[method] ?? "none";
}

// ─── GET /api/insights ────────────────────────────────────────────────────────

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

  const data = await getUserInsightData(req.userId!);
  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { user, recentLogs, baselineLogs, numericBaseline, crossCycleNarrative } = data;

  // ── Contraception routing ──────────────────────────────────────────────────
  const contraceptionType = resolveContraceptionType(user);
  const contraceptionBehavior = getContraceptionBehavior(contraceptionType);

  const completedCycleCount = await prisma.cycleHistory.count({
    where: { userId: req.userId!, endDate: { not: null }, cycleLength: { not: null } },
  });

  const cycleMode = getCycleMode(user);
  const cyclePrediction = await getCyclePredictionContext(req.userId!, user.cycleLength);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;

  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);
  const cycleNumber = getCycleNumber(user.lastPeriodStart, effectiveCycleLength);
  const variantIndex = (cycleNumber % 3) as 0 | 1 | 2;

  // ── Hormone state ──────────────────────────────────────────────────────────
  const hormoneState = buildHormoneState(
    cycleInfo.phase,
    cycleInfo.currentDay,
    effectiveCycleLength,
    cycleMode,
    contraceptionType,
  );
  const hormoneLanguage = contraceptionBehavior.showHormoneCurves
    ? buildHormoneLanguage(hormoneState, cyclePrediction.confidence === "reliable" ? 0.8 : 0.5)
    : null;

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

  // ── Inject hormone context into whyThisIsHappening ────────────────────────
  if (hormoneLanguage && context.mode === "personalized") {
    // Only inject if whyThisIsHappening doesn't already have specific signal reasoning
    const hasSpecificReason =
      draftInsights.whyThisIsHappening.includes("sleep") ||
      draftInsights.whyThisIsHappening.includes("stress") ||
      draftInsights.whyThisIsHappening.includes("strain");

    if (!hasSpecificReason) {
      draftInsights = {
        ...draftInsights,
        whyThisIsHappening: `${draftInsights.whyThisIsHappening} ${hormoneLanguage}`.trim(),
      };
    }
  }

  // ── For hormonal contraception: override insight tone ──────────────────────
  if (contraceptionBehavior.insightTone === "pattern-based" || contraceptionBehavior.insightTone === "symptom-based") {
    // Replace phase-based language with pattern-based framing
    draftInsights = {
      ...draftInsights,
      whyThisIsHappening: draftInsights.whyThisIsHappening
        .replace(/\bthis phase\b/gi, "your recent patterns")
        .replace(/\bin this phase\b/gi, "based on your recent logs")
        .replace(/\bduring this phase\b/gi, "based on what you've been logging"),
    };
  }

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
      draftInsights = { ...draftInsights, physicalInsight: patternResult.headline, solution: patternResult.action, whyThisIsHappening: cycleRecurrenceWhy };
    } else {
      draftInsights = { ...draftInsights, solution: patternResult.action, whyThisIsHappening: cycleRecurrenceWhy };
    }
  }

  if (crossCycleNarrative?.narrativeStatement && context.mode === "personalized") {
    const narrativeSuffix = crossCycleNarrative.trend === "worsening"
      ? " This window has been getting harder across your recent cycles."
      : crossCycleNarrative.trend === "improving"
      ? " The good news: this window has been getting easier across your recent cycles."
      : "";
    if (!draftInsights.whyThisIsHappening.includes("last")) {
      draftInsights = {
        ...draftInsights,
        whyThisIsHappening: `${draftInsights.whyThisIsHappening} ${crossCycleNarrative.narrativeStatement}${narrativeSuffix}`.trim(),
      };
    }
  }

  // ── Enforce non-deterministic language on all draft insights ─────────────
  draftInsights = {
    physicalInsight: softendeterministic(draftInsights.physicalInsight, context.confidenceScore),
    mentalInsight: softendeterministic(draftInsights.mentalInsight, context.confidenceScore),
    emotionalInsight: softendeterministic(draftInsights.emotionalInsight, context.confidenceScore),
    whyThisIsHappening: softendeterministic(draftInsights.whyThisIsHappening, context.confidenceScore),
    solution: draftInsights.solution, // Actions are direct — don't soften
    recommendation: draftInsights.recommendation, // Same
    tomorrowPreview: softendeterministic(draftInsights.tomorrowPreview, context.confidenceScore),
  };

  const logsCount = recentLogs.length;
  const isNewUser = logsCount < 3;
  const nextMilestone = logsCount < 3 ? 3 : logsCount < 7 ? 7 : logsCount < 14 ? 14 : 30;

  const driverForMemory = context.priorityDrivers[0] || null;
  const memory = driverForMemory && context.mode === "personalized"
    ? await getInsightMemoryCount({ userId: req.userId!, driver: driverForMemory })
    : { count: 0, lastSeen: null };
  const existingMemoryCount = memory.count;
  const memoryContext = driverForMemory
    ? buildMemoryContext(driverForMemory, existingMemoryCount)
    : null;

  let insights = draftInsights;
  let aiEnhanced = false;

  // ── Improved GPT gating: signal richness, not just count ─────────────────
  const logSpanDays = computeLogSpanDays(recentLogs);
  const hasSignalRichness =
    logsCount >= 3 &&
    logSpanDays >= 2 &&
    (numericBaseline.recentSleepAvg !== null ||
      numericBaseline.recentStressAvg !== null ||
      numericBaseline.recentMoodAvg !== null);

  const canUseAI =
    hasSignalRichness &&
    context.mode === "personalized" &&
    context.confidence !== "low";

  if (canUseAI) {
    try {
      const raw = await generateInsightsWithGpt(
        context,
        draftInsights,
        numericBaseline,
        crossCycleNarrative,
        user.name,
        contraceptionBehavior.insightTone,
      );
      const candidate = sanitizeInsights(raw, draftInsights);

      // Final guard: reject if GPT introduced deterministic language
      const hasForbidden = Object.values(candidate).some((v) =>
        typeof v === "string" && containsForbiddenLanguage(v)
      );

      if (!hasForbidden) {
        insights = candidate;
        aiEnhanced = JSON.stringify(insights) !== JSON.stringify(draftInsights);
      }
    } catch {
      insights = draftInsights;
    }
  }

  if (driverForMemory === "stress_above_baseline" && context.mode === "personalized") {
    if (existingMemoryCount <= 1) {
      insights = { ...insights, mentalInsight: `Stress levels appear elevated today.\nThis may make focusing harder than usual.`, solution: `Stress may be affecting you today.\nShort breaks can help.`, recommendation: `This week, keep a steady routine and add brief stress resets when you notice overload.` };
    } else if (existingMemoryCount <= 3) {
      insights = { ...insights, mentalInsight: `Stress has been consistent for ${existingMemoryCount} days now.\nMental load may be building up.`, solution: `Stress has been consistent recently.\nReducing your workload slightly may help.`, recommendation: `Consider lighter pacing this week and protect recovery time so stress doesn't carry over.` };
    } else {
      insights = { ...insights, mentalInsight: `Stress has been persistent for ${existingMemoryCount} days — your body is registering this.\nThis level of sustained load matters.`, solution: `Stepping back and prioritizing recovery is the right call now.`, recommendation: `For the next few days, prioritize recovery anchors: sleep consistency, gentle movement, and reduced decision load.` };
    }
  }

  if (driverForMemory === "sleep_below_baseline" && context.mode === "personalized" && existingMemoryCount > 3) {
    const sleepNote = numericBaseline.recentSleepAvg !== null && numericBaseline.baselineSleepAvg !== null
      ? `Sleep has dropped to ${numericBaseline.recentSleepAvg}h — ${Math.abs(numericBaseline.sleepDelta ?? 0)}h below your usual ${numericBaseline.baselineSleepAvg}h for ${existingMemoryCount} days.`
      : `Sleep has been below your usual baseline for ${existingMemoryCount} days.`;
    insights = { ...insights, physicalInsight: `${sleepNote}\nThis can compound fatigue and slow recovery.`, solution: `Prioritize an earlier wind-down tonight and protect tomorrow morning for lighter tasks.` };
  }

  const currentPrimaryKey = resolvePrimaryInsightKey(context);
  const recentHistory = context.mode === "personalized"
    ? await prisma.insightHistory.findMany({ where: { userId: req.userId! }, orderBy: { createdAt: "desc" }, take: 3, select: { primaryKey: true } })
    : [];

  let primaryKeyOverride: typeof currentPrimaryKey | null = null;
  if (context.mode === "personalized" && shouldSuppressPrimary(currentPrimaryKey, recentHistory)) {
    primaryKeyOverride = pickNovelPrimaryKey(currentPrimaryKey, recentHistory, driverForMemory);
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

  // ── PMS forecast — gated by contraception behavior ────────────────────────
  let pmsWarning = null;
  if (contraceptionBehavior.showPmsForecast) {
    const pmsForecastForWarning = cycleInfo.currentDay >= 18 && context.mode === "personalized"
      ? buildPmsSymptomForecast(cycleInfo.phase, cycleInfo.currentDay, cycleInfo.daysUntilNextPhase, previousCycleDrivers, completedCycleCount)
      : null;
    const pmsWarmupEarly = cycleInfo.phase === "luteal" && cycleInfo.currentDay < 18 && completedCycleCount < 2
      ? buildPmsSymptomForecast(cycleInfo.phase, cycleInfo.currentDay, cycleInfo.daysUntilNextPhase, previousCycleDrivers, completedCycleCount)
      : null;

    pmsWarning = pmsForecastForWarning && "available" in pmsForecastForWarning && pmsForecastForWarning.available
      ? { available: true, headline: (pmsForecastForWarning as any).headline, action: (pmsForecastForWarning as any).action, likelySymptoms: (pmsForecastForWarning as any).likelySymptoms, confidence: (pmsForecastForWarning as any).confidence }
      : pmsForecastForWarning && "warmup" in pmsForecastForWarning
      ? pmsForecastForWarning
      : pmsWarmupEarly && "warmup" in pmsWarmupEarly
      ? pmsWarmupEarly
      : null;
  }

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
    progress: { logsCount, nextMilestone, logsToNextMilestone: Math.max(0, nextMilestone - logsCount) },
    mode: context.mode,
    confidence: context.confidence,
    cycleContext: {
      cycleMode,
      cyclePredictionConfidence: cyclePrediction.confidence,
      nextPeriodEstimate: contraceptionBehavior.showPeriodForecast
        ? cycleInfo.nextPeriodDate.toISOString().split("T")[0]
        : null,
      nextPeriodRange:
        contraceptionBehavior.showPeriodForecast &&
        (cyclePrediction.confidence === "variable" || cyclePrediction.confidence === "irregular")
          ? {
              earliest: new Date(cycleInfo.nextPeriodDate.getTime() - cyclePrediction.stdDev * 86400000).toISOString().split("T")[0],
              latest: new Date(cycleInfo.nextPeriodDate.getTime() + cyclePrediction.stdDev * 86400000).toISOString().split("T")[0],
            }
          : undefined,
    },
    // ── Hormone context (new) ──────────────────────────────────────────────
    hormoneContext: contraceptionBehavior.showHormoneCurves ? {
      estrogen: hormoneState.estrogen,
      progesterone: hormoneState.progesterone,
      lh: hormoneState.lh,
      fsh: hormoneState.fsh,
      confidence: hormoneState.confidence,
      // IMPORTANT: Never expose this as "your levels are X"
      // Frontend must frame this as "typically" or "often associated with"
      narrativeContext: hormoneLanguage,
    } : null,
    // ── Contraception context (new) ────────────────────────────────────────
    contraceptionContext: {
      type: contraceptionType,
      contextMessage: contraceptionBehavior.contextMessage || null,
      insightTone: contraceptionBehavior.insightTone,
      showPhaseInsights: contraceptionBehavior.useNaturalCycleEngine,
    },
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
    crossCycleNarrative: crossCycleNarrative
      ? { matchingCycles: crossCycleNarrative.matchingCycles, totalCyclesAnalyzed: crossCycleNarrative.totalCyclesAnalyzed, narrativeStatement: crossCycleNarrative.narrativeStatement, trend: crossCycleNarrative.trend }
      : null,
    memoryContext,
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
      data: { userId: req.userId!, primaryKey: resolvedPrimaryKey, driver: driverForMemory, cycleDay: cycleInfo.currentDay, phase: cycleInfo.phase },
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

// ─── GET /api/insights/forecast ──────────────────────────────────────────────

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

  // ── Contraception routing ──────────────────────────────────────────────────
  const contraceptionType = resolveContraceptionType(user);
  const contraceptionBehavior = getContraceptionBehavior(contraceptionType);

  const completedCycleCount = await prisma.cycleHistory.count({
    where: { userId: req.userId!, endDate: { not: null }, cycleLength: { not: null } },
  });

  const cycleMode = getCycleMode(user);
  const cyclePrediction = await getCyclePredictionContext(req.userId!, user.cycleLength);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;
  const todayCycle = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);
  const cycleNumber = getCycleNumber(user.lastPeriodStart, effectiveCycleLength);
  const variantIndex = (cycleNumber % 3) as 0 | 1 | 2;

  const phaseBaselineLogs = baselineLogs.filter((log) => {
    const logPhase = calculateCycleInfoForDate(user.lastPeriodStart, new Date(log.date), effectiveCycleLength, cycleMode).phase;
    return logPhase === todayCycle.phase;
  });
  const hasPhaseBaseline = phaseBaselineLogs.length >= 7;
  const baselineForComparison = hasPhaseBaseline ? phaseBaselineLogs : baselineLogs;
  const baselineScope = hasPhaseBaseline ? "phase" : baselineForComparison.length >= 7 ? "global" : "none";

  const context = buildInsightContext(
    todayCycle.phase, todayCycle.currentDay, recentLogs, baselineForComparison,
    baselineScope, cycleNumber, effectiveCycleLength, cycleMode, cyclePrediction.confidence,
  );

  const logsCount = recentLogs.length;
  const isNewUser = logsCount < 3;
  const nextMilestone = logsCount < 3 ? 3 : logsCount < 7 ? 7 : logsCount < 14 ? 14 : 30;

  // ── Forecast eligibility check (new strict gating) ────────────────────────
  const logSpanDays = computeLogSpanDays(recentLogs);
  const forecastEligibility = checkForecastEligibility({
    logsCount,
    logsSpanDays: logSpanDays,
    confidenceScore: context.confidenceScore,
    cyclePredictionConfidence: cyclePrediction.confidence,
    contraceptionBehavior,
  });

  // ── If not eligible: return warmup state instead of forecast ──────────────
  if (!forecastEligibility.eligible) {
    const warmupPayload = {
      available: false,
      isNewUser: true,
      forecastLocked: true,
      reason: forecastEligibility.reason,
      warmupMessage: forecastEligibility.warmupMessage,
      progressPercent: forecastEligibility.progressPercent,
      progress: {
        logsCount,
        nextMilestone: 7,
        logsToNextMilestone: Math.max(0, 7 - logsCount),
        logSpanDays,
        logSpanNeeded: 5,
      },
      contraceptionContext: {
        type: contraceptionType,
        contextMessage: contraceptionBehavior.contextMessage || null,
      },
    };

    const forecastJson = JSON.parse(JSON.stringify(warmupPayload)) as Prisma.InputJsonValue;
    await prisma.insightCache.upsert({
      where: { userId_date: { userId: req.userId!, date: dayStart } },
      update: { forecast: forecastJson },
      create: { userId: req.userId!, date: dayStart, payload: {}, forecast: forecastJson },
    });

    res.json(warmupPayload);
    return;
  }

  // ── Build full forecast (user is eligible) ────────────────────────────────
  const forecastPreviousCycleDrivers = context.mode === "personalized"
    ? await getPreviousCycleDriverHistory(req.userId!)
    : [];

  // PMS forecast only if contraception allows it
  const pmsSymptomForecast = contraceptionBehavior.showPmsForecast
    ? buildPmsSymptomForecast(todayCycle.phase, todayCycle.currentDay, todayCycle.daysUntilNextPhase, forecastPreviousCycleDrivers, completedCycleCount)
    : null;

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowCycle = calculateCycleInfoForDate(user.lastPeriodStart, tomorrowDate, effectiveCycleLength, cycleMode);
  const tomorrowOutlook = buildTomorrowPreview(context, todayCycle.daysUntilNextPhase, variantIndex);

  const nextPhaseInDays = todayCycle.daysUntilNextPhase;

  // ── Enforce non-deterministic language on forecast text ───────────────────
  const softenedOutlook = softendeterministic(tomorrowOutlook, context.confidenceScore);
  const nextPhasePreview = nextPhaseInDays <= 2
    ? `A phase shift may be approaching in about ${nextPhaseInDays} day(s) — energy and mood patterns might start shifting soon.`
    : `Your current phase may continue for about ${nextPhaseInDays} day(s), with gradual changes possible near transition.`;

  const forecastConfidenceScore = context.confidenceScore;
  const confidenceLabel = getForecastConfidenceLabel(forecastConfidenceScore, logsCount);

  // Confidence message — never deterministic
  const confidenceMessage =
    forecastConfidenceScore < 0.4
      ? "We're still learning your patterns — this forecast may not reflect your individual experience yet."
      : forecastConfidenceScore < 0.7
      ? "This forecast is based on emerging patterns from your logs — it may shift as we learn more."
      : "This forecast is based on your recent patterns — though individual responses can still vary.";

  const draftForecastPayload = {
    available: true,
    isNewUser,
    progress: { logsCount, nextMilestone, logsToNextMilestone: Math.max(0, nextMilestone - logsCount) },
    today: {
      phase: contraceptionBehavior.useNaturalCycleEngine ? todayCycle.phase : null,
      currentDay: todayCycle.currentDay,
      confidenceScore: forecastConfidenceScore,
      priorityDrivers: context.priorityDrivers,
    },
    forecast: {
      tomorrow: {
        date: tomorrowDate.toISOString().split("T")[0],
        phase: contraceptionBehavior.useNaturalCycleEngine ? tomorrowCycle.phase : null,
        outlook: softenedOutlook,
      },
      nextPhase: contraceptionBehavior.useNaturalCycleEngine
        ? { inDays: nextPhaseInDays, preview: nextPhasePreview }
        : null,
      confidence: {
        level: forecastConfidenceScore >= 0.7 ? "high" : forecastConfidenceScore >= 0.4 ? "medium" : "low",
        score: forecastConfidenceScore,
        label: confidenceLabel,
        message: confidenceMessage,
      },
    },
    pmsSymptomForecast,
    numericSummary: {
      recentSleepAvg: numericBaseline.recentSleepAvg,
      baselineSleepAvg: numericBaseline.baselineSleepAvg,
      sleepDelta: numericBaseline.sleepDelta,
    },
    crossCycleNarrative: crossCycleNarrative
      ? { narrativeStatement: crossCycleNarrative.narrativeStatement, trend: crossCycleNarrative.trend }
      : null,
    cyclesCompleted: completedCycleCount,
    contraceptionContext: {
      type: contraceptionType,
      forecastMode: contraceptionBehavior.forecastMode,
      contextMessage: contraceptionBehavior.contextMessage || null,
    },
  };

  let forecastPayload: typeof draftForecastPayload & { forecastAiEnhanced?: boolean } = { ...draftForecastPayload, forecastAiEnhanced: false };

  const canUseAIForecast = logsCount >= 7 && context.mode === "personalized" && context.confidence !== "low";
  if (canUseAIForecast) {
    try {
      const rewritten = await generateForecastWithGpt(
        context,
        draftForecastPayload,
        numericBaseline,
        crossCycleNarrative,
        user.name,
      ) as typeof draftForecastPayload;

      // Guard: reject if GPT introduced forbidden deterministic language
      const forecastText = JSON.stringify(rewritten);
      const hasForbiddenInForecast = [
        "you will feel", "this will happen", "will improve", "will get worse",
        "your estrogen is", "your progesterone is", "you are going to",
      ].some((phrase) => forecastText.toLowerCase().includes(phrase));

      if (!hasForbiddenInForecast) {
        forecastPayload = { ...rewritten, forecastAiEnhanced: true };
      }
    } catch {
      // keep draft
    }
  }

  const forecastJson = JSON.parse(JSON.stringify(forecastPayload)) as Prisma.InputJsonValue;
  await prisma.insightCache.upsert({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
    update: { forecast: forecastJson },
    create: { userId: req.userId!, date: dayStart, payload: {}, forecast: forecastJson },
  });

  res.json(forecastPayload);
}