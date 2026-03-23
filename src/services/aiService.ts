import OpenAI from "openai";
import { DailyInsights, InsightContext } from "./insightService";
import { CycleInfo } from "./cycleEngine";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const client = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

function sanitize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export async function rewriteInsightsWithGpt(
  context: InsightContext,
  draft: DailyInsights,
  userName?: string
): Promise<DailyInsights> {
  if (!client) return draft;

  const systemPrompt = [
    "You are Vyana, a warm and science-aligned menstrual health companion.",
    "Rewrite insights to be supportive, concise, and personalized.",
    "Use only provided context. Do not diagnose or make medical claims.",
    "Each field must be max 2 short lines.",
    "Avoid generic wording and repetitive phrasing.",
    "Return JSON only with keys: physicalInsight, mentalInsight, emotionalInsight, whyThisIsHappening, solution, recommendation.",
  ].join(" ");

  const payload = {
    userName: userName || "User",
    context,
    draft,
  };

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(payload) },
    ],
  });

  const raw = response.choices[0]?.message?.content || "{}";
  const parsed = JSON.parse(raw) as Partial<DailyInsights>;

  if (
    typeof parsed.physicalInsight !== "string" ||
    typeof parsed.mentalInsight !== "string" ||
    typeof parsed.emotionalInsight !== "string" ||
    typeof parsed.whyThisIsHappening !== "string" ||
    typeof parsed.solution !== "string"
  ) {
    return draft;
  }

  const recommendation = typeof parsed.recommendation === "string" ? parsed.recommendation : parsed.solution;

  return {
    physicalInsight: sanitize(parsed.physicalInsight),
    mentalInsight: sanitize(parsed.mentalInsight),
    emotionalInsight: sanitize(parsed.emotionalInsight),
    whyThisIsHappening: sanitize(parsed.whyThisIsHappening),
    solution: sanitize(parsed.solution),
    recommendation: sanitize(recommendation),
  };
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
