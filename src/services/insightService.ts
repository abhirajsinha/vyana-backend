import { DailyLog } from "@prisma/client";
import {
  CycleMode,
  CyclePredictionConfidence,
  Phase,
} from "./cycleEngine";
import { getDayInsight, getNormalizedDay, buildOrientationLine, type VariantKey } from "./cycleInsightLibrary";

type Trend = "increasing" | "decreasing" | "stable" | "insufficient";

export type PhaseTone = "recovery" | "build" | "growth" | "peak" | "stable_focus" | "decline";

export function getPhaseTone(cycleDay: number, cycleLength: number): PhaseTone {
  const lutealStart = Math.max(10, cycleLength - 13);
  const ovStart = Math.max(6, lutealStart - 3);
  const midLuteal = lutealStart + Math.floor((cycleLength - lutealStart) / 2);

  if (cycleDay <= 5) return "recovery";
  if (cycleDay <= Math.floor((ovStart - 5) / 2) + 5) return "build";
  if (cycleDay < ovStart) return "growth";
  if (cycleDay <= ovStart + 2) return "peak";
  if (cycleDay <= midLuteal) return "stable_focus";
  return "decline";
}

export const PHASE_TONE_PROMPTS: Record<PhaseTone, { description: string; allow: string; avoid: string }> = {
  recovery: {
    description: "Energy is low. Validate rest. Reduce expectations.",
    allow: "resting, recovering, easing, your body is doing real work, take it slow",
    avoid: "peak, strongest, best, push harder, high performance",
  },
  build: {
    description: "Energy is returning but NOT at peak. Gradual improvement.",
    allow: "improving, building, getting easier, coming back, growing, starting to feel",
    avoid: "peak, strongest, best, at its highest, monthly high, at its best",
  },
  growth: {
    description: "Energy is actively rising. Momentum is building. Confidence growing.",
    allow: "getting sharper, momentum building, confidence growing, stronger each day",
    avoid: "peak (unless 'approaching peak'), at its highest, at its best",
  },
  peak: {
    description: "This is the high point. Peak energy, confidence, clarity.",
    allow: "peak, strongest, best, sharpest, most capable, highest",
    avoid: "rest, take it slow, low energy, winding down",
  },
  stable_focus: {
    description: "Post-peak stability. Good for deep work, less social energy.",
    allow: "steady, focused, structured, consistent, independent work",
    avoid: "peak, strongest, rising, most energetic",
  },
  decline: {
    description: "Energy dropping. Sensitivity rising. Protect bandwidth.",
    allow: "winding down, heavier, more sensitive, lighter load, protect energy",
    avoid: "peak, strongest, best performance, push through",
  },
};

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
  phaseDay: number;
  phase: Phase;
  variant: VariantKey;
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
  stress_state: SignalState["stressState"];
  mood_state: SignalState["moodState"];
  priorityDrivers: string[];
  reasoning: string[];
  phaseTone: PhaseTone;
}

export interface DailyInsights {
  // Layered insight response (per LAYERED_INSIGHTS_RULES.md)
  layer1_insight: string;
  body_note: string;
  layer2_wrapper?: string;
  layer3_sentence?: string;
  orientation: string;
  // Action/recommendation (signal-driven when personalized, body_note when fallback)
  recommendation: string;
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
  | "stress_mood_strain"
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
  const ordered = [...logs].reverse();

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

