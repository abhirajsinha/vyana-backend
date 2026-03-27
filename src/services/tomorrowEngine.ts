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
        "Tomorrow might feel a bit heavier if tonight doesn't help you reset — protect your sleep.";
    } else if (ctx.priorityDrivers[0] === "sleep_stress_amplification") {
      base =
        "If you wind down properly tonight, tomorrow will feel lighter — this loop breaks with one good night.";
    } else if (ctx.priorityDrivers[0] === "bleeding_heavy") {
      base =
        "Tomorrow will likely feel similar — keep activity gentle and let your body lead.";
    } else if (sleepIncreasing && !stressIncreasing) {
      base =
        "If you protect your sleep tonight, tomorrow will likely feel noticeably better.";
    } else if (moodDecreasing && !moodIncreasing) {
      base =
        "Tomorrow might feel heavier emotionally — a lighter schedule today will change what you wake up to.";
    } else if (moodIncreasing && sleepIncreasing) {
      base =
        "Tomorrow should feel better — your mood and sleep are both moving in the right direction.";
    }

    if (highVariability) {
      base += " Your patterns have been a bit unpredictable lately, so tomorrow could still surprise you.";
    }
  }

  // Phase transition note (appended as second sentence if ≤ 2 days)
  if (daysUntilNextPhase <= 2) {
    const phaseNote =
      daysUntilNextPhase === 1
        ? "Your next phase starts tomorrow — your energy and mood should start shifting."
        : "Your next phase is two days away — you'll likely start feeling the change soon.";
    base = `${base} ${phaseNote}`;
  }

  return base.trim();
}
