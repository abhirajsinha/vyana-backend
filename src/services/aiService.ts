import OpenAI from "openai";
import { DailyInsights, InsightContext } from "./insightService";
import { CycleInfo } from "./cycleEngine";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

function sanitize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** Post-process AI strings: max 2 lines, max length, normalized whitespace per line. */
export function enforceTwoLines(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter((line) => line.length > 0)
    .slice(0, 2)
    .join("\n")
    .slice(0, 180);
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

/** Count sentences by end-punctuation markers. */
function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return (trimmed.match(/[.!?]+/g) || []).length;
}

/** Returns true if any field in the insights exceeds 2 sentences. */
function anyFieldExceedsTwoSentences(insights: DailyInsights): boolean {
  const fields: (keyof DailyInsights)[] = [
    "physicalInsight", "mentalInsight", "emotionalInsight",
    "whyThisIsHappening", "solution", "recommendation", "tomorrowPreview",
  ];
  return fields.some((k) => countSentences(insights[k]) > 2);
}

/** Final guard after AI: schema check + 2-sentence cap. Rejects entirely if any field exceeds 2 sentences. */
export function sanitizeInsights(insights: unknown, fallback: DailyInsights): DailyInsights {
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
  // Hard reject if any field still exceeds 2 sentences after enforcement
  if (anyFieldExceedsTwoSentences(candidate)) return fallback;
  return candidate;
}

function buildInsightRewritePrompt(
  context: InsightContext,
  draft: DailyInsights,
  userName?: string,
): string {
  const userLine = userName
    ? `User: ${userName}, cycle day ${context.cycleDay}, phase ${context.phase}, cycle ${context.variantIndex}`
    : `User: cycle day ${context.cycleDay}, phase ${context.phase}`;

  return [
    "You are Vyana, a warm cycle wellness companion. Rewrite each field in your",
    "voice — caring, specific, never clinical. Keep all facts exactly as given.",
    "Do not add new claims. HARD LIMIT: max 2 sentences per field, ~15 words each.",
    "If you cannot say it in 2 sentences, cut the less important one.",
    "solution = immediate action today; recommendation = broader guidance; do not duplicate wording.",
    "tomorrowPreview = 1–2 sentences about tomorrow only; do not repeat today's insight.",
    "",
    userLine,
    "",
    "DRAFT (rewrite each field, preserve all facts exactly):",
    `Physical: ${draft.physicalInsight}`,
    "",
    `Mental: ${draft.mentalInsight}`,
    "",
    `Emotional: ${draft.emotionalInsight}`,
    "",
    `Why: ${draft.whyThisIsHappening}`,
    "",
    `Action: ${draft.solution}`,
    "",
    `Recommendation: ${draft.recommendation}`,
    "",
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
        return fallback;
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
    const draftLen = JSON.stringify(fallback).length;
    const outLen = JSON.stringify(out).length;
    if (outLen > Math.max(800, draftLen * 2.5)) {
      return fallback;
    }
    const enforced = enforceTwoLinesOnInsights(out);
    // Hard reject if any field exceeds 2 sentences after enforcement
    if (anyFieldExceedsTwoSentences(enforced)) return fallback;
    return enforced;
  } catch {
    return fallback;
  }
}

export async function generateInsightsWithGpt(
  context: InsightContext,
  draft: DailyInsights,
  userName?: string
): Promise<DailyInsights> {
  if (!client) return draft;

  const userPrompt = buildInsightRewritePrompt(context, draft, userName);
  const systemContent =
    "You rewrite health-adjacent support text safely. Output JSON only. " +
    "Keep all facts exactly as given. Never add new claims or diagnoses.";

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemContent },
      { role: "user", content: userPrompt },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  return safeParseInsights(raw, draft);
}

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
}): Promise<string> {
  const { userName, question, cycleInfo, recentLogs, history = [] } = params;

  if (!client) {
    return "I can help with cycle guidance, but AI chat is not configured yet. Add OPENAI_API_KEY to enable personalized responses.";
  }

  const systemPrompt = [
    "You are Vyana, a warm and knowledgeable menstrual health companion.",
    "Be empathetic, concise, and practical.",
    "Use the user's cycle context and logs when relevant.",
    "Never diagnose conditions; suggest when to seek medical support for severe symptoms.",
  ].join(" ");

  const contextBlock = {
    userName,
    cycleInfo,
    recentLogs,
  };

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [{ role: "system", content: systemPrompt }];
  history.slice(-6).forEach((item) => {
    messages.push({ role: item.role, content: item.content });
  });
  messages.push({
    role: "user",
    content: `Context:\n${JSON.stringify(contextBlock)}\n\nUser question:\n${question}`,
  });

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.6,
    messages,
  });

  return sanitize(response.choices[0]?.message?.content || "");
}