  // Interaction flags claim causal relationships between signals
  // ("sleep and stress are feeding into each other"). This requires
  // enough data points to be defensible — 5 logs across multiple days.
  // At 3 logs, correlation ≠ causation; at 5+, the pattern is reliable.
  if (logs.length >= 5) {
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
  const ordered = [...logs].reverse();
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

  const recent = recentLogs.slice(0, 7);
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
  phase: Phase;
  phaseDay: number;
  variant: VariantKey;
}): InsightDriver[] {
  // Boost physical drivers on days with very_low library energy (menstrual days 1–2, luteal day 14)
  const isVeryLowEnergyDay = getDayInsight(input.phase, input.phaseDay, input.variant).energyLevel === "very_low";
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
    { key: "stress_mood_strain", score: 68, active: input.stressState === "elevated" && input.moodState === "low" },
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
  phaseDay: number = 1,
): InsightContext {
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
  // Variant is now selected externally via selectVariant() and passed via cycleNumber param
  // For backward compat, default to "A" here — the controller overrides this
  const variant: VariantKey = 0;
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
    phase,
    phaseDay,
    variant,
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
    phaseDay,
    phase,
    variant,
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
    stress_state: signals.stressState,
    mood_state: signals.moodState,
    sleep_variability: trends.sleepVariability,
    mood_variability: trends.moodVariability,
    priorityDrivers,
    reasoning,
    phaseTone: getPhaseTone(cycleDay, cycleLength),
  };
}
// ===================== UPDATED SERVICE =====================

/** Peak-positive: no problem drivers, uplifted mood, calm system — typical ovulation / late follicular “good days”. */
function isPeakPositiveWindow(ctx: InsightContext): boolean {
  return (
    ctx.mode === "personalized" &&
    ctx.priorityDrivers.length === 0 &&
    ctx.emotional_state === "uplifted" &&
    ctx.mental_state === "balanced" &&
    ctx.physical_state === "stable" &&
    (ctx.phase === "ovulation" || ctx.phase === "follicular")
  );
}

/**
 * Signals clearly positive regardless of phase. Phase should NOT inject negative
 * language when user data shows they are actually doing well.
 */
function isSignalPositive(ctx: InsightContext): boolean {
  return (
    ctx.mode === "personalized" &&
    ctx.priorityDrivers.length === 0 &&
    ctx.mental_state === "balanced" &&
    ctx.physical_state !== "high_strain" &&
    (ctx.emotional_state === "uplifted" || ctx.emotional_state === "stable") &&
    ctx.stress_state === "calm"
  );
}

function buildPhysicalInsight(ctx: InsightContext): string {
  if (ctx.mode === "fallback") {
    let out = getDayInsight(ctx.phase, ctx.phaseDay, ctx.variant, ctx.cycleMode).insight;
    if (ctx.cyclePredictionConfidence === "irregular") {
      out = out.replace(/\btoday\b/gi, "around this time").replace(/\busually\b/gi, "often");
    }
    return out;
  }

  if (ctx.bleeding_load === "heavy") {
    return `Your bleeding looks heavier today, which can increase weakness. Reduce exertion and prioritize recovery.`;
  }

  if (ctx.physical_state === "high_strain") {
    const variants = [
      `Your body is under more strain than usual today. Slowing down isn't optional right now — it's what helps.`,
      `Physical strain is higher than your baseline right now. Ease off where you can — your body needs the margin.`,
      `Your body is under more strain than usual today. Giving it space to recover will make tomorrow easier.`,
      `Strain is showing up physically today. Pull back on intensity and let recovery take priority.`,
    ];
    return variants[ctx.normalizedDay % variants.length]!;
  }

  if (isPeakPositiveWindow(ctx)) {
    if (ctx.phase === "ovulation") {
      return `Your energy is high right now — your body is in a strong, well-supported state. Movement and focus tend to feel easier in this window.`;
    }
    return `Your energy is building — your body is in a good place to take on more. Physical tasks often feel lighter than they did earlier in the cycle.`;
  }

  if (isSignalPositive(ctx)) {
    return `Your body feels steady and well-supported right now. Energy and recovery both look good.`;
  }

  if (ctx.priorityDrivers.includes("sleep_trend_declining")) {
    return ctx.recentLogsCount < 3
      ? `Your latest log suggests sleep quality may be dropping. This can affect energy recovery.`
      : `Sleep has been declining over recent days. This may affect physical recovery and energy.`;
  }

  const stableVariants = [
    "Your physical energy looks stable for this phase. Adjust activity based on how you feel.",
    "Physically, things are holding steady — no strong signals pulling you in either direction today.",
    "Your energy is in a neutral zone right now. Match your activity to what feels right.",
    "No major physical shifts today — your body is maintaining a steady baseline.",
  ];
  return stableVariants[ctx.normalizedDay % stableVariants.length]!;
}

