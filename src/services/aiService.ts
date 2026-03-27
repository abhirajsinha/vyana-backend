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
  const lines = text
    .split("\n")
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter((l) => l.length > 0);

  const twoLines = lines.slice(0, 2);
  const joined = twoLines.join("\n");

  // Under 350 chars → return as-is (increased from 200 to prevent mid-sentence cuts)
  if (joined.length <= 350) return joined;

  // Find last complete sentence boundary within 350 chars
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

  // No sentence boundary → return first line only (never truncate mid-sentence)
  return twoLines[0] ?? joined;
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

// ─── System prompt (v5 final — all 7 bugs fixed) ─────────────────────────────

const VYANA_SYSTEM_PROMPT =
  `You are Vyana — a deeply personal cycle companion who understands this user's patterns, not just general biology.

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

Replace with:
- "this is why..."
- "this is what's happening..."
- "this tends to happen for you..."

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

5. IDENTITY RULE (VERY IMPORTANT)

When pattern/history exists:

NEVER say:
- "this phase"
- "this tends to happen"

ALWAYS say:
- "for you..."
- "your cycles show..."
- "you tend to notice..."

Make it personal.

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

8. ANTICIPATION RULE

Do NOT say:
- "might feel heavier"

INSTEAD:
- give timing + clarity

Example:
- "you're very close to your period — this is usually the heaviest stretch, and things ease once it starts"

---

9. EMOTIONAL MEMORY RULE

If present:
Use it as genuine recall:

- "the last time this happened, you felt..."
- "you've felt this before when this pattern showed up"

Do NOT sound like data.

---

10. ADVICE RULE

Avoid generic advice like:
- "reduce stress"
- "practice self-care"

Give specific, realistic guidance:
- "keep your schedule lighter than usual"
- "protect your sleep tonight — it will change how tomorrow feels"

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

  // Build primary driver instruction — explicit first-sentence directive
  const primaryDriver =
    vyanaCtx?.prioritySignals.find((s) => s.layer === "core")?.text ??
    ctx.priorityDrivers[0] ??
    null;

  const primaryDriverMap: Record<string, string> = {
    bleeding_heavy: "Your flow is heavier today",
    high_strain: "Your body is under more strain than usual right now",
    sleep_below_baseline: `Sleep has been lower than your usual`,
    sleep_trend_declining: `Sleep has been dropping`,
    stress_above_baseline: "Stress has been higher than your usual",
    sleep_stress_amplification:
      "Sleep and strain are feeding into each other right now",
    mood_stress_coupling:
      "Stress and low mood are feeding into each other right now",
    mood_trend_declining: "Your mood has been lower than usual",
  };

  const primaryOpener = primaryDriver
    ? (primaryDriverMap[primaryDriver] ?? null)
    : null;

  const primaryDriverInstruction = primaryOpener
    ? `\nCRITICAL — physicalInsight MUST start with: "${primaryOpener}..." (then continue describing the experience)`
    : "";

  const userPrompt = `
TONE: ${toneInstruction}
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
physicalInsight MUST open with the primary driver sentence above.
Use the sleep value from context exactly — do not round differently.
Translate all other signals into natural language — never copy verbatim.
Use identity language when present. Express emotional memory as recall, not data.
Surprise insight leads with the unexpected connection. Delight is one warm sentence.

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
