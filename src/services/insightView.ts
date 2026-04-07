import type { DailyInsights, InsightContext } from "./insightService";
import { getDayInsight } from "./cycleInsightLibrary";

const BODY_KEYS = ["physicalInsight", "mentalInsight", "emotionalInsight"] as const;

type BodyKey = (typeof BODY_KEYS)[number];

export function resolvePrimaryInsightKey(ctx: InsightContext): BodyKey {
  const driver = ctx.priorityDrivers[0];
  if (!driver) return "physicalInsight";
  if (driver.includes("sleep") || driver.includes("bleeding") || driver === "high_strain") {
    return "physicalInsight";
  }
  if (driver.includes("stress") || driver.includes("sleep_stress")) {
    return "mentalInsight";
  }
  if (driver.includes("mood")) {
    return "emotionalInsight";
  }
  return "physicalInsight";
}


export function getConfidenceLabel(ctx: InsightContext): string {
  if (ctx.recentLogsCount === 0) return "Phase-based guidance";
  if (ctx.recentLogsCount < 3) return "Early insights";
  if (ctx.recentLogsCount < 5) return "Emerging patterns";
  if (ctx.recentLogsCount < 6) return "Building your patterns";
  if (ctx.confidence === "low") return "Limited data";
  if (ctx.confidence === "medium") return "Emerging patterns";
  return "Personalized insights";
}

export function shouldShowExplanation(ctx: InsightContext): boolean {
  // When mode is personalized we trust the engine's signal enough to show "why",
  // even if confidence is still "low" due to limited log count.
  return ctx.recentLogsCount >= 3 || ctx.mode === "personalized";
}

export function shouldShowSupporting(ctx: InsightContext): boolean {
  // For personalized mode we show supporting insights even when confidence is low,
  // because the signal strength is high enough to justify context.
  return true;
}

export function shouldSuppressPrimary(
  currentKey: BodyKey,
  history: { primaryKey: string }[],
): boolean {
  return history.filter((h) => h.primaryKey === currentKey).length >= 2;
}

export function pickNovelPrimaryKey(
  currentKey: BodyKey,
  history: { primaryKey: string }[],
  driver: string | null,
): BodyKey {
  const filtered = BODY_KEYS.filter(
    (k) => history.filter((h) => h.primaryKey === k).length < 2,
  );
  const candidates = filtered.length > 0 ? filtered : [...BODY_KEYS];

  if (driver?.includes("stress") || driver?.includes("sleep_stress")) {
    if (candidates.includes("mentalInsight")) return "mentalInsight";
    if (candidates.includes("emotionalInsight")) return "emotionalInsight";
  }
  if (driver?.includes("sleep") || driver?.includes("bleeding") || driver === "high_strain") {
    if (candidates.includes("physicalInsight")) return "physicalInsight";
  }
  if (driver?.includes("mood")) {
    if (candidates.includes("emotionalInsight")) return "emotionalInsight";
  }

  return candidates[0];
}

// ─── Two-layer view: vyana (user-facing voice) + system (product/UI) ────────

export type VyanaLayer = {
  physical: string;
  mental: string;
  emotional: string;
  orientation: string;
  allowance: string;
};

export type SystemLayer = {
  recommendation: string;
  nextUnlock: InsightBasisNextUnlock | null;
  progress: { logsCount: number; nextMilestone: number; logsToNextMilestone: number } | null;
  confidenceLabel: string;
  insightBasis: string;
  tomorrowPreview: string;
};

export type InsightViewPayload = {
  vyana: VyanaLayer;
  system: SystemLayer;
  /** @deprecated kept for backwards compatibility */
  primaryInsight: string;
  /** @deprecated kept for backwards compatibility */
  supportingInsights: string[];
  /** @deprecated kept for backwards compatibility */
  action: string;
  /** @deprecated kept for backwards compatibility */
  explanation?: string;
  /** @deprecated kept for backwards compatibility */
  recommendation: string;
  /** @deprecated kept for backwards compatibility */
  tomorrowPreview: string;
  /** @deprecated kept for backwards compatibility */
  confidenceLabel: string;
};

export function buildInsightView(
  ctx: InsightContext,
  insights: DailyInsights,
  options?: {
    primaryKeyOverride?: BodyKey | null;
    logsCount?: number;
    completedCycles?: number;
    progress?: { logsCount: number; nextMilestone: number; logsToNextMilestone: number };
  },
): InsightViewPayload {
  const primaryKey = options?.primaryKeyOverride ?? resolvePrimaryInsightKey(ctx);
  const supporting = BODY_KEYS.filter((k) => k !== primaryKey).map((k) => insights[k]);

  // Get orientation and allowance from the day-specific template
  const dayInsight = getDayInsight(ctx.normalizedDay, ctx.variantIndex, ctx.cycleMode);

  const logsCount = options?.logsCount ?? ctx.recentLogsCount;
  const completedCycles = options?.completedCycles ?? 0;
  const basis = buildInsightBasis(logsCount, completedCycles);

  const confidenceLabel = getConfidenceLabel(ctx);

  const view: InsightViewPayload = {
    vyana: {
      physical: insights.physical || insights.physicalInsight,
      mental: insights.mental || insights.mentalInsight,
      emotional: insights.emotional || insights.emotionalInsight,
      orientation: dayInsight.orientation,
      allowance: dayInsight.allowance,
    },
    system: {
      recommendation: insights.recommendation,
      nextUnlock: basis.nextUnlock,
      progress: options?.progress ?? null,
      confidenceLabel,
      insightBasis: basis.description,
      tomorrowPreview: insights.tomorrowPreview,
    },
    // Backwards compatibility
    primaryInsight: insights[primaryKey],
    supportingInsights: supporting,
    action: insights.solution,
    explanation: insights.whyThisIsHappening,
    recommendation: insights.recommendation,
    tomorrowPreview: insights.tomorrowPreview,
    confidenceLabel,
  };

  if (!shouldShowSupporting(ctx)) {
    view.supportingInsights = [];
  }
  if (!shouldShowExplanation(ctx)) {
    view.explanation = undefined;
  }
  return view;
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
  // Stage 6: 14+ logs + 2+ cycles → fully unlocked
  if (logsCount >= 14 && completedCycles >= 2) {
    return {
      source: "cross_cycle_identity",
      description: `Based on ${logsCount} days of logs across ${completedCycles} completed cycles`,
      nextUnlock: null,
    };
  }

  // Stage 5: 14+ logs + <2 cycles → baseline active, waiting for cycles
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

  // Stage 4: 6-13 logs → personalized, waiting for baseline
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

  // Stage 3: 5 logs → emerging patterns (interaction flags just unlocked)
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

  // Stage 2: 1-4 logs → early signals
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

  // Stage 1: 0 logs → phase only
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
