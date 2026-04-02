// src/controllers/insightController.ts
// Insight controller — GET /api/insights, GET /api/insights/context, GET /api/insights/forecast
// FIX: Removed dead canUseAI gating variables. GPT fires on every insight request.

import "../types/express";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  calculateCycleInfo,
  calculateCycleInfoForDate,
  getCycleMode,
  utcDayDiff,
  type Phase,
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
  generateForecastWithGpt,
  generateInsightsWithGpt,
  type InsightGenerationStatus,
  sanitizeInsights,
} from "../services/aiService";
import type {
  AnticipationFrequencyState,
  EmotionalMemoryInput,
} from "../services/vyanaContext";
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
import {
  buildPmsSymptomForecast,
  type PmsForecast,
} from "../services/pmsEngine";
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
  CERTAINTY_RULES_FOR_GPT,
  getForecastConfidenceLabel,
  containsForbiddenLanguage,
  softenDailyInsights,
  cleanupInsightText,
} from "../utils/confidencelanguage";
import {
  detectPrimaryInsightCause,
  applySleepDisruptionNarrative,
  applyStressLedNarrative,
  applyStableStateNarrative,
  isStableInsightState,
  type PrimaryInsightCause,
} from "../services/insightCause";
import { applyAllGuards } from "../services/insightGuard";
import {
  buildMonitorEntry,
  recordInsightGeneration,
} from "../services/insightMonitor";
import { buildTransitionWarmup } from "../services/transitionWarmup";

const GUARD_VERSION = 1; // bump to invalidate all insight caches

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

function getAnticipationState(
  cached: { payload?: unknown } | null,
): AnticipationFrequencyState {
  if (!cached?.payload || typeof cached.payload !== "object") {
    return { lastShownCycleDay: null, lastShownType: null };
  }
  const p = cached.payload as Record<string, unknown>;
  return {
    lastShownCycleDay:
      typeof p.lastAnticipationCycleDay === "number"
        ? p.lastAnticipationCycleDay
        : null,
    lastShownType:
      typeof p.lastAnticipationTypeKey === "string"
        ? p.lastAnticipationTypeKey
        : null,
  };
}

function utcCalendarDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

/**
 * Fetch past occurrences where the same driver fired AND the user logged mood.
 * Called in getInsights() before building VyanaContext.
 */
