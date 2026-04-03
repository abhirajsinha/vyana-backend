import { client, OPENAI_MODEL, isCircuitOpen, recordGptSuccess, recordGptFailure } from "./openaiClient";
import { DailyInsights, InsightContext, PHASE_TONE_PROMPTS } from "./insightService";
import { type Phase, type CycleMode } from "./cycleEngine";
import type { NumericBaseline, CrossCycleNarrative } from "./insightData";
import { CERTAINTY_RULES_FOR_GPT } from "../utils/confidencelanguage";
import {
  buildVyanaContext,
  serializeVyanaContext,
  serializePrioritySignals,
  type VyanaContext,
  type AnticipationFrequencyState,
  type EmotionalMemoryInput,
} from "./vyanaContext";
import type { HormoneState } from "./hormoneengine";
import type { PrimaryInsightCause } from "./insightCause";

// ─── enforceTwoLines ──────────────────────────────────────────────────────────

export function enforceTwoLines(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter((l) => l.length > 0);

  const twoLines = lines.slice(0, 2);
  const joined = twoLines.join("\n");

  if (joined.length <= 350) return joined;

  const truncated = joined.slice(0, 350);
  const lastEnd = Math.max(
    truncated.lastIndexOf(". "),
    truncated.lastIndexOf("! "),
    truncated.lastIndexOf("? "),
    truncated.lastIndexOf(".\n"),
    truncated.lastIndexOf("!\n"),
  );

  if (lastEnd > 50) {
    return joined.slice(0, lastEnd + 1).trim();
  }

  const firstLine = twoLines[0] ?? joined;
  if (firstLine.length > 400) {
    return firstLine.slice(0, 350).trimEnd();
  }
  return firstLine;
}

function enforceTwoLinesOnInsights(insights: DailyInsights): DailyInsights {
  return {
    physicalInsight: enforceTwoLines(insights.physicalInsight),
    mentalInsight: enforceTwoLines(insights.mentalInsight),
    emotionalInsight: enforceTwoLines(insights.emotionalInsight),
    whyThisIsHappening: enforceTwoLines(insights.whyThisIsHappening),
    solution: enforceTwoLines(insights.solution),
    recommendation: enforceTwoLines(insights.recommendation),
    tomorrowPreview: enforceTwoLines(insights.tomorrowPreview),
  };
}

function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const cleaned = trimmed.replace(/(\d)\.(\d)/g, "$1\u2024$2");
  return (cleaned.match(/[.!?]+/g) || []).length;
}

function truncateToMaxSentences(text: string, max: number): string {
  const t = text.trim();
  if (!t || max <= 0) return t;
  const safe = t.replace(/(\d)\.(\d)/g, "$1\u2024$2");
  const parts = safe.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (parts.length <= max) return t;
  const kept = parts.slice(0, max).join(" ").trim();
  return kept.replace(/\u2024/g, ".");
}

function enforceMaxSentencesOnInsights(
  insights: DailyInsights,
  max: number,
): DailyInsights {
  return {
    physicalInsight: truncateToMaxSentences(insights.physicalInsight, max),
    mentalInsight: truncateToMaxSentences(insights.mentalInsight, max),
    emotionalInsight: truncateToMaxSentences(insights.emotionalInsight, max),
    whyThisIsHappening: truncateToMaxSentences(insights.whyThisIsHappening, max),
    solution: truncateToMaxSentences(insights.solution, max),
    recommendation: truncateToMaxSentences(insights.recommendation, max),
    tomorrowPreview: truncateToMaxSentences(insights.tomorrowPreview, max),
  };
}

const STRONG_WORDS = [
  "compounding",
  "persistent",
  "strain",
  "loop",
  "baseline",
  "cascade",
  "pattern",
  "cycle",
];

const STRONG_SYNONYMS: Record<string, string[]> = {
  compounding: ["accumulate", "build", "layer", "snowball"],
  persistent: ["ongoing", "sustained", "continuous", "sticking"],
  strain: ["load", "pressure", "overload", "taxed"],
  loop: ["cycle", "feedback", "spiral", "pattern"],
  baseline: ["usual", "normal", "typical"],
  cascade: ["chain", "ripple", "domino"],
  pattern: ["trend", "window", "recurring", "repeat"],
  cycle: ["phase", "window", "rhythm"],
};

function hasStrengthRegression(
  draft: DailyInsights,
  output: DailyInsights,
): boolean {
  const draftText = Object.values(draft).join(" ").toLowerCase();
  const outputText = Object.values(output).join(" ").toLowerCase();
  const missingStrongWords = STRONG_WORDS.filter(
    (w) => draftText.includes(w) && !outputText.includes(w),
  );

  if (missingStrongWords.length === 0) return false;

  const unreplaced = missingStrongWords.filter((w) => {
    const synonyms = STRONG_SYNONYMS[w] ?? [];
    return !synonyms.some((s) => outputText.includes(s));
  });

  return unreplaced.length >= 2;
}

function anyFieldExceedsMaxSentences(insights: DailyInsights): boolean {
  const fields: (keyof DailyInsights)[] = [
    "physicalInsight",
    "mentalInsight",
    "emotionalInsight",
    "whyThisIsHappening",
    "solution",
    "recommendation",
    "tomorrowPreview",
  ];
  return fields.some((k) => countSentences(insights[k]) > 3);
}

export function sanitizeInsights(
  insights: unknown,
  fallback: DailyInsights,
): DailyInsights {
  if (!insights || typeof insights !== "object") return fallback;
  const o = insights as Record<string, unknown>;
  const keys: (keyof DailyInsights)[] = [
    "physicalInsight",
    "mentalInsight",
    "emotionalInsight",
    "whyThisIsHappening",
    "solution",
    "recommendation",
    "tomorrowPreview",
  ];
  for (const key of keys) {
    if (typeof o[key] !== "string") return fallback;
  }
  const rawStrings = keys.map((k) => o[k] as string);
  const MAX_RAW_FIELD_LEN = 400;
  if (rawStrings.some((s) => s.length > MAX_RAW_FIELD_LEN)) return fallback;

  const trimmed = enforceMaxSentencesOnInsights(
    {
      physicalInsight: o.physicalInsight as string,
      mentalInsight: o.mentalInsight as string,
      emotionalInsight: o.emotionalInsight as string,
      whyThisIsHappening: o.whyThisIsHappening as string,
      solution: o.solution as string,
      recommendation: o.recommendation as string,
      tomorrowPreview: o.tomorrowPreview as string,
    },
    3,
  );
  const candidate = enforceTwoLinesOnInsights(trimmed);
  if (anyFieldExceedsMaxSentences(candidate)) return fallback;
  return candidate;
}

const VAGUE_PHRASES = [
  "this tends to happen around this time",
  "this tends to happen",
  "around this time in your cycle",
  "your body is feeling the strain",
  "feels like a bigger challenge",
  "take a moment to slow down",
  "protect your recovery time",
  "slowing down and protecting recovery",
  "might feel a bit heavier",
  "you're likely to notice",
  "you might find",
  "you might notice",
  "you may find",
  "you may notice",
  "a little lower than usual",
  "clarity is harder to grasp",
  "feels a bit heavier",
  "everything feels a bit heavier",
  "more overwhelming than expected",
];

