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
  recentLogs?: DailyLog[];
}): Exclude<PrimaryInsightCause, "stable"> {
  const last3 = (input.recentLogs ?? []).slice(0, 3);

  // Single-day spike protection: require 2+ of last 3 days with poor sleep
  // before declaring sleep_disruption. Prevents one bad night flipping the narrative.
  const poorSleepDays = last3.filter(
    (l) => typeof l.sleep === "number" && l.sleep < 6,
  ).length;
  const hasSustainedSleepIssue = last3.length < 2 || poorSleepDays >= 2;

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

  if ((strongSleepDrop || moderateSleepDrop) && hasSustainedSleepIssue) {
    return "sleep_disruption";
  }

  // Single-day spike protection for stress: require 2+ of last 3 days elevated
  const HIGH_STRESS = new Set(["high", "elevated", "severe"]);
  const highStressDays = last3.filter(
    (l) => HIGH_STRESS.has(l.stress?.trim().toLowerCase() ?? ""),
  ).length;
  const hasSustainedStress = last3.length < 2 || highStressDays >= 2;

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

  if (((stressAbove && stressRising) || (stressRising && hasStressDriver)) && hasSustainedStress) {
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
    emotionalInsight: `Small things feel harder than it should — everything takes more effort right now.`,
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
    mentalInsight: `When stress stays elevated like this, focus and clarity both take a hit — decisions feel harder than it should.`,
    emotionalInsight: `Things feel emotionally heavier right now — that's stress showing up in your mood, not just your head.`,
    tomorrowPreview: `If stress eases even slightly, you'll notice the difference — your system responds quickly when the pressure drops.`,
  };
}

/** Deterministic copy when logs show no meaningful movement — do not invent problems. */
export function applyStableStateNarrative(insights: DailyInsights, cycleDay: number = 1): DailyInsights {
  const pick = <T>(variants: T[]): T => variants[cycleDay % variants.length]!;
  return {
    ...insights,
    physicalInsight: pick([
      `Your body feels steady right now — nothing is pulling it in either direction.`,
      `Physically, things are steady today — no strong signals in any direction.`,
      `Your body is holding steady right now — energy isn't being pulled anywhere specific.`,
      `No major physical shifts today — your system is steady and balanced.`,
    ]),
    mentalInsight: pick([
      `Focus is stable — things feel manageable without extra effort or strain.`,
      `Your headspace feels clear today — no mental fog or extra strain.`,
      `Mentally, things are steady — focus isn't being pulled in any particular direction.`,
      `Your mind is holding steady — nothing is demanding extra mental effort right now.`,
    ]),
    emotionalInsight: pick([
      `Your mood is balanced — nothing feels too heavy or too elevated.`,
      `Emotionally, things feel even today — no sharp dips or lifts.`,
      `Your emotional state is steady — nothing is weighing on you more than usual.`,
      `Mood-wise, things are settled — no strong pulls in either direction.`,
    ]),
    whyThisIsHappening: pick([
      `There aren't any strong shifts right now — your system is in a stable, consistent state.`,
      `Sleep, stress, and energy are all in a stable range — nothing is disrupting your balance.`,
      `Your signals are aligned and stable right now — no single factor is pulling things off course.`,
    ]),
    solution: pick([
      `Keep doing what's working — consistency is what's supporting this balance.`,
      `No changes needed — your current routine is supporting a stable state.`,
      `Stay the course — what you're doing is working well right now.`,
    ]),
    recommendation: pick([
      `Maintain your current rhythm — sleep, stress, and energy are all holding steady.`,
      `Stick with your routine — steady days like this are built on the habits you already have.`,
      `Keep your rhythm going — this balance reflects your current habits working well.`,
    ]),
    tomorrowPreview: pick([
      `Things should feel similar tomorrow — no major shifts expected.`,
      `Tomorrow looks steady — expect a similar baseline to today.`,
      `No big changes expected tomorrow — your body is in a consistent rhythm.`,
    ]),
  };
}
