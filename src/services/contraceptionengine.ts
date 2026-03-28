// ─── Contraception types ──────────────────────────────────────────────────────

export type ContraceptionType =
  | "none"
  | "combined_pill"       // Estrogen + progestin — suppresses ovulation
  | "mini_pill"           // Progestin-only — partial suppression, irregular
  | "iud_hormonal"        // Local progestin — may still ovulate
  | "iud_copper"          // Non-hormonal — natural cycle intact
  | "implant"             // Progestin implant — strong suppression
  | "injection"           // Progestin injection — strong suppression
  | "patch"               // Estrogen + progestin patch — same as combined pill
  | "ring"                // Vaginal ring — same as combined pill
  | "barrier"             // Condom/diaphragm — no hormonal effect
  | "natural"             // FAM/fertility awareness — no hormonal effect
  | "unknown";

// ─── Per-type behavioral rules ───────────────────────────────────────────────

export interface ContraceptionBehavior {
  // Whether the natural cycle engine should run
  useNaturalCycleEngine: boolean;
  // Whether ovulation predictions should be shown
  showOvulationPrediction: boolean;
  // Whether phase-based hormone curves should be shown
  showHormoneCurves: boolean;
  // Whether PMS forecast (phase-based) is valid
  showPmsForecast: boolean;
  // Whether period forecasting is reliable
  showPeriodForecast: boolean;
  // Whether full forecast should be shown (or pattern/symptom-only)
  forecastMode: "phase" | "pattern" | "symptom" | "disabled";
  // What to tell the user about their cycle context
  contextMessage: string;
  // Insight tone override
  insightTone: "cycle-based" | "pattern-based" | "symptom-based";
}

export function getContraceptionBehavior(type: ContraceptionType): ContraceptionBehavior {
  switch (type) {
    case "none":
    case "barrier":
    case "natural":
      return {
        useNaturalCycleEngine: true,
        showOvulationPrediction: true,
        showHormoneCurves: true,
        showPmsForecast: true,
        showPeriodForecast: true,
        forecastMode: "phase",
        contextMessage: "",
        insightTone: "cycle-based",
      };

    case "iud_copper":
      return {
        useNaturalCycleEngine: true,
        showOvulationPrediction: true,
        showHormoneCurves: true,
        showPmsForecast: true,
        showPeriodForecast: true,
        forecastMode: "phase",
        contextMessage:
          "You're using a copper IUD, which doesn't affect your hormones. Your natural cycle patterns should apply, though flow may be heavier.",
        insightTone: "cycle-based",
      };

    case "combined_pill":
    case "patch":
    case "ring":
      return {
        useNaturalCycleEngine: false,
        showOvulationPrediction: false,
        showHormoneCurves: false,
        showPmsForecast: false,
        showPeriodForecast: false, // "Period" is a withdrawal bleed, not natural
        forecastMode: "pattern",
        contextMessage:
          "Because you're on combined hormonal contraception, your body's natural hormone cycle is typically suppressed. Insights here are based on your logged symptoms and patterns, not cycle-phase assumptions.",
        insightTone: "pattern-based",
      };

    case "mini_pill":
      return {
        useNaturalCycleEngine: false,
        showOvulationPrediction: false,
        showHormoneCurves: false,
        showPmsForecast: false,
        showPeriodForecast: false,
        forecastMode: "pattern",
        contextMessage:
          "The progestin-only pill can make cycles irregular and sometimes suppresses ovulation. Phase-based predictions may not apply to you — insights are based on your personal patterns instead.",
        insightTone: "pattern-based",
      };

    case "iud_hormonal":
    case "implant":
    case "injection":
      return {
        useNaturalCycleEngine: false,
        showOvulationPrediction: false,
        showHormoneCurves: false,
        showPmsForecast: false,
        showPeriodForecast: false,
        forecastMode: "symptom",
        contextMessage:
          "Hormonal IUDs, implants, and injections work differently for everyone — periods may lighten or stop entirely. Insights here focus on what you're actually logging rather than predicted cycle phases.",
        insightTone: "symptom-based",
      };

    case "unknown":
    default:
      return {
        useNaturalCycleEngine: false,
        showOvulationPrediction: false,
        showHormoneCurves: false,
        showPmsForecast: false,
        showPeriodForecast: false,
        forecastMode: "pattern",
        contextMessage:
          "Insights are based on your logged data rather than cycle-phase assumptions, since contraception type affects how hormones behave.",
        insightTone: "pattern-based",
      };
  }
}

