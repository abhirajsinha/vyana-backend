import type { DailyInsights, InsightContext } from "./insightService";

// ─── Layered Insight View (per LAYERED_INSIGHTS spec) ──────────────────────

export type InsightViewPayload = {
  /** Main insight (Layer 1 + optional Layer 2 wrapper + optional Layer 3 sentence) */
  insight: string;
  /** Supporting body note from the variant */
  body_note: string;
  /** Orientation line: "Day 14 · Ovulation · 14 days to next period" */
  orientation: string;
  /** Action recommendation (signal-driven when personalized) */
  recommendation: string;
  /** Confidence / data basis label */
  confidenceLabel: string;
  /** Progressive unlock info */
  insightBasis: InsightBasis;
  /** Progress toward next milestone */
  progress: { logsCount: number; nextMilestone: number; logsToNextMilestone: number } | null;
};

export function getConfidenceLabel(ctx: InsightContext): string {
  if (ctx.recentLogsCount === 0) return "Phase-based guidance";
  if (ctx.recentLogsCount < 3) return "Early insights";
  if (ctx.recentLogsCount < 5) return "Emerging patterns";
  if (ctx.recentLogsCount < 6) return "Building your patterns";
  if (ctx.confidence === "low") return "Limited data";
  if (ctx.confidence === "medium") return "Emerging patterns";
  return "Personalized insights";
}

export function buildInsightView(
  ctx: InsightContext,
  insights: DailyInsights,
  options?: {
    logsCount?: number;
    completedCycles?: number;
    progress?: { logsCount: number; nextMilestone: number; logsToNextMilestone: number };
  },
): InsightViewPayload {
  const logsCount = options?.logsCount ?? ctx.recentLogsCount;
  const completedCycles = options?.completedCycles ?? 0;
  const basis = buildInsightBasis(logsCount, completedCycles);
  const confidenceLabel = getConfidenceLabel(ctx);

  // Compose the main insight: Layer 1 + Layer 2 wrapper + Layer 3 sentence
  let insight = insights.layer1_insight;
  if (insights.layer2_wrapper) {
    // Layer 2 wraps the Layer 1 opening — prepend acknowledgement
    insight = `${insights.layer2_wrapper} ${insight}`;
  }
  if (insights.layer3_sentence) {
    // Layer 3 appends interpretation
    insight = `${insight}\n\n${insights.layer3_sentence}`;
  }

  return {
    insight,
    body_note: insights.body_note,
    orientation: insights.orientation,
    recommendation: insights.recommendation,
    confidenceLabel,
    insightBasis: basis,
    progress: options?.progress ?? null,
  };
}

// ─── Insight basis — tells the user what insights are based on ────────────────

export interface InsightBasisNextUnlock {
  logsNeeded: number | null;
  cyclesNeeded: number | null;
  what: string;
}

export interface InsightBasis {
  source:
    | "phase_only"
    | "early_signals"
    | "emerging_patterns"
    | "personal_patterns"
    | "baseline_intelligence"
    | "cross_cycle_identity";
  description: string;
  nextUnlock: InsightBasisNextUnlock | null;
}

export function buildInsightBasis(
  logsCount: number,
  completedCycles: number,
): InsightBasis {
  // Stage 6: 14+ logs + 2+ cycles — fully unlocked
  if (logsCount >= 14 && completedCycles >= 2) {
    return {
      source: "cross_cycle_identity",
      description: `Based on ${logsCount} days of logs across ${completedCycles} completed cycles`,
      nextUnlock: null,
    };
  }

  // Stage 5: 14+ logs + <2 cycles — baseline active, waiting for cycles
  if (logsCount >= 14) {
    const cyclesNeeded = 2 - completedCycles;
    return {
      source: "baseline_intelligence",
      description: `Based on ${logsCount} days of logs with personal baseline comparison`,
      nextUnlock: {
        logsNeeded: null,
        cyclesNeeded,
        what: "When this phase repeats next cycle, we'll see if what you've noticed holds. That's when insights become truly yours.",
      },
    };
  }

  // Stage 4: 6-13 logs — personalized, waiting for baseline
  if (logsCount >= 6) {
    return {
      source: "personal_patterns",
      description: `Based on ${logsCount} days of your personal data`,
      nextUnlock: {
        logsNeeded: 14 - logsCount,
        cyclesNeeded: null,
        what: "You're close. Another cycle and we'll know exactly what happens for you here.",
      },
    };
  }

  // Stage 3: 5 logs — emerging patterns (interaction flags just unlocked)
  if (logsCount === 5) {
    return {
      source: "emerging_patterns",
      description: "Based on your recent patterns across 5 days of logs",
      nextUnlock: {
        logsNeeded: 1,
        cyclesNeeded: null,
        what: "One more complete cycle. After that, we'll know your personal rhythm with real clarity.",
      },
    };
  }

  // Stage 2: 1-4 logs — early signals
  if (logsCount >= 1) {
    return {
      source: "early_signals",
      description: logsCount === 1
        ? "Based on your cycle phase and 1 day of logs"
        : `Based on your cycle phase and ${logsCount} days of logs`,
      nextUnlock: {
        logsNeeded: 5 - logsCount,
        cyclesNeeded: null,
        what: "Track once more in a different part of your cycle. That's what unlocks the next level.",
      },
    };
  }

  // Stage 1: 0 logs — phase only
  return {
    source: "phase_only",
    description: "Based on your cycle phase — log how you feel to start building your personal picture",
    nextUnlock: {
      logsNeeded: 1,
      cyclesNeeded: null,
      what: "Log what you're feeling today. Even one entry starts building your personal picture.",
    },
  };
}
