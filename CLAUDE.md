# TASK: Fix Chat Intent Detection + Split aiService.ts

## PROBLEM

When a user sends a casual message like "how are you?" to `POST /api/chat`, Vyana dumps cycle-phase information instead of responding naturally. The root cause:

1. `chatController.ts` ALWAYS runs the full insight pipeline (fetches logs, builds baseline, computes hormone state, builds VyanaContext) — even for "hi" or "how are you?"
2. `askVyanaWithGpt` in `aiService.ts` ALWAYS injects the full cycle context block into the GPT prompt — so GPT sees "Day 9, follicular phase, estrogen climbing..." and uses it even when the user is just saying hello
3. The system prompt has no instruction to distinguish casual conversation from health questions
4. `aiService.ts` is a 1000+ line mega-file that mixes insight generation, forecast generation, and chat — making it hard to maintain

## WHAT TO DO

### Step 1: Split `src/services/aiService.ts` into 3 files

The current `aiService.ts` has three distinct responsibilities. Split them:

**`src/services/chatService.ts`** — NEW FILE
- Move `askVyanaWithGpt` here
- Move `ChatHistoryItem` type here
- Move `buildFallbackContextBlock` here (it's used by chat)
- Move the `sanitize()` helper here (single-use for chat)
- Add the new intent detection logic (see Step 2)
- Import what you need from `insightGptService.ts` and `vyanaContext.ts`

**`src/services/insightGptService.ts`** — NEW FILE
- Move `generateInsightsWithGpt` here
- Move `generateForecastWithGpt` here
- Move `buildVyanaContextForInsights` here
- Move ALL the guard/sanitize/enforce functions here:
  - `enforceTwoLines`, `enforceTwoLinesOnInsights`
  - `countSentences`, `truncateToMaxSentences`, `enforceMaxSentencesOnInsights`
  - `hasStrengthRegression`, `STRONG_WORDS`, `STRONG_SYNONYMS`
  - `anyFieldExceedsMaxSentences`
  - `sanitizeInsights`
  - `VAGUE_PHRASES`, `containsVagueLanguage`, `fixVagueLanguage`
  - `InsightGenerationStatus` type
  - `safeParseInsightsDetailed`
  - `removeUnearnedIdentityLanguage`, `removeUnearnedHistoricalClaims`, `removeUnearnedMemoryLanguage`
  - `fixCapitalization`, `sharpenHighConfidenceTone`, `stripMenstrualHedging`
  - `polishOvulationPeakCopy`, `enforceMenstrualDiscipline`
  - `VYANA_SYSTEM_PROMPT` (the insight system prompt — chat will have its own)
- Keep the OpenAI client initialization shared or duplicated (your choice — a small `src/services/openaiClient.ts` with just the client export is cleanest)

**`src/services/aiService.ts`** — becomes a thin re-export barrel
- Re-export everything from `chatService.ts` and `insightGptService.ts` so existing imports don't break:
```typescript
export { askVyanaWithGpt, type ChatHistoryItem } from "./chatService";
export {
  generateInsightsWithGpt,
  generateForecastWithGpt,
  buildVyanaContextForInsights,
  sanitizeInsights,
  type InsightGenerationStatus,
  enforceTwoLines,
} from "./insightGptService";
```

### Step 2: Add intent detection to chatService.ts

Add a function that classifies the user's message intent:

```typescript
type ChatIntent = "casual" | "health" | "ambiguous";

function classifyIntent(message: string, history: ChatHistoryItem[]): ChatIntent {
  const msg = message.trim().toLowerCase();

  // Casual greetings and small talk
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

  // Health/cycle keywords — user wants insight
  const healthPatterns = [
    /\b(period|cycle|phase|ovulat|menstrual|luteal|follicular|pms|cramp)\b/,
    /\b(sleep|stress|mood|energy|fatigue|pain|bloat|headache)\b/,
    /\b(feel|feeling|felt)\b.*\b(today|lately|recently|bad|good|tired|low|anxious)\b/,
    /\b(why\s+(do|am|is)\s+i)\b/,
    /\b(what('s| is) (wrong|happening|going on) with (me|my))\b/,
    /\b(should i|can i|is it normal)\b/,
    /\b(log|track|insight|predict|forecast)\b/,
    /\b(exercise|workout|diet|eat|iron|vitamin)\b/,
    /\b(hormone|estrogen|progesterone)\b/,
    /\b(pregnant|fertility|conceive|ovulation)\b/,
    /\b(bleeding|flow|pad|tampon|spotting)\b/,
  ];

  if (healthPatterns.some(p => p.test(msg))) return "health";

  // If conversation history has health context, lean toward health
  if (history.length > 0) {
    const lastAssistant = [...history].reverse().find(h => h.role === "assistant");
    if (lastAssistant && healthPatterns.some(p => p.test(lastAssistant.content.toLowerCase()))) {
      return "health";
    }
  }

  return "ambiguous";
}
```

### Step 3: Update chatController.ts to use intent-based routing

The `chat()` function in `chatController.ts` should check intent BEFORE running the insight pipeline:

```typescript
export async function chat(req: Request, res: Response): Promise<void> {
  const { message, history } = req.body as { message?: string; history?: ChatHistoryItem[] };
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const safeHistory = Array.isArray(history) ? history : [];
  const intent = classifyIntent(message, safeHistory);

  // For casual messages, use lightweight path — no insight pipeline
  if (intent === "casual") {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) { res.status(404).json({ error: "User not found" }); return; }

    const reply = await askVyanaWithGpt({
      userName: user.name,
      question: message,
      cycleInfo: calculateCycleInfo(user.lastPeriodStart, user.cycleLength, getCycleMode(user)),
      recentLogs: [],
      history: safeHistory,
      totalLogCount: 0,
      lightMode: true,  // NEW flag — tells askVyanaWithGpt to skip context injection
    });

    await prisma.chatMessage.createMany({
      data: [
        { userId: req.userId!, role: "user", content: message },
        { userId: req.userId!, role: "assistant", content: reply },
      ],
    });
    res.json({ reply });
    return;
  }

  // For health and ambiguous messages — full pipeline (existing code)
  const data = await getUserInsightData(req.userId!);
  // ... rest of existing code unchanged ...
}
```

### Step 4: Update askVyanaWithGpt to support lightMode

Add a `lightMode?: boolean` parameter to the function. When `lightMode` is true:

1. Use a DIFFERENT system prompt that emphasizes conversational behavior:

```typescript
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
```

2. Do NOT inject the context block when `lightMode` is true
3. Only inject user's name as context

```typescript
if (lightMode) {
  messages = [
    { role: "system", content: CHAT_SYSTEM_PROMPT_LIGHT },
    ...history.slice(-6).map(item => ({ role: item.role, content: item.content })),
    { role: "user", content: userName ? `[User: ${userName}]\n\n${question}` : question },
  ];
} else {
  // existing full-context path
}
```

### Step 5: Handle "ambiguous" intent gracefully

For ambiguous messages (e.g., "I'm not feeling great"), the full pipeline runs BUT add this instruction to the existing chat system prompt:

```
"CONVERSATIONAL BALANCE: Even when you have cycle data, lead with empathy and direct response to what the user said. Mention cycle context only if it's genuinely relevant to their question. For vague messages like 'I'm tired' or 'not great', ask what's going on before assuming it's cycle-related."
```

## FILES TO MODIFY

1. **CREATE** `src/services/chatService.ts` — chat GPT logic + intent classifier
2. **CREATE** `src/services/insightGptService.ts` — insight + forecast GPT logic + all guards
3. **MODIFY** `src/services/aiService.ts` — becomes thin re-export barrel
4. **MODIFY** `src/controllers/chatController.ts` — add intent routing, lightweight path for casual
5. **CREATE** `src/services/openaiClient.ts` (optional but clean) — shared OpenAI client init

## TESTING

After changes, test these in Postman:

1. `POST /api/chat` with `{"message": "how are you?", "history": []}` → should get a warm casual reply with NO cycle data
2. `POST /api/chat` with `{"message": "hi", "history": []}` → casual warm greeting
3. `POST /api/chat` with `{"message": "why am I so tired?", "history": []}` → should get full insight-aware response
4. `POST /api/chat` with `{"message": "how's my cycle looking?", "history": []}` → full pipeline
5. `POST /api/chat` with `{"message": "thanks!", "history": []}` → casual acknowledgment
6. Verify `GET /api/insights` still works (no regressions from the split)
7. Verify `GET /api/insights/forecast` still works

## IMPORTANT CONSTRAINTS

- Do NOT change any insight generation logic — only move it to the new file
- Do NOT change any guard/sanitize logic — only move it
- All existing imports from `aiService.ts` across the codebase must still work (use the barrel re-export pattern)
- The `classifyIntent` function should be exported from `chatService.ts` so it can be tested independently
- Keep the full insight pipeline for health-related messages — only skip it for casual chat