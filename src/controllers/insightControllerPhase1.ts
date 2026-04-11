// src/controllers/insightControllerPhase1.ts
// Phase 1 simplified insight controller — no correlation, memory, PMS, monitor, or narrative selector.

import "../types/express";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  calculateCycleInfo,
  calculateCycleInfoForDate,
  getCycleMode,
  utcDayDiff,
} from "../services/cycleEngine";
import {
  buildInsightContext,
  generateRuleBasedInsights,
  insightContextAsStableBaseline,
  softenForConfidenceTier,
  detectMomentumBreak,
  applyMomentumBreakNarrative,
} from "../services/insightService";
import {
  buildVyanaContextForInsights,
  generateInsightsWithGpt,
  generateForecastWithGpt,
  type InsightGenerationStatus,
  sanitizeInsights,
  buildFallbackContextBlock,
} from "../services/insightGptService";
import {
  getCyclePredictionContext,
  getUserInsightData,
} from "../services/insightData";
import {
  buildInsightView,
  buildInsightBasis,
} from "../services/insightView";
import { getCycleNumber, selectVariant } from "../services/cycleInsightLibrary";
import {
  buildHormoneState,
  buildHormoneLanguage,
} from "../services/hormoneengine";
import {
  getContraceptionBehavior,
  checkForecastEligibility,
  computeLogSpanDays,
  resolveContraceptionType,
} from "../services/contraceptionengine";
import {
  softendeterministic,
  containsForbiddenLanguage,
  softenDailyInsights,
  cleanupInsightText,
  getForecastConfidenceLabel,
} from "../utils/confidencelanguage";
import { applyAllGuards, validateZeroDataSafety } from "../services/insightGuard";
import { buildTransitionWarmup } from "../services/transitionWarmup";
import { FEATURE_FLAGS } from "../config/featureFlags";

// Phase 1 stub — always "cycle"
const detectPrimaryInsightCause = () => "cycle" as const;

const GUARD_VERSION = 2; // Phase 1 cache version

function isInsightsPayloadCached(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    "cycleDay" in payload &&
    "insights" in payload &&
    "view" in payload &&
    "guardVersion" in payload &&
    (payload as Record<string, unknown>).guardVersion === GUARD_VERSION
  );
}

// ─── GET /api/insights ────────────────────────────────────────────────────────

