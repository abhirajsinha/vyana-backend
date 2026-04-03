// src/services/insightValidator.ts
// Post-GPT validation: hard checks (fail = invalid) + soft checks (warn only).

export interface InsightValidationInput {
  output: string;
  primaryNarrative: string;
  latestLogSignals: Record<string, unknown> | null;
  conflictDetected: boolean;
  confidenceLevel: 'low' | 'medium' | 'high';
}

export interface ValidationResult {
  valid: boolean;
  hardFails: string[];
  softFails: string[];
}

// ─── Signal keyword map ──────────────────────────────────────────────────────

const SIGNAL_KEYWORDS: Record<string, string[]> = {
  cramps: ["cramps", "pain", "cramping"],
  energy: ["energy", "drained", "tired", "fatigue"],
  sleep: ["sleep", "rest", "slept"],
  stress: ["stress", "stressed", "tense"],
  mood: ["mood", "feeling", "felt"],
  headache: ["headache", "head"],
  bleeding: ["bleeding", "flow", "period"],
  breastTenderness: ["breast", "tenderness"],
};

// ─── Theme keyword sets (for tooBroad check) ────────────────────────────────

const THEME_SETS: Record<string, string[]> = {
  pain: ["cramps", "pain", "ache"],
  sleep: ["sleep", "rest", "tired"],
  mood: ["mood", "feeling", "irritable", "anxious"],
  energy: ["energy", "drained", "fatigue"],
  hormones: ["estrogen", "progesterone", "hormone"],
};

// ─── Hard checks ─────────────────────────────────────────────────────────────

function checkReflectsLogSignals(output: string, signals: Record<string, unknown> | null): boolean {
  if (!signals) return true; // skip for new users
  const lower = output.toLowerCase();
  for (const [key, value] of Object.entries(signals)) {
    if (value === undefined || value === null || value === false) continue;
    const keywords = SIGNAL_KEYWORDS[key] ?? [];
    const allKeywords = [...keywords];
    if (typeof value === "number") allKeywords.push(String(value));
    if (typeof value === "string") allKeywords.push(value.toLowerCase());
    for (const kw of allKeywords) {
      if (lower.includes(kw.toLowerCase())) return true;
    }
  }
  return false;
}

const BANNED_RE = /many people find|it's common to|some women|the body is(?=[^a-z])/i;

function checkNoBannedPhrases(output: string): boolean {
  return !BANNED_RE.test(output);
}

const PHASE_FIRST_RE = /^(your estrogen|your progesterone|in the .* phase|during this phase|this phase)/i;

function checkNotPhaseFirst(output: string): boolean {
  return !PHASE_FIRST_RE.test(output.trim());
}

function checkWithinLength(output: string): boolean {
  const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 0);
  return sentences.length <= 6;
}

const CONFLICT_RE = /even though|despite|usually|normally|override|unexpected/i;

function checkAcknowledgesConflict(output: string, conflictDetected: boolean): boolean {
  if (!conflictDetected) return true;
  return CONFLICT_RE.test(output);
}

// ─── Soft checks ─────────────────────────────────────────────────────────────

const TEMPORAL_RE = /tomorrow|next .* days|yesterday|compared to|easing|building|improving|worsening/i;

function checkHasTemporalAnchor(output: string): boolean {
  return TEMPORAL_RE.test(output);
}

function checkMatchesConfidence(output: string, level: 'low' | 'medium' | 'high'): boolean {
  const lower = output.toLowerCase();
  if (level === 'low') {
    if (lower.includes("your pattern shows") || lower.includes("across your cycles")) return false;
  }
  if (level === 'high') {
    if (lower.includes("you might notice") || lower.includes("around this time")) return false;
  }
  return true;
}

function checkTooBroad(output: string): boolean {
  const lower = output.toLowerCase();
  let matchedThemes = 0;
  for (const keywords of Object.values(THEME_SETS)) {
    if (keywords.some(kw => lower.includes(kw))) matchedThemes++;
  }
  return matchedThemes <= 3;
}

// ─── Main validator ──────────────────────────────────────────────────────────

export function validateInsightField(input: InsightValidationInput): ValidationResult {
  const hardFails: string[] = [];
  const softFails: string[] = [];

  if (!checkReflectsLogSignals(input.output, input.latestLogSignals)) {
    hardFails.push("reflectsLogSignals");
  }
  if (!checkNoBannedPhrases(input.output)) {
    hardFails.push("noBannedPhrases");
  }
  if (!checkNotPhaseFirst(input.output)) {
    hardFails.push("notPhaseFirst");
  }
  if (!checkWithinLength(input.output)) {
    hardFails.push("withinLength");
  }
  if (!checkAcknowledgesConflict(input.output, input.conflictDetected)) {
    hardFails.push("acknowledgesConflict");
  }

  if (!checkHasTemporalAnchor(input.output)) {
    softFails.push("hasTemporalAnchor");
  }
  if (!checkMatchesConfidence(input.output, input.confidenceLevel)) {
    softFails.push("matchesConfidence");
  }
  if (!checkTooBroad(input.output)) {
    softFails.push("tooBroad");
  }

  return {
    valid: hardFails.length === 0,
    hardFails,
    softFails,
  };
}

// ─── Fallback insight generator ──────────────────────────────────────────────

const PHASE_DEFAULTS: Record<string, string> = {
  menstrual: "Your body is working through the start of a new cycle, and rest can make a real difference.",
  follicular: "Energy and focus tend to pick up gradually over the next few days.",
  ovulation: "This is often a high-energy window — things may feel a bit easier.",
  early_luteal: "Your body is shifting gears after ovulation, and things may start to slow down.",
  mid_luteal: "This part of the cycle can bring more sensitivity — be gentle with yourself.",
  late_luteal: "The days before your period can feel heavier — tomorrow may bring some relief.",
};

export function generateFallbackInsight(
  primaryNarrative: string,
  latestLogSignals: Record<string, unknown> | null,
  cycleDay: number,
  phase: string,
): string {
  if (latestLogSignals) {
    const cramps = latestLogSignals.cramps;
    if (typeof cramps === "number" && cramps >= 5) {
      return `Your cramps are high today. Day ${cycleDay} often brings peak intensity, and this usually eases within a day or two.`;
    }

    const energy = latestLogSignals.energy;
    if (typeof energy === "number" && energy <= 2) {
      return `Your energy is low right now. Your body is working through this phase, and things typically start shifting in the next couple of days.`;
    }

    const sleep = latestLogSignals.sleep;
    if (typeof sleep === "number" && sleep <= 2) {
      return `Your sleep was rough last night, and that's likely affecting how everything feels today. Rest when you can — tomorrow may be different.`;
    }
  }

  if (primaryNarrative === "conflict") {
    return `What you're feeling today doesn't match what this phase usually brings — that's okay. Sleep, stress, and other factors can override hormonal patterns.`;
  }

  const phaseDefault = PHASE_DEFAULTS[phase] ?? "Logging how you feel helps build a clearer picture over time.";
  return `You're on day ${cycleDay} of your cycle. ${phaseDefault}`;
}
