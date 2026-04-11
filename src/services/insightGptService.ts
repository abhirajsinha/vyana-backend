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
/** Inlined from deleted insightCause.ts — kept for type compat */
export type PrimaryInsightCause = "stable" | "sleep_disruption" | "stress_led" | "cycle";

/** The subset of DailyInsights that GPT rewrites */
type GptInsightFields = Pick<DailyInsights, "layer1_insight" | "body_note" | "recommendation">;

const GPT_FIELD_KEYS: (keyof GptInsightFields)[] = [
  "layer1_insight",
  "body_note",
  "recommendation",
];

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
    ...insights,
    layer1_insight: enforceTwoLines(insights.layer1_insight),
    body_note: enforceTwoLines(insights.body_note),
    recommendation: enforceTwoLines(insights.recommendation),
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
    ...insights,
    layer1_insight: truncateToMaxSentences(insights.layer1_insight, max),
    body_note: truncateToMaxSentences(insights.body_note, max),
    recommendation: truncateToMaxSentences(insights.recommendation, max),
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
  const draftText = [draft.layer1_insight, draft.body_note, draft.orientation, draft.recommendation].join(" ").toLowerCase();
  const outputText = [output.layer1_insight, output.body_note, output.orientation, output.recommendation].join(" ").toLowerCase();
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
  const fields: (keyof GptInsightFields)[] = GPT_FIELD_KEYS;
  return fields.some((k) => countSentences(insights[k]) > 3);
}

export function sanitizeInsights(
  insights: unknown,
  fallback: DailyInsights,
): DailyInsights {
  if (!insights || typeof insights !== "object") return fallback;
  const o = insights as Record<string, unknown>;
  for (const key of GPT_FIELD_KEYS) {
    if (typeof o[key] !== "string") return fallback;
  }
  const rawStrings = GPT_FIELD_KEYS.map((k) => o[k] as string);
  const MAX_RAW_FIELD_LEN = 400;
  if (rawStrings.some((s) => s.length > MAX_RAW_FIELD_LEN)) return fallback;

  const trimmed = enforceMaxSentencesOnInsights(
    {
      layer1_insight: o.layer1_insight as string,
      body_note: o.body_note as string,
      orientation: fallback.orientation,
      recommendation: o.recommendation as string,
      layer2_wrapper: fallback.layer2_wrapper,
      layer3_sentence: fallback.layer3_sentence,
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
  const text = [insights.layer1_insight, insights.body_note, insights.recommendation].join(" ").toLowerCase();
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
    ["more overwhelming than expected", "more overwhelming than it should"],
  ];

  const fix = (text: string): string => {
    let result = text;
    for (const [from, to] of replacements) {
      result = result.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), to);
    }
    return result;
  };

  return {
    ...insights,
    layer1_insight: fix(insights.layer1_insight),
    body_note: fix(insights.body_note),
    recommendation: fix(insights.recommendation),
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
  primaryDriver?: string;
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
    ...insights,
    layer1_insight: clean(insights.layer1_insight),
    body_note: clean(insights.body_note),
    recommendation: clean(insights.recommendation),
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
    ...insights,
    layer1_insight: scrubSentence(insights.layer1_insight),
    body_note: scrubSentence(insights.body_note),
    recommendation: scrubSentence(insights.recommendation),
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
    ...insights,
    layer1_insight: scrub(insights.layer1_insight),
    body_note: scrub(insights.body_note),
    recommendation: scrub(insights.recommendation),
  };
}

