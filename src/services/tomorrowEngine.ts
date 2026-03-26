import { getDayInsight } from "./cycleInsightLibrary";
import type { InsightContext } from "./insightService";

/**
 * Builds the tomorrow preview sentence.
 * Uses the day-specific library base, adjusted for trend direction.
 * Appends a phase transition note if the transition is ≤ 2 days away.
 *
 * Max 2 sentences total (base + optional phase transition).
 */
export function buildTomorrowPreview(
  ctx: InsightContext,
  daysUntilNextPhase: number,
  variantIndex: 0 | 1 | 2,
): string {
  // Base: day-specific preview from today's library entry
  let base = getDayInsight(ctx.cycleDay, variantIndex).tomorrowPreview;

  // Trend adjustment: override base with a trend-informed sentence when signals are clear
  if (ctx.recentLogsCount >= 3) {
    const stressIncreasing = ctx.trends.some((t) => t === "Stress increasing");
    const sleepDecreasing = ctx.trends.some((t) => t === "Sleep decreasing");
    const sleepIncreasing = ctx.trends.some((t) => t === "Sleep increasing");
    const moodDecreasing = ctx.trends.some((t) => t === "Mood decreasing");
    const moodIncreasing = ctx.trends.some((t) => t === "Mood increasing");

    const highVariability =
      ctx.sleep_variability === "high" || ctx.mood_variability === "high";

    if (stressIncreasing && sleepDecreasing) {
      base =
        "If today's stress and sleep patterns continue, tomorrow may feel heavier.";
    } else if (ctx.priorityDrivers[0] === "sleep_stress_amplification") {
      base =
        "Mental load may carry into tomorrow; a consistent wind-down tonight helps.";
    } else if (ctx.priorityDrivers[0] === "bleeding_heavy") {
      base =
        "Energy may stay lower tomorrow while bleeding remains high — keep activity gentle.";
    } else if (sleepIncreasing && !stressIncreasing) {
      base =
        "Recovery may improve slightly tomorrow if the current sleep trend holds.";
    } else if (moodDecreasing && !moodIncreasing) {
      base =
        "Emotional load may stay sensitive tomorrow; a lighter schedule helps stability.";
    } else if (moodIncreasing && sleepIncreasing) {
      base =
        "Both mood and sleep are trending up — tomorrow should feel better than today.";
    }

    if (highVariability) {
      base += " Recent variability means parts of tomorrow may still feel unpredictable.";
    }
  }

  // Phase transition note (appended as second sentence if ≤ 2 days)
  if (daysUntilNextPhase <= 2) {
    const phaseNote =
      daysUntilNextPhase === 1
        ? "Your next phase begins tomorrow — energy and mood patterns are about to shift."
        : "Your next phase is two days away — gradual changes may start soon.";
    base = `${base} ${phaseNote}`;
  }

  return base.trim();
}