function buildMentalInsight(ctx: InsightContext): string {
  if (ctx.mode === "fallback") {
    let out = getDayInsight(ctx.phase, ctx.phaseDay, ctx.variant, ctx.cycleMode).insight;
    if (ctx.cyclePredictionConfidence === "irregular") {
      out = out.replace(/\btoday\b/gi, "around this time").replace(/\busually\b/gi, "often");
    }
    return out;
  }

  if (ctx.mental_state === "stressed" || ctx.mental_state === "fatigued_and_stressed") {
    const isFatigued = ctx.mental_state === "fatigued_and_stressed";
    if (ctx.recentLogsCount < 3) {
      return isFatigued
        ? `Your latest log suggests stress and fatigue today. This may make focusing harder.`
        : `Your latest log suggests higher stress today. This may make focusing harder.`;
    }

    return isFatigued
      ? `Stress and fatigue have been building up. This is why focusing feels harder than it should right now.`
      : `Stress has been higher than your normal. It's starting to stack up and make everything feel heavier.`;
  }

  if (ctx.priorityDrivers.includes("stress_trend_spiking")) {
    return ctx.recentLogsCount < 3
      ? `Your logs suggest stress may be rising. This can make focusing harder.`
      : `Stress has been building for a few days. Your headspace is carrying more weight than it looks.`;
  }

  if (isPeakPositiveWindow(ctx)) {
    if (ctx.phase === "ovulation") {
      return `Focus and clarity are strong — things feel easier to handle and decisions come more naturally. This is a high-capacity window mentally.`;
    }
    return `Mental bandwidth is opening up — tasks feel more manageable than they did a week ago. Clarity tends to improve as energy builds in this phase.`;
  }

  if (isSignalPositive(ctx)) {
    return `Focus feels steady and manageable right now. No signs of mental strain or overload.`;
  }

  const mentalNeutralVariants = [
    "Your mental state looks balanced right now — no strong strain showing.",
    "Focus and clarity feel steady today — nothing pulling your attention off track.",
    "Mentally, things are holding steady — no signs of extra strain.",
    "Your mind feels clear today — no strong pressure showing.",
  ];
  return mentalNeutralVariants[ctx.normalizedDay % mentalNeutralVariants.length]!;
}

function buildEmotionalInsight(ctx: InsightContext): string {
  if (ctx.mode === "fallback") {
    return getDayInsight(ctx.phase, ctx.phaseDay, ctx.variant, ctx.cycleMode).insight;
  }

  if (ctx.emotional_state === "loaded") {
    return ctx.recentLogsCount < 3
      ? `Stress today may be affecting your mood. Emotional dips may feel sharper.`
      : [
          `How you're feeling emotionally has been heavier than usual. Giving yourself space to decompress will help more than pushing through.`,
          `Emotions have been sitting heavier lately. Letting yourself slow down is more productive than forcing through it.`,
          `Your emotional load has been building. A lighter schedule or some downtime would go further than willpower right now.`,
          `Things have felt emotionally weighty recently. Give yourself room — rest helps more than effort here.`,
        ][ctx.normalizedDay % 4]!;
  }

  if (isPeakPositiveWindow(ctx)) {
    if (ctx.phase === "ovulation") {
      return `You feel more open and engaged — social connection and motivation often come easier here. This is a connected, upbeat kind of energy.`;
    }
    return `Things feel lighter emotionally — there's less heaviness dragging through the day. Motivation and mood tend to lift in this part of the cycle.`;
  }

  if (isSignalPositive(ctx)) {
    return `Things feel emotionally steady right now. Nothing is pulling your mood down.`;
  }

  const emotionalNeutralVariants = [
    "Your emotional state looks steady right now — no strong shifts in either direction.",
    "Emotionally, things feel settled today — nothing is pulling your mood around.",
    "Your mood is holding even — no sharp dips or unexpected lifts showing up.",
    "Things feel emotionally neutral right now — steady, without much movement.",
  ];
  return emotionalNeutralVariants[ctx.normalizedDay % emotionalNeutralVariants.length]!;
}

