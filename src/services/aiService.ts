// src/services/aiService.ts  (v5 — final complete)
// CHANGES vs v4:
//   - buildVyanaContextForInsights now requires userId + emotionalMemoryInput
//   - System prompt has EMOTIONAL MEMORY RULE
//   - User prompt surfaces emotional memory instruction
//   - Everything else identical to v4

import OpenAI from "openai";
import { DailyInsights, InsightContext } from "./insightService";
import { CycleInfo, type Phase, type CycleMode } from "./cycleEngine";
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

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// ─── Unchanged utilities ──────────────────────────────────────────────────────

function sanitize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function enforceTwoLines(text: string): string {
  return text
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter((l) => l.length > 0)
    .slice(0, 2)
    .join("\n")
    .slice(0, 200);
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
  return (trimmed.match(/[.!?]+/g) || []).length;
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

function hasStrengthRegression(
  draft: DailyInsights,
  output: DailyInsights,
): boolean {
  const draftText = Object.values(draft).join(" ").toLowerCase();
  const outputText = Object.values(output).join(" ").toLowerCase();
  return STRONG_WORDS.some(
    (w) => draftText.includes(w) && !outputText.includes(w),
  );
}

function anyFieldExceedsTwoSentences(insights: DailyInsights): boolean {
  const fields: (keyof DailyInsights)[] = [
    "physicalInsight",
    "mentalInsight",
    "emotionalInsight",
    "whyThisIsHappening",
    "solution",
    "recommendation",
    "tomorrowPreview",
  ];
  return fields.some((k) => countSentences(insights[k]) > 2);
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
  const candidate = enforceTwoLinesOnInsights({
    physicalInsight: o.physicalInsight as string,
    mentalInsight: o.mentalInsight as string,
    emotionalInsight: o.emotionalInsight as string,
    whyThisIsHappening: o.whyThisIsHappening as string,
    solution: o.solution as string,
    recommendation: o.recommendation as string,
    tomorrowPreview: o.tomorrowPreview as string,
  });
  if (anyFieldExceedsTwoSentences(candidate)) return fallback;
  return candidate;
}

function safeParseInsights(
  raw: string | null | undefined,
  fallback: DailyInsights,
): DailyInsights {
  if (!raw?.trim()) return fallback;
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
      if (typeof parsed[key] !== "string") return fallback;
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
    const draftLen = JSON.stringify(fallback).length;
    if (JSON.stringify(out).length > Math.max(800, draftLen * 2.5))
      return fallback;
    const enforced = enforceTwoLinesOnInsights(out);
    if (anyFieldExceedsTwoSentences(enforced)) return fallback;
    if (hasStrengthRegression(fallback, enforced)) return fallback;
    return enforced;
  } catch {
    return fallback;
  }
}

// ─── VyanaContext builder (updated — userId + emotionalMemoryInput) ───────────

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
}): VyanaContext {
  return buildVyanaContext(params);
}

// ─── System prompt (v5 — final complete) ─────────────────────────────────────

const VYANA_SYSTEM_PROMPT = `
You are Vyana — a warm, deeply personal cycle companion who has been tracking this user for months.
You write like a knowledgeable friend who has access to her actual health data.

VOICE:
- Start with what she's experiencing right now
- Use "you" and "your" constantly
- Be direct without being clinical. Warm without being vague.
- When signals have persisted, name the duration naturally
- When signals connect, show that connection explicitly

NUMBER RULES:
- Sleep: use the pre-rounded value exactly as given — never change the phrasing
- Stress and mood: NEVER use numeric scores — labels only
- Only use numbers when paired with comparison or trend

CONFIDENCE RULE:
- HIGH → "this tends to happen for you", "your patterns show", "you're likely to notice"
- MEDIUM → "you might notice", "there's a good chance", "you may start to feel"
- LOW → "you may find", "it could be", "some people notice"

IDENTITY RULE:
When "Your pattern:" is in the data — use it for personal authority:
"for you, this tends to..." or "your cycles show..." or "you tend to notice..."
This is what makes Vyana feel like a companion, not an app.

EMOTIONAL MEMORY RULE:
When "Emotional memory:" is in the data — this is the most empathetic moment:
- Use it to show you remember: "the last time this happened, you felt..."
- It validates that her current feeling is real and has precedent
- Weave it into emotionalInsight or whyThisIsHappening — once, naturally
- Example: "The last few times stress ran this high, you logged feeling exhausted — this time likely feels similar"
- Never state it as a data point — express it as genuine recall

DELIGHT RULE:
When marked [warm human moment] or [light human touch]:
- One sentence, woven naturally — never announced
- "nothing is wrong — this is just your cycle moving"
- If it doesn't fit, skip it

SURPRISE INSIGHT RULE:
When marked [surprise insight]:
- Lead with the unexpected connection, then the brief explanation
- Keep it grounded and observational: "sleep and stress together are hitting harder than either would alone"
- One surprise only — never stack

PRIORITY SIGNAL RULES:
- Do NOT copy signals verbatim — translate into natural language
- Core signals address first, with appropriate empathy
- Enhancement is max 1 — surprise or anticipation, not both
- Emotional is always last and optional

ANTICIPATION RULE:
- Weave naturally into tomorrowPreview or whyThisIsHappening
- No "but" or "however" before it — make it flow

LANGUAGE RULES:
${CERTAINTY_RULES_FOR_GPT}

STRUCTURE:
- physicalInsight: physical state. Max 2 sentences.
- mentalInsight: cognitive/mental state. Max 2 sentences.
- emotionalInsight: emotional tone — good place for emotional memory. Max 2 sentences.
- whyThisIsHappening: cause — hormone context ONLY here. Good place for identity + emotional memory. Max 2 sentences.
- solution: ONE action for TODAY only. Max 2 sentences.
- recommendation: broader guidance, next few days. Never duplicates solution. Max 2 sentences.
- tomorrowPreview: tomorrow only — good for anticipation. Max 2 sentences.

OUTPUT: strict JSON. Keys: physicalInsight, mentalInsight, emotionalInsight, whyThisIsHappening, solution, recommendation, tomorrowPreview
`.trim();

