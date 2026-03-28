import type { Phase, CycleMode } from "./cycleEngine";
import type { ContraceptionType } from "../services/contraceptionengine";

// ─── Hormone state types ──────────────────────────────────────────────────────

export type HormoneLevel = "low" | "rising" | "peak" | "falling" | "suppressed" | "variable";
export type HormoneConfidence = "inferred" | "approximated" | "unreliable";

export interface HormoneState {
  estrogen: HormoneLevel;
  progesterone: HormoneLevel;
  lh: HormoneLevel;
  fsh: HormoneLevel;
  confidence: HormoneConfidence;
  // Human-readable explanation of what's likely happening hormonally
  // Always framed as approximation, never as measurement
  narrativeContext: string;
  // Whether hormone-based claims should be surfaced at all
  surfaceHormones: boolean;
}

// ─── Phase → hormone state (natural cycle only) ───────────────────────────────

function buildNaturalHormoneState(phase: Phase, cycleDay: number, cycleLength: number): HormoneState {
  // Menstrual phase: days 1–5
  if (phase === "menstrual") {
    return {
      estrogen: "low",
      progesterone: "low",
      lh: "low",
      fsh: "rising",
      confidence: "inferred",
      narrativeContext:
        "Both estrogen and progesterone are typically at their lowest point, which is what triggers bleeding. FSH is beginning its gradual rise to start preparing the next follicle.",
      surfaceHormones: true,
    };
  }

  // Follicular phase: estrogen climbing toward peak
  if (phase === "follicular") {
    // Early follicular (days 6–9)
    if (cycleDay <= 9) {
      return {
        estrogen: "rising",
        progesterone: "low",
        lh: "low",
        fsh: "rising",
        confidence: "inferred",
        narrativeContext:
          "Estrogen is typically climbing during this window, with FSH helping follicles develop. Progesterone and LH tend to stay low. This gradual estrogen rise is often linked to improving energy and mood.",
        surfaceHormones: true,
      };
    }
    // Late follicular (days 10+): approaching peak
    return {
      estrogen: "peak",
      progesterone: "low",
      lh: "rising",
      fsh: "rising",
      confidence: "inferred",
      narrativeContext:
        "Estrogen is approaching its monthly peak, with LH starting to build toward its surge. This is often associated with peak energy, confidence, and mental clarity.",
      surfaceHormones: true,
    };
  }

  // Ovulation: LH surge, estrogen peak
  if (phase === "ovulation") {
    return {
      estrogen: "peak",
      progesterone: "rising",
      lh: "peak",
      fsh: "rising",
      confidence: "inferred",
      narrativeContext:
        "The LH surge typically peaks around ovulation, accompanied by an estrogen peak. Progesterone begins rising as the body shifts into the luteal phase. This window is often associated with high energy, social confidence, and physical vitality.",
      surfaceHormones: true,
    };
  }

  // Luteal phase: progesterone dominant
  if (phase === "luteal") {
    const daysFromEnd = cycleLength - cycleDay;

    // Early luteal (7+ days from period)
    if (daysFromEnd >= 7) {
      return {
        estrogen: "falling",
        progesterone: "peak",
        lh: "low",
        fsh: "low",
        confidence: "inferred",
        narrativeContext:
          "Progesterone is typically dominant in this window, while LH and FSH tend to stay low. Estrogen has a secondary rise then begins to fall. This progesterone influence is often linked to the calmer, more inward energy of the luteal phase.",
        surfaceHormones: true,
      };
    }

    // Late luteal (within 7 days of period): PMS window
    return {
      estrogen: "low",
      progesterone: "falling",
      lh: "low",
      fsh: "low",
      confidence: "inferred",
      narrativeContext:
        "Both estrogen and progesterone are typically declining toward their monthly low, which can amplify emotional sensitivity and physical discomfort. This hormone drop is often what drives pre-period symptoms.",
      surfaceHormones: true,
    };
  }

  // Fallback
  return {
    estrogen: "variable",
    progesterone: "variable",
    lh: "variable",
    fsh: "variable",
    confidence: "unreliable",
    narrativeContext: "",
    surfaceHormones: false,
  };
}

