import { DailyLog } from "@prisma/client";
import {
  CycleMode,
  CyclePredictionConfidence,
  Phase,
} from "./cycleEngine";
import { getDayInsight, getNormalizedDay } from "./cycleInsightLibrary";

type Trend = "increasing" | "decreasing" | "stable" | "insufficient";

interface SignalState {
  sleepState: "poor" | "moderate" | "optimal" | "unknown";
  stressState: "calm" | "moderate" | "elevated" | "unknown";
  moodState: "low" | "neutral" | "positive" | "unknown";
  exerciseState: "sedentary" | "light" | "active" | "unknown";
  symptomState: string[];
  bleedingLoad: "light" | "moderate" | "heavy" | "unknown";
  physicalState: "high_strain" | "low_recovery" | "stable" | "unknown";
  mentalState: "stressed" | "balanced" | "fatigued" | "fatigued_and_stressed" | "unknown";
  emotionalState: "loaded" | "stable" | "uplifted" | "unknown";
  interactionFlags: string[];
}

interface TrendState {
  sleepTrend: Trend;
  stressTrend: Trend;
  moodTrend: Trend;
  sleepVariability: "low" | "moderate" | "high" | "insufficient";
  moodVariability: "low" | "moderate" | "high" | "insufficient";
}

export interface InsightContext {
  recentLogsCount: number;
  cycleDay: number;
  normalizedDay: number;
  phase: Phase;
  variantIndex: 0 | 1 | 2;
  cycleMode: CycleMode;
  cyclePredictionConfidence: CyclePredictionConfidence;
  physical_state: SignalState["physicalState"];
  mental_state: SignalState["mentalState"];
  emotional_state: SignalState["emotionalState"];
  bleeding_load: SignalState["bleedingLoad"];
  interaction_flags: string[];
  phase_deviation: string | null;
  symptoms: string[];
  trends: string[];
  mode: "personalized" | "fallback";
  confidence: "low" | "medium" | "high";
  confidenceScore: number;
  baselineDeviation: string[];
  baselineScope: "phase" | "global" | "none";
  sleep_variability: TrendState["sleepVariability"];
  mood_variability: TrendState["moodVariability"];
  priorityDrivers: string[];
  reasoning: string[];
}

export interface DailyInsights {
  physicalInsight: string;
  mentalInsight: string;
  emotionalInsight: string;
  whyThisIsHappening: string;
  solution: string;
  recommendation: string;
  tomorrowPreview: string;
}

type InsightDriver =
  | "sleep_variability_high"
  | "sleep_below_baseline"
  | "stress_above_baseline"
  | "stress_trend_spiking"
  | "sleep_trend_declining"
  | "mood_trend_declining"
  | "bleeding_heavy"
  | "sleep_stress_amplification"
  | "mood_stress_coupling"
  | "sedentary_strain"
  | "phase_deviation"
  | "high_strain";

function normalizeMood(value?: string | null): SignalState["moodState"] {
  if (!value) return "unknown";
  const v = value.toLowerCase();
  if (["sad", "low", "anxious", "irritable", "down"].some((m) => v.includes(m))) return "low";
  if (["happy", "good", "great", "calm", "positive"].some((m) => v.includes(m))) return "positive";
  return "neutral";
}

function normalizeStress(value?: string | null): SignalState["stressState"] {
  if (!value) return "unknown";
  const v = value.toLowerCase();
  if (["high", "elevated", "severe", "stressed"].some((m) => v.includes(m))) return "elevated";
  if (["medium", "moderate"].some((m) => v.includes(m))) return "moderate";
  return "calm";
}

function normalizeSleep(hours?: number | null): SignalState["sleepState"] {
  if (typeof hours !== "number") return "unknown";
  if (hours < 6) return "poor";
  if (hours < 7) return "moderate";
  if (hours <= 9) return "optimal";
  return "moderate";
}

function normalizeExercise(value?: string | null): SignalState["exerciseState"] {
  if (!value) return "unknown";
  const v = value.toLowerCase();
  if (["none", "no", "sedentary"].some((m) => v.includes(m))) return "sedentary";
  if (["workout", "run", "gym", "strength", "active"].some((m) => v.includes(m))) return "active";
  return "light";
}

/**
 * Weighted mean over chronological order (array index 0 = oldest, last = newest).
 * Missing entries must be `null` so they are dropped before weights are applied (no index skew).
 */
