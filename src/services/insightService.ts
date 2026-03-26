import { DailyLog } from "@prisma/client";
import { Phase } from "./cycleEngine";
import { getDayInsight } from "./cycleInsightLibrary";

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
  phase: Phase;
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
}

type InsightDriver =
  | "sleep_variability_high"
  | "sleep_below_baseline"
  | "stress_above_baseline"
  | "stress_trend_spiking"
  | "sleep_trend_declining"
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
      : weightedMoodScore <= 1.4
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
}): InsightDriver[] {
  const candidates: Array<{ key: InsightDriver; score: number; active: boolean }> = [
    { key: "sleep_variability_high", score: 100, active: input.sleepVariability === "high" },
    { key: "sleep_below_baseline", score: 95, active: input.baselineDeviation.includes("sleep_below_personal_baseline") },
    { key: "stress_above_baseline", score: 90, active: input.baselineDeviation.includes("stress_above_personal_baseline") },
    { key: "stress_trend_spiking", score: 88, active: input.stressTrend === "increasing" && input.stressState !== "calm" },
    { key: "bleeding_heavy", score: 85, active: input.bleedingLoad === "heavy" },
    { key: "sleep_trend_declining", score: 83, active: input.sleepTrend === "decreasing" && input.sleepState !== "optimal" },
    {
      key: "sleep_stress_amplification",
      score: 80,
      active: input.interactionFlags.includes("sleep_stress_amplification"),
    },
    { key: "mood_stress_coupling", score: 75, active: input.interactionFlags.includes("mood_stress_coupling") },
    { key: "sedentary_strain", score: 70, active: input.interactionFlags.includes("sedentary_strain") },
    { key: "phase_deviation", score: 65, active: Boolean(input.phaseDeviation) },
    { key: "high_strain", score: 60, active: input.physicalState === "high_strain" },
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
  baselineScope: InsightContext["baselineScope"] = "none"
): InsightContext {
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
    phase,
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
    return getDayInsight(ctx.cycleDay).physicalExpectation;
  }

  if (ctx.bleeding_load === "heavy") {
    return `Your bleeding looks heavier today, which can increase weakness.\nReduce exertion and prioritize recovery.`;
  }

  if (ctx.physical_state === "high_strain") {
    return `Your body shows signs of higher strain today.\nConsider slowing down and focusing on recovery.`;
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
    return getDayInsight(ctx.cycleDay).mentalExpectation;
  }

  if (ctx.mental_state === "stressed" || ctx.mental_state === "fatigued_and_stressed") {
    const isFatigued = ctx.mental_state === "fatigued_and_stressed";
    if (ctx.recentLogsCount < 3) {
      return isFatigued
        ? `Your latest log suggests stress and fatigue today.\nThis may make focusing harder.`
        : `Your latest log suggests higher stress today.\nThis may make focusing harder.`;
    }

    return isFatigued
      ? `Stress and fatigue have been elevated recently.\nThis may increase mental load.`
      : `Stress levels have been elevated recently.\nThis may increase mental load.`;
  }

  if (ctx.priorityDrivers.includes("stress_trend_spiking")) {
    return ctx.recentLogsCount < 3
      ? `Your logs suggest stress may be rising.\nThis can make focusing harder.`
      : `Stress has been building over recent days.\nThis may be increasing mental load.`;
  }

  return `Your recent signal suggests a relatively balanced mental state.\nNo strong strain signals detected.`;
}

function buildEmotionalInsight(ctx: InsightContext): string {
  if (ctx.mode === "fallback") {
    return getDayInsight(ctx.cycleDay).emotionalNote;
  }

  if (ctx.emotional_state === "loaded") {
    return ctx.recentLogsCount < 3
      ? `Stress today may be affecting your mood.\nEmotional dips may feel sharper.`
      : `You may be carrying higher emotional load recently.\nTake space to decompress.`;
  }

  return `Your recent signals suggest a steady emotional state.\nNo major fluctuations detected.`;
}

function buildBroaderGuidance(ctx: InsightContext): string {
  if (ctx.recentLogsCount < 3) {
    return `Log mood, sleep, and stress for the next 3 days to unlock more personalized insights.`;
  }
  return `This week, aim for steady basics: regular sleep, gentle movement, and brief stress resets when things feel heavy.`;
}

function buildRecommendation(ctx: InsightContext): string {
  const primary = ctx.priorityDrivers[0];
  if (!primary) {
    if (ctx.mode === "fallback") {
      return getDayInsight(ctx.cycleDay).actionTip;
    }
    return `Keep your current rhythm and add one anchor habit today (sleep timing or movement) for consistency.`;
  }
  if (primary === "sleep_variability_high") {
    return `Focus on a consistent sleep window for the next 3 nights; regular timing can stabilize recovery and mood.`;
  }
  if (primary === "sleep_below_baseline") {
    return `Your sleep is below your usual baseline; prioritize an earlier wind-down tonight and lighter load tomorrow morning.`;
  }
  if (primary === "stress_above_baseline") {
    return `Stress is above your usual baseline; insert two short reset breaks today to prevent overload accumulation.`;
  }
  if (primary === "stress_trend_spiking") {
    return `Stress is trending upward; add a short reset break between tasks today to prevent accumulation.`;
  }
  if (primary === "bleeding_heavy") {
    return `Prioritize hydration and iron-rich meals today, and reduce exertion while bleeding is heavier.`;
  }
  if (primary === "sleep_trend_declining") {
    return `Sleep has been declining; prioritize an earlier wind-down tonight to reverse this trend before it compounds.`;
  }
  if (primary === "sleep_stress_amplification") {
    return `Use a 10-minute calming routine before bed and one midday reset to break the sleep-stress loop.`;
  }
  if (primary === "mood_stress_coupling") {
    return `Reduce decision load today and use short decompression pauses when stress spikes to protect mood stability.`;
  }
  if (primary === "sedentary_strain") {
    return `Add two gentle movement breaks today; short activity can reduce stress-related body heaviness.`;
  }
  if (primary === "phase_deviation") {
    return `Keep routines lighter today and monitor symptoms; if this mismatch persists for several days, consider extra recovery support.`;
  }
  if (primary === "high_strain") {
    return `Try one recovery action now: hydration, a warm compress, or a 20-minute low-intensity walk.`;
  }
  if (ctx.mental_state === "stressed") {
    return `Use a 5-minute reset block (breathing + single-priority planning) to reduce mental overload.`;
  }
  if (ctx.mode === "fallback") {
    return getDayInsight(ctx.cycleDay).actionTip;
  }
  return `Keep your current rhythm and add one anchor habit today (sleep timing or movement) for consistency.`;
}

function buildWhyThisIsHappening(ctx: InsightContext): string {
  if (ctx.recentLogsCount === 0) {
    return getDayInsight(ctx.cycleDay).hormoneNote;
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
      return `Stress and fatigue signals can amplify mental load, making fatigue and discomfort feel stronger in this phase.`;
    }
    if (ctx.emotional_state === "loaded") {
      return `Elevated stress or low mood signals can make your emotional system feel more loaded today.`;
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
  };
}
