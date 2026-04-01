// src/services/insightGuard.ts
// ─────────────────────────────────────────────────────────────────────────────
// POST-GENERATION GUARD LAYER
//
// Runs AFTER GPT rewrite (or rule-based fallback) and BEFORE sending to client.
// This is the final enforcement layer. GPT prompt instructions can fail silently;
// this layer never fails — it's deterministic string processing.
//
// Pipeline position:
//   ruleBasedInsights → softenForConfidenceTier → GPT rewrite → softenDailyInsights
//   → cleanupInsightText → *** insightGuard.applyAllGuards() *** → res.json()
// ─────────────────────────────────────────────────────────────────────────────

import type { Phase } from "./cycleEngine";

export interface DailyInsightsShape {
  physicalInsight: string;
  mentalInsight: string;
  emotionalInsight: string;
  whyThisIsHappening: string;
  solution: string;
  recommendation: string;
  tomorrowPreview: string;
}

export type PhaseDirection = "low" | "improving" | "rising" | "peak" | "stable" | "declining";

// ─── 1. PHASE DIRECTION MAP ──────────────────────────────────────────────────

export function getPhaseDirection(cycleDay: number, cycleLength: number): PhaseDirection {
  const lutealStart = Math.max(10, cycleLength - 13);
  const ovStart = Math.max(6, lutealStart - 3);
  const midLuteal = lutealStart + Math.floor((cycleLength - lutealStart) / 2);

  if (cycleDay <= 2) return "low";
  if (cycleDay <= 5) return "improving";
  if (cycleDay < ovStart) return "rising";
  if (cycleDay <= ovStart + 2) return "peak";
  if (cycleDay <= midLuteal) return "stable";
  return "declining";
}

// ─── 2. ZERO-DATA ASSERTION GUARD ────────────────────────────────────────────
// When logsCount === 0, ALL hard assertions about the user's current state
// must be converted to phase-based tendencies.

const ZERO_DATA_ASSERTION_PATTERNS: Array<[RegExp, string]> = [
  // "Your energy is noticeably lower" → "Energy can feel lower"
  [/\b[Yy]our energy is\b/g, "Energy can feel"],
  [/\b[Ee]nergy is noticeably\b/g, "Energy can feel"],
  [/\b[Ee]nergy is\b(?!\s+(typically|often|can|may|sometimes))/g, "Energy can be"],
  [/\b[Ff]ocus is\b(?!\s+(typically|often|can|may|sometimes))/g, "Focus can be"],
  [/\b[Mm]ood is\b(?!\s+(typically|often|can|may|sometimes))/g, "Mood can be"],
  [/\b[Yy]our body is doing\b/g, "Your body may be going through"],
  [/\b[Yy]ou feel\b/g, "You may feel"],
  [/\b[Yy]ou find that\b/gi, "You may find that"],
  [/\b[Yy]ou find\b/g, "You may find"],
  [/\b[Ee]verything takes more effort\b/g, "things may take more effort"],
  [/\b[Ee]verything feels\b/g, "things may feel"],
  [/\b[Ss]mall things feel harder\b/g, "small things may feel harder"],
  [/\b[Ii]t feels like\b/g, "it may feel like"],
  // Deterministic state claims
  [/\bis lower today\b/g, "can feel lower around this time"],
  [/\bis lower right now\b/g, "can feel lower around this time"],
  [/\bis higher today\b/g, "can feel higher around this time"],
  [/\bis higher right now\b/g, "can feel higher around this time"],
  [/\bis high right now\b/g, "can feel higher around this time"],
  [/\bis at its? peak\b/g, "tends to peak around this time"],
  [/\bare at their peak\b/g, "tend to peak around this time"],
  [/\bat its? fullest\b/g, "at its strongest around this time"],
  [/\bat their fullest\b/g, "at their strongest around this time"],
  [/\bhit(?:s|ting)? their monthly high\b/g, "can reach their monthly high"],
  [/\bhits? its? monthly high\b/g, "can reach its monthly high"],
  // Remove "noticeably" — too assertive for zero data
  [/\bnoticeably\b/g, ""],
  [/\bdefinitely\b/g, ""],
  [/\bclearly\b/g, ""],
];