function buildBroaderGuidance(ctx: InsightContext): string {
  if (ctx.recentLogsCount < 3) {
    return `Log mood, sleep, and stress for the next 3 days — the insights will get sharper fast.`;
  }
  const tone = ctx.phaseTone;
  if (ctx.phase === "menstrual") {
    return `Iron-rich food, early sleep, and fewer obligations this week — your body is doing its hardest work right now.`;
  }
  if (ctx.phase === "follicular" && (tone === "build" || tone === "recovery")) {
    return `Your energy is starting to come back — ease into things this week and let momentum build naturally.`;
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
      return getDayInsight(ctx.phase, ctx.phaseDay, ctx.variant, ctx.cycleMode).body_note;
    }
    if (isPeakPositiveWindow(ctx) || isSignalPositive(ctx)) {
      return `Lean into momentum today — social plans, focused work, or anything that needs your full presence tend to land easier in this window.`;
    }
    return `Keep your current rhythm and add one anchor habit today (sleep timing or movement) for consistency.`;
  }
  if (primary === "sleep_variability_high") {
    const sleepVarVariants = [
      "Pick a consistent bedtime and stick to it for the next 3 nights — the regularity will do more than extra hours.",
      "Your sleep timing has been inconsistent — locking in one fixed wake-up time for the next few days will help more than sleeping in.",
      "Sleep variability is what's dragging you down. Set one non-negotiable bedtime this week and protect it.",
      "Irregular sleep hits harder than short sleep. Aim for the same window tonight — consistency is the fix here.",
    ];
    return sleepVarVariants[ctx.normalizedDay % sleepVarVariants.length]!;
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
  if (primary === "stress_mood_strain") {
    return `Stress is weighing on your mood right now. One short break and one boundary today will help more than pushing through.`;
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
    return getDayInsight(ctx.phase, ctx.phaseDay, ctx.variant, ctx.cycleMode).body_note;
  }
  return `Keep your current rhythm and add one anchor habit today (sleep timing or movement) for consistency.`;
}