function weightedAverageNullable(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === "number");
  if (valid.length === 0) return null;
  const weights = valid.map((_, idx) => idx + 1);
  const weightedSum = valid.reduce((sum, value, idx) => sum + value * weights[idx]!, 0);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  return weightedSum / totalWeight;
}

function getSymptoms(log?: DailyLog): string[] {
  if (!log) return [];
  const out: string[] = [];
  if (log.pain) out.push(`${log.pain} cramps`);
  if (typeof log.padsChanged === "number") out.push(`pads changed: ${log.padsChanged}`);
  if (log.cravings) out.push(`${log.cravings} cravings`);
  if (log.fatigue) out.push(`${log.fatigue} fatigue`);
  if (Array.isArray(log.symptoms) && log.symptoms.length > 0) out.push(...log.symptoms);
  return out;
}

function getBleedingLoad(padsChanged?: number | null): SignalState["bleedingLoad"] {
  if (typeof padsChanged !== "number") return "unknown";
  if (padsChanged >= 7) return "heavy";
  if (padsChanged >= 4) return "moderate";
  return "light";
}

/** Compare earliest vs latest *present* sample in timeline order (nulls preserve gaps). */
function numberTrendNullable(values: (number | null)[]): Trend {
  const validIndexes = values
    .map((v, i) => (typeof v === "number" ? i : -1))
    .filter((i) => i !== -1);
  if (validIndexes.length < 3) return "insufficient";
  const firstIdx = validIndexes[0]!;
  const lastIdx = validIndexes[validIndexes.length - 1]!;
  const first = values[firstIdx]!;
  const last = values[lastIdx]!;
  const delta = last - first;
  if (Math.abs(delta) < 0.35) return "stable";
  return delta > 0 ? "increasing" : "decreasing";
}

function variabilityLabel(values: number[]): TrendState["sleepVariability"] {
  if (values.length < 3) return "insufficient";
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  if (sd >= 1.1) return "high";
  if (sd >= 0.55) return "moderate";
  return "low";
}

function stateToScore(state: string, map: Record<string, number>): number {
  return map[state] ?? 0;
}

function buildSignals(logs: DailyLog[]): SignalState {
  const latest = logs[0];
  const ordered = [...logs].slice(0, 5).reverse();

  const sleepSeries = ordered.map((l) => (typeof l.sleep === "number" ? l.sleep : null));
  const stressSeries = ordered.map((l) => {
    if (!l.stress?.trim()) return null;
    const s = normalizeStress(l.stress);
    const sc = stateToScore(s, { calm: 1, moderate: 2, elevated: 3 });
    return sc > 0 ? sc : null;
  });
  const moodSeries = ordered.map((l) => {
    if (!l.mood?.trim()) return null;
    const m = normalizeMood(l.mood);
    const sc = stateToScore(m, { low: 1, neutral: 2, positive: 3 });
    return sc > 0 ? sc : null;
  });

  const weightedSleep = weightedAverageNullable(sleepSeries);
  const weightedStressScore = weightedAverageNullable(stressSeries);
  const weightedMoodScore = weightedAverageNullable(moodSeries);

  const sleepState = normalizeSleep(weightedSleep);
  const stressState =
    weightedStressScore === null
      ? "unknown"
      : weightedStressScore >= 2.4
      ? "elevated"
      : weightedStressScore >= 1.6
      ? "moderate"
      : "calm";
  const moodState =
    weightedMoodScore === null
      ? "unknown"
      : weightedMoodScore <= 1.6
      ? "low"
      : weightedMoodScore >= 2.4
      ? "positive"
      : "neutral";
  const exerciseState = normalizeExercise(latest?.exercise);
  const symptomState = getSymptoms(latest);
  const bleedingLoad = getBleedingLoad(latest?.padsChanged);
  const interactionFlags: string[] = [];

  let physicalState: SignalState["physicalState"] = "stable";
  if (
    sleepState === "poor" ||
    bleedingLoad === "heavy" ||
    symptomState.some((s) => s.toLowerCase().includes("severe")) ||
    (exerciseState === "sedentary" && stressState === "elevated")
  ) {
    physicalState = "high_strain";
  } else if (sleepState === "moderate" || stressState === "moderate") {
    physicalState = "low_recovery";
  }

  let mentalState: SignalState["mentalState"] = "balanced";
  if (stressState === "elevated" && sleepState === "poor") {
    mentalState = "fatigued_and_stressed";
  } else if (stressState === "elevated") {
    mentalState = "stressed";
  } else if (sleepState === "poor") {
    mentalState = "fatigued";
  }

  let emotionalState: SignalState["emotionalState"] = "stable";
  if (moodState === "low" || stressState === "elevated") emotionalState = "loaded";
  else if (moodState === "positive") emotionalState = "uplifted";

  // Avoid "pattern/coupling" type claims for brand new users.
  // Interactions can be re-enabled once we have enough days to justify them.
  if (logs.length >= 3) {
    if (stressState === "elevated" && sleepState === "poor") {
      interactionFlags.push("sleep_stress_amplification");
    }
    if (moodState === "low" && stressState !== "calm") {
      interactionFlags.push("mood_stress_coupling");
    }
    if (exerciseState === "sedentary" && stressState === "elevated") {
      interactionFlags.push("sedentary_strain");
    }
  }

  return {
    sleepState,
    stressState,
    moodState,
    exerciseState,
    symptomState,
    bleedingLoad,
    physicalState,
    mentalState,
    emotionalState,
    interactionFlags,
  };
}

