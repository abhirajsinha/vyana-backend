/**
 * Layer 2 — Log Mirror
 *
 * Per LAYERED_INSIGHTS_RULES.md §6 and §11:
 * Layer 2 fires at n=1. It acknowledges what the user logged without making
 * pattern claims. It wraps the Layer 1 insight with a short opening clause.
 *
 * Per LAYERED_INSIGHTS.md §2:
 * "The reflection is honest because it doesn't claim anything more than
 * 'I see what you said, and here is what this looks like in the phase you're in.'"
 */

import type { Phase } from "./cycleEngine";

export type SymptomKey =
  | "mood" | "energy" | "sleep" | "stress"
  | "pain" | "fatigue" | "cramps" | "bloating"
  | "headache" | "acne" | "breast_tenderness" | "back_pain";

interface WrapperTemplate {
  basic: string;
  continuity?: string; // n=2+ in same phase, same cycle
}

type WrapperMap = Partial<Record<Phase, WrapperTemplate>>;

/**
 * Layer 2 wrapper templates keyed by (symptom, phase).
 * {phaseDay} and {value} are substituted at runtime.
 * Per rules: hand-written, stored as data, substituted at runtime.
 */
const LAYER2_WRAPPERS: Record<SymptomKey, WrapperMap> = {
  cramps: {
    menstrual: {
      basic: "Cramps today — the body doing real work.",
      continuity: "Cramps continuing — the body in the thick of it.",
    },
    luteal: {
      basic: "Cramps in the late luteal — the body preparing for what comes next.",
    },
  },
  energy: {
    menstrual: {
      basic: "Low energy on a bleeding day — accurate, not avoidant.",
      continuity: "Low energy continuing through the bleeding days.",
    },
    follicular: {
      basic: "Energy logged today.",
      continuity: "Energy continuing to track through the follicular.",
    },
    ovulation: {
      basic: "Energy logged today.",
    },
    luteal: {
      basic: "Energy in the luteal — the body running on a different fuel mix.",
      continuity: "Energy continuing to shift as the luteal progresses.",
    },
  },
  mood: {
    menstrual: {
      basic: "Mood logged today — hormones are at their lowest.",
      continuity: "Mood has been shifting through the bleeding days.",
    },
    follicular: {
      basic: "Mood logged today.",
    },
    ovulation: {
      basic: "Mood logged today.",
    },
    luteal: {
      basic: "Mood logged in the luteal — progesterone shapes how things land.",
      continuity: "Mood continuing to shift through the luteal.",
    },
  },
  sleep: {
    menstrual: {
      basic: "Sleep logged today — rest matters more during bleeding.",
    },
    follicular: {
      basic: "Sleep logged today.",
    },
    ovulation: {
      basic: "Sleep logged today.",
    },
    luteal: {
      basic: "Sleep logged in the luteal — progesterone affects how sleep feels.",
      continuity: "Sleep has been shifting through the luteal days.",
    },
  },
  stress: {
    // Type C: phase-independent, rolling window, no phase causation
    menstrual: {
      basic: "Stress today. The body is also doing the work of menstruating, which can make stress feel heavier.",
    },
    follicular: {
      basic: "Stress today.",
    },
    ovulation: {
      basic: "Stress today.",
    },
    luteal: {
      basic: "Stress today. The late luteal often amplifies what's already there.",
    },
  },
  pain: {
    menstrual: {
      basic: "Pain logged today — the body is doing real work.",
    },
    follicular: {
      basic: "Pain logged today.",
    },
    ovulation: {
      basic: "Pain logged today.",
    },
    luteal: {
      basic: "Pain logged in the luteal.",
    },
  },
  fatigue: {
    menstrual: {
      basic: "Fatigue on a bleeding day — that's a physiological fact, not a mood.",
    },
    follicular: {
      basic: "Fatigue logged today.",
    },
    ovulation: {
      basic: "Fatigue logged today.",
    },
    luteal: {
      basic: "Fatigue in the luteal — progesterone acts on the same receptors as sedatives.",
    },
  },
  bloating: {
    luteal: {
      basic: "Bloating logged — water retention is common in the late luteal.",
    },
  },
  headache: {
    menstrual: {
      basic: "Headache today — sometimes the body reacts to the hormonal shifts.",
    },
    follicular: {
      basic: "Headache today — sometimes the body reacts to rising estrogen.",
    },
    ovulation: {
      basic: "Headache around ovulation — hormonal shifts can trigger this.",
    },
    luteal: {
      basic: "Headache in the luteal — falling estrogen can trigger this.",
    },
  },
  acne: {
    luteal: {
      basic: "Skin changes in the luteal — hormonal shifts affect the skin.",
    },
  },
  breast_tenderness: {
    luteal: {
      basic: "Breast tenderness in the luteal — progesterone does that.",
    },
  },
  back_pain: {
    menstrual: {
      basic: "Back pain during bleeding — the uterus and lower back share nerve pathways.",
    },
    luteal: {
      basic: "Back pain in the late luteal — the body preparing for what comes next.",
    },
  },
};