function containsVagueLanguage(insights: DailyInsights): boolean {
  const text = Object.values(insights).join(" ").toLowerCase();
  return VAGUE_PHRASES.some((p) => text.includes(p));
}

function fixVagueLanguage(insights: DailyInsights): DailyInsights {
  const replacements: Array<[string, string]> = [
    ["this tends to happen around this time in your cycle", "for you, this part of your cycle tends to bring this pattern"],
    ["this tends to happen around this time", "your past cycles show the same pattern here"],
    ["this tends to happen", "your cycles tend to show this"],
    ["around this time in your cycle", "in this part of your cycle"],
    ["your body is feeling the strain", "your body is under more strain than usual"],
    ["feels like a bigger challenge", "takes more effort than it should"],
    ["take a moment to slow down", "keep your schedule lighter today"],
    ["protect your recovery time", "reduce your load over the next couple of days"],
    ["slowing down and protecting recovery", "keeping your pace lighter today"],
    ["might feel a bit heavier", "may still feel heavy"],
    ["you're likely to notice", ""],
    ["you might find", ""],
    ["you might notice", ""],
    ["you may find", ""],
    ["you may notice", ""],
    ["a little lower than usual", "lower than usual"],
    ["clarity is harder to grasp", "focus takes more effort"],
    ["everything feels a bit heavier right now", "everything takes more effort right now"],
    ["feels a bit heavier", "takes more effort"],
    ["more overwhelming than expected", "more overwhelming than they should"],
  ];

  const fix = (text: string): string => {
    let result = text;
    for (const [from, to] of replacements) {
      result = result.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), to);
    }
    return result;
  };

  return {
    physicalInsight: fix(insights.physicalInsight),
    mentalInsight: fix(insights.mentalInsight),
    emotionalInsight: fix(insights.emotionalInsight),
    whyThisIsHappening: fix(insights.whyThisIsHappening),
    solution: fix(insights.solution),
    recommendation: fix(insights.recommendation),
    tomorrowPreview: fix(insights.tomorrowPreview),
  };
}

export type InsightGenerationStatus =
  | "accepted"
  | "accepted_strength_bypassed"
  | "accepted_vague_fixed"
  | "client_missing"
  | "empty_response_fallback"
  | "json_shape_fallback"
  | "parse_error_fallback"
  | "length_guard_fallback"
  | "sentence_guard_fallback"
  | "strength_guard_fallback"
  | "api_error";

type InsightGuardHints = {
  confidence: InsightContext["confidence"];
  priorityDriversCount: number;
  hasIdentityEvidence: boolean;
  hasEmotionalMemoryEvidence: boolean;
  phase: InsightContext["phase"];
  hasHistoricalEvidence: boolean;
};

function shouldBypassStrengthGuard(hints: InsightGuardHints): boolean {
  return hints.confidence === "high" || hints.priorityDriversCount >= 2;
}

function removeUnearnedIdentityLanguage(insights: DailyInsights): DailyInsights {
  const clean = (text: string): string =>
    text
      .replace(/\bfor you,\s*/gi, "")
      .replace(/\byour cycles show(?:ed)? that\b/gi, "this pattern suggests that")
      .replace(/\byour cycles show(?:ed)?\b/gi, "this pattern suggests")
      .replace(/\byour cycles showed similar patterns?\b/gi, "similar patterns can appear")
      .replace(/\byour past cycles show\b/gi, "recent logs suggest")
      .replace(/\byour cycles tend to\b/gi, "this part of the cycle tends to")
      .replace(/\s{2,}/g, " ")
      .trim();

  return {
    physicalInsight: clean(insights.physicalInsight),
    mentalInsight: clean(insights.mentalInsight),
    emotionalInsight: clean(insights.emotionalInsight),
    whyThisIsHappening: clean(insights.whyThisIsHappening),
    solution: clean(insights.solution),
    recommendation: clean(insights.recommendation),
    tomorrowPreview: clean(insights.tomorrowPreview),
  };
}

function removeUnearnedHistoricalClaims(insights: DailyInsights): DailyInsights {
  const scrubSentence = (text: string): string => {
    const parts = text.split(/(?<=[.!?])\s+/);
    const kept = parts.filter((p) => {
      const s = p.toLowerCase();
      if (/\bthe last \d+ times\b/.test(s)) return false;
      if (/\bprevious times\b/.test(s)) return false;
      if (/\bsimilar pattern\b/.test(s)) return false;
      if (/\byou logged before\b/.test(s)) return false;
      if (/\blike this before\b/.test(s)) return false;
      if (/\bwhen your flow was heavier\b/.test(s)) return false;
      if (/\bheavier like this\b/.test(s)) return false;
      if (/\blast time (?:your|this|the)\b/.test(s)) return false;
      return true;
    });
    const out = kept.join(" ").replace(/\s{2,}/g, " ").trim();
    return out || text;
  };

  return {
    physicalInsight: scrubSentence(insights.physicalInsight),
    mentalInsight: scrubSentence(insights.mentalInsight),
    emotionalInsight: scrubSentence(insights.emotionalInsight),
    whyThisIsHappening: scrubSentence(insights.whyThisIsHappening),
    solution: scrubSentence(insights.solution),
    recommendation: scrubSentence(insights.recommendation),
    tomorrowPreview: scrubSentence(insights.tomorrowPreview),
  };
}