function buildTrends(logs: DailyLog[]): TrendState {
  const ordered = [...logs].slice(0, 5).reverse();
  const sleepSeries = ordered.map((l) => (typeof l.sleep === "number" ? l.sleep : null));
  const stressSeries = ordered.map((l) => {
    if (!l.stress?.trim()) return null;
    const s = normalizeStress(l.stress);
    const sc = stateToScore(s, { calm: 1, moderate: 2, elevated: 3 });
    return sc > 0 ? sc : null;
  });
  const moodSeries = ordered.map((l) => {
    if (!l.mood?.trim()) return null;
    const m = normalizeMood(l.mood);
    const sc = stateToScore(m, { low: 1, neutral: 2, positive: 3 });
    return sc > 0 ? sc : null;
  });

  const sleepForVar = sleepSeries.filter((v): v is number => typeof v === "number");
  const moodForVar = moodSeries.filter((v): v is number => typeof v === "number");

  return {
    sleepTrend: numberTrendNullable(sleepSeries),
    stressTrend: numberTrendNullable(stressSeries),
    moodTrend: numberTrendNullable(moodSeries),
    sleepVariability: variabilityLabel(sleepForVar),
    moodVariability: variabilityLabel(moodForVar),
  };
}

function formatTrends(trends: TrendState): string[] {
  const out: string[] = [];
  if (trends.sleepTrend !== "insufficient") out.push(`Sleep ${trends.sleepTrend}`);
  if (trends.stressTrend !== "insufficient") out.push(`Stress ${trends.stressTrend}`);
  if (trends.moodTrend !== "insufficient") out.push(`Mood ${trends.moodTrend}`);
  if (trends.sleepVariability !== "insufficient") out.push(`Sleep variability ${trends.sleepVariability}`);
  if (trends.moodVariability !== "insufficient") out.push(`Mood variability ${trends.moodVariability}`);
  return out;
}

function modeFor(logs: DailyLog[], signals: SignalState): InsightContext["mode"] {
  const strongSignal =
    signals.physicalState === "high_strain" || signals.mentalState === "stressed" || signals.emotionalState === "loaded";
  // For <3 logs, keep tone conservative and avoid trend/coupling framing.
  return logs.length >= 3 || strongSignal ? "personalized" : "fallback";
}

function buildBaselineDeviation(recentLogs: DailyLog[], baselineLogs: DailyLog[]): string[] {
  if (baselineLogs.length < 7 || recentLogs.length === 0) return [];

  const recent = recentLogs.slice(0, 5);
  const recentSleep = weightedAverageNullable(recent.map((l) => (typeof l.sleep === "number" ? l.sleep : null)));
  const baselineSleep = weightedAverageNullable(
    baselineLogs.map((l) => (typeof l.sleep === "number" ? l.sleep : null)),
  );
  const recentStress = weightedAverageNullable(
    recent.map((l) => {
      if (!l.stress?.trim()) return null;
      const s = normalizeStress(l.stress);
      const sc = stateToScore(s, { calm: 1, moderate: 2, elevated: 3 });
      return sc > 0 ? sc : null;
    }),
  );
  const baselineStress = weightedAverageNullable(
    baselineLogs.map((l) => {
      if (!l.stress?.trim()) return null;
      const s = normalizeStress(l.stress);
      const sc = stateToScore(s, { calm: 1, moderate: 2, elevated: 3 });
      return sc > 0 ? sc : null;
    }),
  );

  const deviations: string[] = [];
  if (recentSleep !== null && baselineSleep !== null && recentSleep <= baselineSleep - 0.9) {
    deviations.push("sleep_below_personal_baseline");
  }
  if (recentStress !== null && baselineStress !== null && recentStress >= baselineStress + 0.6) {
    deviations.push("stress_above_personal_baseline");
  }
  return deviations;
}

