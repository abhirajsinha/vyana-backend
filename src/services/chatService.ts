import OpenAI from "openai";
import { client, OPENAI_MODEL } from "./openaiClient";
import { InsightContext } from "./insightService";
import { CycleInfo } from "./cycleEngine";
import type { NumericBaseline, CrossCycleNarrative } from "./insightData";
import { CERTAINTY_RULES_FOR_GPT } from "../utils/confidencelanguage";
import { serializeVyanaContext, type VyanaContext } from "./vyanaContext";
import { buildFallbackContextBlock } from "./insightGptService";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export type ChatIntent = "casual" | "health" | "ambiguous";

// ─── Intent classifier ────────────────────────────────────────────────────────

export function classifyIntent(message: string, history: ChatHistoryItem[]): ChatIntent {
  const msg = message.trim().toLowerCase();

  const casualPatterns = [
    /^(hi|hello|hey|hii+|hola|yo)\b/,
    /^(good\s*(morning|afternoon|evening|night))/,
    /^(how are you|how('s| is) it going|what'?s up|sup)\b/,
    /^(thanks|thank you|thx|ty)\b/,
    /^(ok(ay)?|sure|cool|nice|great|awesome|haha|lol|lmao)\b/,
    /^(bye|goodbye|see you|good night|gn)\b/,
    /^(tell me about yourself|who are you|what are you|what can you do)/,
    /^(nothing|nm|not much|just chilling|bored)\b/,
  ];

  if (casualPatterns.some(p => p.test(msg))) return "casual";

  const healthPatterns = [
    /\b(period|cycle|phase|ovulat\w*|menstrual|luteal|follicular|pms|cramp\w*)\b/,
    /\b(sleep|stress|mood|energy|fatigue|pain|bloat\w*|headache)\b/,
    /\b(feel|feeling|felt)\b.*\b(today|lately|recently|bad|good|tired|low|anxious)\b/,
    /\b(why\s+(do|am|is)\s+i)\b/,
    /\b(what('s| is) (wrong|happening|going on) with (me|my))\b/,
    /\b(should i|can i|is it normal)\b/,
    /\b(log|track|insight\w*|predict|forecast)\b/,
    /\b(exercise|workout|diet|eat|iron|vitamin)\b/,
    /\b(hormone|estrogen|progesterone)\b/,
    /\b(pregnant|fertility|conceive|ovulation)\b/,
    /\b(bleeding|flow|pad|tampon|spotting)\b/,
  ];

  if (healthPatterns.some(p => p.test(msg))) return "health";

  if (history.length > 0) {
    const lastAssistant = [...history].reverse().find(h => h.role === "assistant");
    if (lastAssistant && healthPatterns.some(p => p.test(lastAssistant.content.toLowerCase()))) {
      return "health";
    }
  }

  return "ambiguous";
}

// ─── System prompts ───────────────────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT_LIGHT = `You are Vyana — a warm, friendly menstrual health companion.

RIGHT NOW the user is making casual conversation. Respond naturally and warmly, like a supportive friend.

RULES FOR CASUAL CONVERSATION:
- Be warm, personal, and natural
- Use the user's name if available
- Do NOT mention cycle day, phase, hormones, or health data unless the user asks
- Do NOT encourage logging or tracking unless relevant
- Keep responses short and conversational (2-4 sentences max)
- If the user asks "how are you", respond like a friendly companion — NOT with cycle information
- You can mention you're here to help with their cycle/health if it comes up naturally, but don't force it

You know the user's name and that they use you for cycle tracking, but this is just a friendly chat right now.`;

const CHAT_SYSTEM_PROMPT_FULL = `You are Vyana — a warm, personal menstrual health companion.

VOICE:
- Speak directly: "you", "your"
- Sound like a knowledgeable friend, not a doctor
- Be specific when you have data, honest when you don't
- Never diagnose. Suggest seeing a doctor for persistent symptoms.
- Never use: "estrogen surge", "progesterone peak", "hormonal rhythms"
- Use natural language: "energy feels lower", "things can feel heavier"

CONFIDENCE:
- Zero logs: general cycle knowledge. "Energy can feel lower during your period."
- Some logs: reference what they've shared. "You mentioned stress recently."
- Never claim patterns you haven't seen across 2+ cycles.

DATA:
- Sleep values: use as given
- Never show numeric stress/mood scores
- If you don't have data, say so warmly

CONVERSATION:
- Lead with empathy. Answer their question first.
- Only mention cycle context if genuinely relevant
- For vague messages ("I'm tired"), ask what's going on before assuming cycle cause
- Keep responses concise: 2-4 sentences for casual, 4-6 for health
- Never lecture. Never list symptoms unprompted.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitize(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

// ─── askVyanaWithGpt ──────────────────────────────────────────────────────────

export async function askVyanaWithGpt(params: {
  userName: string;
  question: string;
  cycleInfo: CycleInfo;
  recentLogs: unknown[];
  history?: ChatHistoryItem[];
  numericBaseline?: NumericBaseline | null;
  crossCycleNarrative?: CrossCycleNarrative | null;
  vyanaCtx?: VyanaContext;
  totalLogCount?: number;
  lightMode?: boolean;
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
    totalLogCount = recentLogs.length,
    lightMode = false,
  } = params;

  if (!client)
    return "I can help with cycle guidance, but AI chat is not configured yet.";

  let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];

  if (lightMode) {
    messages = [
      { role: "system", content: CHAT_SYSTEM_PROMPT_LIGHT },
      ...history.slice(-6).map(
        (item) => ({ role: item.role, content: item.content }) as OpenAI.Chat.Completions.ChatCompletionMessageParam,
      ),
      {
        role: "user",
        content: userName ? `[User: ${userName}]\n\n${question}` : question,
      },
    ];
  } else {
    const noDataGuard =
      totalLogCount === 0
        ? `\n\nCRITICAL — ZERO DATA: This user has NOT logged a single day. You have NO sleep, mood, stress, energy, or symptom data whatsoever. If they ask about ANY metric (sleep, mood, stress, energy, patterns, how they've been feeling, what's been happening), you MUST tell them you don't have that data yet and warmly encourage them to start logging. Do NOT invent, assume, guess, or infer any values. Do NOT say their sleep has been "consistent", "restful", "stable", or anything implying you have information you don't have. You literally know NOTHING about how they feel — only their cycle day and phase. Be honest, warm, and direct about this.`
        : totalLogCount < 3
          ? `\n\nLIMITED DATA: This user has only ${totalLogCount} log(s). Be honest about what you can and cannot say. Do not make pattern, trend, or baseline claims. Only reference what the logged data actually shows. If they ask about something you don't have data for, say so.`
          : "";

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

    messages = [
      { role: "system", content: CHAT_SYSTEM_PROMPT_FULL + noDataGuard },
      ...history.slice(-6).map(
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
  }

  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: 0.6,
    messages,
  });
  return sanitize(response.choices[0]?.message?.content || "");
}