function buildWhyThisIsHappening(ctx: InsightContext): string {
  if (ctx.recentLogsCount === 0) {
    return getDayInsight(ctx.phase, ctx.phaseDay, ctx.variant, ctx.cycleMode).body_note;
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
    if (isPeakPositiveWindow(ctx) && ctx.phase === "ovulation") {
      return `Around ovulation, estrogen is typically elevated — that's often what drives this lift in energy, confidence, and clarity.`;
    }
    if (isPeakPositiveWindow(ctx) && ctx.phase === "follicular") {
      return `In this part of your cycle, hormones are often moving toward a stronger energy window — that can show up as better mood and motivation.`;
    }
    if (isSignalPositive(ctx)) {
      return `Your signals are steady and positive right now. No strong shifts driving how you feel.`;
    }
    if (ctx.trends.length > 0) {
      return `Recent trends (${ctx.trends.join(", ")}) indicate your body and mood are responding to day-to-day changes.`;
    }
  }

  if (ctx.recentLogsCount < 3) {
    return `This combines your cycle phase with limited data. It will refine as more logs are added.`;
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

  // Driver-first explanations — avoid defaulting to hormones when a signal driver exists
  const primaryDriver = ctx.priorityDrivers[0];
  if (primaryDriver?.includes("stress")) {
    return `Elevated stress is the main factor shaping how you feel right now — your cycle phase may be adding to it, but stress is what's driving this.`;
  }
  if (primaryDriver?.includes("sleep")) {
    return `Your sleep pattern is the main factor here — when sleep is off, it cascades into energy, mood, and recovery regardless of cycle phase.`;
  }
  if (primaryDriver?.includes("mood")) {
    return `Your declining mood is the primary factor right now — this is coming from your logged signals more than from cycle-related shifts.`;
  }

  return `Cycle-related hormonal shifts can naturally influence energy, mood, and symptoms even with limited logs.`;
}


/** Flatten false alarms when raw logs are objectively steady (see isStableInsightState). */
export function insightContextAsStableBaseline(ctx: InsightContext): InsightContext {
  return {
    ...ctx,
    baselineDeviation: [],
    trends: [],
    interaction_flags: [],
    priorityDrivers: [],
    phase_deviation: null,
    physical_state: "stable",
    mental_state: "balanced",
    emotional_state: "stable",
    reasoning: [
      `Phase is ${ctx.phase}`,
      "Recent logs are steady — no meaningful shifts in sleep, stress, or mood.",
    ],
  };
}

export function generateRuleBasedInsights(
  ctx: InsightContext,
  daysToNextPeriod: number = 0,
): DailyInsights {
  const dayInsight = getDayInsight(ctx.phase, ctx.phaseDay, ctx.variant, ctx.cycleMode);

  // Layer 1: always present — from the 6-variant library
  const layer1_insight = dayInsight.insight;
  const body_note = dayInsight.body_note;

  // Orientation: computed from cycle context
  const orientation = buildOrientationLine(ctx.cycleDay, ctx.phase, daysToNextPeriod);

  // Recommendation: signal-driven when personalized, body_note when fallback
  const recommendation = ctx.mode === "fallback"
    ? dayInsight.body_note
    : buildRecommendation(ctx);

  return {
    layer1_insight,
    body_note,
    orientation,
    recommendation,
  };
}

// ─── Zero-data / low-data language tier system ──────────────────────────────

/**
 * Rewrites assertive insight text into suggestive/phase-educational language
 * for users with zero logged data. We know their cycle day and phase but
 * nothing about how they actually feel.
 */
function rewriteForZeroData(insights: DailyInsights, phase: Phase, cycleDay: number): DailyInsights {
  const soften = (text: string): string =>
    text
      // State assertions → suggestions
      .replace(/\bYou feel\b/gi, "You may feel")
      .replace(/\bYou are feeling\b/gi, "You might be feeling")
      .replace(/\bEnergy is\b/gi, "Energy can feel")
      .replace(/\bFocus is\b/gi, "Focus might be")
      .replace(/\bMood is\b/gi, "Mood may be")
      .replace(/\bYour body is doing\b/gi, "Your body may be going through")
      .replace(/\bYou might feel low energy today\b/gi, "Energy can still feel lower toward the end of your period")
      .replace(/\bYou might feel more stable today\b/gi, "Things may start to feel more stable around this time")
      .replace(/\bYou might feel more active today\b/gi, "Many people start to feel more active around this time")
      .replace(/\bYou might feel confident today\b/gi, "Confidence and energy tend to build around this time")
      .replace(/\bYou might feel more sensitive today\b/gi, "Sensitivity can increase around this part of the cycle")
      .replace(/\bYou might feel confident and energised\b/gi, "This is often a higher-energy window in the cycle")
      .replace(/\bYou might feel balanced today\b/gi, "Things may start to feel more balanced around this time")
      .replace(/\bYou may feel drained today\b/gi, "It's common to feel more drained around this time")
      .replace(/\bYou may feel more calm today\b/gi, "Many people feel calmer around this time")
      .replace(/\bYou might feel more reflective today\b/gi, "This part of the cycle can bring a more reflective mood")
      // Remove "today" specificity — we don't know about today
      .replace(/\btoday\b/gi, "around this time")
      .replace(/\bright now\b/gi, "during this phase")
      // Technical → accessible
      .replace(/\bhormone floor\b/gi, "lowest hormone levels")
      .replace(/\bhormone floor recedes\b/gi, "hormone levels begin stabilizing")
      .replace(/\bYour hormone floor\b/gi, "Hormone levels around this time")
      .trim();

  return {
    layer1_insight: soften(insights.layer1_insight),
    body_note: soften(insights.body_note),
    orientation: insights.orientation,
    recommendation: soften(insights.recommendation),
  };
}

/**
 * Softens insight language based on how much data we have.
 * - 0 logs: full suggestive rewrite (Tier 1)
 * - 1-4 logs: light softening via low-confidence treatment (Tier 2)
 * - 5+ logs: return as-is — already personalized (Tier 3)
 */
export function softenForConfidenceTier(
  insights: DailyInsights,
  logsCount: number,
  phase: Phase,
  cycleDay: number,
): DailyInsights {
  // Tier 3: 6+ logs — return as-is (personalized with enough data)
  // At 5 logs we have trends but no baseline comparison yet,
  // so "Based on your recent logs..." hedging is still appropriate.
  if (logsCount >= 6) return insights;

  // Tier 2: 1-4 logs — light softening (replace "is" with "may be" style)
  if (logsCount >= 1) {
    const lightSoften = (text: string): string =>
      text
        .replace(/(?:^|(?<=[.!?\n]\s*))You feel\b/gi, "Based on your recent log, you may feel")
        .replace(/\bEnergy is\b/gi, "Energy may be")
        .replace(/\bFocus is\b/gi, "Focus may be")
        .replace(/\bYour sleep has been\b/gi, "Your latest log suggests sleep has been")
        .replace(/\bStress has been\b/gi, "Your recent entry suggests stress has been")
        .replace(/\bYour pattern shows\b/gi, "Your recent log suggests")
        .replace(/\bOver the last few days\b/gi, "Based on your recent log");
    return {
      layer1_insight: lightSoften(insights.layer1_insight),
      body_note: lightSoften(insights.body_note),
      orientation: insights.orientation,
      recommendation: lightSoften(insights.recommendation),
    };
  }

  // Tier 1: 0 logs — full suggestive rewrite
  return rewriteForZeroData(insights, phase, cycleDay);
}

// ─── Momentum protection ────────────────────────────────────────────────────

const POSITIVE_MOOD = new Set(["good", "positive", "happy", "great", "calm"]);
const NEGATIVE_MOOD = new Set(["bad", "low", "sad", "terrible", "awful"]);
const LOW_STRESS = new Set(["low", "calm", "mild"]);
const HIGH_STRESS = new Set(["high", "elevated", "severe"]);

/**
 * Detects if a user has a positive streak broken by a single bad day.
 * Returns a narrative override if momentum break is detected.
 */
export function detectMomentumBreak(
  recentLogs: Pick<DailyLog, "mood" | "stress" | "sleep" | "energy">[]
): { isMomentumBreak: boolean; streakDays: number } {
  if (recentLogs.length < 5) return { isMomentumBreak: false, streakDays: 0 };

  const today = recentLogs[0];
  const previous = recentLogs.slice(1, 5);

  // Check if today is a negative day
  const todayMood = today?.mood?.trim().toLowerCase() ?? "";
  const todayStress = today?.stress?.trim().toLowerCase() ?? "";
  const todayNegative =
    NEGATIVE_MOOD.has(todayMood) ||
    HIGH_STRESS.has(todayStress) ||
    (typeof today?.sleep === "number" && today.sleep < 5);

  if (!todayNegative) return { isMomentumBreak: false, streakDays: 0 };

  // Check if previous 4+ days were positive
  let streakDays = 0;
  for (const log of previous) {
    const mood = log.mood?.trim().toLowerCase() ?? "";
    const stress = log.stress?.trim().toLowerCase() ?? "";
    const isPositive =
      (POSITIVE_MOOD.has(mood) || mood === "neutral") &&
      (LOW_STRESS.has(stress) || stress === "moderate") &&
      (typeof log.sleep !== "number" || log.sleep >= 6);

    if (isPositive) {
      streakDays++;
    } else {
      break;
    }
  }

  return {
    isMomentumBreak: streakDays >= 4,
    streakDays,
  };
}

/**
 * Applies momentum-aware framing to insights when a positive streak
 * is broken by a single bad day.
 */
export function applyMomentumBreakNarrative(
  insights: DailyInsights,
  streakDays: number,
): DailyInsights {
  return {
    ...insights,
    layer1_insight: `Today feels rougher than your recent ${streakDays}-day streak — that's a real contrast, and your body is noticing it. One harder day doesn't erase the good stretch you've had.`,
    body_note: `After ${streakDays} solid days, a dip stands out more. It doesn't mean the pattern is breaking — it's just one off day.`,
  };
}