function resolvePriorityDrivers(input: {
  baselineDeviation: string[];
  sleepVariability: TrendState["sleepVariability"];
  bleedingLoad: SignalState["bleedingLoad"];
  interactionFlags: string[];
  phaseDeviation: string | null;
  physicalState: SignalState["physicalState"];
  stressTrend: TrendState["stressTrend"];
  stressState: SignalState["stressState"];
  sleepTrend: TrendState["sleepTrend"];
  sleepState: SignalState["sleepState"];
  moodTrend: TrendState["moodTrend"];
  moodState: SignalState["moodState"];
  cycleDay: number;
  variantIndex: 0 | 1 | 2;
}): InsightDriver[] {
  // Boost physical drivers on days with very_low library energy (days 1–2, day 28)
  const isVeryLowEnergyDay = getDayInsight(input.cycleDay, input.variantIndex).energyLevel === "very_low";
  const physicalBoost = isVeryLowEnergyDay ? 0.3 : 0;

  const candidates: Array<{ key: InsightDriver; score: number; active: boolean }> = [
    { key: "sleep_variability_high", score: 100, active: input.sleepVariability === "high" },
    { key: "sleep_below_baseline", score: 95, active: input.baselineDeviation.includes("sleep_below_personal_baseline") },
    { key: "stress_above_baseline", score: 90, active: input.baselineDeviation.includes("stress_above_personal_baseline") },
    { key: "stress_trend_spiking", score: 88, active: input.stressTrend === "increasing" && input.stressState !== "calm" },
    { key: "bleeding_heavy", score: 85 + physicalBoost, active: input.bleedingLoad === "heavy" },
    { key: "sleep_trend_declining", score: 83, active: input.sleepTrend === "decreasing" && input.sleepState !== "optimal" },
    {
      key: "sleep_stress_amplification",
      score: 80,
      active: input.interactionFlags.includes("sleep_stress_amplification"),
    },
    { key: "mood_stress_coupling", score: 75, active: input.interactionFlags.includes("mood_stress_coupling") },
    { key: "mood_trend_declining", score: 72, active: input.moodTrend === "decreasing" && input.moodState !== "positive" },
    { key: "sedentary_strain", score: 70, active: input.interactionFlags.includes("sedentary_strain") },
    { key: "phase_deviation", score: 65, active: Boolean(input.phaseDeviation) },
    { key: "high_strain", score: 60 + physicalBoost, active: input.physicalState === "high_strain" },
  ];

  return candidates
    .filter((c) => c.active)
    .sort((a, b) => b.score - a.score)
    .map((c) => c.key);
}

