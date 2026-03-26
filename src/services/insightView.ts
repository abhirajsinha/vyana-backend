import type { DailyInsights, InsightContext } from "./insightService";

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

export function getRelevantKeysForDriver(driver: string | null): readonly BodyKey[] {
  if (!driver) return BODY_KEYS;
  if (driver.includes("stress") || driver.includes("sleep_stress")) {
    return ["mentalInsight", "emotionalInsight"];
  }
  if (driver.includes("sleep") || driver.includes("bleeding") || driver === "high_strain") {
    return ["physicalInsight"];
  }
  if (driver.includes("mood")) {
    return ["emotionalInsight", "mentalInsight"];
  }
  return BODY_KEYS;
}

export function getConfidenceLabel(ctx: InsightContext): string {
  if (ctx.recentLogsCount === 0) return "Phase-based guidance";
  if (ctx.recentLogsCount < 3) return "Early insights";
  if (ctx.confidence === "low") return "Limited data";
  if (ctx.confidence === "medium") return "Emerging patterns";
  return "High confidence insights";
}

export function shouldShowExplanation(ctx: InsightContext): boolean {
  // When mode is personalized we trust the engine's signal enough to show "why",
  // even if confidence is still "low" due to limited log count.
  return ctx.recentLogsCount >= 3 || ctx.mode === "personalized";
}

export function shouldShowSupporting(ctx: InsightContext): boolean {
  // For personalized mode we show supporting insights even when confidence is low,
  // because the signal strength is high enough to justify context.
  return ctx.confidence !== "low" || ctx.mode === "personalized";
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

export type InsightViewPayload = {
  primaryInsight: string;
  supportingInsights: string[];
  action: string;
  explanation?: string;
  recommendation: string;
  confidenceLabel: string;
};

export function buildInsightView(
  ctx: InsightContext,
  insights: DailyInsights,
  options?: { primaryKeyOverride?: BodyKey | null },
): InsightViewPayload {
  const primaryKey = options?.primaryKeyOverride ?? resolvePrimaryInsightKey(ctx);
  const supporting = BODY_KEYS.filter((k) => k !== primaryKey).map((k) => insights[k]);

  const view: InsightViewPayload = {
    primaryInsight: insights[primaryKey],
    supportingInsights: supporting,
    action: insights.solution,
    explanation: insights.whyThisIsHappening,
    recommendation: insights.recommendation,
    confidenceLabel: getConfidenceLabel(ctx),
  };

  if (!shouldShowSupporting(ctx)) {
    view.supportingInsights = [];
  }
  if (!shouldShowExplanation(ctx)) {
    view.explanation = undefined;
  }
  return view;
}