function applyZeroDataGuard(text: string): string {
  let result = text;
  for (const [pattern, replacement] of ZERO_DATA_ASSERTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  // Clean up double spaces from removals
  return result.replace(/\s{2,}/g, " ").trim();
}

// ─── 3. DIRECTION GUARD ─────────────────────────────────────────────────────
// Prevents wrong-direction assertions.
// E.g., "harder" / "worse" during an improving direction (late menstrual Day 4-5)
// E.g., strong negatives during peak/rising phases

const NEGATIVE_ASSERTION_REPLACEMENTS: Array<[string, string]> = [
  ["harder than usual", "still settling"],
  ["harder than they should", "not quite settled yet"],
  ["harder than", "still adjusting compared to"],
  ["get worse", "still be adjusting"],
  ["worse than usual", "still stabilizing"],
  ["worse than", "still adjusting compared to"],
  ["feel worse", "still be settling"],
  ["more effort than", "a bit more effort than"],
  ["more effort", "some extra effort"],
  ["everything takes more", "things may take a bit more"],
  ["draining", "still settling"],
  ["exhausting", "still settling"],
  ["more difficult", "not as easy"],
  ["struggling", "adjusting"],
  ["feels heavy", "may still feel a bit weighty"],
  ["feels heavier", "may still feel a bit heavy"],
];

// For test validation: the terms we check for
const NEGATIVE_ASSERTIONS = [
  "harder than",
  "worse than",
  "draining",
  "exhausting",
  "more difficult",
  "struggling",
];

const STRONG_POSITIVE_ASSERTIONS = [
  "at its peak",
  "at their peak",
  "at its fullest",
  "at their fullest",
  "effortless",
  "highest point",
  "monthly high",
  "at its best",
  "at their best",
  "strongest",
  "maximum",
  "perfect",
];

function applyDirectionGuard(text: string, direction: PhaseDirection, logsCount: number): string {
  let result = text;

  // For improving/rising directions: block strong negatives (unless user has data showing it)
  if ((direction === "improving" || direction === "rising") && logsCount === 0) {
    for (const [phrase, replacement] of NEGATIVE_ASSERTION_REPLACEMENTS) {
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escaped, "gi"), replacement);
    }
  }

  // For low/declining/stable directions with zero data: block strong positives
  if ((direction === "low" || direction === "declining" || direction === "stable") && logsCount === 0) {
    for (const phrase of STRONG_POSITIVE_ASSERTIONS) {
      const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      result = result.replace(new RegExp(escapedPhrase, "gi"), "tends to improve");
    }
  }

  // For ALL directions with zero data: block peak exaggeration
  if (logsCount === 0) {
    result = applyPeakLimiter(result);
  }

  return result;
}

// ─── 4. PEAK PHASE LIMITER ──────────────────────────────────────────────────
// Caps exaggeration during ovulation/late follicular for zero/low-data users

function applyPeakLimiter(text: string): string {
  return text
    .replace(/\bat (?:its?|their) peak\b/gi, "tends to peak around this time")
    .replace(/\bat (?:its?|their) fullest\b/gi, "can feel stronger around this time")
    .replace(/\beffortless(?:ly)?\b/gi, "can feel easier")
    .replace(/\bmonthly high\b/gi, "cycle high")
    .replace(/\bhighest point\b/gi, "higher point")
    .replace(/\bat (?:its?|their) best\b/gi, "tends to be stronger")
    .replace(/\bstrongest\b/gi, "stronger")
    .replace(/\bpeak energy\b/gi, "higher energy");
}

// ─── 5. CONSISTENCY VALIDATOR ────────────────────────────────────────────────
// Detects contradictions between fields and resolves them.

const IMPROVING_SIGNALS = /\b(returning|improving|lifting|better|easing|stabilizing|recovering|lighter)\b/i;
const NEGATIVE_SIGNALS = /\b(harder|low|draining|exhausting|worse|heavy|heavier|difficult|struggling)\b/i;