export function buildInsightContext(
  phase: Phase,
  cycleDay: number,
  recentLogs: DailyLog[],
  baselineLogs: DailyLog[] = [],
  baselineScope: InsightContext["baselineScope"] = "none",
  cycleNumber: number = 0,
  cycleLength: number = 28,
  cycleMode: CycleMode = "natural",
  cyclePredictionConfidence: CyclePredictionConfidence = "unknown",
): InsightContext {
  const variantIndex = (cycleNumber % 3) as 0 | 1 | 2;
  const normalizedDay = getNormalizedDay(cycleDay, cycleLength, phase);
  const recentLogsCount = recentLogs.length;
  const signals = buildSignals(recentLogs);
  const trends = buildTrends(recentLogs);
  const trendList = formatTrends(trends);
  const mode = modeFor(recentLogs, signals);
  const baselineDeviation = buildBaselineDeviation(recentLogs, baselineLogs);

  let phaseDeviation: string | null = null;
  if (phase === "ovulation" && (signals.sleepState === "poor" || signals.physicalState === "high_strain")) {
    phaseDeviation = "Energy/recovery dip detected during ovulation window.";
  } else if (phase === "follicular" && signals.moodState === "low") {
    phaseDeviation = "Lower mood than expected for rising-energy follicular phase.";
  }
  // luteal stress/mood variability is often expected — no deviation flag here.

  const confidence: InsightContext["confidence"] =
    recentLogs.length >= 5 ? "high" : recentLogs.length >= 3 ? "medium" : "low";
  const trendCount = trendList.length;
  const signalStrength =
    (signals.physicalState === "high_strain" ? 1 : 0) +
    (signals.mentalState === "fatigued_and_stressed" ? 1 : 0) +
    (signals.emotionalState === "loaded" ? 1 : 0);
  const logPortion = recentLogs.length === 0 ? 0 : recentLogs.length / 5;
  const confidenceScore = Math.min(
    1,
    logPortion * 0.6 + Math.min(1, trendCount / 3) * 0.25 + Math.min(1, signalStrength / 3) * 0.15
  );
  const priorityDrivers = resolvePriorityDrivers({
    baselineDeviation,
    sleepVariability: trends.sleepVariability,
    bleedingLoad: signals.bleedingLoad,
    interactionFlags: signals.interactionFlags,
    phaseDeviation,
    physicalState: signals.physicalState,
    stressTrend: trends.stressTrend,
    stressState: signals.stressState,
    sleepTrend: trends.sleepTrend,
    sleepState: signals.sleepState,
    moodTrend: trends.moodTrend,
    moodState: signals.moodState,
    cycleDay,
    variantIndex,
  });

  const reasoning = [
    `Phase is ${phase}`,
    `Physical state mapped to ${signals.physicalState}`,
    `Mental state mapped to ${signals.mentalState}`,
    `Emotional state mapped to ${signals.emotionalState}`,
    `Bleeding load mapped to ${signals.bleedingLoad}`,
    signals.interactionFlags.length
      ? `Cross-signal interactions: ${signals.interactionFlags.join(", ")}`
      : "No strong cross-signal interaction detected",
    baselineDeviation.length
      ? `Personal baseline deviations: ${baselineDeviation.join(", ")}`
      : "No strong personal baseline deviation detected",
    priorityDrivers.length
      ? `Insight priority drivers: ${priorityDrivers.join(", ")}`
      : "No high-priority drivers triggered",
    phaseDeviation ? `Phase deviation detected: ${phaseDeviation}` : "No strong phase deviation detected",
    trendList.length ? `Trends: ${trendList.join(", ")}` : "Not enough trend data yet",
  ];

  return {
    recentLogsCount,
    cycleDay,
    normalizedDay,
    phase,
    variantIndex,
    cycleMode,
    cyclePredictionConfidence,
    physical_state: signals.physicalState,
    mental_state: signals.mentalState,
    emotional_state: signals.emotionalState,
    bleeding_load: signals.bleedingLoad,
    interaction_flags: signals.interactionFlags,
    phase_deviation: phaseDeviation,
    symptoms: signals.symptomState,
    trends: trendList,
    mode,
    confidence,
    confidenceScore: Number(confidenceScore.toFixed(2)),
    baselineDeviation,
    baselineScope,
    sleep_variability: trends.sleepVariability,
    mood_variability: trends.moodVariability,
    priorityDrivers,
    reasoning,
  };
}
// ===================== UPDATED SERVICE =====================

function buildPhysicalInsight(ctx: InsightContext): string {
  if (ctx.mode === "fallback") {
    let out = getDayInsight(
      ctx.normalizedDay,
      ctx.variantIndex,
      ctx.cycleMode,
    ).physicalExpectation;
    if (ctx.cyclePredictionConfidence === "irregular") {
      out = out.replace(/\btoday\b/gi, "around this time").replace(/\busually\b/gi, "often");
    }
    return out;
  }

  if (ctx.bleeding_load === "heavy") {
    return `Your bleeding looks heavier today, which can increase weakness.\nReduce exertion and prioritize recovery.`;
  }

  if (ctx.physical_state === "high_strain") {
    return `Your body is under more strain than usual today.\nSlowing down isn't optional right now — it's what helps.`;
  }

  if (ctx.priorityDrivers.includes("sleep_trend_declining")) {
    return ctx.recentLogsCount < 3
      ? `Your latest log suggests sleep quality may be dropping.\nThis can affect energy recovery.`
      : `Sleep has been declining over recent days.\nThis may affect physical recovery and energy.`;
  }

  return `Your physical energy looks stable for this phase.\nAdjust activity based on how you feel.`;
}