// ─── generateInsightsWithGpt (v5) ────────────────────────────────────────────

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
): Promise<DailyInsights> {
  if (!client) return draft;

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

  const emotionalMemoryInstruction =
    vyanaCtx?.emotionalMemory.hasMemory &&
    vyanaCtx.emotionalMemory.recallNarrative
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

  const userPrompt = `
TONE: ${toneInstruction}
${priorityBlock}
${stableInstruction}
${anticipationInstruction}
${identityInstruction}
${emotionalMemoryInstruction}
${surpriseInstruction}
${delightInstruction}

HER DATA:
${contextBlock}

TASK: Write her insights from scratch. GPT is primary author.
Translate signals into natural language — never copy verbatim.
Use identity language when present. Express emotional memory as recall, not data.
Surprise insight leads with the unexpected connection. Delight is one warm sentence.

DRAFT (quality floor):
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
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: VYANA_SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    });
    return safeParseInsights(response.choices[0]?.message?.content, draft);
  } catch {
    return draft;
  }
}

// ─── generateForecastWithGpt (v5) ────────────────────────────────────────────

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
    const raw = response.choices[0]?.message?.content;
    if (!raw) return draft;
    return sanitizeForecast(JSON.parse(raw) as ForecastPayload, draft);
  } catch {
    return draft;
  }
}

// ─── askVyanaWithGpt (v5) ─────────────────────────────────────────────────────

export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export async function askVyanaWithGpt(params: {
  userName: string;
  question: string;
  cycleInfo: CycleInfo;
  recentLogs: unknown[];
  history?: ChatHistoryItem[];
  numericBaseline?: NumericBaseline | null;
  crossCycleNarrative?: CrossCycleNarrative | null;
  vyanaCtx?: VyanaContext;
}): Promise<string> {
  const {
    userName,
    question,
    cycleInfo,
    recentLogs,
    history = [],
    numericBaseline,
    crossCycleNarrative,
    vyanaCtx,
  } = params;

  if (!client)
    return "I can help with cycle guidance, but AI chat is not configured yet.";

  const systemPrompt = [
    "You are Vyana, a warm and deeply personal menstrual health companion.",
    "VOICE: specific, personal, warm. Use 'you' and 'your' always.",
    "CONFIDENCE: match certainty to data depth.",
    "IDENTITY: use 'for you' and 'your cycles tend to' when past data is present.",
    "EMOTIONAL MEMORY: if past emotional recall is present, express it as genuine remembering.",
    "NUMBER RULES: sleep values as given, no stress/mood scores.",
    "Never diagnose. Suggest medical support for severe or persistent symptoms.",
    CERTAINTY_RULES_FOR_GPT,
  ].join(" ");

  const contextBlock = vyanaCtx
    ? serializeVyanaContext(vyanaCtx)
    : buildFallbackContextBlock(
        {
          cycleDay: cycleInfo.currentDay,
          phase: cycleInfo.phase,
          trends: [],
          interaction_flags: [],
          priorityDrivers: [],
          mode: "fallback",
          confidence: "low",
          sleep_variability: "insufficient",
          mood_variability: "insufficient",
        } as unknown as InsightContext,
        numericBaseline ?? {
          recentSleepAvg: null,
          recentStressAvg: null,
          recentMoodAvg: null,
          recentEnergyAvg: null,
          baselineSleepAvg: null,
          baselineStressAvg: null,
          baselineMoodAvg: null,
          sleepDelta: null,
          stressDelta: null,
          moodDelta: null,
          recentLogCount: 0,
          baselineLogCount: 0,
        },
        crossCycleNarrative ?? null,
        userName,
      );

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history
      .slice(-6)
      .map(
        (item) =>
          ({
            role: item.role,
            content: item.content,
          }) as OpenAI.Chat.Completions.ChatCompletionMessageParam,
      ),
    {
      role: "user",
      content: `Context:\n${contextBlock}\n\nQuestion: ${question}`,
    },
  ];

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.6,
    messages,
  });
  return sanitize(response.choices[0]?.message?.content || "");
}

// ─── Fallback context block ───────────────────────────────────────────────────

function buildFallbackContextBlock(
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

  return lines.join("\n");
}