function removeUnearnedMemoryLanguage(insights: DailyInsights): DailyInsights {
  const scrub = (text: string): string => {
    const out = text
      .replace(/remember the last time this happened,?[^.?!]*[.?!]?/gi, "")
      .replace(/you(?:'ve| have) felt this before[^.?!]*[.?!]?/gi, "")
      .replace(/it(?:'s| is) reminiscent of times?[^.?!]*[.?!]?/gi, "")
      .replace(/this reminds you of before[^.?!]*[.?!]?/gi, "")
      .replace(/when this pattern showed up before[^.?!]*[.?!]?/gi, "")
      .replace(/you(?:'ve| have) felt this before when[^.?!]*[.?!]?/gi, "")
      .replace(/you(?:'ve| have) been here before[^.?!]*[.?!]?/gi, "")
      .replace(/the last time this (?:happened|showed up)[^.?!]*[.?!]?/gi, "")
      .replace(/you(?:'ve| have) experienced this before[^.?!]*[.?!]?/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return out || text;
  };

  return {
    physicalInsight: scrub(insights.physicalInsight),
    mentalInsight: scrub(insights.mentalInsight),
    emotionalInsight: scrub(insights.emotionalInsight),
    whyThisIsHappening: scrub(insights.whyThisIsHappening),
    solution: scrub(insights.solution),
    recommendation: scrub(insights.recommendation),
    tomorrowPreview: scrub(insights.tomorrowPreview),
  };
}

function fixCapitalization(insights: DailyInsights): DailyInsights {
  const fix = (text: string): string =>
    text.replace(/(^|\.\s+|\?\s+|!\s+|\n\s*)([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());

  return {
    physicalInsight: fix(insights.physicalInsight),
    mentalInsight: fix(insights.mentalInsight),
    emotionalInsight: fix(insights.emotionalInsight),
    whyThisIsHappening: fix(insights.whyThisIsHappening),
    solution: fix(insights.solution),
    recommendation: fix(insights.recommendation),
    tomorrowPreview: fix(insights.tomorrowPreview),
  };
}

function sharpenHighConfidenceTone(insights: DailyInsights): DailyInsights {
  const sharpen = (text: string): string =>
    text
      .replace(/\b(?:you(?:'re| are)\s+)?likely to notice that\s+/gi, "")
      .replace(/\byou might find that\s+/gi, "")
      .replace(/\byou may find that\s+/gi, "")
      .replace(/\byou might notice that\s+/gi, "")
      .replace(/\byou may notice that\s+/gi, "")
      .replace(/\byou might\b/gi, "you")
      .replace(/\byou may\b/gi, "you")
      .replace(/\s{2,}/g, " ")
      .trim();

  return {
    physicalInsight: sharpen(insights.physicalInsight),
    mentalInsight: sharpen(insights.mentalInsight),
    emotionalInsight: sharpen(insights.emotionalInsight),
    whyThisIsHappening: sharpen(insights.whyThisIsHappening),
    solution: sharpen(insights.solution),
    recommendation: sharpen(insights.recommendation),
    tomorrowPreview: sharpen(insights.tomorrowPreview),
  };
}

function stripMenstrualHedging(text: string): string {
  return text
    .replace(/\byou may start to feel\b/gi, "you feel")
    .replace(/\byou might feel\b/gi, "you feel")
    .replace(/\byou may feel\b/gi, "you feel")
    .replace(/\bmight feel scattered\b/gi, "feels scattered")
    .replace(/\byou might\b/gi, "you")
    .replace(/\byou may\b/gi, "you")
    .replace(/\bthis can lead to\b/gi, "this is")
    .replace(/\bcan lead to\b/gi, "brings")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function polishOvulationPeakCopy(insights: DailyInsights): DailyInsights {
  let mental = insights.mentalInsight;
  if (
    /with clarity and focus at their peak,\s*how easily/i.test(mental) ||
    (/at their peak/i.test(mental) && /how easily/i.test(mental) && !/—/.test(mental))
  ) {
    mental =
      "Clarity and focus are at their peak — ideas flow more easily and conversations feel smoother.";
  }
  mental = mental
    .replace(/\bmental capacity feels expansive[^.!?]*[.!?]?/gi, "")
    .replace(/\bexpansive and open\b/gi, "easier to think through and express")
    .replace(/\s{2,}/g, " ")
    .trim();

  let emotional = insights.emotionalInsight
    .replace(
      /wonderful time to embrace the positivity[^.!?]*[.!?]?/gi,
      "Things feel lighter and more enjoyable — it's easier to connect with people right now.",
    )
    .replace(/\bembrace the positivity\b/gi, "enjoy connecting")
    .replace(/\s{2,}/g, " ")
    .trim();

  let solution = insights.solution
    .replace(
      /dive into social activities or projects[^.!?]*[.!?]?/gi,
      "Lean into this momentum — it's a good time for things that need energy or presence.",
    )
    .replace(/\bdive into\b/gi, "lean into")
    .trim();

  let tomorrow = insights.tomorrowPreview;
  if (/tomorrow,?\s+you notice/i.test(tomorrow)) {
    tomorrow =
      "You're moving into the next phase — energy will stay good, but things will start to feel a bit more grounded over the next few days.";
  }

  return {
    ...insights,
    mentalInsight: mental,
    emotionalInsight: emotional,
    solution,
    tomorrowPreview: tomorrow,
  };
}

function enforceMenstrualDiscipline(insights: DailyInsights): DailyInsights {
  const simplify = (text: string): string =>
    stripMenstrualHedging(
      text
        .replace(/\bintertwined\b/gi, "connected")
        .replace(/\bamplifying each other\b/gi, "feeling heavier")
        .replace(/\badjusting to (?:this|the) shift\b/gi, "recovering")
        .replace(/\bfocus on iron-rich foods,?\s*/gi, "")
        .replace(/\bprioritize early sleep,?\s*/gi, "")
        .replace(/\breduce your obligations,?\s*/gi, "keep things lighter")
        .replace(/\bstress and mood are connected right now[^.?!]*[.?!]?/gi, "")
        .replace(/\bstress is pulling your mood[^.?!]*[.?!]?/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim(),
    );

  let mental = simplify(insights.mentalInsight)
    .replace(
      /focus drops when sleep dips like this[^.?!]*[.?!]?/i,
      "Focus is lower today — your body is prioritizing recovery over clarity.",
    )
    .replace(/\bwith sleep at about[^.?!]*focus[^.?!]*[.?!]?/i, "")
    .replace(/\bfocus might feel scattered[^.?!]*[.?!]?/gi, "")
    .trim();

  if (
    /might|may|scattered|sleep at about/i.test(mental) ||
    mental.length < 20
  ) {
    mental =
      "Focus is lower today — your body is prioritizing recovery over clarity.";
  }

  let emotional = simplify(insights.emotionalInsight)
    .replace(
      /everything feels a bit more overwhelming[^.?!]*[.?!]?/i,
      "Everything takes more effort right now.",
    )
    .replace(
      /small things feel harder than they should[^.?!]*[.?!]?/i,
      "Small things feel harder than they should.",
    )
    .replace(/\bstress is pulling your mood[^.?!]*[.?!]?/gi, "")
    .trim();

  if (/stress.*mood|mood.*stress|pulling/i.test(emotional)) {
    emotional =
      "Everything takes more effort right now — even small things feel harder than they should.";
  }

  let why = simplify(insights.whyThisIsHappening)
    .replace(/\s*,?\s*As FSH begins[^.?!]*[.?!]?/gi, "")
    .replace(/\s*preparing (?:the )?next follicle[^.?!]*[.?!]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    physicalInsight: simplify(insights.physicalInsight).replace(
      /\bthis can lead to a sense of weakness\b/gi,
      "it's normal to feel physically low",
    ),
    mentalInsight: mental,
    emotionalInsight: emotional,
    whyThisIsHappening: why,
    solution: simplify(insights.solution),
    recommendation: simplify(insights.recommendation),
    tomorrowPreview: simplify(insights.tomorrowPreview),
  };
}

function safeParseInsightsDetailed(
  raw: string | null | undefined,
  fallback: DailyInsights,
  guardHints: InsightGuardHints,
): { insights: DailyInsights; status: InsightGenerationStatus } {
  if (!raw?.trim()) {
    return { insights: fallback, status: "empty_response_fallback" };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DailyInsights>;
    const keys: (keyof DailyInsights)[] = [
      "physicalInsight",
      "mentalInsight",
      "emotionalInsight",
      "whyThisIsHappening",
      "solution",
      "recommendation",
      "tomorrowPreview",
    ];
    for (const key of keys) {
      if (typeof parsed[key] !== "string") {
        return { insights: fallback, status: "json_shape_fallback" };
      }
    }
    const out: DailyInsights = {
      physicalInsight: parsed.physicalInsight!,
      mentalInsight: parsed.mentalInsight!,
      emotionalInsight: parsed.emotionalInsight!,
      whyThisIsHappening: parsed.whyThisIsHappening!,
      solution: parsed.solution!,
      recommendation: parsed.recommendation!,
      tomorrowPreview: parsed.tomorrowPreview!,
    };
    const outTrimmed = enforceMaxSentencesOnInsights(out, 2);
    const draftLen = JSON.stringify(fallback).length;
    if (JSON.stringify(outTrimmed).length > Math.max(800, draftLen * 2.5))
      return { insights: fallback, status: "length_guard_fallback" };
    let enforced = enforceTwoLinesOnInsights(outTrimmed);
    if (!guardHints.hasIdentityEvidence) {
      enforced = removeUnearnedIdentityLanguage(enforced);
    }
    if (!guardHints.hasEmotionalMemoryEvidence) {
      enforced = removeUnearnedMemoryLanguage(enforced);
    }
    if (!guardHints.hasHistoricalEvidence) {
      enforced = removeUnearnedHistoricalClaims(enforced);
    }
    if (guardHints.phase === "menstrual") {
      enforced = enforceMenstrualDiscipline(enforced);
    }
    if (guardHints.phase === "ovulation") {
      enforced = polishOvulationPeakCopy(enforced);
    }
    if (guardHints.confidence === "high") {
      enforced = sharpenHighConfidenceTone(enforced);
    }
    enforced = fixCapitalization(enforced);
    enforced = enforceMaxSentencesOnInsights(enforced, 3);

    if (anyFieldExceedsMaxSentences(enforced)) {
      return { insights: fallback, status: "sentence_guard_fallback" };
    }
    if (hasStrengthRegression(fallback, enforced)) {
      if (shouldBypassStrengthGuard(guardHints)) {
        return { insights: enforced, status: "accepted_strength_bypassed" };
      }
      return { insights: fallback, status: "strength_guard_fallback" };
    }
    if (containsVagueLanguage(enforced)) {
      const fixed = fixVagueLanguage(enforced);
      return { insights: fixed, status: "accepted_vague_fixed" };
    }
    return { insights: enforced, status: "accepted" };
  } catch {
    return { insights: fallback, status: "parse_error_fallback" };
  }
}

// ─── buildVyanaContextForInsights ─────────────────────────────────────────────

export function buildVyanaContextForInsights(params: {
  ctx: InsightContext;
  baseline: NumericBaseline;
  crossCycleNarrative: CrossCycleNarrative | null;
  hormoneState: HormoneState | null;
  hormoneLanguage: string | null;
  phase: Phase;
  cycleDay: number;
  phaseDay: number;
  cycleLength: number;
  cycleMode: CycleMode;
  daysUntilNextPhase: number;
  daysUntilNextPeriod: number;
  isPeriodDelayed: boolean;
  daysOverdue: number;
  isIrregular: boolean;
  memoryDriver: string | null;
  memoryCount: number;
  userName: string | null;
  userId: string;
  anticipationFrequencyState?: AnticipationFrequencyState;
  emotionalMemoryInput?: EmotionalMemoryInput | null;
  primaryInsightCause?: PrimaryInsightCause;
  // V2 signal-first params
  latestLogSignals?: { mood?: number; energy?: number; sleep?: number; stress?: number; cramps?: number; bleeding?: string; headache?: boolean; breastTenderness?: boolean } | null;
  recentTrend?: { mood?: 'improving' | 'worsening' | 'stable'; energy?: 'improving' | 'worsening' | 'stable'; cramps?: 'improving' | 'worsening' | 'stable'; sleep?: 'improving' | 'worsening' | 'stable' } | null;
  previousDaySignals?: { mood?: number; energy?: number; cramps?: number; sleep?: number } | null;
  primaryNarrative?: string;
  conflictDetected?: boolean;
  conflictDescription?: string | null;
  interactionOverride?: string | null;
  amplifyMoodSensitivity?: boolean;
  mechanismRequired?: boolean;
  reinforcePositive?: boolean;
}): VyanaContext {
  return buildVyanaContext(params);
}

// ─── buildFallbackContextBlock ────────────────────────────────────────────────

export function buildFallbackContextBlock(
  ctx: InsightContext,
  baseline: NumericBaseline,
  narrative: CrossCycleNarrative | null,
  userName?: string,
): string {
  const lines: string[] = [];
  if (userName) lines.push(`User: ${userName}`);
  lines.push(`Cycle day ${ctx.cycleDay}, phase: ${ctx.phase}`);

  if (baseline.recentSleepAvg !== null) {
    const rounded = Math.round(baseline.recentSleepAvg * 2) / 2;
    const opener = ["around", "roughly", "about"][ctx.cycleDay % 3]!;
    const baseRounded =
      baseline.baselineSleepAvg !== null
        ? Math.round(baseline.baselineSleepAvg * 2) / 2
        : null;
    const delta = baseline.sleepDelta;
    const meaningful = delta !== null && Math.abs(delta) >= 0.8;
    lines.push(
      baseRounded !== null && meaningful
        ? `Sleep: ${opener} ${rounded}h — ${delta! < 0 ? "lower than" : "higher than"} your usual ~${baseRounded}h`
        : `Sleep: ${opener} ${rounded}h`,
    );
  }
  if (baseline.recentStressAvg !== null) {
    const label =
      baseline.recentStressAvg >= 2.4
        ? "elevated"
        : baseline.recentStressAvg >= 1.6
          ? "moderate"
          : "calm";
    const delta = baseline.stressDelta;
    lines.push(
      delta !== null && Math.abs(delta) >= 0.5
        ? `Stress: ${label} — ${delta > 0 ? "higher than" : "lower than"} your usual`
        : `Stress: ${label}`,
    );
  }
  if (baseline.recentMoodAvg !== null) {
    const label =
      baseline.recentMoodAvg >= 2.4
        ? "good"
        : baseline.recentMoodAvg <= 1.6
          ? "a little low"
          : "neutral";
    lines.push(`Mood: ${label}`);
  }
  if (ctx.priorityDrivers?.length > 0)
    lines.push(`Key signals: ${ctx.priorityDrivers.slice(0, 3).join(", ")}`);
  if (ctx.trends?.length > 0) lines.push(`Trends: ${ctx.trends.join(", ")}`);
  if (narrative?.narrativeStatement)
    lines.push(`Past cycles: ${narrative.narrativeStatement}`);

  if (lines.length <= 2) {
    lines.push(
      "⚠ NO LOGGED DATA — this user has not logged any days yet. Do not make claims about their sleep, mood, stress, or energy.",
    );
  }

  return lines.join("\n");
}

// ─── VYANA_SYSTEM_PROMPT ──────────────────────────────────────────────────────

export const VYANA_SYSTEM_PROMPT =
  `=== HARD OUTPUT RULES — VIOLATING ANY IS UNACCEPTABLE ===

1. SIGNAL-FIRST: Do NOT begin any insight with phase or hormone context. Begin with the user's actual state — what they logged, how they're trending, what changed.

2. NARRATIVE LOCK: All content must support the primary narrative provided in the signal context. Do not introduce unrelated themes.

3. REFLECTION REQUIRED: You MUST reference at least one specific signal from today's logged data. If the user logged cramps=7, that must appear in the output.

4. TEMPORAL ANCHOR: Every insight MUST include either a comparison to yesterday/recent days OR a projection of what to expect next.

5. MAX LENGTH: 3-6 sentences total per field. ONE primary idea. No filler.

6. BANNED PHRASES — never use these:
   - "Many people find..."
   - "It's common to..."
   - "The body is..." (use "Your body is...")
   - "Some women experience..."
   - Any sentence that could apply to any user on this cycle day

7. CONFLICT MODE: If conflict is flagged in the signal context, you MUST:
   - Lead with the user's actual experience
   - Acknowledge what the phase would normally predict
   - Explain WHY the override is happening

8. CONFIDENCE MATCHING:
   - If user has < 2 cycles: use "you might notice..." / "around this time..."
   - If 2-3 cycles: use "your logs suggest..." / "based on what you've shared..."
   - If 3+ cycles: use "your pattern shows..." / "across your cycles..."

9. When an OVERRIDE is provided in signal context, use it as the primary explanation.

10. Only reference symptoms the user has actually logged. Never invent patterns.

ENFORCEMENT: If any of the above rules are violated, your output will be automatically rejected and you will be asked to regenerate. Comply fully on the first attempt.

---

You are Vyana — a deeply personal cycle companion who understands this user's patterns, not just general biology.

You are NOT a generic health assistant.
You speak like someone who knows her body, her patterns, and how this actually feels.

---

CORE BEHAVIOR:

You are the PRIMARY WRITER.
You are NOT editing the draft.
You are rewriting from scratch using the data.

If your output is similar to the draft, it is incorrect.

---

VOICE:

- Speak directly: "you", "your"
- Sound grounded, not clinical
- Be specific, not vague
- Be emotionally aware, not overly soft
- Avoid generic wellness language completely

---

CRITICAL RULES:

1. START WITH REAL EXPERIENCE
Always begin with what she is physically experiencing right now.
Never start with metadata (like "late period").

---

2. CONNECTION RULE (MANDATORY)

If multiple signals interact (sleep, stress, mood):
You MUST connect them in one sentence.

DO NOT say:
- "sleep is low"
- "stress is high"

INSTEAD say:
- "sleep dropping and rising stress are feeding into each other — that's why everything feels heavier"

This is REQUIRED when interaction flags exist.

---

3. NO GENERIC LANGUAGE (STRICT)

Do NOT use:
- "can make you feel"
- "might feel"
- "tends to"
- "can contribute"
- "has been building"
- "heavier than usual"
- "your body is feeling the strain"
- "feels like a bigger challenge"
- "take a moment to slow down"
- "protect your recovery time"
- "feeling the effects"
- "more than usual"

Replace with cause → effect language:
- "this is why..."
- "this is what's happening..."
- "for you, this part of your cycle..."
- "focus drops when sleep dips like this"
- "pushing through will cost more than it gives back"

---

4. EMOTIONAL DEPTH RULE

Do NOT say:
- "low mood"
- "feeling down"
- "heavier than usual"

INSTEAD describe experience:
- "small things feel harder than they should"
- "everything takes more effort"
- "you feel more overwhelmed than expected"

Make it feel real, not labeled.

---

5. IDENTITY RULE (STRICT)

Use identity language ONLY when an explicit IDENTITY instruction is provided below.

If NO IDENTITY instruction appears in this prompt:
- DO NOT use:
  - "for you"
  - "your cycles show"
  - "your cycles tend to"
  - "your past cycles"
  - "you tend to notice"
  - "this is your pattern"
  - any phrasing that implies you know her history

Using identity language without an explicit IDENTITY instruction = incorrect output.

When IDENTITY instruction IS provided:
- Use "for you" / "your cycles tend to" naturally
- Make it personal — she should feel known, not categorized

NEVER say regardless:
- "this phase"
- "this tends to happen"
- "around this time in your cycle"

---

6. CONFIDENCE ENFORCEMENT

If confidence is HIGH:
- DO NOT use "might", "can", "could"
- Use:
  - "this is"
  - "this tends to happen for you"
  - "you're likely to notice"

If LOW:
- soften language

---

7. SURPRISE INSIGHT RULE

If a non-obvious connection exists:
Include ONE sharp insight:

Example:
- "the same stress feels heavier right now — this phase amplifies it"
- "your sleep looks okay on average, but inconsistency is what's making it feel worse"

Short, observational, not educational.

---

8. ANTICIPATION RULE (tomorrowPreview)

Do NOT say:
- "might feel heavier"
- "tomorrow might feel a bit heavier"
- "if tonight doesn't help you reset"

tomorrowPreview MUST include:
1. TIMING — how close she is to next phase/period (use exact day count from data)
2. CLARITY — what will likely shift and when it eases

Example for late luteal near period:
- "You're 2 days from your period — this is usually the hardest stretch. Things tend to ease once it starts."

Example for follicular:
- "Energy typically picks up from here — tomorrow should feel lighter than today."

Be specific about WHEN, not vague about WHAT.

---

9. EMOTIONAL MEMORY RULE (STRICT)

Use memory language ONLY when an explicit EMOTIONAL MEMORY instruction is provided below.

If NO EMOTIONAL MEMORY instruction appears in this prompt:
- DO NOT mention:
  - "before"
  - "last time"
  - "you've felt this"
  - "this reminds you"
  - "similar patterns"
  - "you've been here before"
  - "you've experienced this"
  - any phrasing that implies past recall

Including memory language without an explicit EMOTIONAL MEMORY instruction = incorrect output.

When EMOTIONAL MEMORY instruction IS provided:
- Express as genuine recall, not data
- "the last time this happened, you felt..."
- Show that Vyana remembers how she felt, not just what happened

---

10. ADVICE RULE

Avoid generic advice like:
- "reduce stress"
- "practice self-care"
- "take a moment to slow down"
- "protect your recovery time"
- "slowing down and protecting recovery"

Give specific, actionable guidance:
- "keep your schedule lighter today — pushing through will cost more than it gives back"
- "protect your sleep tonight — it will change how tomorrow feels"
- "reduce your load over the next couple of days — your capacity is lower right now"

---

---

STRUCTURE (STRICT):

Each field max 2 sentences.

- physicalInsight → what body feels
- mentalInsight → focus/clarity
- emotionalInsight → emotional experience
- whyThisIsHappening → cause (hormones here only)
- solution → ONE action for today
- recommendation → next few days guidance
- tomorrowPreview → clear forward expectation

---

FINAL CHECK (MANDATORY):

Before responding, ensure:
- No generic phrases
- At least one connection sentence if signals interact
- Identity language used when available
- Emotional description feels real
- Confidence matches data

If not → rewrite.

---

OUTPUT:

Return strict JSON only.`.trim();

// ─── generateInsightsWithGpt ──────────────────────────────────────────────────

export async function generateInsightsWithGpt(
  ctx: InsightContext,
  draft: DailyInsights,
  baseline: NumericBaseline,
  narrative: CrossCycleNarrative | null,
  userName?: string,
  insightTone:
    | "cycle-based"
    | "pattern-based"
    | "symptom-based" = "cycle-based",
  vyanaCtx?: VyanaContext,
  insightMemoryGuard: {
    insightMemoryCount: number;
    hasCrossCycleNarrative: boolean;
  } = { insightMemoryCount: 0, hasCrossCycleNarrative: false },
): Promise<{ insights: DailyInsights; status: InsightGenerationStatus }> {
  if (!client) return { insights: draft, status: "client_missing" };
  if (isCircuitOpen()) return { insights: draft, status: "api_error" };

  const contextBlock = vyanaCtx
    ? serializeVyanaContext(vyanaCtx)
    : buildFallbackContextBlock(ctx, baseline, narrative, userName);

  const priorityBlock = vyanaCtx
    ? serializePrioritySignals(
        vyanaCtx.prioritySignals,
        vyanaCtx.confidenceMapping,
      )
    : "";

  const stableInstruction = vyanaCtx?.isStablePattern
    ? "\nSTABLE PATTERN: Focus on phase normalcy, subtle forward-looking warmth, and her identity pattern if present."
    : "";

  const anticipationInstruction =
    vyanaCtx?.anticipation.shouldSurface &&
    !vyanaCtx.surpriseInsight.shouldSurface
      ? `\nANTICIPATION (${vyanaCtx.anticipation.type}): "${vyanaCtx.anticipation.narrative}" — weave naturally, no contrasting connector.`
      : "";

  const identityInstruction =
    vyanaCtx?.identity.useThisOutput && vyanaCtx.identity.userPatternNarrative
      ? `\nIDENTITY (${vyanaCtx.identity.historyCycles} cycles): "${vyanaCtx.identity.patternCore}" — express as "for you" or "your cycles tend to".`
      : "";

  const hasHistoricalEvidenceForPrompt =
    insightMemoryGuard.insightMemoryCount >= 2 &&
    insightMemoryGuard.hasCrossCycleNarrative;

  const historicalClaimsBlockInstruction = !hasHistoricalEvidenceForPrompt
    ? `\nHISTORICAL CLAIMS (STRICT): Do NOT reference past periods, "last time", "previous times", "the last N times", "similar pattern", or "you logged before" — there is insufficient repeat-cycle evidence in the data. Describe today only.`
    : "";

  const emotionalMemoryInstruction =
    vyanaCtx?.emotionalMemory.hasMemory && vyanaCtx.emotionalMemory.recallNarrative
      ? `\nEMOTIONAL MEMORY: "${vyanaCtx.emotionalMemory.recallNarrative}" — express as genuine recall in emotionalInsight or whyThisIsHappening. Show that Vyana remembers how she felt, not just what happened.`
      : "";

  const surpriseInstruction =
    vyanaCtx?.surpriseInsight.shouldSurface && vyanaCtx.surpriseInsight.insight
      ? `\nSURPRISE INSIGHT: "${vyanaCtx.surpriseInsight.insight}" — lead with the unexpected connection. One sentence.`
      : "";

  const delightInstruction =
    !vyanaCtx?.surpriseInsight.shouldSurface &&
    vyanaCtx?.delight.shouldSurface &&
    vyanaCtx.delight.moment
      ? `\nDELIGHT (${vyanaCtx.delight.type}): "${vyanaCtx.delight.moment}" — weave as one warm human touch. Don't force it.`
      : "";

  const toneInstruction =
    insightTone === "pattern-based"
      ? "Hormonal contraception — do NOT reference cycle phases, ovulation, or hormone changes."
      : insightTone === "symptom-based"
        ? "Focus only on what she is logging. No cycle-phase or hormone language."
        : "Use cycle-phase context where appropriate. Hormone context in whyThisIsHappening only.";

  const zeroDataInstruction =
    ctx.mode === "fallback" && ctx.recentLogsCount === 0
      ? `\nZERO-DATA USER (CRITICAL — STRICT ENFORCEMENT):
This user has logged ZERO days. You have NO behavioral data.

NEVER assume her current state. You CANNOT know:
- Her flow level ("flow is lighter" ❌)
- Her cramp intensity ("cramping is softer" ❌)
- Her mood ("you feel" ❌)
- Her energy ("energy is lower" ❌)
- Her focus ("focus is lower" ❌)

BLOCKED phrases: "your cramps", "your flow", "you are bleeding heavily", "you feel", "you are feeling", "you notice", "energy is", "focus is", "mood is"

REQUIRED language: "can", "may", "often", "typically", "many people find", "it's common to", "around this time"
Example: "Flow and cramping can start to ease around this time" ✅ (NOT "Flow is lighter and cramping is softer" ❌)

NO clinical/academic language: "emotional regulation" ❌ → "handling things emotionally" ✅
NO energy exaggeration: "energy boost" ❌ → "a gentle energy shift" ✅
NO directive tone: "resting will support" ❌ → "resting can help support" ✅
NO deterministic predictions: "you notice a shift" ❌ → "you may start to notice" ✅

Each insight field must describe a DIFFERENT aspect — do not repeat the same signal across fields.
Keep whyThisIsHappening tied to the specific day number, not generic hormone explanation.`
      : "";

  const phaseVoiceInstruction =
    ctx.phase === "menstrual"
      ? `\nPHASE VOICE — MENSTRUAL (STRICT):
- Prioritize validation over optimization.
- Focus on physical load and permission to slow down.
- Keep tone grounding, low-pressure, and compassionate.
- Do NOT use instructive/performance language like "you should", "optimize", or "prioritize productivity".
- Do NOT use analytical relationships (e.g., "sleep causes focus drop", "stress amplifies mood").
- Do NOT provide multi-step advice lists (foods, checklists, habit stacks).
- Keep each field direct, short, and experiential.
- Avoid system language like "intertwined", "amplifying each other", or "adjusting to shift".
- Do NOT assume specific symptoms (flow level, cramp intensity) — describe what "can happen" unless user has logged data.
- ${ctx.recentLogsCount === 0 ? 'Use: "can feel", "may notice", "around this time" — NOT "is", "feels", "takes".' : 'Use direct experiential verbs ("is", "feels", "takes").'}
- Good phrasing: "flow and cramping can start to ease", "your body may be going through recovery", "if you can, taking things slower can help".`
      : ctx.phase === "follicular"
        ? `\nPHASE VOICE — FOLLICULAR:
- Use a light, forward-looking tone.
- Emphasize gradual recovery and momentum.
- Avoid over-warning or over-coaching.
- If PRIMARY CAUSE in data is sleep disruption: do NOT promise rising energy or tell her to "take on harder things" — her logs trump phase averages.`
        : ctx.phase === "ovulation"
          ? `\nPHASE VOICE — OVULATORY (STRICT):
- This is often a peak energy / high-capacity window — sound confident and enabling, not neutral.
- Do NOT downplay the state with words like "stable", "balanced", or "no strong signals" when logs show positive mood, calm stress, and good sleep.
- Highlight: high energy, clarity, social ease, momentum — without inventing past-cycle memory.
- Do NOT frame this as recovery, strain, or limitation unless data shows strain.
- Avoid AI-poetic or app-cheesy phrasing: "expansive", "mental capacity feels expansive", "embrace the positivity", "wonderful time to".
- Avoid broken or abstract openers like "With clarity and focus at their peak, how easily..." — use full sentences.
- solution: enabling ("lean into momentum") — not bossy ("dive into social activities").
- tomorrowPreview: no "Tomorrow, you notice..." — use clear transition into next phase.
- solution / recommendation: encourage using the window (focus, connection, momentum) — not generic "anchor habits".`
          : `\nPHASE VOICE — LUTEAL:
- Use protective and explanatory tone.
- Emphasize sensitivity amplification and lower capacity.
- Explain cause -> effect clearly without sounding generic.`;

  const interactionIsActive = ctx.interaction_flags.includes("sleep_stress_amplification");
  const bleedingIsActive =
    ctx.phase === "menstrual" &&
    ctx.cycleDay <= 2 &&
    ctx.priorityDrivers.includes("bleeding_heavy");

  const primaryDriver =
    vyanaCtx?.prioritySignals.find((s) => s.layer === "core")?.text ??
    (bleedingIsActive ? "bleeding_heavy" : null) ??
    (interactionIsActive ? "sleep_stress_amplification" : null) ??
    ctx.priorityDrivers[0] ??
    (ctx.phase === "ovulation" && ctx.priorityDrivers.length === 0
      ? "ovulation_peak_energy"
      : null);

  const primaryDriverMap: Record<string, string> = {
    bleeding_heavy: "Your flow is heavier today",
    high_strain: "Your body is under more strain than usual right now",
    sleep_below_baseline: `Sleep has been lower than your usual`,
    sleep_variability_high: `Your sleep has been inconsistent and lower than your usual`,
    sleep_trend_declining: `Sleep has been dropping`,
    stress_above_baseline: "Stress has been higher than your usual",
    sleep_stress_amplification:
      "Sleep and strain are feeding into each other right now",
    mood_stress_coupling:
      "Stress and low mood are feeding into each other right now",
    mood_trend_declining: "Your mood has been lower than usual",
    ovulation_peak_energy: "Your energy is high right now",
  };

  const primaryOpener = primaryDriver
    ? (primaryDriverMap[primaryDriver] ?? null)
    : null;

  let primaryDriverInstruction = primaryOpener
    ? `\nCRITICAL — physicalInsight MUST start with: "${primaryOpener}..." (then continue describing the experience)`
    : "";

  if (vyanaCtx?.primaryInsightCause === "sleep_disruption") {
    primaryDriverInstruction = `\nCRITICAL — SLEEP-DISRUPTION PRIMARY: physicalInsight MUST open with the sharp sleep drop (use recentSleepAvg and baselineSleepAvg from HER DATA verbatim). Do NOT open with generic strain, iron, or "past cycles". whyThisIsHappening MUST attribute how she feels to sleep, not hormones. recommendation MUST keep load lighter until sleep recovers — NOT "take on harder things" or peak-phase messaging.`;
  }

  if (vyanaCtx?.primaryInsightCause === "stress_led") {
    primaryDriverInstruction = `\nCRITICAL — STRESS-LED PRIMARY: whyThisIsHappening MUST attribute how she feels to stress, NOT hormones or sleep. physicalInsight should NOT mention sleep dropping (sleep is fine). mentalInsight should reference focus affected by stress load.`;
  }

  if (ctx.phase === "ovulation" && ctx.stress_state === "elevated") {
    primaryDriverInstruction += `\nCRITICAL — OVULATION BLOCKED: stress is dampening this user's peak window. physicalInsight MUST acknowledge the energy peak is being cancelled by stress. Do NOT write pure peak-phase copy when stress is active. whyThisIsHappening should mention stress dampening the ovulation window.`;
  }

  const signalPositiveOverride =
    ctx.priorityDrivers.length === 0 &&
    ctx.physical_state !== "high_strain" &&
    ctx.mental_state === "balanced" &&
    (ctx.emotional_state === "uplifted" || ctx.emotional_state === "stable")
      ? `\nSIGNAL-POSITIVE OVERRIDE: Her logged signals are clearly positive (mood good, stress low, sleep adequate). Do NOT inject negative phase language even if she is in menstrual phase. Acknowledge her actual state. Tone should be warm, calm, and affirmative — not cautionary or sympathetic.`
      : "";

  const toneRule = PHASE_TONE_PROMPTS[ctx.phaseTone];
  const phaseToneInstruction = `\nPHASE TONE (${ctx.phaseTone.toUpperCase()}): ${toneRule.description}
USE language like: ${toneRule.allow}
DO NOT use: ${toneRule.avoid}`;

  const narrativeLock = vyanaCtx?.primaryNarrative && vyanaCtx.primaryNarrative !== "phase"
    ? `\nNARRATIVE LOCK: This insight is primarily about: ${vyanaCtx.primaryNarrative}. All content must support this primary narrative.`
    : "";

  const userPrompt = `
TONE: ${toneInstruction}${narrativeLock}
${zeroDataInstruction}
${phaseVoiceInstruction}${phaseToneInstruction}${signalPositiveOverride}
${historicalClaimsBlockInstruction}
${primaryDriverInstruction}
${priorityBlock}
${stableInstruction}
${anticipationInstruction}
${identityInstruction}
${emotionalMemoryInstruction}
${surpriseInstruction}
${delightInstruction}

HER DATA (sleep values must be used EXACTLY as written below — never rephrase):
${contextBlock}

TASK: Write her insights from scratch. GPT is primary author.
${primaryOpener && vyanaCtx?.primaryInsightCause !== "sleep_disruption" ? `physicalInsight MUST start with the primary driver opener above (first sentence).\n` : ""}Use the sleep value from context exactly — do not round differently.
Translate all other signals into natural language — never copy verbatim.
Use identity language when present. Express emotional memory as recall, not data.
Surprise insight leads with the unexpected connection. Delight is one warm sentence.

CRITICAL REMINDERS:
- Each JSON field: at most 2 sentences total (periods . ! ? count as sentence ends).
- whyThisIsHappening: keep concise and experiential (avoid textbook biology dumps)
${ctx.phase === "menstrual"
    ? `- mentalInsight: simple and non-analytical — prefer "Focus is lower today — your body is prioritizing recovery over clarity." Do NOT chain sleep → focus or stress → mood.
- emotionalInsight: direct experience only — no system explanations ("stress pulling mood").`
    : ctx.phase === "ovulation"
      ? `- mentalInsight: grounded sentences only — e.g. "Clarity and focus are at their peak — ideas flow more easily and conversations feel smoother." Avoid abstract fragments.
- emotionalInsight: natural and human — e.g. "Things feel lighter and more enjoyable — it's easier to connect with people right now." No wellness-app cheerleading.
- solution: e.g. "Lean into this momentum — it's a good time for things that need energy or presence." Not "dive into" lists.`
      : `- mentalInsight: cause → effect ("focus drops when sleep dips like this") — NOT "feels like a challenge"`}
- solution: match phase — ovulation: momentum / presence; luteal: lighter load — NOT generic "anchor habits" unless appropriate
- tomorrowPreview: MUST include timing (days until period/next phase from data) and what shifts

DRAFT (quality floor — use ONLY if you cannot write something more specific):
Physical: ${draft.physicalInsight}
Mental: ${draft.mentalInsight}
Emotional: ${draft.emotionalInsight}
Why: ${draft.whyThisIsHappening}
Action: ${draft.solution}
Recommendation: ${draft.recommendation}
Tomorrow: ${draft.tomorrowPreview}

Return strict JSON only.
`.trim();

  try {
    const gptStart = Date.now();
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: VYANA_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    const gptMs = Date.now() - gptStart;
    recordGptSuccess();
    console.log(JSON.stringify({ type: "gpt_call", fn: "rewriteInsights", durationMs: gptMs, status: "success", timestamp: new Date().toISOString() }));
    return safeParseInsightsDetailed(response.choices[0]?.message?.content, draft, {
      confidence: ctx.confidence,
      priorityDriversCount: ctx.priorityDrivers.length,
      hasIdentityEvidence: Boolean(
        vyanaCtx?.identity.hasPersonalHistory &&
          (vyanaCtx.identity.historyCycles ?? 0) >= 2,
      ),
      hasEmotionalMemoryEvidence: Boolean(
        vyanaCtx?.emotionalMemory.hasMemory &&
          (vyanaCtx.emotionalMemory.occurrenceCount ?? 0) >= 2 &&
          vyanaCtx.emotionalMemory.recallNarrative,
      ),
      phase: ctx.phase,
      hasHistoricalEvidence: hasHistoricalEvidenceForPrompt,
    });
  } catch {
    recordGptFailure();
    console.log(JSON.stringify({ type: "gpt_call", fn: "rewriteInsights", status: "error", timestamp: new Date().toISOString() }));
    return { insights: draft, status: "api_error" };
  }
}

// ─── generateForecastWithGpt ──────────────────────────────────────────────────

type ForecastPayload = {
  isNewUser: boolean;
  progress: {
    logsCount: number;
    nextMilestone: number;
    logsToNextMilestone: number;
  };
  today: {
    phase: string | null;
    currentDay: number;
    confidenceScore: number;
    priorityDrivers: string[];
  };
  forecast: {
    tomorrow: { date: string; phase: string | null; outlook: string };
    nextPhase: { inDays: number; preview: string } | null;
    confidence: { level: string; score: number; message: string };
  };
  pmsSymptomForecast?: {
    available: boolean;
    headline?: string;
    action?: string;
  } | null;
  forecastAiEnhanced?: boolean;
};

function sanitizeForecast(
  payload: ForecastPayload,
  fallback: ForecastPayload,
): ForecastPayload {
  if (!payload?.forecast?.tomorrow?.outlook) return fallback;
  if (!payload?.forecast?.confidence?.message) return fallback;
  return {
    ...fallback,
    ...payload,
    forecast: {
      ...fallback.forecast,
      ...payload.forecast,
      tomorrow: {
        ...fallback.forecast.tomorrow,
        ...payload.forecast.tomorrow,
        outlook: enforceTwoLines(payload.forecast.tomorrow.outlook),
      },
      nextPhase: payload.forecast.nextPhase
        ? {
            ...fallback.forecast.nextPhase,
            ...payload.forecast.nextPhase,
            preview: enforceTwoLines(payload.forecast.nextPhase.preview),
          }
        : fallback.forecast.nextPhase,
      confidence: {
        ...fallback.forecast.confidence,
        ...payload.forecast.confidence,
        message: enforceTwoLines(payload.forecast.confidence.message),
      },
    },
    pmsSymptomForecast: payload.pmsSymptomForecast
      ? {
          ...fallback.pmsSymptomForecast,
          ...payload.pmsSymptomForecast,
          headline: payload.pmsSymptomForecast.headline
            ? enforceTwoLines(payload.pmsSymptomForecast.headline)
            : fallback.pmsSymptomForecast?.headline,
          action: payload.pmsSymptomForecast.action
            ? enforceTwoLines(payload.pmsSymptomForecast.action)
            : fallback.pmsSymptomForecast?.action,
        }
      : fallback.pmsSymptomForecast,
  };
}

export async function generateForecastWithGpt(
  ctx: InsightContext,
  draft: ForecastPayload,
  baseline: NumericBaseline,
  narrative: CrossCycleNarrative | null,
  userName?: string,
  vyanaCtx?: VyanaContext,
): Promise<ForecastPayload> {
  if (!client) return draft;
  if (isCircuitOpen()) return draft;

  const contextBlock = vyanaCtx
    ? serializeVyanaContext(vyanaCtx)
    : buildFallbackContextBlock(ctx, baseline, narrative, userName);
  const confidenceLevel = vyanaCtx?.confidenceMapping.level ?? "medium";
  const forwardClaims =
    vyanaCtx?.confidenceMapping.forwardClaims ?? "you might notice";

  const anticipationNote = vyanaCtx?.anticipation.shouldSurface
    ? `\nANTICIPATION for tomorrow: "${vyanaCtx.anticipation.narrative}"`
    : "";
  const identityNote =
    vyanaCtx?.identity.useThisOutput && vyanaCtx.identity.userPatternNarrative
      ? `\nIDENTITY: Use "for you this tends to..." (${vyanaCtx.identity.historyCycles} cycles of data).`
      : "";

  const userPrompt = `
You are Vyana. Rewrite only forecast text fields to feel personal and grounded.

HER DATA: ${contextBlock}
${anticipationNote}
${identityNote}

CONFIDENCE: ${confidenceLevel} — use "${forwardClaims}" for forward claims.
NUMBER RULES: sleep values as given, never stress/mood scores.
${CERTAINTY_RULES_FOR_GPT}

TASK: Rewrite only: forecast.tomorrow.outlook, forecast.nextPhase.preview, forecast.confidence.message
Optional: pmsSymptomForecast.headline, pmsSymptomForecast.action
All other fields: unchanged. Max 2 sentences each.

INPUT_JSON: ${JSON.stringify(draft)}
Return strict JSON only. Same schema.
`.trim();

  try {
    const gptStart = Date.now();
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are Vyana. Rewrite forecast text to feel personal. Never deterministic. Output valid JSON only.",
        },
        { role: "user", content: userPrompt },
      ],
    });
    const gptMs = Date.now() - gptStart;
    recordGptSuccess();
    console.log(JSON.stringify({ type: "gpt_call", fn: "generateForecast", durationMs: gptMs, status: "success", timestamp: new Date().toISOString() }));
    const raw = response.choices[0]?.message?.content;
    if (!raw) return draft;
    return sanitizeForecast(JSON.parse(raw) as ForecastPayload, draft);
  } catch {
    recordGptFailure();
    console.log(JSON.stringify({ type: "gpt_call", fn: "generateForecast", status: "error", timestamp: new Date().toISOString() }));
    return draft;
  }
}