async function fetchEmotionalMemoryInput(
  userId: string,
  driver: string | null,
  currentCycleDay: number,
): Promise<EmotionalMemoryInput | null> {
  if (!driver) return null;

  const pastHistory = await prisma.insightHistory.findMany({
    where: {
      userId,
      driver,
      cycleDay: {
        gte: Math.max(1, currentCycleDay - 4),
        lte: currentCycleDay + 4,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { cycleDay: true, phase: true, createdAt: true },
  });

  if (pastHistory.length < 2) return null;

  let globalMin: Date | null = null;
  let globalMax: Date | null = null;
  for (const h of pastHistory) {
    const dayStart = new Date(h.createdAt);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(h.createdAt);
    dayEnd.setUTCHours(23, 59, 59, 999);
    if (!globalMin || dayStart < globalMin) globalMin = dayStart;
    if (!globalMax || dayEnd > globalMax) globalMax = dayEnd;
  }
  if (!globalMin || !globalMax) return null;

  const allLogs = await prisma.dailyLog.findMany({
    where: { userId, date: { gte: globalMin, lte: globalMax } },
    orderBy: { date: "asc" },
    select: { mood: true, energy: true, stress: true, date: true },
  });

  const logByUtcDay = new Map<
    string,
    { mood: string | null; energy: string | null; stress: string | null }
  >();
  for (const log of allLogs) {
    const key = utcCalendarDayKey(new Date(log.date));
    if (!logByUtcDay.has(key)) {
      logByUtcDay.set(key, {
        mood: log.mood,
        energy: log.energy,
        stress: log.stress,
      });
    }
  }

  const now = new Date();
  const occurrences = pastHistory.map((h) => {
    const log = logByUtcDay.get(utcCalendarDayKey(h.createdAt));
    const daysAgo = Math.floor(
      (now.getTime() - h.createdAt.getTime()) / 86400000,
    );
    return {
      cycleDay: h.cycleDay ?? currentCycleDay,
      phase: (h.phase ?? "luteal") as Phase,
      mood: log?.mood ?? null,
      energy: log?.energy ?? null,
      stress: log?.stress ?? null,
      daysAgo,
    };
  });

  return { pastOccurrences: occurrences.filter((o) => o.mood !== null) };
}

// ─── GET /api/insights ────────────────────────────────────────────────────────

export async function getInsights(req: Request, res: Response): Promise<void> {
  const now = new Date();
  const pipelineStart = Date.now();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const cached = await prisma.insightCache.findUnique({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
  });
  if (cached?.payload && isInsightsPayloadCached(cached.payload)) {
    console.log(JSON.stringify({ type: "insight_cache", hit: true, userId: req.userId, timestamp: new Date().toISOString() }));
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
  console.log(JSON.stringify({ type: "insight_cache", hit: false, userId: req.userId, timestamp: new Date().toISOString() }));

  const data = await getUserInsightData(req.userId!);
  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const {
    user,
    recentLogs,
    baselineLogs,
    numericBaseline,
    crossCycleNarrative,
  } = data;

  const transitionWarmup = buildTransitionWarmup(
    user.contraceptionChangedAt ?? null,
  );

  const contraceptionType = resolveContraceptionType(user.contraceptiveMethod);
  const contraceptionBehavior = getContraceptionBehavior(contraceptionType);
  const cycleMode = getCycleMode(user);

  // ── Parallel: cycle count + prediction context + previous drivers ────────
  const [completedCycleCount, cyclePrediction, previousCycleDrivers] = await Promise.all([
    prisma.cycleHistory.count({
      where: {
        userId: req.userId!,
        endDate: { not: null },
        cycleLength: { not: null },
      },
    }),
    getCyclePredictionContext(req.userId!, user.cycleLength),
    getPreviousCycleDriverHistory(req.userId!),
  ]);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;

  // ── Detect delayed period ──────────────────────────────────────────────────
  const rawDiffDays = utcDayDiff(now, user.lastPeriodStart);
  const daysOverdue = Math.max(0, rawDiffDays - effectiveCycleLength);
  const isPeriodDelayed =
    daysOverdue > 0 &&
    cyclePrediction.confidence !== "irregular" &&
    cycleMode !== "hormonal";
  const isIrregular = cycleMode !== "hormonal" && cyclePrediction.isIrregular;

  // Learning state: irregular users with < 2 completed cycles shouldn't see phase-based insights
  const isLearning =
    (cycleMode === "irregular" || cyclePrediction.confidence === "irregular") &&
    completedCycleCount < 2;

  // Extended cycle notice for irregular users on day 50+
  const isExtendedCycle = cycleMode === "irregular" && rawDiffDays > 45;

  const cycleInfo = calculateCycleInfo(
    user.lastPeriodStart,
    effectiveCycleLength,
    cycleMode,
  );
  const cycleNumber = getCycleNumber(
    user.lastPeriodStart,
    effectiveCycleLength,
  );
  const variantIndex = (cycleNumber % 3) as 0 | 1 | 2;

  const hormoneState = buildHormoneState(
    cycleInfo.phase,
    cycleInfo.currentDay,
    effectiveCycleLength,
    cycleMode,
    contraceptionType,
  );
  const hormoneLanguage = contraceptionBehavior.showHormoneCurves
    ? buildHormoneLanguage(
        hormoneState,
        cyclePrediction.confidence === "reliable" ? 0.8 : 0.5,
      )
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
  const baselineForComparison = hasPhaseBaseline
    ? phaseBaselineLogs
    : baselineLogs;
  const baselineScope = hasPhaseBaseline
    ? "phase"
    : baselineForComparison.length >= 7
      ? "global"
      : "none";

  let context = buildInsightContext(
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

  const stableCandidate = isStableInsightState(recentLogs, numericBaseline);
  const isPeakPhaseWithPositiveSignals =
    (cycleInfo.phase === "ovulation" || cycleInfo.phase === "follicular") &&
    context.emotional_state === "uplifted" &&
    context.mental_state === "balanced" &&
    context.physical_state === "stable";
  const effectiveStable =
    stableCandidate &&
    !isPeriodDelayed &&
    !isPeakPhaseWithPositiveSignals &&
    context.mode === "personalized";

  if (effectiveStable) {
    context = insightContextAsStableBaseline(context);
  }

  const primaryInsightCause: PrimaryInsightCause = effectiveStable
    ? "stable"
    : detectPrimaryInsightCause({
        baselineDeviation: context.baselineDeviation,
        trends: context.trends,
        sleepDelta: numericBaseline.sleepDelta,
        priorityDrivers: context.priorityDrivers,
        recentLogs,
      });

  const ruleBasedInsights = generateRuleBasedInsights(context);
  const tomorrowPreview = buildTomorrowPreview(
    context,
    cycleInfo.daysUntilNextPhase,
    variantIndex,
  );
  let draftInsights = { ...ruleBasedInsights, tomorrowPreview };

  // Soften language for zero-data / low-data users before GPT sees the draft
  draftInsights = softenForConfidenceTier(
    draftInsights,
    recentLogs.length,
    cycleInfo.phase,
    cycleInfo.currentDay,
  );

  if (
    hormoneLanguage &&
    context.mode === "personalized" &&
    primaryInsightCause !== "sleep_disruption" &&
    primaryInsightCause !== "stable"
  ) {
    const hasSpecificReason =
      draftInsights.whyThisIsHappening.includes("sleep") ||
      draftInsights.whyThisIsHappening.includes("stress") ||
      draftInsights.whyThisIsHappening.includes("strain");
    if (!hasSpecificReason) {
      draftInsights = {
        ...draftInsights,
        whyThisIsHappening:
          `${draftInsights.whyThisIsHappening} ${hormoneLanguage}`.trim(),
      };
    }
  }

  if (
    contraceptionBehavior.insightTone === "pattern-based" ||
    contraceptionBehavior.insightTone === "symptom-based"
  ) {
    const stripHormonalLanguage = (text: string): string =>
      text
        .replace(/\bthis phase\b/gi, "your recent patterns")
        .replace(/\bin this phase\b/gi, "based on your recent logs")
        .replace(/\bduring this phase\b/gi, "based on what you've been logging")
        .replace(/\bthe ovulation window\b/gi, "your energy peak")
        .replace(/\bovulation window\b/gi, "your energy peak")
        .replace(/\bthe ovulatory window\b/gi, "your energy peak")
        .replace(/\bovulatory window\b/gi, "your energy peak")
        .replace(/\bthe ovulatory shift\b/gi, "the next shift")
        .replace(/\bovulatory shift\b/gi, "the next shift")
        .replace(/\bthe ovulatory phase\b/gi, "the next part of your cycle")
        .replace(/\bovulatory phase\b/gi, "the next part of your cycle")
        .replace(/\bovulatory buildup\b/gi, "your energy building")
        .replace(/\bovulatory peak\b/gi, "your energy peak")
        .replace(/\bpre-ovulatory\b/gi, "pre-peak")
        .replace(/\bpost-ovulatory\b/gi, "post-peak")
        .replace(/\bovulation is occurring\b/gi, "your energy is peaking")
        .replace(/\bovulation is happening\b/gi, "your energy is peaking")
        .replace(/\bovulation is imminent\b/gi, "your peak is close")
        .replace(/\bovulation is approaching\b/gi, "your peak is approaching")
        .replace(/\bovulation\b/gi, "your cycle's peak")
        .replace(/\bLH surge\b/gi, "your cycle's shift")
        .replace(/\bLH peaks\b/gi, "your cycle peaks")
        .replace(/\bLH begins surging\b/gi, "your cycle is shifting")
        .replace(/\bLuteinizing hormone\b/gi, "Your cycle")
        .replace(/\bEstrogen is rising\b/gi, "Energy is building")
        .replace(/\bEstrogen rises\b/gi, "Energy builds")
        .replace(/\bEstrogen is climbing\b/gi, "Energy is building")
        .replace(/\bEstrogen is at its peak\b/gi, "Energy is at its peak")
        .replace(/\bEstrogen peaks\b/gi, "Energy peaks")
        .replace(/\bEstrogen drops\b/gi, "Energy drops")
        .replace(/\bEstrogen is falling\b/gi, "Energy is shifting")
        .replace(/\bEstrogen is low\b/gi, "Energy is lower")
        .replace(/\bEstrogen is typically\b/gi, "Energy is typically")
        .replace(/\bEstrogen\b/gi, "Energy")
        .replace(/\bProgesterone is rising\b/gi, "Your body is shifting")
        .replace(/\bProgesterone rises\b/gi, "Your body shifts")
        .replace(/\bProgesterone peaks\b/gi, "Your body settles")
        .replace(
          /\bProgesterone is at its peak\b/gi,
          "Your body is in its quieter mode",
        )
        .replace(
          /\bProgesterone dominates\b/gi,
          "Your body is in a calmer rhythm",
        )
        .replace(/\bProgesterone is falling\b/gi, "Your body is transitioning")
        .replace(/\bProgesterone is typically\b/gi, "Your body is typically")
        .replace(/\bProgesterone\b/gi, "Your body")
        .replace(/\bmost fertile window\b/gi, "your energy peak")
        .replace(/\bfertile window\b/gi, "your energy peak")
        .replace(/\bfollicles are developing\b/gi, "your cycle is progressing")
        .replace(/\bcervical mucus[^.!?]*[.!?]?/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();

    draftInsights = {
      physicalInsight: stripHormonalLanguage(draftInsights.physicalInsight),
      mentalInsight: stripHormonalLanguage(draftInsights.mentalInsight),
      emotionalInsight: stripHormonalLanguage(draftInsights.emotionalInsight),
      whyThisIsHappening: stripHormonalLanguage(
        draftInsights.whyThisIsHappening,
      ),
      solution: stripHormonalLanguage(draftInsights.solution),
      recommendation: stripHormonalLanguage(draftInsights.recommendation),
      tomorrowPreview: stripHormonalLanguage(draftInsights.tomorrowPreview),
    };
  }

  // Irregular cycle — soften language
  if (isIrregular || cyclePrediction.confidence === "irregular") {
    draftInsights = {
      ...draftInsights,
      whyThisIsHappening: draftInsights.whyThisIsHappening
        .replace(/\bthis phase\b/gi, "this part of your cycle")
        .replace(/\btoday\b/gi, "around this time"),
    };
  }

  // Delayed period — tiered override based on days overdue
  if (isPeriodDelayed) {
    let physicalInsight: string;
    if (daysOverdue <= 3) {
      physicalInsight = "Your period is a little late — this can happen with stress, travel, or lifestyle changes.";
    } else if (daysOverdue <= 7) {
      physicalInsight = `Your period is ${daysOverdue} days late. If you're concerned, a pregnancy test or doctor visit might help.`;
    } else if (daysOverdue <= 14) {
      physicalInsight = `Your period is ${daysOverdue} days late — that's significantly late. Consider a pregnancy test or checking in with your doctor.`;
    } else {
      physicalInsight = `Your period is more than two weeks late (${daysOverdue} days). We'd recommend seeing a doctor.`;
    }

    draftInsights = {
      ...draftInsights,
      physicalInsight,
      emotionalInsight:
        "It's natural to feel uncertain when your cycle doesn't follow the expected pattern.",
      whyThisIsHappening: isIrregular
        ? "Irregular cycles can vary significantly — a late period doesn't always mean something is wrong."
        : "Even regular cycles can be shifted by stress, illness, travel, or changes in routine.",
      tomorrowPreview:
        "Keep logging how you feel — the more data you have, the better we can support you.",
    };
  }

  const correlation = runCorrelationEngine(
    context,
    recentLogs,
    previousCycleDrivers,
  );

  if (
    !effectiveStable &&
    correlation.patternKey &&
    correlation.confidence >= 0.7 &&
    context.mode === "personalized"
  ) {
    const patternResult = correlation.patterns[correlation.patternKey]!;
    const physicallyProtected =
      context.priorityDrivers.includes("bleeding_heavy") ||
      context.priorityDrivers.includes("high_strain");

    const cycleRecurrenceWhy =
      correlation.patternKey === "cycle_recurrence"
        ? (() => {
            const n = Math.max(
              2,
              Math.round(
                (correlation.patterns.cycle_recurrence.confidence - 0.5) / 0.15,
              ),
            );
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

  if (
    primaryInsightCause !== "sleep_disruption" &&
    crossCycleNarrative?.narrativeStatement &&
    context.mode === "personalized"
  ) {
    const narrativeSuffix =
      crossCycleNarrative.trend === "worsening"
        ? " This window has been getting harder across your recent cycles."
        : crossCycleNarrative.trend === "improving"
          ? " The good news: this window has been getting easier across your recent cycles."
          : "";
    if (!draftInsights.whyThisIsHappening.includes("last")) {
      draftInsights = {
        ...draftInsights,
        whyThisIsHappening:
          `${draftInsights.whyThisIsHappening} ${crossCycleNarrative.narrativeStatement}${narrativeSuffix}`.trim(),
      };
    }
  }

  const skipSleepDisruptionOverride =
    primaryInsightCause === "sleep_disruption" &&
    crossCycleNarrative !== null &&
    crossCycleNarrative.matchingCycles >= 2;

  if (
    primaryInsightCause === "sleep_disruption" &&
    context.mode === "personalized" &&
    !skipSleepDisruptionOverride
  ) {
    draftInsights = applySleepDisruptionNarrative(
      draftInsights,
      numericBaseline,
    );
  }

  if (primaryInsightCause === "stress_led" && context.mode === "personalized") {
    draftInsights = applyStressLedNarrative(draftInsights);
  }

  if (effectiveStable && context.mode === "personalized") {
    draftInsights = applyStableStateNarrative(draftInsights);
  }

  draftInsights = {
    physicalInsight: softendeterministic(
      draftInsights.physicalInsight,
      context.confidenceScore,
    ),
    mentalInsight: softendeterministic(
      draftInsights.mentalInsight,
      context.confidenceScore,
    ),
    emotionalInsight: softendeterministic(
      draftInsights.emotionalInsight,
      context.confidenceScore,
    ),
    whyThisIsHappening: softendeterministic(
      draftInsights.whyThisIsHappening,
      context.confidenceScore,
    ),
    solution: draftInsights.solution,
    recommendation: draftInsights.recommendation,
    tomorrowPreview: softendeterministic(
      draftInsights.tomorrowPreview,
      context.confidenceScore,
    ),
  };

  const logsCount = recentLogs.length;
  const isNewUser = logsCount < 3;
  const nextMilestone =
    logsCount < 3 ? 3 : logsCount < 7 ? 7 : logsCount < 14 ? 14 : 30;

  const driverForMemory = context.priorityDrivers[0] || null;

  // ── Parallel: memory count + emotional memory ─────────────────────────────
  const [memory, emotionalMemoryInput] = await Promise.all([
    driverForMemory && context.mode === "personalized"
      ? getInsightMemoryCount({ userId: req.userId!, driver: driverForMemory })
      : Promise.resolve({ count: 0, lastSeen: null }),
    fetchEmotionalMemoryInput(req.userId!, driverForMemory, cycleInfo.currentDay),
  ]);
  const existingMemoryCount = memory.count;
  const memoryContext = driverForMemory
    ? buildMemoryContext(driverForMemory, existingMemoryCount)
    : null;
  const anticipationFrequencyState = getAnticipationState(cached);
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
    memoryDriver: driverForMemory,
    memoryCount: existingMemoryCount,
    userName: user.name ?? null,
    userId: req.userId!,
    anticipationFrequencyState,
    emotionalMemoryInput,
    primaryInsightCause,
  });

  let insights = draftInsights;
  let aiEnhanced = false;
  let aiDebug:
    | "gated"
    | "client_missing"
    | "empty_response_fallback"
    | "json_shape_fallback"
    | "parse_error_fallback"
    | "length_guard_fallback"
    | "sentence_guard_fallback"
    | "strength_guard_fallback"
    | "api_error"
    | "forbidden_language"
    | "accepted"
    | "accepted_strength_bypassed"
    | "accepted_vague_fixed"
    | "unchanged_output"
    | "stable_state" = "gated";

  // GPT fires on every request — no gating
  try {
    const aiResult = await generateInsightsWithGpt(
      context,
      draftInsights,
      numericBaseline,
      crossCycleNarrative,
      user.name,
      contraceptionBehavior.insightTone,
      vyanaCtx,
      {
        insightMemoryCount: existingMemoryCount,
        hasCrossCycleNarrative: crossCycleNarrative !== null,
      },
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
      const aiStatus = aiResult.status;
      aiDebug = aiEnhanced
        ? "accepted"
        : aiStatus === "accepted"
          ? "unchanged_output"
          : (aiStatus as Exclude<InsightGenerationStatus, "accepted">);
    } else {
      aiDebug = "forbidden_language";
    }
  } catch {
    insights = draftInsights;
    aiDebug = "api_error";
  }

  // Momentum protection — when a positive streak is broken by one bad day,
  // frame it as "rougher than your recent streak" instead of full negative narrative
  const momentumCheck = detectMomentumBreak(recentLogs);
  if (momentumCheck.isMomentumBreak && context.mode === "personalized") {
    insights = applyMomentumBreakNarrative(insights, momentumCheck.streakDays);
  }

  // Memory override — ONLY applied when AI did not run or produced no improvement
  if (!aiEnhanced) {
    if (
      context.interaction_flags.includes("sleep_stress_amplification") &&
      primaryInsightCause !== "sleep_disruption"
    ) {
      insights = {
        ...insights,
        physicalInsight:
          "Sleep dropping and stress rising are feeding into each other.\nThat feedback loop is why everything feels heavier right now.",
      };
    }

    if (cycleInfo.currentDay >= 25) {
      const daysToPeriod = Math.max(0, cycleInfo.daysUntilNextPeriod);
      insights = {
        ...insights,
        tomorrowPreview:
          daysToPeriod <= 2
            ? `You are very close to your period (${daysToPeriod} day${daysToPeriod === 1 ? "" : "s"} away) — this is usually the heaviest stretch, and things tend to ease once it starts.`
            : `You are in the late luteal window (${daysToPeriod} days to your period) — this can stay heavy briefly before easing as your period begins.`,
      };
    }

    if (
      driverForMemory === "stress_above_baseline" &&
      context.mode === "personalized"
    ) {
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
          mentalInsight: `Stress has been consistent for ${existingMemoryCount} days now.\nMental load may be building up.`,
          solution: `Stress has been consistent recently.\nReducing your workload slightly may help.`,
          recommendation: `Consider lighter pacing this week and protect recovery time so stress doesn't carry over.`,
        };
      } else {
        insights = {
          ...insights,
          mentalInsight: `Stress has been persistent for ${existingMemoryCount} days — your body is registering this.\nThis level of sustained load matters.`,
          solution: `Stepping back and prioritizing recovery is the right call now.`,
          recommendation: `For the next few days, prioritize recovery anchors: sleep consistency, gentle movement, and reduced decision load.`,
        };
      }
    }

    if (
      driverForMemory === "sleep_below_baseline" &&
      context.mode === "personalized" &&
      existingMemoryCount > 3
    ) {
      const sleepNote =
        numericBaseline.recentSleepAvg !== null &&
        numericBaseline.baselineSleepAvg !== null
          ? `Sleep has been lower than your usual for ${existingMemoryCount} days.`
          : `Sleep has been below your usual baseline for ${existingMemoryCount} days.`;
      insights = {
        ...insights,
        physicalInsight: `${sleepNote}\nThis can compound fatigue and slow recovery.`,
        solution: `Prioritize an earlier wind-down tonight and protect tomorrow morning for lighter tasks.`,
      };
    }
  }

  const currentPrimaryKey = resolvePrimaryInsightKey(context);
  const recentHistory =
    context.mode === "personalized"
      ? await prisma.insightHistory.findMany({
          where: { userId: req.userId! },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { primaryKey: true },
        })
      : [];

  let primaryKeyOverride: typeof currentPrimaryKey | null = null;
  if (
    context.mode === "personalized" &&
    shouldSuppressPrimary(currentPrimaryKey, recentHistory)
  ) {
    primaryKeyOverride = pickNovelPrimaryKey(
      currentPrimaryKey,
      recentHistory,
      driverForMemory,
    );
  }
  if (
    driverForMemory === "bleeding_heavy" ||
    driverForMemory === "high_strain"
  ) {
    primaryKeyOverride = null;
  }

  insights = cleanupInsightText(insights);

  // ── Post-generation guard layer ──────────────────────────────────────────
  // Deterministic enforcement: catches zero-data overconfidence, direction
  // errors, contradictions, peak exaggeration, and hallucinations that GPT
  // prompt instructions failed to prevent.
  const guardResult = applyAllGuards({
    insights,
    cycleDay: cycleInfo.currentDay,
    cycleLength: effectiveCycleLength,
    phase: cycleInfo.phase,
    logsCount,
  });
  insights = guardResult.insights;

  const view = buildInsightView(context, insights, { primaryKeyOverride });

  let pmsWarning = null;
  if (contraceptionBehavior.showPmsForecast && completedCycleCount >= 2) {
    const pmsForecastForWarning =
      cycleInfo.currentDay >= 18 && context.mode === "personalized"
        ? buildPmsSymptomForecast(
            cycleInfo.phase,
            cycleInfo.currentDay,
            cycleInfo.daysUntilNextPhase,
            previousCycleDrivers,
            completedCycleCount,
          )
        : null;

    if (
      pmsForecastForWarning &&
      "available" in pmsForecastForWarning &&
      pmsForecastForWarning.available
    ) {
      const pms = pmsForecastForWarning as PmsForecast;
      pmsWarning = {
        available: true,
        headline: pms.headline,
        action: pms.action,
        likelySymptoms: pms.likelySymptoms,
        confidence: pms.confidence,
      };
    }
  }

  // Full payload — written to cache for internal use
  const cachePayload = {
    guardVersion: GUARD_VERSION,
    cycleDay: cycleInfo.currentDay,
    isNewUser,
    progress: {
      logsCount,
      nextMilestone,
      logsToNextMilestone: Math.max(0, nextMilestone - logsCount),
    },
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
      correlationPattern: effectiveStable
        ? "stable_state"
        : primaryInsightCause === "sleep_disruption"
          ? "sleep_disruption_primary"
          : correlation.patternKey,
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
        nextPeriodRange:
          contraceptionBehavior.showPeriodForecast &&
          (cyclePrediction.confidence === "variable" ||
            cyclePrediction.confidence === "irregular")
            ? {
                earliest: new Date(
                  cycleInfo.nextPeriodDate.getTime() -
                    cyclePrediction.stdDev * 86400000,
                )
                  .toISOString()
                  .split("T")[0],
                latest: new Date(
                  cycleInfo.nextPeriodDate.getTime() +
                    cyclePrediction.stdDev * 86400000,
                )
                  .toISOString()
                  .split("T")[0],
              }
            : undefined,
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
        recentStressLabel:
          numericBaseline.recentStressAvg !== null
            ? numericBaseline.recentStressAvg >= 2.4
              ? "elevated"
              : numericBaseline.recentStressAvg >= 1.6
                ? "moderate"
                : "calm"
            : null,
        recentMoodLabel:
          numericBaseline.recentMoodAvg !== null
            ? numericBaseline.recentMoodAvg >= 2.4
              ? "positive"
              : numericBaseline.recentMoodAvg <= 1.6
                ? "low"
                : "neutral"
            : null,
      },
      crossCycleNarrative: crossCycleNarrative
        ? {
            matchingCycles: crossCycleNarrative.matchingCycles,
            totalCyclesAnalyzed: crossCycleNarrative.totalCyclesAnalyzed,
            narrativeStatement: crossCycleNarrative.narrativeStatement,
            trend: crossCycleNarrative.trend,
          }
        : null,
      memoryContext,
      pmsWarning,
      lastAnticipationCycleDay: vyanaCtx.anticipation.anticipationType
        ? cycleInfo.currentDay
        : (anticipationFrequencyState.lastShownCycleDay ?? null),
      lastAnticipationTypeKey: vyanaCtx.anticipation.anticipationType
        ? vyanaCtx.anticipation.anticipationType
        : (anticipationFrequencyState.lastShownType ?? null),
    },
  };

  // "Has your period started?" prompt when period is delayed or extended cycle
  const periodAction = (isPeriodDelayed || isExtendedCycle)
    ? { show: true, label: "Has your period started?", ctaText: "Log period" }
    : null;

  // Client response
  const responsePayload = {
    cycleDay: cachePayload.cycleDay,
    isNewUser: cachePayload.isNewUser,
    progress: cachePayload.progress,
    confidence: cachePayload.confidence,
    isPeriodDelayed: cachePayload.isPeriodDelayed,
    daysOverdue: cachePayload.daysOverdue,
    isIrregular: cachePayload.isIrregular,
    isLearning,
    isExtendedCycle,
    insights: cachePayload.insights,
    view: cachePayload.view,
    aiEnhanced: cachePayload.aiEnhanced,
    transitionWarmup,
    periodAction,
  };

  // ── Cache write (awaited — needed for subsequent requests) ─────────────────
  const payloadJson = JSON.parse(
    JSON.stringify(cachePayload),
  ) as Prisma.InputJsonValue;
  await prisma.insightCache.upsert({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
    update: { payload: payloadJson },
    create: { userId: req.userId!, date: dayStart, payload: payloadJson },
  });

  // ── Respond immediately, then fire-and-forget background writes ──────────
  res.json(responsePayload);

  // Fire-and-forget: memory + history writes (don't block response)
  const backgroundWrites: Promise<unknown>[] = [];
  if (driverForMemory && context.mode === "personalized") {
    backgroundWrites.push(
      recordInsightMemoryOccurrence({
        userId: req.userId!,
        driver: driverForMemory,
        now,
      }),
    );
  }
  if (context.mode === "personalized") {
    const resolvedPrimaryKey = primaryKeyOverride ?? currentPrimaryKey;
    backgroundWrites.push(
      prisma.insightHistory.create({
        data: {
          userId: req.userId!,
          primaryKey: resolvedPrimaryKey,
          driver: driverForMemory,
          cycleDay: cycleInfo.currentDay,
          phase: cycleInfo.phase,
        },
      }),
    );
  }
  Promise.all(backgroundWrites).catch((err) =>
    console.error(JSON.stringify({ type: "background_write_error", error: String(err), timestamp: new Date().toISOString() })),
  );

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

  recordInsightGeneration(
    buildMonitorEntry({
      userId: req.userId!,
      cycleDay: cycleInfo.currentDay,
      phase: cycleInfo.phase,
      cycleMode,
      aiEnhanced,
      aiDebug,
      draft: draftInsights,
      output: insights,
      primaryDriver: driverForMemory,
      primaryCause: primaryInsightCause,
      driverCount: context.priorityDrivers.length,
      confidence: context.confidence,
      confidenceScore: context.confidenceScore,
      mode: context.mode,
      pipelineMs: Date.now() - pipelineStart,
    }),
  );
}

// ─── GET /api/insights/context ────────────────────────────────────────────────

export async function getInsightsContext(
  req: Request,
  res: Response,
): Promise<void> {
  const now = new Date();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  const cached = await prisma.insightCache.findUnique({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
  });

  if (!cached?.payload || !isInsightsPayloadCached(cached.payload)) {
    res.status(404).json({
      error: "No insights generated yet today. Call GET /api/insights first.",
    });
    return;
  }

  const full = cached.payload as Record<string, unknown>;
  const internal = (full._internal ?? {}) as Record<string, unknown>;

  res.json({
    cycleDay: full.cycleDay,
    mode: internal.mode ?? null,
    aiDebug: internal.aiDebug ?? null,
    correlationPattern: internal.correlationPattern ?? null,
    basedOn: internal.basedOn ?? null,
    cycleContext: internal.cycleContext ?? null,
    hormoneContext: internal.hormoneContext ?? null,
    contraceptionContext: internal.contraceptionContext ?? null,
    numericSummary: internal.numericSummary ?? null,
    crossCycleNarrative: internal.crossCycleNarrative ?? null,
    memoryContext: internal.memoryContext ?? null,
    pmsWarning: internal.pmsWarning ?? null,
  });
}

// ─── GET /api/insights/forecast ───────────────────────────────────────────────

export async function getInsightsForecast(
  req: Request,
  res: Response,
): Promise<void> {
  const now = new Date();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );

  // ── Parallel: cache + user data (both needed regardless of cache hit) ────
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
    res.json({
      ...(cached.forecast as object),
      transitionWarmup: cachedTransitionWarmup,
    });
    return;
  }
  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const {
    user,
    recentLogs,
    baselineLogs,
    numericBaseline,
    crossCycleNarrative,
  } = data;

  const forecastTransitionWarmup = buildTransitionWarmup(
    user.contraceptionChangedAt ?? null,
  );

  const contraceptionType = resolveContraceptionType(user.contraceptiveMethod);
  const contraceptionBehavior = getContraceptionBehavior(contraceptionType);

  const cycleMode = getCycleMode(user);

  // ── Parallel: cycle count + prediction context ────────────────────────────
  const [completedCycleCount, cyclePrediction] = await Promise.all([
    prisma.cycleHistory.count({
      where: {
        userId: req.userId!,
        endDate: { not: null },
        cycleLength: { not: null },
      },
    }),
    getCyclePredictionContext(req.userId!, user.cycleLength),
  ]);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;
  const todayCycle = calculateCycleInfo(
    user.lastPeriodStart,
    effectiveCycleLength,
    cycleMode,
  );
  const cycleNumber = getCycleNumber(
    user.lastPeriodStart,
    effectiveCycleLength,
  );
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
    effectiveCycleLength,
    cycleMode,
    cyclePrediction.confidence,
  );

  const logsCount = recentLogs.length;
  const isNewUser = logsCount < 3;
  const nextMilestone =
    logsCount < 3 ? 3 : logsCount < 7 ? 7 : logsCount < 14 ? 14 : 30;

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

    const forecastJson = JSON.parse(
      JSON.stringify(warmupPayload),
    ) as Prisma.InputJsonValue;
    await prisma.insightCache.upsert({
      where: { userId_date: { userId: req.userId!, date: dayStart } },
      update: { forecast: forecastJson },
      create: {
        userId: req.userId!,
        date: dayStart,
        payload: {},
        forecast: forecastJson,
      },
    });

    res.json(warmupPayload);
    return;
  }

  const forecastPreviousCycleDrivers =
    context.mode === "personalized"
      ? await getPreviousCycleDriverHistory(req.userId!)
      : [];

  const pmsSymptomForecast = contraceptionBehavior.showPmsForecast
    ? buildPmsSymptomForecast(
        todayCycle.phase,
        todayCycle.currentDay,
        todayCycle.daysUntilNextPhase,
        forecastPreviousCycleDrivers,
        completedCycleCount,
      )
    : null;

  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowCycle = calculateCycleInfoForDate(
    user.lastPeriodStart,
    tomorrowDate,
    effectiveCycleLength,
    cycleMode,
  );
  const tomorrowOutlook = buildTomorrowPreview(
    context,
    todayCycle.daysUntilNextPhase,
    variantIndex,
  );

  const nextPhaseInDays = todayCycle.daysUntilNextPhase;
  const softenedOutlook = softendeterministic(
    tomorrowOutlook,
    context.confidenceScore,
  );
  const dayWord = nextPhaseInDays === 1 ? "day" : "days";
  const nextPhasePreview =
    nextPhaseInDays <= 2
      ? `A phase shift may be approaching in about ${nextPhaseInDays} ${dayWord} — energy and mood patterns might start shifting soon.`
      : `Your current phase may continue for about ${nextPhaseInDays} ${dayWord}, with gradual changes possible near transition.`;

  const forecastConfidenceScore = context.confidenceScore;
  const confidenceLabel = getForecastConfidenceLabel(
    forecastConfidenceScore,
    logsCount,
  );
  const confidenceMessage =
    forecastConfidenceScore < 0.4
      ? "We're still learning your patterns — this forecast may not reflect your individual experience yet."
      : forecastConfidenceScore < 0.7
        ? "This forecast is based on emerging patterns from your logs — it may shift as we learn more."
        : "This forecast is based on your recent patterns — though individual responses can still vary.";

  const draftForecastPayload = {
    available: true,
    isNewUser,
    progress: {
      logsCount,
      nextMilestone,
      logsToNextMilestone: Math.max(0, nextMilestone - logsCount),
    },
    today: {
      phase: contraceptionBehavior.useNaturalCycleEngine
        ? todayCycle.phase
        : null,
      currentDay: todayCycle.currentDay,
      confidenceScore: forecastConfidenceScore,
      priorityDrivers: context.priorityDrivers,
    },
    forecast: {
      tomorrow: {
        date: tomorrowDate.toISOString().split("T")[0],
        phase: contraceptionBehavior.useNaturalCycleEngine
          ? tomorrowCycle.phase
          : null,
        outlook: softenedOutlook,
      },
      nextPhase: contraceptionBehavior.useNaturalCycleEngine
        ? { inDays: nextPhaseInDays, preview: nextPhasePreview }
        : null,
      confidence: {
        level:
          forecastConfidenceScore >= 0.7
            ? "high"
            : forecastConfidenceScore >= 0.4
              ? "medium"
              : "low",
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
      ? {
          narrativeStatement: crossCycleNarrative.narrativeStatement,
          trend: crossCycleNarrative.trend,
        }
      : null,
    cyclesCompleted: completedCycleCount,
    contraceptionContext: {
      type: contraceptionType,
      forecastMode: contraceptionBehavior.forecastMode,
      contextMessage: contraceptionBehavior.contextMessage || null,
    },
  };

  let forecastPayload: typeof draftForecastPayload & {
    forecastAiEnhanced?: boolean;
  } = { ...draftForecastPayload, forecastAiEnhanced: false };

  const forecastContraceptionType = resolveContraceptionType(
    user.contraceptiveMethod,
  );
  const forecastHormoneState = buildHormoneState(
    todayCycle.phase,
    todayCycle.currentDay,
    effectiveCycleLength,
    cycleMode,
    forecastContraceptionType,
  );
  const forecastHormoneLanguage = contraceptionBehavior.showHormoneCurves
    ? buildHormoneLanguage(
        forecastHormoneState,
        cyclePrediction.confidence === "reliable" ? 0.8 : 0.5,
      )
    : null;

  const forecastPrimaryInsightCause = detectPrimaryInsightCause({
    baselineDeviation: context.baselineDeviation,
    trends: context.trends,
    sleepDelta: numericBaseline.sleepDelta,
    priorityDrivers: context.priorityDrivers,
    recentLogs,
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

  const canUseAIForecast =
    logsCount >= 7 &&
    context.mode === "personalized" &&
    context.confidence !== "low";
  if (canUseAIForecast) {
    try {
      const rewritten = (await generateForecastWithGpt(
        context,
        draftForecastPayload,
        numericBaseline,
        crossCycleNarrative,
        user.name,
        forecastVyanaCtx,
      )) as typeof draftForecastPayload;

      const forecastText = JSON.stringify(rewritten);
      const hasForbiddenInForecast = [
        "you will feel",
        "this will happen",
        "will improve",
        "will get worse",
        "your estrogen is",
        "your progesterone is",
        "you are going to",
      ].some((phrase) => forecastText.toLowerCase().includes(phrase));

      if (!hasForbiddenInForecast) {
        forecastPayload = { ...rewritten, forecastAiEnhanced: true };
      }
    } catch {
      // keep draft
    }
  }

  const forecastJson = JSON.parse(
    JSON.stringify(forecastPayload),
  ) as Prisma.InputJsonValue;
  await prisma.insightCache.upsert({
    where: { userId_date: { userId: req.userId!, date: dayStart } },
    update: { forecast: forecastJson },
    create: {
      userId: req.userId!,
      date: dayStart,
      payload: {},
      forecast: forecastJson,
    },
  });

  res.json({ ...forecastPayload, transitionWarmup: forecastTransitionWarmup });
}