export async function getInsights(req: Request, res: Response): Promise<void> {
  const now = new Date();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  // ── Cache check ─────────────────────────────────────────────────────────
  const cached = await prisma.insightCache.findUnique({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
  });
  if (cached?.payload && isInsightsPayloadCached(cached.payload)) {
    const full = cached.payload as Record<string, unknown>;
    const cachedUser = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { contraceptionChangedAt: true },
    });
    const cachedTransitionWarmup = cachedUser
      ? buildTransitionWarmup(cachedUser.contraceptionChangedAt ?? null)
      : null;
    const cachedLogsCount = (full.progress as { logsCount?: number })?.logsCount ?? 0;
    const cachedInsightBasis = buildInsightBasis(
      cachedLogsCount,
      await prisma.cycleHistory.count({
        where: { userId: req.userId!, endDate: { not: null }, cycleLength: { not: null } },
      }),
    );
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
      insightBasis: cachedInsightBasis,
      aiEnhanced: full.aiEnhanced,
      transitionWarmup: cachedTransitionWarmup,
    });
    return;
  }

  // ── Fetch data ──────────────────────────────────────────────────────────
  const data = await getUserInsightData(req.userId!);
  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { user, recentLogs, baselineLogs, numericBaseline, crossCycleNarrative } = data;

  const transitionWarmup = buildTransitionWarmup(user.contraceptionChangedAt ?? null);
  const contraceptionType = resolveContraceptionType(user.contraceptiveMethod);
  const contraceptionBehavior = getContraceptionBehavior(contraceptionType);
  const cycleMode = getCycleMode(user);

  const [completedCycleCount, cyclePrediction] = await Promise.all([
    prisma.cycleHistory.count({
      where: { userId: req.userId!, endDate: { not: null }, cycleLength: { not: null } },
    }),
    getCyclePredictionContext(req.userId!, user.cycleLength),
  ]);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;

  // ── Cycle info ──────────────────────────────────────────────────────────
  const rawDiffDays = utcDayDiff(now, user.lastPeriodStart);
  const daysOverdue = Math.max(0, rawDiffDays - effectiveCycleLength);
  const isPeriodDelayed =
    daysOverdue > 0 &&
    cyclePrediction.confidence !== "irregular" &&
    cycleMode !== "hormonal";
  const isIrregular = cycleMode !== "hormonal" && cyclePrediction.isIrregular;
  const isExtendedCycle = cycleMode === "irregular" && rawDiffDays > 45;

  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);
  const cycleNumber = getCycleNumber(user.lastPeriodStart, effectiveCycleLength);

  const hormoneState = buildHormoneState(
    cycleInfo.phase, cycleInfo.currentDay, effectiveCycleLength, cycleMode, contraceptionType,
  );
  const hormoneLanguage = contraceptionBehavior.showHormoneCurves
    ? buildHormoneLanguage(hormoneState, cyclePrediction.confidence === "reliable" ? 0.8 : 0.5)
    : null;

  // ── Baseline scope ──────────────────────────────────────────────────────
  const phaseBaselineLogs = baselineLogs.filter((log) => {
    const logPhase = calculateCycleInfoForDate(
      user.lastPeriodStart, new Date(log.date), effectiveCycleLength, cycleMode,
    ).phase;
    return logPhase === cycleInfo.phase;
  });
  const hasPhaseBaseline = phaseBaselineLogs.length >= 7;
  const baselineForComparison = hasPhaseBaseline ? phaseBaselineLogs : baselineLogs;
  const baselineScope = hasPhaseBaseline ? "phase" : baselineForComparison.length >= 7 ? "global" : "none";

  // ── Build context ───────────────────────────────────────────────────────
  let context = buildInsightContext(
    cycleInfo.phase, cycleInfo.currentDay, recentLogs, baselineForComparison,
    baselineScope, cycleNumber, effectiveCycleLength, cycleMode, cyclePrediction.confidence,
    cycleInfo.phaseDay,
  );

  // Stable state detection (simplified — no isStableInsightState from deleted insightCause.ts)
  const effectiveStable = false; // Phase 1: skip stable state override

  const primaryInsightCause = detectPrimaryInsightCause();

  // ── Variant selection (weighted A-F rotation) ───────────────────────────
  const variant = selectVariant(
    req.userId!, cycleNumber, cycleInfo.currentDay, cycleInfo.phase,
    cycleInfo.phaseDay,
  );
  context = { ...context, variant };

  // ── Generate rule-based insights ────────────────────────────────────────
  let draftInsights = generateRuleBasedInsights(context, cycleInfo.daysUntilNextPeriod);

  // ── Layer 2: Log mirror (acknowledge today's log) ──────────────────────
  const todayLog = recentLogs.length > 0 ? recentLogs[0] : null;
  if (todayLog) {
    const { buildLayer2Wrapper } = await import("../services/layer2Wrappers");
    const wrapper = buildLayer2Wrapper(todayLog, cycleInfo.phase);
    if (wrapper) {
      draftInsights = { ...draftInsights, layer2_wrapper: wrapper };
    }
  }

  // Soften for confidence tier
  draftInsights = softenForConfidenceTier(
    draftInsights, recentLogs.length, cycleInfo.phase, cycleInfo.currentDay,
  );

  // Hormone language injection — append to body_note when relevant
  if (hormoneLanguage && context.mode === "personalized") {
    draftInsights = {
      ...draftInsights,
      body_note: `${draftInsights.body_note} ${hormoneLanguage}`.trim(),
    };
  }

  // Strip hormonal language for hormonal contraception users
  if (
    contraceptionBehavior.insightTone === "pattern-based" ||
    contraceptionBehavior.insightTone === "symptom-based"
  ) {
    const stripHormonalLanguage = (text: string): string =>
      text
        .replace(/\bthis phase\b/gi, "your recent patterns")
        .replace(/\bin this phase\b/gi, "based on your recent logs")
        .replace(/\bduring this phase\b/gi, "based on what you've been logging")
        .replace(/\bovulation\b/gi, "your cycle's peak")
        .replace(/\bEstrogen\b/gi, "Energy")
        .replace(/\bProgesterone\b/gi, "Your body")
        .replace(/\bfertile window\b/gi, "your energy peak")
        .replace(/\bcervical mucus[^.!?]*[.!?]?/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();

    draftInsights = {
      ...draftInsights,
      layer1_insight: stripHormonalLanguage(draftInsights.layer1_insight),
      body_note: stripHormonalLanguage(draftInsights.body_note),
      recommendation: stripHormonalLanguage(draftInsights.recommendation),
    };
  }

  // Irregular cycle softening
  if (isIrregular || cyclePrediction.confidence === "irregular") {
    draftInsights = {
      ...draftInsights,
      layer1_insight: draftInsights.layer1_insight
        .replace(/\bthis phase\b/gi, "this part of your cycle")
        .replace(/\btoday\b/gi, "around this time"),
    };
  }

  // Delayed period override
  if (isPeriodDelayed) {
    let delayedInsight: string;
    if (daysOverdue <= 3) {
      delayedInsight = "Your period is a little late — this can happen with stress, travel, or lifestyle changes.";
    } else if (daysOverdue <= 7) {
      delayedInsight = `Your period is ${daysOverdue} days late. If you're concerned, a pregnancy test or doctor visit might help.`;
    } else if (daysOverdue <= 14) {
      delayedInsight = `Your period is ${daysOverdue} days late — that's significantly late. Consider a pregnancy test or checking in with your doctor.`;
    } else {
      delayedInsight = `Your period is more than two weeks late (${daysOverdue} days). We'd recommend seeing a doctor.`;
    }
    draftInsights = {
      ...draftInsights,
      layer1_insight: delayedInsight,
      body_note: isIrregular
        ? "Irregular cycles can vary significantly — a late period doesn't always mean something is wrong."
        : "Even regular cycles can be shifted by stress, illness, travel, or changes in routine.",
    };
  }

  // Pre-GPT deterministic softening
  draftInsights = {
    ...draftInsights,
    layer1_insight: softendeterministic(draftInsights.layer1_insight, context.confidenceScore),
    body_note: softendeterministic(draftInsights.body_note, context.confidenceScore),
  };

  const logsCount = recentLogs.length;
  const isNewUser = logsCount < 3;
  const nextMilestone = logsCount < 3 ? 3 : logsCount < 7 ? 7 : logsCount < 14 ? 14 : 30;

  // ── GPT enhancement ─────────────────────────────────────────────────────
  const vyanaCtx = buildVyanaContextForInsights({
    ctx: context,
    baseline: numericBaseline,
    crossCycleNarrative,
    hormoneState,
    hormoneLanguage,
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

  let insights = draftInsights;
  let aiEnhanced = false;
  let aiDebug: string = "gated";

  if (logsCount === 0) {
    aiDebug = "zero_data_skip";
  } else if (logsCount >= FEATURE_FLAGS.MIN_LOGS_FOR_GPT && FEATURE_FLAGS.ENABLE_GPT_ENHANCEMENT) {
    try {
      const aiResult = await generateInsightsWithGpt(
        context, draftInsights, numericBaseline, crossCycleNarrative,
        user.name, contraceptionBehavior.insightTone, vyanaCtx,
        { insightMemoryCount: 0, hasCrossCycleNarrative: crossCycleNarrative !== null },
      );
      const candidate = softenDailyInsights(
        sanitizeInsights(aiResult.insights, draftInsights),
        context.confidenceScore,
      );
      const hasForbidden = Object.values(candidate).some(
        (v) => typeof v === "string" && containsForbiddenLanguage(v),
      );
      if (!hasForbidden) {
        insights = candidate;
        aiEnhanced = JSON.stringify(insights) !== JSON.stringify(draftInsights);
        aiDebug = aiEnhanced
          ? "accepted"
          : aiResult.status === "accepted" ? "unchanged_output" : aiResult.status;
      } else {
        aiDebug = "forbidden_language";
      }
    } catch {
      insights = draftInsights;
      aiDebug = "api_error";
    }
  }

  // Momentum protection
  const momentumCheck = detectMomentumBreak(recentLogs);
  if (momentumCheck.isMomentumBreak && context.mode === "personalized") {
    insights = applyMomentumBreakNarrative(insights, momentumCheck.streakDays);
  }

  const driverForMemory = context.priorityDrivers[0] || null;

  insights = cleanupInsightText(insights);

  // ── Post-generation guard layer ──────────────────────────────────────────
  const guardResult = applyAllGuards({
    insights, cycleDay: cycleInfo.currentDay, cycleLength: effectiveCycleLength,
    phase: cycleInfo.phase, logsCount,
  });
  insights = { ...insights, ...guardResult.insights };

  // Zero-data safety net
  if (logsCount === 0) {
    const safetyCheck = validateZeroDataSafety(insights);
    if (!safetyCheck.pass) {
      insights = cleanupInsightText(draftInsights);
    }
  }

  const progress = { logsCount, nextMilestone, logsToNextMilestone: Math.max(0, nextMilestone - logsCount) };
  const view = buildInsightView(context, insights, {
    logsCount, completedCycles: completedCycleCount, progress,
  });

  // ── Cache + respond ─────────────────────────────────────────────────────
  const cachePayload = {
    guardVersion: GUARD_VERSION,
    cycleDay: cycleInfo.currentDay,
    isNewUser,
    progress,
    confidence: context.confidence,
    isPeriodDelayed,
    daysOverdue,
    isIrregular,
    insights,
    view,
    aiEnhanced,
    _internal: {
      mode: context.mode,
      aiDebug,
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
      cycleContext: {
        cycleMode,
        cyclePredictionConfidence: cyclePrediction.confidence,
        nextPeriodEstimate: contraceptionBehavior.showPeriodForecast
          ? cycleInfo.nextPeriodDate.toISOString().split("T")[0]
          : null,
        isIrregular,
        isPeriodDelayed,
        daysOverdue,
      },
      hormoneContext: contraceptionBehavior.showHormoneCurves
        ? {
            estrogen: hormoneState.estrogen,
            progesterone: hormoneState.progesterone,
            lh: hormoneState.lh,
            fsh: hormoneState.fsh,
            confidence: hormoneState.confidence,
            narrativeContext: hormoneLanguage,
          }
        : null,
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
      },
      crossCycleNarrative: crossCycleNarrative
        ? {
            matchingCycles: crossCycleNarrative.matchingCycles,
            totalCyclesAnalyzed: crossCycleNarrative.totalCyclesAnalyzed,
            narrativeStatement: crossCycleNarrative.narrativeStatement,
            trend: crossCycleNarrative.trend,
          }
        : null,
    },
  };

  const periodAction = (isPeriodDelayed || isExtendedCycle)
    ? { show: true, label: "Has your period started?", ctaText: "Log period" }
    : null;

  const responsePayload = {
    cycleDay: cachePayload.cycleDay,
    isNewUser: cachePayload.isNewUser,
    confidence: cachePayload.confidence,
    isPeriodDelayed: cachePayload.isPeriodDelayed,
    daysOverdue: cachePayload.daysOverdue,
    isIrregular: cachePayload.isIrregular,
    // Layered insight response (includes insight, body_note, orientation, recommendation, progress, etc.)
    ...view,
    aiEnhanced: cachePayload.aiEnhanced,
    transitionWarmup,
    periodAction,
  };

  const payloadJson = JSON.parse(JSON.stringify(cachePayload)) as Prisma.InputJsonValue;
  await prisma.insightCache.upsert({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
    update: { payload: payloadJson },
    create: { userId: req.userId!, date: dayStart, payload: payloadJson },
  });

  res.json(responsePayload);

  // Fire-and-forget: insight history
  if (context.mode === "personalized") {
    prisma.insightHistory.create({
      data: {
        userId: req.userId!,
        primaryKey: "layer1",
        driver: driverForMemory,
        cycleDay: cycleInfo.currentDay,
        phase: cycleInfo.phase,
      },
    }).catch((err) =>
      console.error(JSON.stringify({ type: "background_write_error", error: String(err) })),
    );
  }
}

// ─── GET /api/insights/context ────────────────────────────────────────────────

export async function getInsightsContext(req: Request, res: Response): Promise<void> {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const cached = await prisma.insightCache.findUnique({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
  });

  if (!cached?.payload || !isInsightsPayloadCached(cached.payload)) {
    res.status(404).json({ error: "No insights generated yet today. Call GET /api/insights first." });
    return;
  }

  const full = cached.payload as Record<string, unknown>;
  const internal = (full._internal ?? {}) as Record<string, unknown>;

  res.json({
    cycleDay: full.cycleDay,
    mode: internal.mode ?? null,
    aiDebug: internal.aiDebug ?? null,
    basedOn: internal.basedOn ?? null,
    cycleContext: internal.cycleContext ?? null,
    hormoneContext: internal.hormoneContext ?? null,
    contraceptionContext: internal.contraceptionContext ?? null,
    numericSummary: internal.numericSummary ?? null,
    crossCycleNarrative: internal.crossCycleNarrative ?? null,
  });
}

// ─── GET /api/insights/forecast ───────────────────────────────────────────────

export async function getInsightsForecast(req: Request, res: Response): Promise<void> {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const [cached, data] = await Promise.all([
    prisma.insightCache.findUnique({
      where: { userId_date: { userId: req.userId!, date: dayStart } },
    }),
    getUserInsightData(req.userId!),
  ]);

  if (cached?.forecast) {
    const cachedTransitionWarmup = data?.user?.contraceptionChangedAt
      ? buildTransitionWarmup(data.user.contraceptionChangedAt)
      : null;
    res.json({ ...(cached.forecast as object), transitionWarmup: cachedTransitionWarmup });
    return;
  }

  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { user, recentLogs, baselineLogs, numericBaseline, crossCycleNarrative } = data;
  const forecastTransitionWarmup = buildTransitionWarmup(user.contraceptionChangedAt ?? null);
  const contraceptionType = resolveContraceptionType(user.contraceptiveMethod);
  const contraceptionBehavior = getContraceptionBehavior(contraceptionType);
  const cycleMode = getCycleMode(user);

  const [completedCycleCount, cyclePrediction] = await Promise.all([
    prisma.cycleHistory.count({
      where: { userId: req.userId!, endDate: { not: null }, cycleLength: { not: null } },
    }),
    getCyclePredictionContext(req.userId!, user.cycleLength),
  ]);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;

  const todayCycle = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);
  const cycleNumber = getCycleNumber(user.lastPeriodStart, effectiveCycleLength);
  const phaseBaselineLogs = baselineLogs.filter((log) => {
    const logPhase = calculateCycleInfoForDate(
      user.lastPeriodStart, new Date(log.date), effectiveCycleLength, cycleMode,
    ).phase;
    return logPhase === todayCycle.phase;
  });
  const hasPhaseBaseline = phaseBaselineLogs.length >= 7;
  const baselineForComparison = hasPhaseBaseline ? phaseBaselineLogs : baselineLogs;
  const baselineScope = hasPhaseBaseline ? "phase" : baselineForComparison.length >= 7 ? "global" : "none";

  const context = buildInsightContext(
    todayCycle.phase, todayCycle.currentDay, recentLogs, baselineForComparison,
    baselineScope, cycleNumber, effectiveCycleLength, cycleMode, cyclePrediction.confidence,
    todayCycle.phaseDay,
  );

  const logsCount = recentLogs.length;
  const isNewUser = logsCount < 3;
  const nextMilestone = logsCount < 3 ? 3 : logsCount < 7 ? 7 : logsCount < 14 ? 14 : 30;

  const logSpanDays = computeLogSpanDays(recentLogs);
  const forecastEligibility = checkForecastEligibility({
    logsCount,
    logsSpanDays: logSpanDays,
    confidenceScore: context.confidenceScore,
    cyclePredictionConfidence: cyclePrediction.confidence,
    contraceptionBehavior,
  });

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

  // Simplified tomorrow outlook — use nudge from template instead of tomorrowEngine
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowCycle = calculateCycleInfoForDate(
    user.lastPeriodStart, tomorrowDate, effectiveCycleLength, cycleMode,
  );

  const { getDayInsight } = await import("../services/cycleInsightLibrary");
  const tomorrowVariant = selectVariant(
    req.userId!, cycleNumber, tomorrowCycle.currentDay, tomorrowCycle.phase, tomorrowCycle.phaseDay,
  );
  const tomorrowInsight = getDayInsight(tomorrowCycle.phase, tomorrowCycle.phaseDay, tomorrowVariant, cycleMode);
  const tomorrowOutlook = tomorrowInsight.body_note;

  const nextPhaseInDays = todayCycle.daysUntilNextPhase;
  const softenedOutlook = softendeterministic(tomorrowOutlook, context.confidenceScore);
  const dayWord = nextPhaseInDays === 1 ? "day" : "days";
  const nextPhasePreview =
    nextPhaseInDays <= 2
      ? `A phase shift may be approaching in about ${nextPhaseInDays} ${dayWord} — energy and mood patterns might start shifting soon.`
      : `Your current phase may continue for about ${nextPhaseInDays} ${dayWord}, with gradual changes possible near transition.`;

  const forecastConfidenceScore = context.confidenceScore;
  const confidenceLabel = getForecastConfidenceLabel(forecastConfidenceScore, logsCount);
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

  let forecastPayload: typeof draftForecastPayload & { forecastAiEnhanced?: boolean } = {
    ...draftForecastPayload,
    forecastAiEnhanced: false,
  };

  // GPT forecast rewrite for high-data users
  const canUseAIForecast = logsCount >= 7 && context.mode === "personalized" && context.confidence !== "low";
  if (canUseAIForecast && FEATURE_FLAGS.ENABLE_GPT_ENHANCEMENT) {
    try {
      const forecastHormoneState = buildHormoneState(
        todayCycle.phase, todayCycle.currentDay, effectiveCycleLength, cycleMode, contraceptionType,
      );
      const forecastHormoneLanguage = contraceptionBehavior.showHormoneCurves
        ? buildHormoneLanguage(forecastHormoneState, cyclePrediction.confidence === "reliable" ? 0.8 : 0.5)
        : null;

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
        primaryInsightCause: detectPrimaryInsightCause(),
      });

      const rewritten = (await generateForecastWithGpt(
        context, draftForecastPayload, numericBaseline, crossCycleNarrative, user.name, forecastVyanaCtx,
      )) as typeof draftForecastPayload;

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

  res.json({ ...forecastPayload, transitionWarmup: forecastTransitionWarmup });
}
