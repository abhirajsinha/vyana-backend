import OpenAI from "openai";
import { DailyInsights, InsightContext } from "./insightService";
import { CycleInfo } from "./cycleEngine";
import type { NumericBaseline, CrossCycleNarrative } from "./insightData";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

function sanitize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function enforceTwoLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line.length > 0)
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

const STRONG_WORDS = ["compounding", "persistent", "strain", "loop", "baseline", "cascade", "pattern", "cycle"];

function hasStrengthRegression(draft: DailyInsights, output: DailyInsights): boolean {
  const draftText = Object.values(draft).join(" ").toLowerCase();
  const outputText = Object.values(output).join(" ").toLowerCase();
  return STRONG_WORDS.some((word) => draftText.includes(word) && !outputText.includes(word));
}

function anyFieldExceedsTwoSentences(insights: DailyInsights): boolean {
  const fields: (keyof DailyInsights)[] = [
    "physicalInsight", "mentalInsight", "emotionalInsight",
    "whyThisIsHappening", "solution", "recommendation", "tomorrowPreview",
  ];
  return fields.some((k) => countSentences(insights[k]) > 2);
}

export function sanitizeInsights(insights: unknown, fallback: DailyInsights): DailyInsights {
  if (!insights || typeof insights !== "object") return fallback;
  const o = insights as Record<string, unknown>;
  const keys: (keyof DailyInsights)[] = [
    "physicalInsight", "mentalInsight", "emotionalInsight",
    "whyThisIsHappening", "solution", "recommendation", "tomorrowPreview",
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

// ─── Build a rich data block for GPT ─────────────────────────────────────────

function buildUserDataBlock(
  ctx: InsightContext,
  baseline: NumericBaseline,
  narrative: CrossCycleNarrative | null,
  userName?: string,
): string {
  const lines: string[] = [];

  if (userName) lines.push(`User: ${userName}`);
  lines.push(`Cycle day ${ctx.cycleDay}, phase: ${ctx.phase}, mode: ${ctx.cycleMode}`);

  // Real sleep numbers
  if (baseline.recentSleepAvg !== null) {
    const sleepLine = baseline.baselineSleepAvg !== null
      ? `Sleep: averaging ${baseline.recentSleepAvg}h over the last ${baseline.recentLogCount} days (her usual: ${baseline.baselineSleepAvg}h, delta: ${baseline.sleepDelta !== null ? (baseline.sleepDelta > 0 ? "+" : "") + baseline.sleepDelta + "h" : "unknown"})`
      : `Sleep: averaging ${baseline.recentSleepAvg}h over the last ${baseline.recentLogCount} days`;
    lines.push(sleepLine);
  }

  // Real stress numbers
  if (baseline.recentStressAvg !== null) {
    const stressLabel = baseline.recentStressAvg >= 2.4 ? "elevated" : baseline.recentStressAvg >= 1.6 ? "moderate" : "calm";
    const stressLine = baseline.baselineStressAvg !== null
      ? `Stress: ${stressLabel} (score ${baseline.recentStressAvg}/3, her usual: ${baseline.baselineStressAvg}/3${baseline.stressDelta !== null ? `, delta: ${baseline.stressDelta > 0 ? "+" : ""}${baseline.stressDelta}` : ""})`
      : `Stress: ${stressLabel} (score ${baseline.recentStressAvg}/3)`;
    lines.push(stressLine);
  }

  // Real mood numbers
  if (baseline.recentMoodAvg !== null) {
    const moodLabel = baseline.recentMoodAvg >= 2.4 ? "positive" : baseline.recentMoodAvg <= 1.6 ? "low" : "neutral";
    const moodLine = baseline.baselineMoodAvg !== null
      ? `Mood: ${moodLabel} (score ${baseline.recentMoodAvg}/3, her usual: ${baseline.baselineMoodAvg}/3${baseline.moodDelta !== null ? `, delta: ${baseline.moodDelta > 0 ? "+" : ""}${baseline.moodDelta}` : ""})`
      : `Mood: ${moodLabel} (score ${baseline.recentMoodAvg}/3)`;
    lines.push(moodLine);
  }

  // Active drivers
  if (ctx.priorityDrivers.length > 0) {
    lines.push(`Key signals: ${ctx.priorityDrivers.slice(0, 3).join(", ")}`);
  }

  // Trends
  if (ctx.trends.length > 0) {
    lines.push(`Trends: ${ctx.trends.join(", ")}`);
  }

  // Cross-cycle narrative — this is the "knows me" layer
  if (narrative && narrative.narrativeStatement) {
    lines.push(`Cross-cycle memory: ${narrative.narrativeStatement}`);
    if (narrative.trend !== "unknown") {
      lines.push(`Pattern trend across cycles: ${narrative.trend}`);
    }
  }

  return lines.join("\n");
}

// ─── Core GPT prompt builder ──────────────────────────────────────────────────

function buildInsightRewritePrompt(
  ctx: InsightContext,
  draft: DailyInsights,
  baseline: NumericBaseline,
  narrative: CrossCycleNarrative | null,
  userName?: string,
): string {
  const dataBlock = buildUserDataBlock(ctx, baseline, narrative, userName);

  return [
    "You are Vyana — a deeply personal cycle wellness companion who has been tracking this user for months.",
    "You have real data about her. Use it. Make her feel seen.",
    "",
    "CRITICAL RULES:",
    "- Use her actual numbers when available: e.g. 'your sleep dropped from 7.2h to 5.8h' not 'sleep has been declining'",
    "- If you have cross-cycle memory, use it: e.g. 'last cycle you felt this exact way around day 24 too'",
    "- Never say 'above baseline' or 'pattern detected' — say 'higher than your normal' or 'tends to happen'",
    "- Start with how she feels right now, not with data",
    "- Use 'you' and 'your' constantly — this is personal, not clinical",
    "- solution = one specific action for TODAY. recommendation = broader guidance for this week. Never duplicate wording between them.",
    "- tomorrowPreview = 1–2 sentences about TOMORROW only, not today",
    "- Max 2 sentences per field. ~15 words per sentence. Hard limit.",
    "- If you cannot improve a field — return it unchanged",
    "- Never add new medical claims. Never soften strong causal statements.",
    "",
    "HER DATA RIGHT NOW:",
    dataBlock,
    "",
    "DRAFT TO REWRITE (preserve all facts, improve specificity and warmth):",
    `Physical: ${draft.physicalInsight}`,
    `Mental: ${draft.mentalInsight}`,
    `Emotional: ${draft.emotionalInsight}`,
    `Why: ${draft.whyThisIsHappening}`,
    `Action: ${draft.solution}`,
    `Recommendation: ${draft.recommendation}`,
    `Tomorrow: ${draft.tomorrowPreview}`,
    "",
    "Return strict JSON with keys: physicalInsight, mentalInsight, emotionalInsight, whyThisIsHappening, solution, recommendation, tomorrowPreview.",
  ].join("\n");
}

function safeParseInsights(raw: string | null | undefined, fallback: DailyInsights): DailyInsights {
  if (!raw?.trim()) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<DailyInsights>;
    const keys: (keyof DailyInsights)[] = [
      "physicalInsight", "mentalInsight", "emotionalInsight",
      "whyThisIsHappening", "solution", "recommendation", "tomorrowPreview",
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
    const outLen = JSON.stringify(out).length;
    if (outLen > Math.max(800, draftLen * 2.5)) return fallback;
    const enforced = enforceTwoLinesOnInsights(out);
    if (anyFieldExceedsTwoSentences(enforced)) return fallback;
    if (hasStrengthRegression(fallback, enforced)) return fallback;
    return enforced;
  } catch {
    return fallback;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function generateInsightsWithGpt(
  ctx: InsightContext,
  draft: DailyInsights,
  baseline: NumericBaseline,
  narrative: CrossCycleNarrative | null,
  userName?: string,
): Promise<DailyInsights> {
  if (!client) return draft;

  // Always try GPT when we have personalized mode — removed isDraftAlreadyPremium guard
  // because even "premium" drafts can be made more specific with real user numbers
  if (ctx.mode !== "personalized") return draft;

  const userPrompt = buildInsightRewritePrompt(ctx, draft, baseline, narrative, userName);

  const systemContent = [
    "You are Vyana — a warm, sharp, deeply personal cycle companion who has been tracking this user for months.",
    "You write like a knowledgeable friend who has access to her actual health data.",
    "VOICE: Start with how she feels. Use 'you' constantly. Use her real numbers ('your sleep dropped from 7.2h to 5.8h').",
    "Use cross-cycle memory when available ('last cycle you felt this around day 24 too — it passed').",
    "Say 'higher than your normal' not 'above baseline'. Say 'tends to happen' not 'pattern detected'.",
    "Use 'today', 'tonight', 'tomorrow' — never 'this phase' or 'this week'.",
    "Never say: 'it is important to', 'make sure to', 'consider', 'elevated levels'.",
    "Be direct: 'do X tonight' not 'you might want to try X'. One idea per sentence. Short. Human.",
    "TASK: Make every field feel like it was written specifically for her — because it was.",
    "OUTPUT: JSON with keys: physicalInsight, mentalInsight, emotionalInsight, whyThisIsHappening, solution, recommendation, tomorrowPreview",
  ].join(" ");

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.35,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  return safeParseInsights(raw, draft);
}

// ─── Forecast rewrite ─────────────────────────────────────────────────────────

type ForecastPayload = {
  isNewUser: boolean;
  progress: { logsCount: number; nextMilestone: number; logsToNextMilestone: number };
  today: { phase: string; currentDay: number; confidenceScore: number; priorityDrivers: string[] };
  forecast: {
    tomorrow: { date: string; phase: string; outlook: string };
    nextPhase: { inDays: number; preview: string };
    confidence: { level: string; score: number; message: string };
  };
  pmsSymptomForecast?: { available: boolean; headline?: string; action?: string } | null;
  forecastAiEnhanced?: boolean;
};

function sanitizeForecast(payload: ForecastPayload, fallback: ForecastPayload): ForecastPayload {
  if (!payload?.forecast?.tomorrow?.outlook || !payload?.forecast?.nextPhase?.preview) return fallback;
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
      nextPhase: {
        ...fallback.forecast.nextPhase,
        ...payload.forecast.nextPhase,
        preview: enforceTwoLines(payload.forecast.nextPhase.preview),
      },
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
): Promise<ForecastPayload> {
  if (!client) return draft;

  const dataBlock = buildUserDataBlock(ctx, baseline, narrative, userName);

  const userPrompt = [
    "Rewrite ONLY the text fields for warmth, specificity, and personal resonance.",
    "Use her actual data (sleep hours, stress scores, cross-cycle memory) to make the forecast feel personal.",
    "Keep all facts exactly the same — dates, phase names, confidence level, score, milestone numbers.",
    "Max 2 sentences per rewritten field. Never add medical claims.",
    "",
    "HER DATA:",
    dataBlock,
    "",
    "Return strict JSON with same schema as input.",
    `INPUT_JSON: ${JSON.stringify(draft)}`,
  ].join("\n");

  const systemContent =
    "You are Vyana. Rewrite forecast text fields to feel personal and specific — use her real numbers when you have them. " +
    "Only rewrite: forecast.tomorrow.outlook, forecast.nextPhase.preview, forecast.confidence.message, pmsSymptomForecast.headline, pmsSymptomForecast.action. " +
    "Keep all non-text fields unchanged. Output valid JSON only.";

  try {
    const response = await client.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemContent },
        { role: "user", content: userPrompt },
      ],
    });
    const raw = response.choices[0]?.message?.content;
    if (!raw) return draft;
    const parsed = JSON.parse(raw) as ForecastPayload;
    return sanitizeForecast(parsed, draft);
  } catch {
    return draft;
  }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

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
}): Promise<string> {
  const { userName, question, cycleInfo, recentLogs, history = [], numericBaseline, crossCycleNarrative } = params;

  if (!client) {
    return "I can help with cycle guidance, but AI chat is not configured yet. Add OPENAI_API_KEY to enable personalized responses.";
  }

  const systemPrompt = [
    "You are Vyana, a warm and deeply personal menstrual health companion.",
    "You have access to this user's real health data — use it to make every response feel specific to her.",
    "Be empathetic, concise, and practical.",
    "Use her actual numbers when relevant (sleep hours, stress levels, cycle day).",
    "Reference cross-cycle patterns if they're helpful ('this has happened in your past cycles too').",
    "Never diagnose conditions. Suggest seeking medical support for severe or persistent symptoms.",
  ].join(" ");

  // Build a rich context block
  const contextParts: string[] = [
    `User: ${userName}`,
    `Cycle day: ${cycleInfo.currentDay}, phase: ${cycleInfo.phase}`,
  ];

  if (numericBaseline) {
    if (numericBaseline.recentSleepAvg !== null) {
      contextParts.push(
        `Sleep: ${numericBaseline.recentSleepAvg}h avg recently` +
        (numericBaseline.baselineSleepAvg ? ` (usual: ${numericBaseline.baselineSleepAvg}h)` : "")
      );
    }
    if (numericBaseline.recentStressAvg !== null) {
      const label = numericBaseline.recentStressAvg >= 2.4 ? "elevated" : numericBaseline.recentStressAvg >= 1.6 ? "moderate" : "calm";
      contextParts.push(`Stress: ${label}`);
    }
  }

  if (crossCycleNarrative?.narrativeStatement) {
    contextParts.push(`Cross-cycle: ${crossCycleNarrative.narrativeStatement}`);
  }

  contextParts.push(`Recent logs (last ${recentLogs.length}): ${JSON.stringify(recentLogs.slice(0, 3))}`);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];
  history.slice(-6).forEach((item) => {
    messages.push({ role: item.role, content: item.content });
  });
  messages.push({
    role: "user",
    content: `Context:\n${contextParts.join("\n")}\n\nQuestion: ${question}`,
  });

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.6,
    messages,
  });

  return sanitize(response.choices[0]?.message?.content || "");
}