import type { DailyInsights } from "../services/insightService";

// ─── Confidence tone system ───────────────────────────────────────────────────
// Every forecast and insight that makes a forward-looking claim must go through
// this layer. Nothing reaches the user that sounds 100% certain.

export type ConfidenceTone = "exploratory" | "suggestive" | "informed";

export function getTone(confidenceScore: number): ConfidenceTone {
  if (confidenceScore < 0.4) return "exploratory";
  if (confidenceScore < 0.7) return "suggestive";
  return "informed";
}

// ─── Language templates by tone ───────────────────────────────────────────────

const OPENERS: Record<ConfidenceTone, string[]> = {
  exploratory: [
    "You might notice",
    "Some people find",
    "It's possible you'll feel",
    "You may start to notice",
    "There's a chance",
  ],
  suggestive: [
    "You may start to feel",
    "There's a good chance",
    "You might find",
    "It's likely you'll notice",
    "Many people experience",
  ],
  informed: [
    "You're likely to notice",
    "Most people in this window experience",
    "You may find",
    "Based on your patterns, you might",
    "It's quite likely you'll feel",
  ],
};

export function getOpener(confidenceScore: number): string {
  const tone = getTone(confidenceScore);
  const options = OPENERS[tone];
  // Deterministic selection — use score to pick consistently
  const index = Math.floor(confidenceScore * 10) % options.length;
  return options[index]!;
}

// ─── Forbidden words / phrases ────────────────────────────────────────────────
// These must NEVER appear in forecast or insight text — they imply certainty
// that the system cannot guarantee.

export const FORBIDDEN_DETERMINISTIC_PHRASES = [
  "you will feel",
  "you will experience",
  "you will have",
  "this will happen",
  "you are going to",
  "you'll definitely",
  "this is certain",
  "guaranteed to",
  "always happens",
  "definitely feel",
  "will improve",
  "will get worse",
  "will start",
  "will end",
  "your period will",
  "ovulation will",
  "estrogen will",
  "progesterone will",
  "you will feel energetic",
  "you will be",
  "emotional regulation",
  "luteal phase defect",
  "cognitive function",
  "neuroendocrine",
];

export function containsForbiddenLanguage(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_DETERMINISTIC_PHRASES.some((phrase) => lower.includes(phrase));
}

/** Run certainty softening on every insight field (GPT often omits solution/recommendation in draft soften pass). */
export function softenDailyInsights(
  insights: DailyInsights,
  confidenceScore: number,
): DailyInsights {
  return {
    ...insights,
    physicalInsight: softendeterministic(insights.physicalInsight, confidenceScore),
    mentalInsight: softendeterministic(insights.mentalInsight, confidenceScore),
    emotionalInsight: softendeterministic(
      insights.emotionalInsight,
      confidenceScore,
    ),
    whyThisIsHappening: softendeterministic(
      insights.whyThisIsHappening,
      confidenceScore,
    ),
    solution: softendeterministic(insights.solution, confidenceScore),
    recommendation: softendeterministic(insights.recommendation, confidenceScore),
    tomorrowPreview: softendeterministic(
      insights.tomorrowPreview,
      confidenceScore,
    ),
  };
}

// Strip deterministic language from a string — replaces with tone-appropriate hedges
export function softendeterministic(text: string, confidenceScore: number): string {
  const tone = getTone(confidenceScore);
  let result = text;

  const replacements: Array<[RegExp, string]> = [
    [/\byou will feel\b/gi, tone === "informed" ? "you're likely to feel" : "you may feel"],
    [/\byou will experience\b/gi, "you might experience"],
    [/\byou will have\b/gi, "you may have"],
    [/\bthis will happen\b/gi, "this may happen"],
    [/\byou are going to\b/gi, "you might"],
    [/\bwill improve\b/gi, "may improve"],
    [/\bwill get worse\b/gi, "may feel more intense"],
    [/\bwill start\b/gi, "may start"],
    [/\bwill end\b/gi, "may ease"],
    [/\byou will be\b/gi, "you may be"],
    [/\bdefinitely\b/gi, tone === "informed" ? "likely" : "possibly"],
    [/\bcertainly\b/gi, "possibly"],
    [/\balways\b/gi, "often"],
    [/\bnever\b/gi, "rarely"],
    // Hormone-specific
    [/\bestrogen will\b/gi, "estrogen is typically"],
    [/\bprogesterone will\b/gi, "progesterone tends to"],
    [/\blh will\b/gi, "LH is likely to"],
    [/\bfsh will\b/gi, "FSH is typically"],
    [/\byour period will\b/gi, "your period may"],
    [/\bovulation will\b/gi, "ovulation may"],
  ];

  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }

  return result;
}

// ─── Confidence label for UI display ─────────────────────────────────────────

export function getForecastConfidenceLabel(confidenceScore: number, logsCount: number): string {
  if (logsCount < 7) return "Building your forecast";
  if (confidenceScore < 0.4) return "Early signals";
  if (confidenceScore < 0.7) return "Emerging patterns";
  return "Based on your patterns";
}

// ─── Uncertainty suffix ───────────────────────────────────────────────────────
// Appended to forecast sentences to soften them

export function getUncertaintySuffix(confidenceScore: number): string {
  if (confidenceScore < 0.4) return " — though this could vary for you.";
  if (confidenceScore < 0.7) return " — this may shift depending on how your week unfolds.";
  return " — based on what we've seen in your recent patterns.";
}

