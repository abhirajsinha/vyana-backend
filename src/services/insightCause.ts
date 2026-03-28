import type { DailyInsights } from "./insightService";
import type { NumericBaseline } from "./insightData";

/** What is mainly driving how she feels right now — cycle context vs life factors. */
export type PrimaryInsightCause = "sleep_disruption" | "stress_led" | "cycle";

export function detectPrimaryInsightCause(input: {
  baselineDeviation: string[];
  trends: string[];
  sleepDelta: number | null;
}): PrimaryInsightCause {
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
  if (stressAbove && stressRising) {
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
