import type { DailyLog } from "@prisma/client";
import type { DailyInsights } from "./insightService";
import type { NumericBaseline } from "./insightData";

/** What is mainly driving how she feels right now — cycle context vs life factors. */
export type PrimaryInsightCause =
  | "stable"
  | "sleep_disruption"
  | "stress_led"
  | "cycle";

const STABLE_STRESS = new Set(["low", "moderate", "calm", "mild"]);
const STABLE_MOOD = new Set(["neutral", "good", "positive", "calm", "happy"]);

/**
 * Log-grounded steady state: recent days are consistent and non-distressed.
 * Accepts healthy states (calm stress, good mood) — not just "moderate/neutral".
 * Uses raw recent logs so aggregate/baseline split bugs cannot force a fake "crisis" mode.
 */
export function isStableInsightState(
  recentLogs: DailyLog[],
  _baseline: NumericBaseline,
): boolean {
  if (recentLogs.length < 5) return false;

  const slice = recentLogs.slice(0, 7);
  for (const log of slice) {
    if (typeof log.sleep !== "number" || log.sleep < 6.0 || log.sleep > 9.5) {
      return false;
    }
    const st = log.stress?.trim().toLowerCase() ?? "";
    if (!STABLE_STRESS.has(st)) return false;

    const mo = log.mood?.trim().toLowerCase() ?? "";
    if (!STABLE_MOOD.has(mo)) return false;

    if (Array.isArray(log.symptoms) && log.symptoms.length > 0) return false;

    if (log.pain?.trim()) {
      const p = log.pain.trim().toLowerCase();
      if (p !== "none" && !p.startsWith("none")) return false;
    }

    const flow = log.padsChanged;
    if (typeof flow === "number" && flow >= 6) return false;
  }

  return true;
}

export function detectPrimaryInsightCause(input: {
  baselineDeviation: string[];
  trends: string[];
  sleepDelta: number | null;
  priorityDrivers?: string[];
}): Exclude<PrimaryInsightCause, "stable"> {
  const sleepBelow = input.baselineDeviation.includes(
    "sleep_below_personal_baseline",
  );
  const sleepDeclining = input.trends.some((t) => t === "Sleep decreasing");
  const strongSleepDrop =
    input.sleepDelta !== null &&
    input.sleepDelta <= -1.5 &&
    sleepBelow;
  const moderateSleepDrop =
    input.sleepDelta !== null &&
    input.sleepDelta <= -1.0 &&
    sleepBelow &&
    sleepDeclining;

  if (strongSleepDrop || moderateSleepDrop) {
    return "sleep_disruption";
  }

  const stressAbove = input.baselineDeviation.includes(
    "stress_above_personal_baseline",
  );
  const stressRising = input.trends.some((t) => t === "Stress increasing");
  const drivers = input.priorityDrivers ?? [];
  const hasStressDriver =
    drivers.includes("stress_above_baseline") ||
    drivers.includes("stress_trend_spiking") ||
    drivers.includes("stress_mood_strain") ||
    drivers.includes("mood_stress_coupling");

  if ((stressAbove && stressRising) || (stressRising && hasStressDriver)) {
    return "stress_led";
  }

  return "cycle";
}

/** Deterministic copy when sleep is the real driver (not hormones / post-period recovery). */
export function applySleepDisruptionNarrative(
  insights: DailyInsights,
  baseline: NumericBaseline,
): DailyInsights {
  const b = baseline.baselineSleepAvg;
  const r = baseline.recentSleepAvg;
  const fromH =
    b !== null ? `around ${b < 10 && b % 1 !== 0 ? b.toFixed(1) : Math.round(b)} hours` : "around 7 hours";
  const toH =
    r !== null
      ? `closer to ${r < 10 && r % 1 !== 0 ? r.toFixed(1) : Math.round(r)}`
      : "4–5 hours";

  return {
    ...insights,
    physicalInsight: `Your sleep has dropped sharply over the last few days — from ${fromH} to ${toH}. That kind of drop puts your body under real strain, which is why you're feeling physically low right now.`,
    mentalInsight: `When sleep dips like this, focus drops with it — even simple things take more effort right now.`,
    emotionalInsight: `Small things feel harder than they should — everything takes more effort right now.`,
    whyThisIsHappening: `This isn't about your cycle — your sleep has taken a hit over the last few days, and that's what's driving how you feel right now.`,
    solution: `The most important thing right now is getting your sleep back on track — that will shift how everything feels more than anything else.`,
    recommendation: `Keep your load lighter until your sleep recovers — your energy will come back quickly once it does.`,
    tomorrowPreview: `If your sleep improves tonight, you'll feel noticeably better tomorrow — your system just needs that reset.`,
  };
}

/** Deterministic copy when stress is the primary driver — do not blame hormones or sleep. */
export function applyStressLedNarrative(insights: DailyInsights): DailyInsights {
  return {
    ...insights,
    whyThisIsHappening: `Stress has been building over the last few days, and that's what's driving how you feel right now.`,
    mentalInsight: `When stress stays elevated like this, focus and clarity both take a hit — decisions feel harder than they should.`,
    emotionalInsight: `Things feel emotionally heavier right now — that's stress showing up in your mood, not just your head.`,
    tomorrowPreview: `If stress eases even slightly, you'll notice the difference — your system responds quickly when the pressure drops.`,
  };
}

/** Deterministic copy when logs show no meaningful movement — do not invent problems. */
export function applyStableStateNarrative(insights: DailyInsights): DailyInsights {
  return {
    ...insights,
    physicalInsight: `Your body feels steady right now — nothing is pulling it in either direction.`,
    mentalInsight: `Focus is stable — things feel manageable without extra effort or strain.`,
    emotionalInsight: `Your mood is balanced — nothing feels too heavy or too elevated.`,
    whyThisIsHappening: `There aren't any strong shifts right now — your system is in a stable, consistent state.`,
    solution: `Keep doing what's working — consistency is what's supporting this balance.`,
    recommendation: `Maintain your current rhythm — sleep, stress, and energy are all holding steady.`,
    tomorrowPreview: `Things should feel similar tomorrow — no major shifts expected.`,
  };
}
