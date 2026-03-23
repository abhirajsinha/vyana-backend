import OpenAI from "openai";
import { DailyInsights, InsightContext } from "./insightService";

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
    "Return JSON only with keys: physicalInsight, mentalInsight, emotionalInsight, recommendation.",
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
    typeof parsed.recommendation !== "string"
  ) {
    return draft;
  }

  return {
    physicalInsight: sanitize(parsed.physicalInsight),
    mentalInsight: sanitize(parsed.mentalInsight),
    emotionalInsight: sanitize(parsed.emotionalInsight),
    recommendation: sanitize(parsed.recommendation),
  };
}