// ─── Hormone claim softener ───────────────────────────────────────────────────
// Never say "your estrogen is X" — always frame as approximation

export function softHormoneClaim(hormone: string, state: string, confidence: number): string {
  const hedges: Record<ConfidenceTone, string> = {
    exploratory: `${hormone} might be ${state} in this part of your cycle`,
    suggestive: `${hormone} is often ${state} during this window`,
    informed: `${hormone} is typically ${state} at this phase`,
  };
  return hedges[getTone(confidence)];
}

// ─── Post-generation text cleanup ────────────────────────────────────────────

const POSITIVE_MARKERS = ["steady", "stable", "balanced", "good place", "well-supported", "manageable"];
const NEGATIVE_MARKERS = ["strain", "harder", "heavier", "dropping", "low energy", "takes more effort", "declining"];

function sentencesOf(text: string): string[] {
  return text.replace(/(\d)\.(\d)/g, "$1\u2024$2")
    .split(/(?<=[.!?])\s+/)
    .map(s => s.replace(/\u2024/g, ".").trim())
    .filter(Boolean);
}

function dedupSentences(text: string): string {
  const sents = sentencesOf(text);
  const unique: string[] = [];
  for (const s of sents) {
    const norm = s.toLowerCase().replace(/[^a-z0-9 ]/g, "");
    if (unique.some(u => {
      const uNorm = u.toLowerCase().replace(/[^a-z0-9 ]/g, "");
      if (uNorm === norm) return true;
      const words = norm.split(" ").filter(Boolean);
      const uWords = uNorm.split(" ").filter(Boolean);
      const overlap = words.filter(w => uWords.includes(w)).length;
      return overlap / Math.max(words.length, 1) > 0.7;
    })) continue;
    unique.push(s);
  }
  return unique.join(" ");
}

function hasContradiction(a: string, b: string): boolean {
  const aLow = a.toLowerCase();
  const bLow = b.toLowerCase();
  const aPos = POSITIVE_MARKERS.some(m => aLow.includes(m));
  const aNeg = NEGATIVE_MARKERS.some(m => aLow.includes(m));
  const bPos = POSITIVE_MARKERS.some(m => bLow.includes(m));
  const bNeg = NEGATIVE_MARKERS.some(m => bLow.includes(m));
  return (aPos && bNeg) || (aNeg && bPos);
}

export function cleanupInsightText(insights: DailyInsights): DailyInsights {
  const cleaned = { ...insights };
  const keys: (keyof DailyInsights)[] = [
    "physicalInsight", "mentalInsight", "emotionalInsight",
    "whyThisIsHappening", "solution", "recommendation", "tomorrowPreview",
  ];
  for (const k of keys) {
    cleaned[k] = cleaned[k]
      .replace(/\n/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/than they should/g, "than it should")
      .replace(/a under/g, "an under")
      .replace(/under some pressure sense/g, "sense of pressure")
      .replace(/more overwhelming than they/g, "more overwhelming than it")
      .trim();
    cleaned[k] = dedupSentences(cleaned[k]);
  }

  if (hasContradiction(cleaned.physicalInsight, cleaned.mentalInsight)) {
    const physNeg = NEGATIVE_MARKERS.some(m => cleaned.physicalInsight.toLowerCase().includes(m));
    if (physNeg) {
      cleaned.mentalInsight = cleaned.mentalInsight
        .replace(/\bbalanced\b/gi, "under some pressure")
        .replace(/\bsteady\b/gi, "affected");
    } else {
      cleaned.physicalInsight = cleaned.physicalInsight
        .replace(/\bstrain\b/gi, "adjustment")
        .replace(/\bhigh strain\b/gi, "some strain");
    }
  }

  if (hasContradiction(cleaned.emotionalInsight, cleaned.physicalInsight)) {
    const emoNeg = NEGATIVE_MARKERS.some(m => cleaned.emotionalInsight.toLowerCase().includes(m));
    if (!emoNeg) {
      cleaned.emotionalInsight = cleaned.emotionalInsight
        .replace(/\bsteady\b/gi, "under some pressure")
        .replace(/\bbalanced\b/gi, "shifted");
    }
  }

  return cleaned;
}

// ─── GPT system prompt addition ───────────────────────────────────────────────
// Injected into every GPT call for forecast + insight rewriting

export const CERTAINTY_RULES_FOR_GPT = `
LANGUAGE RULES — NON-NEGOTIABLE:
- NEVER say "you will feel", "you will experience", "this will happen", "you are going to", "definitely", "certainly", "always", "your period will", "ovulation will", "estrogen will", or any phrase that implies 100% certainty.
- For hormones: NEVER say "your estrogen is high" or "your progesterone is low" — these imply measurement. Instead say "estrogen is typically rising in this phase" or "progesterone tends to be elevated around now".
- Replace ALL certain future claims with probability-aware language:
  - LOW confidence → "You might notice...", "Some people find...", "It's possible you'll..."
  - MEDIUM confidence → "You may start to feel...", "There's a good chance...", "You might find..."
  - HIGH confidence → "You're likely to notice...", "Based on your patterns, you may...", "It's quite likely you'll feel..."
- Even at HIGH confidence, never claim certainty. Biology varies. Cycles vary.
- Hormone context belongs ONLY in "why this is happening" explanations — never as a headline.
- Frame all hormone references as phase-based approximations, not biological measurements.
`.trim();