function applyConsistencyGuard(insights: DailyInsightsShape): DailyInsightsShape {
  const result = { ...insights };
  const allText = Object.values(result).join(" ");

  const hasImproving = IMPROVING_SIGNALS.test(allText);
  const hasNegative = NEGATIVE_SIGNALS.test(allText);

  if (hasImproving && hasNegative) {
    // Check which direction the majority of fields lean
    const fields = Object.values(result);
    let improvingCount = 0;
    let negativeCount = 0;
    for (const field of fields) {
      if (IMPROVING_SIGNALS.test(field)) improvingCount++;
      if (NEGATIVE_SIGNALS.test(field)) negativeCount++;
    }

    if (improvingCount >= negativeCount) {
      // Majority improving — soften negatives
      for (const key of Object.keys(result) as (keyof DailyInsightsShape)[]) {
        if (NEGATIVE_SIGNALS.test(result[key]) && IMPROVING_SIGNALS.test(result[key])) {
          // Same field has both — keep it, it's probably intentional nuance
          continue;
        }
        if (NEGATIVE_SIGNALS.test(result[key]) && !IMPROVING_SIGNALS.test(result[key])) {
          result[key] = result[key]
            // Phrase-level replacements first (longer patterns before shorter)
            .replace(/\bharder than they should\b/gi, "not quite settled yet")
            .replace(/\bharder than usual\b/gi, "still settling")
            .replace(/\bharder than\b/gi, "not as easy as")
            .replace(/\bworse than usual\b/gi, "still stabilizing")
            .replace(/\bworse than\b/gi, "not as steady as")
            .replace(/\bget worse\b/gi, "still be adjusting")
            .replace(/\bfeel worse\b/gi, "still be settling")
            // Standalone word replacements (only if no "than" follows)
            .replace(/\bharder\b(?!\s+than)/gi, "not as easy")
            .replace(/\bworse\b(?!\s+than)/gi, "not as steady")
            .replace(/\bdraining\b/gi, "still settling")
            .replace(/\bexhausting\b/gi, "still settling")
            .replace(/\bheavy\b/gi, "still adjusting")
            .replace(/\bheavier\b/gi, "still adjusting");
        }
      }
    } else {
      // Majority negative — soften overly positive claims
      for (const key of Object.keys(result) as (keyof DailyInsightsShape)[]) {
        if (IMPROVING_SIGNALS.test(result[key]) && !NEGATIVE_SIGNALS.test(result[key])) {
          result[key] = result[key]
            .replace(/\blifting\b/gi, "may start to ease")
            .replace(/\bimproving\b/gi, "beginning to stabilize")
            .replace(/\bbetter\b/gi, "a little more settled");
        }
      }
    }
  }

  return result;
}

// ─── 6. INTENSITY LIMITER ────────────────────────────────────────────────────
// For zero-data users, cap emotional intensity

const HIGH_INTENSITY_PHRASES: Array<[RegExp, string]> = [
  [/\beverything feels\b/gi, "things may feel"],
  [/\bvery hard\b/gi, "a bit harder"],
  [/\bextremely\b/gi, "somewhat"],
  [/\boverwhelming\b/gi, "challenging"],
  [/\bcompletely drained\b/gi, "a bit low on energy"],
  [/\bcompletely\b/gi, ""],
  [/\btotally\b/gi, ""],
  [/\babsolutely\b/gi, ""],
];

function applyIntensityLimiter(text: string): string {
  let result = text;
  for (const [pattern, replacement] of HIGH_INTENSITY_PHRASES) {
    result = result.replace(pattern, replacement);
  }
  return result.replace(/\s{2,}/g, " ").trim();
}

// ─── 7. HALLUCINATION FILTER ─────────────────────────────────────────────────
// Block physical claims that can't be known without user data

const FORBIDDEN_PHYSICAL_CLAIMS = [
  "pelvic",
  "tingling",
  "pressure in your",
  "sensation in your",
  "cramping" // unless menstrual phase
];