function buildMentalInsight(ctx: InsightContext): string {
  if (ctx.mode === "fallback") {
    let out = getDayInsight(
      ctx.normalizedDay,
      ctx.variantIndex,
      ctx.cycleMode,
    ).mentalExpectation;
    if (ctx.cyclePredictionConfidence === "irregular") {
      out = out.replace(/\btoday\b/gi, "around this time").replace(/\busually\b/gi, "often");
    }
    return out;
  }

  if (ctx.mental_state === "stressed" || ctx.mental_state === "fatigued_and_stressed") {
    const isFatigued = ctx.mental_state === "fatigued_and_stressed";
    if (ctx.recentLogsCount < 3) {
      return isFatigued
        ? `Your latest log suggests stress and fatigue today.\nThis may make focusing harder.`
        : `Your latest log suggests higher stress today.\nThis may make focusing harder.`;
    }

    return isFatigued
      ? `Stress and fatigue have been building up.\nThis is why focusing feels harder than it should right now.`
      : `Stress has been higher than your normal.\nIt's starting to stack up and make everything feel heavier.`;
  }

  if (ctx.priorityDrivers.includes("stress_trend_spiking")) {
    return ctx.recentLogsCount < 3
      ? `Your logs suggest stress may be rising.\nThis can make focusing harder.`
      : `Stress has been building for a few days.\nYour headspace is carrying more weight than it looks.`;
  }

  return `Your recent signal suggests a relatively balanced mental state.\nNo strong strain signals detected.`;
}

function buildEmotionalInsight(ctx: InsightContext): string {
  if (ctx.mode === "fallback") {
    return getDayInsight(
      ctx.normalizedDay,
      ctx.variantIndex,
      ctx.cycleMode,
    ).emotionalNote;
  }

  if (ctx.emotional_state === "loaded") {
    return ctx.recentLogsCount < 3
      ? `Stress today may be affecting your mood.\nEmotional dips may feel sharper.`
      : `How you're feeling emotionally has been heavier than usual.\nGiving yourself space to decompress will help more than pushing through.`;
  }

  return `Your emotional state looks steady right now.\nNo strong shifts in either direction.`;
}

function buildBroaderGuidance(ctx: InsightContext): string {
  if (ctx.recentLogsCount < 3) {
    return `Log mood, sleep, and stress for the next 3 days — the insights will get sharper fast.`;
  }
  if (ctx.phase === "menstrual") {
    return `Iron-rich food, early sleep, and fewer obligations this week — your body is doing its hardest work right now.`;
  }
  if (ctx.phase === "follicular") {
    return `This week is a good time to take on harder things — your energy is on the way up and your resilience is higher than usual.`;
  }
  if (ctx.phase === "ovulation") {
    return `Your peak window — use it for whatever needs your best focus or presence this week.`;
  }
  if (ctx.phase === "luteal" && ctx.cycleDay >= 22) {
    return `Wind down obligations where you can this week. Your body is already working harder than it looks.`;
  }
  if (ctx.phase === "luteal") {
    return `This week, keep your sleep consistent and protect your recovery time — stress lands harder in this phase.`;
  }
  return `Steady basics this week: regular sleep, a little movement, and short breaks when things feel heavy.`;
}

