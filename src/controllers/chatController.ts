import "../types/express";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { calculateCycleInfo, getCycleMode, utcDayDiff } from "../services/cycleEngine";
import {
  askVyanaWithGpt,
  buildVyanaContextForInsights,
  type ChatHistoryItem,
} from "../services/aiService";
import { classifyIntent } from "../services/chatService";
import { getCyclePredictionContext, getUserInsightData } from "../services/insightData";
import { buildInsightContext } from "../services/insightService";
import { getCycleNumber } from "../services/cycleInsightLibrary";
import { buildHormoneState, buildHormoneLanguage } from "../services/hormoneengine";
import { detectPrimaryInsightCause } from "../services/insightCause";
import { resolveContraceptionType } from "../services/contraceptionengine";

export async function chat(req: Request, res: Response): Promise<void> {
  const { message, history } = req.body as { message?: string; history?: ChatHistoryItem[] };
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }
  if (message.length > 2000) {
    res.status(400).json({ error: "Message must not exceed 2000 characters" });
    return;
  }

  const safeHistory = Array.isArray(history) ? history : [];
  const intent = classifyIntent(message, safeHistory);

  // Lightweight path — no insight pipeline for casual messages
  if (intent === "casual") {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const cycleMode = getCycleMode(user);
    const cycleInfo = calculateCycleInfo(user.lastPeriodStart, user.cycleLength, cycleMode);

    const reply = await askVyanaWithGpt({
      userName: user.name ?? "",
      question: message,
      cycleInfo,
      recentLogs: [],
      history: safeHistory,
      totalLogCount: 0,
      lightMode: true,
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

  // Full pipeline for health and ambiguous messages
  const data = await getUserInsightData(req.userId!);
  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { user, recentLogs, baselineLogs, numericBaseline, crossCycleNarrative } = data;
  const cycleMode = getCycleMode(user);

  // FIX: Use prediction-adjusted cycle length (was user.cycleLength)
  const cyclePrediction = await getCyclePredictionContext(req.userId!, user.cycleLength);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;

  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);

  // FIX: Compute delayed period (was hardcoded false)
  const rawDiffDays = utcDayDiff(new Date(), user.lastPeriodStart);
  const daysOverdue = Math.max(0, rawDiffDays - effectiveCycleLength);
  const isPeriodDelayed =
    daysOverdue > 0 &&
    cyclePrediction.confidence !== "irregular" &&
    cycleMode !== "hormonal";
  const isIrregular = cycleMode !== "hormonal" && cyclePrediction.isIrregular;

  const totalLogCount = recentLogs.length + baselineLogs.length;

  // FIX: Pass cyclePredictionConfidence as 9th arg (was missing)
  const context = buildInsightContext(
    cycleInfo.phase,
    cycleInfo.currentDay,
    recentLogs,
    baselineLogs,
    baselineLogs.length >= 7 ? "global" : "none",
    getCycleNumber(user.lastPeriodStart, effectiveCycleLength),
    effectiveCycleLength,
    cycleMode,
    cyclePrediction.confidence,
  );

  // FIX: Use actual contraception type (was hardcoded "none")
  const contraceptionType = resolveContraceptionType(user.contraceptiveMethod);

  const hormoneState = buildHormoneState(
    cycleInfo.phase,
    cycleInfo.currentDay,
    effectiveCycleLength,
    cycleMode,
    contraceptionType,
  );

  const primaryInsightCause = detectPrimaryInsightCause({
    baselineDeviation: context.baselineDeviation,
    trends: context.trends,
    sleepDelta: numericBaseline.sleepDelta,
    priorityDrivers: context.priorityDrivers,
  });

  const vyanaCtx = buildVyanaContextForInsights({
    ctx: context,
    baseline: numericBaseline,
    crossCycleNarrative,
    hormoneState,
    hormoneLanguage: buildHormoneLanguage(hormoneState, 0.5),
    phase: cycleInfo.phase,
    cycleDay: cycleInfo.currentDay,
    phaseDay: cycleInfo.phaseDay,
    cycleLength: effectiveCycleLength,
    cycleMode,
    daysUntilNextPhase: cycleInfo.daysUntilNextPhase,
    daysUntilNextPeriod: cycleInfo.daysUntilNextPeriod,
    isPeriodDelayed,
    daysOverdue,
    isIrregular,
    memoryDriver: context.priorityDrivers[0] ?? null,
    memoryCount: 0,
    userName: user.name ?? null,
    userId: req.userId!,
    primaryInsightCause,
  });

  const reply = await askVyanaWithGpt({
    userName: user.name ?? "",
    question: message,
    cycleInfo,
    recentLogs,
    history: safeHistory,
    numericBaseline,
    crossCycleNarrative,
    vyanaCtx,
    totalLogCount,
  });

  await prisma.chatMessage.createMany({
    data: [
      { userId: req.userId!, role: "user", content: message },
      { userId: req.userId!, role: "assistant", content: reply },
    ],
  });

  res.json({ reply });
}

export async function getChatHistory(req: Request, res: Response): Promise<void> {
  const messages = await prisma.chatMessage.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "asc" },
    take: 100,
  });

  res.json(messages);
}