function fixCapitalization(insights: DailyInsights): DailyInsights {
  const fix = (text: string): string =>
    text.replace(/(^|\.\s+|\?\s+|!\s+|\n\s*)([a-z])/g, (_, prefix, letter) => prefix + letter.toUpperCase());

  return {
    ...insights,
    layer1_insight: fix(insights.layer1_insight),
    body_note: fix(insights.body_note),
    recommendation: fix(insights.recommendation),
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
    ...insights,
    layer1_insight: sharpen(insights.layer1_insight),
    body_note: sharpen(insights.body_note),
    recommendation: sharpen(insights.recommendation),
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

function enforceMenstrualDiscipline(insights: DailyInsights, primaryDriver?: string): DailyInsights {
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

  function driverAwareMentalFallback(): string {
    if (primaryDriver?.includes("sleep")) {
      return "Sleep loss is clouding your focus — your brain is running on less fuel than it needs.";
    }
    if (primaryDriver?.includes("stress")) {
      return "Stress is scattering your focus — your mind is processing too many signals at once.";
    }
    return "Focus may feel harder to hold today — your system is redirecting energy to recovery.";
  }

  let layer1 = simplify(insights.layer1_insight)
    .replace(
      /focus drops when sleep dips like this[^.?!]*[.?!]?/i,
      driverAwareMentalFallback(),
    )
    .replace(/\bwith sleep at about[^.?!]*focus[^.?!]*[.?!]?/i, "")
    .replace(/\bfocus might feel scattered[^.?!]*[.?!]?/gi, "")
    .replace(/recovery over clarity/gi, "recovery")
    .trim();

  if (
    /might|may|scattered|sleep at about/i.test(layer1) ||
    layer1.length < 20
  ) {
    layer1 = driverAwareMentalFallback();
  }

  let bodyNote = simplify(insights.body_note)
    .replace(
      /everything feels a bit more overwhelming[^.?!]*[.?!]?/i,
      "Everything takes more effort right now.",
    )
    .replace(
      /small things feel harder than they should[^.?!]*[.?!]?/i,
      "Small things feel harder than it should.",
    )
    .replace(/\bstress is pulling your mood[^.?!]*[.?!]?/gi, "")
    .replace(/\s*,?\s*As FSH begins[^.?!]*[.?!]?/gi, "")
    .replace(/\s*preparing (?:the )?next follicle[^.?!]*[.?!]?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (/stress.*mood|mood.*stress|pulling/i.test(bodyNote)) {
    bodyNote =
      "Everything takes more effort right now — even small things feel harder than it should.";
  }

  return {
    ...insights,
    layer1_insight: layer1,
    body_note: bodyNote,
    recommendation: simplify(insights.recommendation),
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
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of GPT_FIELD_KEYS) {
      if (typeof parsed[key] !== "string") {
        return { insights: fallback, status: "json_shape_fallback" };
      }
    }
    const out: DailyInsights = {
      layer1_insight: parsed.layer1_insight as string,
      body_note: parsed.body_note as string,
      orientation: fallback.orientation,
      recommendation: parsed.recommendation as string,
      layer2_wrapper: fallback.layer2_wrapper,
      layer3_sentence: fallback.layer3_sentence,
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
      enforced = enforceMenstrualDiscipline(enforced, guardHints.primaryDriver);
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

export const VYANA_SYSTEM_PROMPT = `You are Vyana — a personal cycle companion.

RULES:
1. Start with what the user is actually experiencing based on their logged data.
2. Never use: "Many people find...", "It's common to...", "The body is..."
3. Always use: "Energy feels...", "Things can feel...", "Focus feels..."
4. Never claim patterns from less than 2 cycles of data.
5. Each field: max 2 sentences. One clear idea.
6. Be specific to their data. Never generic.
7. If you don't have data for something, don't invent it.

FIELDS:
- layer1_insight: the primary insight — what she is experiencing and why (from her logs)
- body_note: grounded context — where in cycle, what the body is doing, what to expect

Return strict JSON with keys: layer1_insight, body_note, recommendation.`.trim();

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
      ? `\nEMOTIONAL MEMORY: "${vyanaCtx.emotionalMemory.recallNarrative}" — express as genuine recall in layer1_insight or body_note. Show that Vyana remembers how she felt, not just what happened.`
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
        : "Use cycle-phase context where appropriate. Hormone context in body_note only.";

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

BLOCKED phrases: "your cramps", "your flow", "you are bleeding heavily", "you are bleeding", "continue to bleed", "as you bleed", "still bleeding", "bleeding continues", "you feel", "you are feeling", "you notice", "energy is", "focus is", "mood is", "cramps are", "pain is getting"

REQUIRED language: "can", "may", "often", "typically", "many people find", "it's common to", "around this time"
Example: "Flow and cramping can start to ease around this time" ✅ (NOT "Flow is lighter and cramping is softer" ❌)

More examples by field:
- layer1_insight: "Day ${ctx.cycleDay} is typically when the body starts recovering — energy often begins to shift upward from here." ✅
- body_note: "On day ${ctx.cycleDay}, hormone levels are still low, which is what drives this phase — but they're beginning the gradual rise that leads to recovery." ✅

Key pattern: [specific day reference] + [what typically happens] + [temporal anchor to next change]

NO clinical/academic language: "emotional regulation" ❌ → "handling things emotionally" ✅
NO energy exaggeration: "energy boost" ❌ → "a gentle energy shift" ✅
NO directive tone: "resting will support" ❌ → "resting can help support" ✅
NO deterministic predictions: "you notice a shift" ❌ → "you may start to notice" ✅

Each insight field must describe a DIFFERENT aspect — do not repeat the same signal across fields.
Keep body_note tied to the specific day number, not generic hormone explanation.

DAY-SPECIFIC ANCHORING (REQUIRED for zero-data users):
Instead of generic body statements, anchor each insight on what day ${ctx.cycleDay} of ${ctx.phase} specifically means.

❌ WRONG: "Your body may be going through a lot right now"
✅ RIGHT: "Day ${ctx.cycleDay} of your period is typically when bleeding starts to lighten and recovery begins"

❌ WRONG: "Energy can feel lower during this phase"
✅ RIGHT: "By day ${ctx.cycleDay}, energy often starts recovering compared to the first couple of days"

Every insight field must reference the specific day number or its position within the phase.
Do NOT use generic "your body" or "this phase" openings — be specific about WHAT is happening on THIS day.`
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
- recommendation: enabling ("lean into momentum") — not bossy ("dive into social activities").`
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
    ? `\nCRITICAL — layer1_insight MUST start with: "${primaryOpener}..." (then continue describing the experience)`
    : "";

  if (vyanaCtx?.primaryInsightCause === "sleep_disruption") {
    primaryDriverInstruction = `\nCRITICAL — SLEEP-DISRUPTION PRIMARY: layer1_insight MUST open with the sharp sleep drop (use recentSleepAvg and baselineSleepAvg from HER DATA verbatim). Do NOT open with generic strain, iron, or "past cycles". body_note MUST attribute how she feels to sleep, not hormones. recommendation MUST keep load lighter until sleep recovers — NOT "take on harder things" or peak-phase messaging.`;
  }

  if (vyanaCtx?.primaryInsightCause === "stress_led") {
    primaryDriverInstruction = `\nCRITICAL — STRESS-LED PRIMARY: body_note MUST attribute how she feels to stress, NOT hormones or sleep. layer1_insight should NOT mention sleep dropping (sleep is fine).`;
  }

  if (ctx.phase === "ovulation" && ctx.stress_state === "elevated") {
    primaryDriverInstruction += `\nCRITICAL — OVULATION BLOCKED: stress is dampening this user's peak window. layer1_insight MUST acknowledge the energy peak is being cancelled by stress. Do NOT write pure peak-phase copy when stress is active. body_note should mention stress dampening the ovulation window.`;
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
${primaryOpener && vyanaCtx?.primaryInsightCause !== "sleep_disruption" ? `layer1_insight MUST start with the primary driver opener above (first sentence).\n` : ""}Use the sleep value from context exactly — do not round differently.
Translate all other signals into natural language — never copy verbatim.
Use identity language when present. Express emotional memory as recall, not data.
Surprise insight leads with the unexpected connection. Delight is one warm sentence.

CRITICAL REMINDERS:
- Each JSON field: at most 2 sentences total (periods . ! ? count as sentence ends).
- body_note: keep concise and experiential (avoid textbook biology dumps)
${ctx.phase === "menstrual"
    ? `- layer1_insight: simple and non-analytical — match the primary driver. If sleep-driven: "Sleep loss is clouding your focus." If stress-driven: "Stress is scattering your focus." Otherwise: "Focus may feel harder to hold today." Do NOT chain sleep → focus or stress → mood. Do NOT use "recovery over clarity."`
    : ctx.phase === "ovulation"
      ? `- layer1_insight: grounded sentences only — e.g. "Clarity and focus are at their peak — ideas flow more easily and conversations feel smoother." Avoid abstract fragments.`
      : `- layer1_insight: cause → effect ("focus drops when sleep dips like this") — NOT "feels like a challenge"`}
- recommendation: match phase — ovulation: momentum / presence; luteal: lighter load — NOT generic "anchor habits" unless appropriate

DRAFT (quality floor — use ONLY if you cannot write something more specific):
Layer1: ${draft.layer1_insight}
BodyNote: ${draft.body_note}
Recommendation: ${draft.recommendation}

Return strict JSON only with keys: layer1_insight, body_note, recommendation.
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
      primaryDriver: ctx.priorityDrivers[0],
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