// ─── Contraception-aware hormone state ───────────────────────────────────────

function buildHormonalContraceptionState(contraceptionType: ContraceptionType): HormoneState {
  switch (contraceptionType) {
    case "combined_pill":
    case "patch":
    case "ring":
      return {
        estrogen: "suppressed",
        progesterone: "suppressed",
        lh: "suppressed",
        fsh: "suppressed",
        confidence: "unreliable",
        narrativeContext:
          "Combined hormonal contraception typically suppresses the natural hormone fluctuations that drive a standard cycle. The hormones that would usually rise and fall are kept at a more stable level, which can change how your body responds throughout the month.",
        surfaceHormones: false, // Don't show hormone claims — too unreliable
      };

    case "mini_pill":
      return {
        estrogen: "variable",
        progesterone: "rising",
        lh: "variable",
        fsh: "variable",
        confidence: "unreliable",
        narrativeContext:
          "Progestin-only pills work primarily through progesterone, and ovulation may or may not be suppressed. Hormone patterns can vary significantly from person to person, so phase-based predictions are less reliable.",
        surfaceHormones: false,
      };

    case "iud_hormonal":
    case "implant":
    case "injection":
      return {
        estrogen: "variable",
        progesterone: "rising",
        lh: "variable",
        fsh: "variable",
        confidence: "unreliable",
        narrativeContext:
          "Hormonal IUDs and implants work locally with progestin. Ovulation may still occur in some cases. Because the hormone effect is localised and varies by individual, cycle-phase predictions are not reliable.",
        surfaceHormones: false,
      };

    case "iud_copper":
      // Copper IUD — non-hormonal, natural cycle intact
      return {
        estrogen: "variable",
        progesterone: "variable",
        lh: "variable",
        fsh: "variable",
        confidence: "inferred",
        narrativeContext:
          "Copper IUDs don't contain hormones, so your natural hormone cycle should remain largely intact. Your phase-based patterns should follow a natural cycle, though bleeding may be heavier or more painful.",
        surfaceHormones: true,
      };

    default:
      return {
        estrogen: "variable",
        progesterone: "variable",
        lh: "variable",
        fsh: "variable",
        confidence: "unreliable",
        narrativeContext: "",
        surfaceHormones: false,
      };
  }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function buildHormoneState(
  phase: Phase,
  cycleDay: number,
  cycleLength: number,
  cycleMode: CycleMode,
  contraceptionType: ContraceptionType,
): HormoneState {
  // Hormonal contraception (not copper IUD) → suppress natural cycle model
  if (
    cycleMode === "hormonal" &&
    contraceptionType !== "iud_copper" &&
    contraceptionType !== "none"
  ) {
    return buildHormonalContraceptionState(contraceptionType);
  }

  // Irregular cycle — natural state but with reduced confidence
  if (cycleMode === "irregular") {
    const base = buildNaturalHormoneState(phase, cycleDay, cycleLength);
    return {
      ...base,
      confidence: "approximated",
      narrativeContext: base.narrativeContext
        ? base.narrativeContext + " Because your cycle is irregular, these patterns may vary more than usual."
        : "",
    };
  }

  // Natural cycle
  return buildNaturalHormoneState(phase, cycleDay, cycleLength);
}

// ─── Safe hormone language builder ───────────────────────────────────────────
// Always framed as approximation. Never "your estrogen is X" — always "estrogen is typically X"

export function buildHormoneLanguage(state: HormoneState, confidenceScore: number): string | null {
  if (!state.surfaceHormones || !state.narrativeContext) return null;

  // Only surface hormone context in "why this is happening" — never as headline
  // Low confidence: more hedged language
  if (confidenceScore < 0.4 || state.confidence === "approximated") {
    return state.narrativeContext
      .replace(/typically/g, "sometimes")
      .replace(/often/g, "can sometimes")
      .replace(/is often associated/g, "may be associated");
  }

  return state.narrativeContext;
}