// ─── Shared contraception type resolver ───────────────────────────────────────

const CONTRACEPTION_MAP: Record<string, ContraceptionType> = {
  pill: "combined_pill",
  combined_pill: "combined_pill",
  mini_pill: "mini_pill",
  iud_hormonal: "iud_hormonal",
  iud_copper: "iud_copper",
  implant: "implant",
  injection: "injection",
  patch: "patch",
  ring: "ring",
  condom: "barrier",
  barrier: "barrier",
  natural: "natural",
  none: "none",
};

export function resolveContraceptionType(method: string | null): ContraceptionType {
  return CONTRACEPTION_MAP[method?.toLowerCase() ?? "none"] ?? "none";
}

/** True when the natural cycle engine should not run (matches `getCycleMode` → `"hormonal"`). */
export function isSuppressingNaturalCycle(method: string | null): boolean {
  const t = resolveContraceptionType(method);
  return !getContraceptionBehavior(t).useNaturalCycleEngine;
}

// ─── Forecast eligibility check ──────────────────────────────────────────────

export interface ForecastEligibility {
  eligible: boolean;
  reason: string | null; // null when eligible
  warmupMessage: string | null;
  progressPercent: number;
}

export function checkForecastEligibility(params: {
  logsCount: number;
  logsSpanDays: number;
  confidenceScore: number;
  cyclePredictionConfidence: string;
  contraceptionBehavior: ContraceptionBehavior;
}): ForecastEligibility {
  const { logsCount, logsSpanDays, confidenceScore, cyclePredictionConfidence, contraceptionBehavior } = params;

  // Disabled by contraception
  if (contraceptionBehavior.forecastMode === "disabled") {
    return {
      eligible: false,
      reason: "forecast_disabled_contraception",
      warmupMessage: "Forecast isn't available with your current contraception setting.",
      progressPercent: 0,
    };
  }

  // Minimum log count
  if (logsCount < 7) {
    const pct = Math.round((logsCount / 7) * 100);
    return {
      eligible: false,
      reason: "insufficient_logs",
      warmupMessage: `We're still learning your patterns. Log a few more days and your forecast will unlock. (${logsCount}/7 days logged)`,
      progressPercent: Math.min(99, pct),
    };
  }

  // Log spread — 7 logs in 1 day is meaningless
  if (logsSpanDays < 5) {
    return {
      eligible: false,
      reason: "insufficient_spread",
      warmupMessage: "Your logs need a little more time spread before we can build a meaningful forecast.",
      progressPercent: Math.round((logsSpanDays / 5) * 80), // cap at 80 since count is already met
    };
  }

  // Confidence threshold
  if (confidenceScore < 0.4) {
    return {
      eligible: false,
      reason: "low_confidence",
      warmupMessage: "We're still building confidence in your patterns. Keep logging and your forecast will open up.",
      progressPercent: Math.round(confidenceScore * 200), // 0.4 threshold = 80%
    };
  }

  return {
    eligible: true,
    reason: null,
    warmupMessage: null,
    progressPercent: 100,
  };
}

// ─── Compute log span in days ─────────────────────────────────────────────────

export function computeLogSpanDays(logs: { date: Date | string }[]): number {
  if (logs.length < 2) return logs.length;
  const dates = logs.map((l) => new Date(l.date).getTime()).sort((a, b) => a - b);
  const spanMs = dates[dates.length - 1]! - dates[0]!;
  return Math.floor(spanMs / 86400000) + 1;
}