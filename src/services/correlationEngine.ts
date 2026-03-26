import type { DailyLog } from "@prisma/client";
import type { InsightContext } from "./insightService";
import type { Phase } from "./cycleEngine";

export interface PatternResult {
  detected: boolean;
  confidence: number; // 0–1
  headline: string;
  action: string;
}

export interface CorrelationResult {
  patternKey: string | null;
  headline: string | null;
  action: string | null;
  confidence: number;
  patterns: Record<string, PatternResult>;
}

function avgSleep(logs: DailyLog[], nights: number): number | null {
  const values = logs
    .slice(0, nights)
    .map((l) => (typeof l.sleep === "number" ? l.sleep : null))
    .filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function latestEnergyLow(logs: DailyLog[]): boolean {
  const latest = logs[0];
  if (!latest?.energy) return false;
  return ["low", "very low", "exhausted", "tired"].some((v) =>
    latest.energy!.toLowerCase().includes(v),
  );
}

function stressIsElevated(ctx: InsightContext): boolean {
  return ctx.mental_state === "stressed" || ctx.mental_state === "fatigued_and_stressed";
}

function sleepIsPoor(ctx: InsightContext): boolean {
  return (
    ctx.physical_state === "high_strain" ||
    ctx.interaction_flags.includes("sleep_stress_amplification")
  );
}

function moodIsDeclining(ctx: InsightContext): boolean {
  return ctx.trends.some((t) => t === "Mood decreasing");
}

function stressIsIncreasing(ctx: InsightContext): boolean {
  return ctx.trends.some((t) => t === "Stress increasing");
}

function sleepIsImproving(ctx: InsightContext): boolean {
  return ctx.trends.some((t) => t === "Sleep increasing");
}

function moodIsImproving(ctx: InsightContext): boolean {
  return ctx.trends.some((t) => t === "Mood increasing");
}

// Pattern 1: Sleep-stress amplification
// sleep < 6.5h for 2+ nights AND stress elevated
function pattern1(ctx: InsightContext, logs: DailyLog[]): PatternResult {
  const avg = avgSleep(logs, 2);
  const poorSleep = avg !== null && avg < 6.5;
  const elevatedStress = stressIsElevated(ctx);
  const detected = poorSleep && elevatedStress;
  const confidence = detected
    ? avg !== null && avg < 6.0 && ctx.mental_state === "fatigued_and_stressed"
      ? 0.9
      : 0.75
    : 0;
  return {
    detected,
    confidence,
    headline:
      "Poor sleep and high stress are compounding each other right now.",
    action:
      "A 20-min wind-down tonight breaks this loop faster than anything else.",
  };
}

// Pattern 2: Pre-period mood convergence
// days 24–27 AND mood declining AND stress elevated
function pattern2(ctx: InsightContext): PatternResult {
  const inWindow = ctx.cycleDay >= 24 && ctx.cycleDay <= 27;
  const detected = inWindow && moodIsDeclining(ctx) && stressIsElevated(ctx);
  const confidence = detected ? 0.85 : 0;
  return {
    detected,
    confidence,
    headline:
      "Low estrogen and high cortisol are converging — this is peak PMS window.",
    action:
      "It lifts within two days of your period starting.",
  };
}

// Pattern 3: Ovulation energy blocked
// ovulation phase AND (sleep poor OR stress elevated)
function pattern3(ctx: InsightContext): PatternResult {
  const inPhase = ctx.phase === "ovulation";
  const blocked = sleepIsPoor(ctx) || stressIsElevated(ctx);
  const detected = inPhase && blocked;
  const confidence = detected ? 0.8 : 0;
  return {
    detected,
    confidence,
    headline:
      "Your hormonal energy peak is being cancelled by poor sleep or stress.",
    action:
      "The boost returns once recovery improves.",
  };
}

// Pattern 4: Post-period recovery lag
// cycleDay 6–8 (menstrual just ended) AND energy still low
function pattern4(ctx: InsightContext, logs: DailyLog[]): PatternResult {
  const inWindow = ctx.cycleDay >= 6 && ctx.cycleDay <= 8;
  const energyLow = latestEnergyLow(logs) || ctx.physical_state === "high_strain";
  const detected = inWindow && energyLow;
  const confidence = detected ? 0.78 : 0;
  return {
    detected,
    confidence,
    headline:
      "Bleeding stopped but iron takes two to three days to replenish — low energy now is expected.",
    action:
      "Add iron-rich food today.",
  };
}

// Pattern 5: Luteal stress sensitivity
// luteal phase AND stress increasing AND days 18–24
function pattern5(ctx: InsightContext): PatternResult {
  const inPhase = ctx.phase === "luteal";
  const inWindow = ctx.cycleDay >= 18 && ctx.cycleDay <= 24;
  const detected = inPhase && inWindow && stressIsIncreasing(ctx);
  const confidence = detected ? 0.82 : 0;
  return {
    detected,
    confidence,
    headline:
      "Luteal phase makes your cortisol response stronger — same stress hits harder now than in week 2.",
    action:
      "Reduce decision load today.",
  };
}

// Pattern 6: Follicular momentum
// follicular phase AND sleep improving AND mood improving
function pattern6(ctx: InsightContext): PatternResult {
  const inPhase = ctx.phase === "follicular";
  const detected = inPhase && sleepIsImproving(ctx) && moodIsImproving(ctx);
  const confidence = detected ? 0.72 : 0;
  return {
    detected,
    confidence,
    headline:
      "Sleep and mood are both trending up — this is your recovery window.",
    action:
      "Use this momentum for anything you've been postponing.",
  };
}

// Pattern 7: Cycle-to-cycle recurrence
// same phase + similar day as a difficult driver from the previous cycle
function pattern7(
  ctx: InsightContext,
  prevCycleDifficultDrivers: string[],
): PatternResult {
  const hasDifficultPast = prevCycleDifficultDrivers.length > 0;
  const detected = hasDifficultPast && ctx.recentLogsCount >= 2;
  const confidence = detected ? 0.7 : 0;
  return {
    detected,
    confidence,
    headline:
      "Last cycle you felt worst around this day.",
    action:
      "Light your schedule for the next two days.",
  };
}

/**
 * Scores all 7 correlation patterns and returns the highest-confidence detected pattern.
 * prevCycleDifficultDrivers: drivers from previous cycle at the same phase/day window.
 */
export function runCorrelationEngine(
  ctx: InsightContext,
  logs: DailyLog[],
  prevCycleDifficultDrivers: string[] = [],
): CorrelationResult {
  const patterns: Record<string, PatternResult> = {
    sleep_stress_amplification: pattern1(ctx, logs),
    pre_period_mood_convergence: pattern2(ctx),
    ovulation_energy_blocked: pattern3(ctx),
    post_period_recovery_lag: pattern4(ctx, logs),
    luteal_stress_sensitivity: pattern5(ctx),
    follicular_momentum: pattern6(ctx),
    cycle_recurrence: pattern7(ctx, prevCycleDifficultDrivers),
  };

  let best: { key: string; result: PatternResult } | null = null;
  for (const [key, result] of Object.entries(patterns)) {
    if (result.detected && (best === null || result.confidence > best.result.confidence)) {
      best = { key, result };
    }
  }

  return {
    patternKey: best?.key ?? null,
    headline: best?.result.headline ?? null,
    action: best?.result.action ?? null,
    confidence: best?.result.confidence ?? 0,
    patterns,
  };
}

/** Difficult drivers that warrant cycle-to-cycle recurrence checks. */
export const DIFFICULT_DRIVERS = [
  "sleep_stress_amplification",
  "sleep_below_baseline",
  "stress_above_baseline",
  "sleep_variability_high",
  "bleeding_heavy",
  "high_strain",
  "mood_stress_coupling",
  "phase_deviation",
] as const;

export type Phase_ = Phase;