function buildRecommendation(ctx: InsightContext): string {
  const primary = ctx.priorityDrivers[0];
  if (!primary) {
    if (ctx.mode === "fallback") {
      return getDayInsight(ctx.cycleDay, ctx.variantIndex).actionTip;
    }
    return `Keep your current rhythm and add one anchor habit today (sleep timing or movement) for consistency.`;
  }
  if (primary === "sleep_variability_high") {
    return `Pick a consistent bedtime and stick to it for the next 3 nights — the regularity will do more than extra hours.`;
  }
  if (primary === "sleep_below_baseline") {
    return `Get to bed 30 minutes earlier tonight. It will change how tomorrow feels.`;
  }
  if (primary === "stress_above_baseline") {
    return `Two short breaks today — even 5 minutes each — will stop this from spiralling into tonight.`;
  }
  if (primary === "stress_trend_spiking") {
    return `One short reset between tasks today will stop this from compounding — don't wait until tonight.`;
  }
  if (primary === "bleeding_heavy") {
    return `Iron-rich food and extra water today — your body is losing more than usual and it needs the support.`;
  }
  if (primary === "sleep_trend_declining") {
    return `Get to bed 30 minutes earlier tonight to start reversing this before it gets harder to shake.`;
  }
  if (primary === "sleep_stress_amplification") {
    return `A 10-minute wind-down before bed and one midday pause today — breaking this loop now is easier than tomorrow.`;
  }
  if (primary === "mood_stress_coupling") {
    return `Keep your task list short today. When stress spikes, take 5 minutes before reacting — it protects how you feel tonight.`;
  }
  if (primary === "sedentary_strain") {
    return `A short walk today — even 10 minutes — will help more than rest alone right now.`;
  }
  if (primary === "phase_deviation") {
    return `Keep things lighter today — your body is out of its usual rhythm and pushing through rarely helps.`;
  }
  if (primary === "high_strain") {
    return `Pick one recovery action now: heat on your lower abdomen, hydration, or a short walk — don't wait until later.`;
  }
  if (ctx.mental_state === "stressed") {
    return `5 minutes of focused breathing now will lower the mental weight more than powering through.`;
  }
  if (ctx.mode === "fallback") {
    return getDayInsight(ctx.cycleDay, ctx.variantIndex).actionTip;
  }
  return `Keep your current rhythm and add one anchor habit today (sleep timing or movement) for consistency.`;
}

function buildWhyThisIsHappening(ctx: InsightContext): string {
  if (ctx.recentLogsCount === 0) {
    return getDayInsight(
      ctx.normalizedDay,
      ctx.variantIndex,
      ctx.cycleMode,
    ).hormoneNote;
  }

  // If the engine decided we have a strong signal, prefer signal-derived reasoning
  // even with limited log count (eg. 1–2 logs).
  if (ctx.mode === "personalized") {
    if (ctx.phase_deviation) {
      return `${ctx.phase_deviation} This likely reflects a temporary mismatch between expected phase energy and current recovery signals.`;
    }
    if (ctx.bleeding_load === "heavy") {
      return `Higher pad usage suggests heavier bleeding, which can temporarily lower energy and increase weakness.`;
    }
    if (ctx.physical_state === "high_strain") {
      return `Your recent signals combine into high body strain, likely from recovery load, symptoms, and sleep/stress mix.`;
    }
    if (ctx.mental_state === "stressed" || ctx.mental_state === "fatigued_and_stressed") {
      return `When stress and fatigue stack up together, they amplify each other — what feels like a lot right now probably is.`;
    }
    if (ctx.emotional_state === "loaded") {
      return `Stress and low mood feed into each other — how you're feeling right now has a reason, it's not just in your head.`;
    }
    if (ctx.trends.length > 0) {
      return `Recent trends (${ctx.trends.join(", ")}) indicate your body and mood are responding to day-to-day changes.`;
    }
  }

  if (ctx.recentLogsCount < 3) {
    return `This combines your cycle phase with limited data.\nIt will refine as more logs are added.`;
  }

  if (ctx.phase_deviation) {
    return `${ctx.phase_deviation} This likely reflects a temporary mismatch between expected phase energy and current recovery signals.`;
  }
  if (ctx.bleeding_load === "heavy") {
    return `Higher pad usage suggests heavier bleeding, which can temporarily lower energy and increase weakness.`;
  }
  if (ctx.physical_state === "high_strain") {
    return `Your recent signals combine into high body strain, likely from recovery load, symptoms, and sleep/stress mix.`;
  }
  if (ctx.mental_state === "stressed" || ctx.mental_state === "fatigued_and_stressed") {
    return `Stress has stayed elevated across recent logs, which can amplify fatigue and discomfort in this phase.`;
  }
  if (ctx.trends.length > 0) {
    return `Recent trends (${ctx.trends.join(", ")}) indicate your body and mood are responding to day-to-day changes.`;
  }
  return `Cycle-related hormonal shifts can naturally influence energy, mood, and symptoms even with limited logs.`;
}

export interface DailyInsightV2 {
  hook: string;
  core: string;
  pattern?: string;
  why?: string;
  action: string;
  guidance?: string;
  tomorrow: string;
  confidenceLabel: string;
}