function applyHallucinationFilter(text: string, phase: Phase, logsCount: number): string {
  if (logsCount > 0) return text; // Only filter for zero-data users

  let result = text;
  for (const term of FORBIDDEN_PHYSICAL_CLAIMS) {
    if (term === "cramping" && phase === "menstrual") continue; // Cramping is expected in menstrual
    // Remove sentences containing the term
    const sentences = result.split(/(?<=[.!?])\s+/);
    result = sentences
      .filter(s => !s.toLowerCase().includes(term))
      .join(" ");
  }
  return result.trim();
}

// ─── 8. TOMORROW PREVIEW SOFTENER ────────────────────────────────────────────

function applyTomorrowSoftener(text: string, logsCount: number): string {
  if (logsCount > 0) return text;
  return text
    .replace(/\bwill\b(?!\s+not)/gi, "may")
    .replace(/\byou'll\b/gi, "you may")
    .replace(/\bhit(?:s|ting)?\b/gi, "reach")
    .replace(/\benergy and confidence hit\b/gi, "energy and confidence can reach");
}

// ─── 9. CAPITALIZE FIX ──────────────────────────────────────────────────────
// Fix broken capitalization from replacements (e.g., "Small" mid-sentence)

function fixCapitalization(text: string): string {
  // Fix mid-sentence capitals that aren't proper nouns
  let result = text.replace(/(?<=[,;]\s)([A-Z])(?=[a-z]{2,})/g, (_, letter) => letter.toLowerCase());
  // Ensure sentence starts are capitalized
  result = result.replace(/(^|\.\s+|\?\s+|!\s+|\n\s*)([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());
  return result;
}

// ─── 10. TECHNICAL LANGUAGE GUARD ────────────────────────────────────────────
// Replace overly technical hormone language for zero-data users

function applyTechnicalLanguageGuard(text: string, logsCount: number): string {
  if (logsCount >= 3) return text; // Users with data can handle more specifics
  return text
    .replace(/\bhormone floor\b/gi, "lowest hormone levels")
    .replace(/\bhormone floor recedes\b/gi, "hormone levels begin stabilizing")
    .replace(/\bLH surge\b/gi, "hormonal shift")
    .replace(/\bLH peaks?\b/gi, "hormones shift")
    .replace(/\bcervical mucus\b/gi, "")
    .replace(/\bbasal temperature\b/gi, "body temperature")
    .replace(/\bfollicles? (?:are |is )?developing\b/gi, "your cycle is progressing")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── MAIN PIPELINE ──────────────────────────────────────────────────────────

export interface InsightGuardInput {
  insights: DailyInsightsShape;
  cycleDay: number;
  cycleLength: number;
  phase: Phase;
  logsCount: number;
}

export interface InsightGuardResult {
  insights: DailyInsightsShape;
  guardsApplied: string[];
}

export function applyAllGuards(input: InsightGuardInput): InsightGuardResult {
  const { cycleDay, cycleLength, phase, logsCount } = input;
  let insights = { ...input.insights };
  const guardsApplied: string[] = [];

  const direction = getPhaseDirection(cycleDay, cycleLength);
  const isZeroData = logsCount === 0;
  const isLowData = logsCount > 0 && logsCount < 3;

  // Process each field through the pipeline
  const keys: (keyof DailyInsightsShape)[] = [
    "physicalInsight", "mentalInsight", "emotionalInsight",
    "whyThisIsHappening", "solution", "recommendation", "tomorrowPreview",
  ];

  for (const key of keys) {
    let text = insights[key];

    // Guard 1: Zero-data assertion softening
    if (isZeroData) {
      const before = text;
      text = applyZeroDataGuard(text);
      if (text !== before) guardsApplied.push(`zero_data:${key}`);
    }

    // Guard 2: Direction enforcement
    {
      const before = text;
      text = applyDirectionGuard(text, direction, logsCount);
      if (text !== before) guardsApplied.push(`direction:${key}`);
    }

    // Guard 3: Intensity limiting for zero-data
    if (isZeroData || isLowData) {
      const before = text;
      text = applyIntensityLimiter(text);
      if (text !== before) guardsApplied.push(`intensity:${key}`);
    }

    // Guard 4: Hallucination filter
    {
      const before = text;
      text = applyHallucinationFilter(text, phase, logsCount);
      if (text !== before) guardsApplied.push(`hallucination:${key}`);
    }

    // Guard 5: Technical language
    {
      const before = text;
      text = applyTechnicalLanguageGuard(text, logsCount);
      if (text !== before) guardsApplied.push(`technical:${key}`);
    }

    // Guard 6: Tomorrow-specific softening
    if (key === "tomorrowPreview") {
      const before = text;
      text = applyTomorrowSoftener(text, logsCount);
      if (text !== before) guardsApplied.push(`tomorrow:${key}`);
    }

    // Guard 7: Capitalize fix
    text = fixCapitalization(text);

    insights[key] = text;
  }

  // Guard 8: Cross-field consistency (only for zero/low-data users)
  // High-data users can have intentional nuance like "sleep dropped → harder → but tomorrow will be better"
  if (isZeroData || isLowData) {
    const before = JSON.stringify(insights);
    insights = applyConsistencyGuard(insights);
    if (JSON.stringify(insights) !== before) guardsApplied.push("consistency");
  }

  return { insights, guardsApplied };
}

// ─── VALIDATION HELPERS (for testing) ────────────────────────────────────────

export interface ValidationResult {
  pass: boolean;
  failures: string[];
}

/** Validates that zero-data insights don't contain hard assertions */
export function validateZeroDataSafety(insights: DailyInsightsShape): ValidationResult {
  const failures: string[] = [];
  const allText = Object.entries(insights);

  const HARD_ASSERTION_PATTERNS = [
    /\b[Yy]our energy is (?!typically|often|can|may)/,
    /\b[Ff]ocus is (?!typically|often|can|may)/,
    /\b[Yy]ou feel (?!that)/,  // "You feel X" without hedging
    /\b(?:is|are) at (?:its?|their) peak\b/,
    /\b(?:is|are) at (?:its?|their) fullest\b/,
    /\beffortlessly?\b/,
    /\bnoticeably\b/,
    /\beverything takes more effort\b/,
    /\beverything feels\b/,
    /\bhit(?:s|ting)? their monthly high\b/,
  ];

  for (const [key, text] of allText) {
    for (const pattern of HARD_ASSERTION_PATTERNS) {
      if (pattern.test(text)) {
        failures.push(`${key}: contains hard assertion matching ${pattern.source} → "${text.substring(0, 80)}..."`);
      }
    }
  }

  return { pass: failures.length === 0, failures };
}

/** Validates phase direction correctness */
export function validateDirectionCorrectness(
  insights: DailyInsightsShape,
  direction: PhaseDirection,
): ValidationResult {
  const failures: string[] = [];
  const allText = Object.values(insights).join(" ").toLowerCase();

  if (direction === "improving" || direction === "rising") {
    for (const neg of NEGATIVE_ASSERTIONS) {
      if (allText.includes(neg)) {
        failures.push(`Direction ${direction} but found negative assertion: "${neg}"`);
      }
    }
  }

  return { pass: failures.length === 0, failures };
}

/** Validates no internal contradictions */
export function validateConsistency(insights: DailyInsightsShape): ValidationResult {
  const failures: string[] = [];

  // Check physicalInsight vs emotionalInsight for contradiction
  const physical = insights.physicalInsight.toLowerCase();
  const emotional = insights.emotionalInsight.toLowerCase();
  const mental = insights.mentalInsight.toLowerCase();

  const physImproving = IMPROVING_SIGNALS.test(physical) && !NEGATIVE_SIGNALS.test(physical);
  const physNeg = NEGATIVE_SIGNALS.test(physical) && !IMPROVING_SIGNALS.test(physical);
  const emoImproving = IMPROVING_SIGNALS.test(emotional) && !NEGATIVE_SIGNALS.test(emotional);
  const emoNeg = NEGATIVE_SIGNALS.test(emotional) && !IMPROVING_SIGNALS.test(emotional);

  if (physImproving && emoNeg) {
    failures.push(`Physical says improving but emotional says negative: "${insights.physicalInsight.substring(0, 50)}" vs "${insights.emotionalInsight.substring(0, 50)}"`);
  }
  if (physNeg && emoImproving) {
    failures.push(`Physical says negative but emotional says improving`);
  }

  return { pass: failures.length === 0, failures };
}