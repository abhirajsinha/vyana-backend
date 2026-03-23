import { DailyLog } from "@prisma/client";
import { Phase } from "./cycleEngine";

type Trend = "increasing" | "decreasing" | "stable" | "insufficient";

interface SignalState {
  sleepState: "poor" | "moderate" | "optimal" | "unknown";
  stressState: "calm" | "moderate" | "elevated" | "unknown";
  moodState: "low" | "neutral" | "positive" | "unknown";
  exerciseState: "sedentary" | "light" | "active" | "unknown";
  symptomState: string[];
  physicalState: "high_strain" | "low_recovery" | "stable" | "unknown";
  mentalState: "stressed" | "balanced" | "fatigued" | "unknown";
  emotionalState: "loaded" | "stable" | "uplifted" | "unknown";
}

interface TrendState {
  sleepTrend: Trend;
  stressTrend: Trend;
  moodTrend: Trend;
}

export interface InsightContext {
  phase: Phase;
  physical_state: SignalState["physicalState"];
  mental_state: SignalState["mentalState"];
  emotional_state: SignalState["emotionalState"];
  symptoms: string[];
  trends: string[];
  mode: "personalized" | "fallback";
  confidence: "low" | "medium" | "high";
  reasoning: string[];
}

export interface DailyInsights {
  physicalInsight: string;
  mentalInsight: string;
  emotionalInsight: string;
  recommendation: string;
}

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

function getSymptoms(log?: DailyLog): string[] {
  if (!log) return [];
  const out: string[] = [];
  if (log.pain) out.push(`${log.pain} cramps`);
  if (log.cravings) out.push(`${log.cravings} cravings`);
  if (log.fatigue) out.push(`${log.fatigue} fatigue`);
  if (Array.isArray(log.symptoms) && log.symptoms.length > 0) out.push(...log.symptoms);
  return out;
}

function numberTrend(values: number[]): Trend {
  if (values.length < 3) return "insufficient";
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  if (Math.abs(delta) < 0.35) return "stable";
  return delta > 0 ? "increasing" : "decreasing";
}

function stateToScore(state: string, map: Record<string, number>): number {
  return map[state] ?? 0;
}

function buildSignals(logs: DailyLog[]): SignalState {
  const latest = logs[0];
  const sleepState = normalizeSleep(latest?.sleep);
  const stressState = normalizeStress(latest?.stress);
  const moodState = normalizeMood(latest?.mood);
  const exerciseState = normalizeExercise(latest?.exercise);
  const symptomState = getSymptoms(latest);

  let physicalState: SignalState["physicalState"] = "stable";
  if (
    sleepState === "poor" ||
    symptomState.some((s) => s.toLowerCase().includes("severe")) ||
    (exerciseState === "sedentary" && stressState === "elevated")
  ) {
    physicalState = "high_strain";
  } else if (sleepState === "moderate" || stressState === "moderate") {
    physicalState = "low_recovery";
  }

  let mentalState: SignalState["mentalState"] = "balanced";
  if (stressState === "elevated") mentalState = "stressed";
  else if (sleepState === "poor") mentalState = "fatigued";

  let emotionalState: SignalState["emotionalState"] = "stable";
  if (moodState === "low" || stressState === "elevated") emotionalState = "loaded";
  else if (moodState === "positive") emotionalState = "uplifted";

  return {
    sleepState,
    stressState,
    moodState,
    exerciseState,
    symptomState,
    physicalState,
    mentalState,
    emotionalState,
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
  };
}

function formatTrends(trends: TrendState): string[] {
  const out: string[] = [];
  if (trends.sleepTrend !== "insufficient") out.push(`Sleep ${trends.sleepTrend}`);
  if (trends.stressTrend !== "insufficient") out.push(`Stress ${trends.stressTrend}`);
  if (trends.moodTrend !== "insufficient") out.push(`Mood ${trends.moodTrend}`);
  return out;
}

function modeFor(logs: DailyLog[], signals: SignalState): InsightContext["mode"] {
  const strongSignal =
    signals.physicalState === "high_strain" || signals.mentalState === "stressed" || signals.emotionalState === "loaded";
  return logs.length >= 3 || strongSignal ? "personalized" : "fallback";
}

export function buildInsightContext(phase: Phase, recentLogs: DailyLog[]): InsightContext {
  const signals = buildSignals(recentLogs);
  const trends = buildTrends(recentLogs);
  const trendList = formatTrends(trends);
  const mode = modeFor(recentLogs, signals);

  const confidence: InsightContext["confidence"] =
    recentLogs.length >= 5 ? "high" : recentLogs.length >= 3 ? "medium" : "low";

  const reasoning = [
    `Phase is ${phase}`,
    `Physical state mapped to ${signals.physicalState}`,
    `Mental state mapped to ${signals.mentalState}`,
    `Emotional state mapped to ${signals.emotionalState}`,
    trendList.length ? `Trends: ${trendList.join(", ")}` : "Not enough trend data yet",
  ];

  return {
    phase,
    physical_state: signals.physicalState,
    mental_state: signals.mentalState,
    emotional_state: signals.emotionalState,
    symptoms: signals.symptomState,
    trends: trendList,
    mode,
    confidence,
    reasoning,
  };
}

function buildPhysicalInsight(ctx: InsightContext): string {
  if (ctx.mode === "fallback") {
    return `In the ${ctx.phase} phase, energy shifts are common; a lighter routine can support recovery.`;
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
  if (ctx.mental_state === "fatigued") {
    return `Your focus may feel heavier today because recovery signals point to mental fatigue.`;
  }
  return `Your mental load appears balanced overall, with no strong strain pattern right now.`;
}

function buildEmotionalInsight(ctx: InsightContext): string {
  if (ctx.emotional_state === "loaded") {
    return `Emotionally, you may be carrying extra load today; this aligns with your current phase context.`;
  }
  if (ctx.emotional_state === "uplifted") {
    return `Your emotional trend looks uplifted, which can be a strong window for meaningful tasks.`;
  }
  return `Your emotional state appears steady, with manageable variation across recent days.`;
}

function buildRecommendation(ctx: InsightContext): string {
  if (ctx.physical_state === "high_strain") {
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

export function generateRuleBasedInsights(ctx: InsightContext): DailyInsights {
  return {
    physicalInsight: buildPhysicalInsight(ctx),
    mentalInsight: buildMentalInsight(ctx),
    emotionalInsight: buildEmotionalInsight(ctx),
    recommendation: buildRecommendation(ctx),
  };
}