/**
 * Map raw log fields to symptom keys for Layer 2 lookup.
 */
function extractLoggedSymptoms(log: {
  mood?: string | null;
  energy?: string | null;
  sleep?: number | null;
  stress?: string | null;
  pain?: string | null;
  fatigue?: string | null;
  symptoms?: string[] | null;
}): SymptomKey[] {
  const logged: SymptomKey[] = [];
  if (log.mood) logged.push("mood");
  if (log.energy) logged.push("energy");
  if (log.sleep != null) logged.push("sleep");
  if (log.stress) logged.push("stress");
  if (log.pain) logged.push("pain");
  if (log.fatigue) logged.push("fatigue");
  if (log.symptoms) {
    for (const s of log.symptoms) {
      const lower = s.toLowerCase();
      if (lower.includes("cramp")) logged.push("cramps");
      if (lower.includes("bloat")) logged.push("bloating");
      if (lower.includes("headache")) logged.push("headache");
      if (lower.includes("acne") || lower.includes("skin")) logged.push("acne");
      if (lower.includes("breast") || lower.includes("tender")) logged.push("breast_tenderness");
      if (lower.includes("back")) logged.push("back_pain");
    }
  }
  return [...new Set(logged)]; // deduplicate
}

/**
 * Build a Layer 2 wrapper string from the user's current log and phase.
 *
 * Returns undefined if no logged symptoms match a wrapper template.
 * Per LAYERED_INSIGHTS_RULES.md §6: Layer 2 fires at n=1.
 */
export function buildLayer2Wrapper(
  todayLog: {
    mood?: string | null;
    energy?: string | null;
    sleep?: number | null;
    stress?: string | null;
    pain?: string | null;
    fatigue?: string | null;
    symptoms?: string[] | null;
  } | null,
  phase: Phase,
): string | undefined {
  if (!todayLog) return undefined;

  const symptoms = extractLoggedSymptoms(todayLog);
  if (symptoms.length === 0) return undefined;

  // Pick the first symptom that has a wrapper for this phase
  for (const symptom of symptoms) {
    const wrappers = LAYER2_WRAPPERS[symptom];
    if (!wrappers) continue;
    const phaseWrapper = wrappers[phase];
    if (!phaseWrapper) continue;
    return phaseWrapper.basic;
  }

  return undefined;
}

/**
 * Build a Layer 2 wrapper with continuity language when the same symptom
 * has been logged multiple times in the current phase/cycle.
 */
export function buildLayer2WrapperWithContinuity(
  todayLog: {
    mood?: string | null;
    energy?: string | null;
    sleep?: number | null;
    stress?: string | null;
    pain?: string | null;
    fatigue?: string | null;
    symptoms?: string[] | null;
  } | null,
  phase: Phase,
  inPhaseLogs: number,
): string | undefined {
  if (!todayLog) return undefined;

  const symptoms = extractLoggedSymptoms(todayLog);
  if (symptoms.length === 0) return undefined;

  for (const symptom of symptoms) {
    const wrappers = LAYER2_WRAPPERS[symptom];
    if (!wrappers) continue;
    const phaseWrapper = wrappers[phase];
    if (!phaseWrapper) continue;
    // Use continuity language if 2+ logs in this phase and available
    if (inPhaseLogs >= 2 && phaseWrapper.continuity) {
      return phaseWrapper.continuity;
    }
    return phaseWrapper.basic;
  }

  return undefined;
}