export function generateHook(
  driver: string | null,
  ctx: InsightContext,
  correlationPattern?: string | null,
): string {
  if (driver === "bleeding_heavy") {
    return "Your body is doing a lot right now.";
  }
  if (driver === "high_strain") {
    return "Today is one of the harder days — that's real.";
  }
  if (driver === "sleep_below_baseline") {
    return "Your body hasn't been getting the rest it's used to.";
  }
  if (driver === "stress_above_baseline") {
    return "It makes sense if things feel heavier today.";
  }
  if (driver === "stress_trend_spiking") {
    return "Something has been building up over the last few days.";
  }
  if (driver === "sleep_trend_declining") {
    return "Your sleep has been slipping and your body is noticing.";
  }
  if (driver === "sleep_stress_amplification") {
    return "Poor sleep and rising stress are feeding into each other right now.";
  }
  if (driver === "mood_stress_coupling") {
    return "It's not just in your head — stress and mood are connected today.";
  }
  if (driver === "cycle_recurrence" || correlationPattern === "cycle_recurrence") {
    return "This tends to happen around this time in your cycle.";
  }
  if (ctx.phase === "menstrual" && ctx.cycleDay <= 2) {
    return "Today can feel like the hardest day — your body is doing real work.";
  }
  if (ctx.phase === "menstrual") {
    return "Your body is in recovery mode right now.";
  }
  if (ctx.phase === "luteal" && ctx.cycleDay >= 22) {
    return "You might feel a bit more sensitive than usual — that's part of this phase.";
  }
  if (ctx.phase === "luteal") {
    return "This phase can make everything feel slightly heavier than it is.";
  }
  if (ctx.phase === "ovulation") {
    return "This should be one of your stronger days.";
  }
  if (ctx.phase === "follicular") {
    return "Your energy is starting to come back.";
  }
  return "This shift you're feeling has a reason.";
}

export function buildCoreInsight(
  insights: DailyInsights,
  ctx: InsightContext,
): string {
  const driver = ctx.priorityDrivers[0];
  if (
    driver === "bleeding_heavy" ||
    driver === "high_strain" ||
    driver === "sleep_below_baseline" ||
    driver === "sleep_trend_declining"
  ) {
    return insights.physicalInsight;
  }
  if (
    driver === "stress_above_baseline" ||
    driver === "stress_trend_spiking" ||
    driver === "sleep_stress_amplification"
  ) {
    return insights.mentalInsight;
  }
  if (driver === "mood_stress_coupling" || driver === "mood_trend_declining") {
    return insights.emotionalInsight;
  }
  return insights.physicalInsight;
}

export function buildPatternReassurance(
  ctx: InsightContext,
  correlationPattern: string | null,
): string | undefined {
  if (ctx.recentLogsCount < 3) return undefined;
  if (correlationPattern === "cycle_recurrence") {
    return "This tends to happen around this time in your cycle — your body follows a pattern here.";
  }
  if (correlationPattern === "pre_period_mood_convergence") {
    return "This is a known window in your cycle. It passes within a day or two of your period starting.";
  }
  if (correlationPattern === "luteal_stress_sensitivity") {
    return "Stress hits harder in this phase — same stressor, stronger effect. It's not you, it's timing.";
  }
  if (correlationPattern === "ovulation_energy_blocked") {
    return "This should be a high-energy window. Your sleep or stress is dampening it — not permanent.";
  }
  if (correlationPattern === "follicular_momentum") {
    return "Your body is in a recovery arc right now — this upward trend usually continues.";
  }
  if (ctx.phase === "menstrual" && ctx.cycleDay <= 3) {
    return "The first 1–3 days are the hardest. It gets noticeably better from day 3 onward.";
  }
  if (ctx.phase === "luteal" && ctx.cycleDay >= 22) {
    return "This sensitivity is hormonal and temporary — it lifts within a day or two of your period.";
  }
  return undefined;
}

export function generateRuleBasedInsights(ctx: InsightContext): DailyInsights {
  const solution = buildRecommendation(ctx);
  const recommendation = buildBroaderGuidance(ctx);
  return {
    physicalInsight: buildPhysicalInsight(ctx),
    mentalInsight: buildMentalInsight(ctx),
    emotionalInsight: buildEmotionalInsight(ctx),
    whyThisIsHappening: buildWhyThisIsHappening(ctx),
    solution,
    recommendation,
    // Basic tomorrowPreview from day-specific library. Controller replaces with
    // trend-adjusted version from tomorrowEngine before sending to client.
    tomorrowPreview: getDayInsight(
      ctx.normalizedDay,
      ctx.variantIndex,
      ctx.cycleMode,
    ).tomorrowPreview,
  };
}
