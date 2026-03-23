import { DailyLog } from "@prisma/client";
import { Phase } from "./cycleEngine";

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

function weightedAverage(values: number[]): number | null {
  if (values.length === 0) return null;
  const weights = values.map((_, idx) => idx + 1);
  const weightedSum = values.reduce((sum, value, idx) => sum + value * weights[idx], 0);
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
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

function numberTrend(values: number[]): Trend {
  if (values.length < 3) return "insufficient";
  const first = values[0];
  const last = values[values.length - 1];
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

  const weightedSleep = weightedAverage(
    ordered.map((l) => l.sleep).filter((v): v is number => typeof v === "number")
  );
  const weightedStressScore = weightedAverage(
    ordered
      .map((l) => normalizeStress(l.stress))
      .map((s) => stateToScore(s, { calm: 1, moderate: 2, elevated: 3 }))
      .filter((v) => v > 0)
  );
  const weightedMoodScore = weightedAverage(
    ordered
      .map((l) => normalizeMood(l.mood))
      .map((m) => stateToScore(m, { low: 1, neutral: 2, positive: 3 }))
      .filter((v) => v > 0)
  );

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
    interactionFlags.push("sleep_stress_amplification");
  } else if (stressState === "elevated") {
    mentalState = "stressed";
  } else if (sleepState === "poor") {
    mentalState = "fatigued";
  }

  let emotionalState: SignalState["emotionalState"] = "stable";
  if (moodState === "low" || stressState === "elevated") emotionalState = "loaded";
  else if (moodState === "positive") emotionalState = "uplifted";

  if (moodState === "low" && stressState !== "calm") {
    interactionFlags.push("mood_stress_coupling");
  }
  if (exerciseState === "sedentary" && stressState === "elevated") {
    interactionFlags.push("sedentary_strain");
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
  const sleepValues = ordered.map((l) => l.sleep).filter((v): v is number => typeof v === "number");
  const stressValues = ordered
    .map((l) => normalizeStress(l.stress))
    .map((s) => stateToScore(s, { calm: 1, moderate: 2, elevated: 3 }))
    .filter((v) => v > 0);
  const moodValues = ordered
    .map((l) => normalizeMood(l.mood))
    .map((m) => stateToScore(m, { low: 1, neutral: 2, positive: 3 }))
    .filter((v) => v > 0);

  return {
    sleepTrend: numberTrend(sleepValues),
    stressTrend: numberTrend(stressValues),
    moodTrend: numberTrend(moodValues),
    sleepVariability: variabilityLabel(sleepValues),
    moodVariability: variabilityLabel(moodValues),
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
  return logs.length >= 3 || strongSignal ? "personalized" : "fallback";
}

function buildBaselineDeviation(recentLogs: DailyLog[], baselineLogs: DailyLog[]): string[] {
  if (baselineLogs.length < 7 || recentLogs.length === 0) return [];

  const recent = recentLogs.slice(0, 5);
  const recentSleep = weightedAverage(recent.map((l) => l.sleep).filter((v): v is number => typeof v === "number"));
  const baselineSleep = weightedAverage(
    baselineLogs.map((l) => l.sleep).filter((v): v is number => typeof v === "number")
  );
  const recentStress = weightedAverage(
    recent
      .map((l) => normalizeStress(l.stress))
      .map((s) => stateToScore(s, { calm: 1, moderate: 2, elevated: 3 }))
      .filter((v) => v > 0)
  );
  const baselineStress = weightedAverage(
    baselineLogs
      .map((l) => normalizeStress(l.stress))
      .map((s) => stateToScore(s, { calm: 1, moderate: 2, elevated: 3 }))
      .filter((v) => v > 0)
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
}): InsightDriver[] {
  const candidates: Array<{ key: InsightDriver; score: number; active: boolean }> = [
    { key: "sleep_variability_high", score: 100, active: input.sleepVariability === "high" },
    { key: "sleep_below_baseline", score: 95, active: input.baselineDeviation.includes("sleep_below_personal_baseline") },
    { key: "stress_above_baseline", score: 90, active: input.baselineDeviation.includes("stress_above_personal_baseline") },
    { key: "bleeding_heavy", score: 85, active: input.bleedingLoad === "heavy" },
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
  recentLogs: DailyLog[],
  baselineLogs: DailyLog[] = [],
  baselineScope: InsightContext["baselineScope"] = "none"
): InsightContext {
  const signals = buildSignals(recentLogs);
  const trends = buildTrends(recentLogs);
  const trendList = formatTrends(trends);
  const mode = modeFor(recentLogs, signals);
  const baselineDeviation = buildBaselineDeviation(recentLogs, baselineLogs);
  const phaseDeviation =
    phase === "ovulation" && (signals.sleepState === "poor" || signals.physicalState === "high_strain")
      ? "Energy/recovery dip detected during ovulation window."
      : phase === "luteal" && signals.stressState === "elevated"
      ? null
      : phase === "follicular" && signals.moodState === "low"
      ? "Lower mood than expected for rising-energy follicular phase."
      : null;

  const confidence: InsightContext["confidence"] =
    recentLogs.length >= 5 ? "high" : recentLogs.length >= 3 ? "medium" : "low";
  const trendCount = trendList.length;
  const signalStrength =
    (signals.physicalState === "high_strain" ? 1 : 0) +
    (signals.mentalState === "fatigued_and_stressed" ? 1 : 0) +
    (signals.emotionalState === "loaded" ? 1 : 0);
  const confidenceScore = Math.min(
    1,
    Math.max(0.2, recentLogs.length / 5) * 0.6 + Math.min(1, trendCount / 3) * 0.25 + Math.min(1, signalStrength / 3) * 0.15
  );
  const priorityDrivers = resolvePriorityDrivers({
    baselineDeviation,
    sleepVariability: trends.sleepVariability,
    bleedingLoad: signals.bleedingLoad,
    interactionFlags: signals.interactionFlags,
    phaseDeviation,
    physicalState: signals.physicalState,
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

function buildPhysicalInsight(ctx: InsightContext): string {
  if (ctx.mode === "fallback") {
    return `In the ${ctx.phase} phase, energy shifts are common; a lighter routine can support recovery.`;
  }
  if (ctx.bleeding_load === "heavy") {
    return `Your bleeding looks heavier today, which can increase weakness and body strain.`;
  }
  if (ctx.interaction_flags.includes("sedentary_strain")) {
    return `Low movement with elevated stress is adding physical strain, so your body may feel heavier than usual.`;
  }
  if (ctx.sleep_variability === "high") {
    return `Your sleep pattern is inconsistent across recent days, which can reduce physical recovery quality.`;
  }
  if (ctx.physical_state === "high_strain") {
    return `Your body shows high strain today, likely from combined recovery load and symptoms.`;
  }
  if (ctx.physical_state === "low_recovery") {
    return `Your body seems to be in low recovery mode, so pacing activities can help stability.`;
  }
  return `Your physical signals look relatively stable for this point in your cycle.`;
}

function buildMentalInsight(ctx: InsightContext): string {
  if (ctx.mental_state === "stressed") {
    return `Your recent logs suggest elevated cognitive strain, especially with stress carrying across days.`;
  }
  if (ctx.mental_state === "fatigued_and_stressed") {
    return `Low recovery and elevated stress are amplifying each other, which can increase mental fatigue today.`;
  }
  if (ctx.interaction_flags.includes("sleep_stress_amplification")) {
    return `Recent sleep-stress interaction is reinforcing cognitive load, so focus may feel harder than usual.`;
  }
  if (ctx.mental_state === "fatigued") {
    return `Your focus may feel heavier today because recovery signals point to mental fatigue.`;
  }
  return `Your mental load appears balanced overall, with no strong strain pattern right now.`;
}

function buildEmotionalInsight(ctx: InsightContext): string {
  if (ctx.mood_variability === "high") {
    return `Your mood has been fluctuating more than usual, suggesting an emotionally variable pattern this week.`;
  }
  if (ctx.interaction_flags.includes("mood_stress_coupling")) {
    return `Your mood appears tightly coupled with stress right now, so emotional dips may track stressful moments quickly.`;
  }
  if (ctx.emotional_state === "loaded") {
    return `Emotionally, you may be carrying extra load today; this aligns with your current phase context.`;
  }
  if (ctx.emotional_state === "uplifted") {
    return `Your emotional trend looks uplifted, which can be a strong window for meaningful tasks.`;
  }
  return `Your emotional state appears steady, with manageable variation across recent days.`;
}

function buildRecommendation(ctx: InsightContext): string {
  const primary = ctx.priorityDrivers[0];
  if (!primary) {
    if (ctx.mode === "fallback") {
      return `Log mood, sleep, and stress for the next 3 days to unlock more personalized insights.`;
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
  if (primary === "bleeding_heavy") {
    return `Prioritize hydration and iron-rich meals today, and reduce exertion while bleeding is heavier.`;
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
    return `Log mood, sleep, and stress for the next 3 days to unlock more personalized insights.`;
  }
  return `Keep your current rhythm and add one anchor habit today (sleep timing or movement) for consistency.`;
}

function buildWhyThisIsHappening(ctx: InsightContext): string {
  if (ctx.confidenceScore < 0.45) {
    return `This insight is based on limited recent data, so it may shift as more daily logs are added.`;
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
  if (ctx.mental_state === "stressed") {
    return `Stress has stayed elevated across recent logs, which can amplify fatigue and discomfort in this phase.`;
  }
  if (ctx.trends.length > 0) {
    return `Recent trends (${ctx.trends.join(", ")}) indicate your body and mood are responding to day-to-day changes.`;
  }
  return `Cycle-related hormonal shifts can naturally influence energy, mood, and symptoms even with limited logs.`;
}

export function generateRuleBasedInsights(ctx: InsightContext): DailyInsights {
  const solution = buildRecommendation(ctx);
  return {
    physicalInsight: buildPhysicalInsight(ctx),
    mentalInsight: buildMentalInsight(ctx),
    emotionalInsight: buildEmotionalInsight(ctx),
    whyThisIsHappening: buildWhyThisIsHappening(ctx),
    solution,
    recommendation: solution,
  };
}
