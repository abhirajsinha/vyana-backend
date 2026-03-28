import "../types/express";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { calculateCycleInfo, getCycleMode } from "../services/cycleEngine";
import {
  askVyanaWithGpt,
  buildVyanaContextForInsights,
  type ChatHistoryItem,
} from "../services/aiService";
import { getUserInsightData } from "../services/insightData";
import { buildInsightContext } from "../services/insightService";
import { getCycleNumber } from "../services/cycleInsightLibrary";
import { buildHormoneState, buildHormoneLanguage } from "../services/hormoneengine";
import { detectPrimaryInsightCause } from "../services/insightCause";

export async function chat(req: Request, res: Response): Promise<void> {
  const { message, history } = req.body as { message?: string; history?: ChatHistoryItem[] };
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const data = await getUserInsightData(req.userId!);
  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { user, recentLogs, baselineLogs, numericBaseline, crossCycleNarrative } = data;
  const cycleMode = getCycleMode(user);
  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, user.cycleLength, cycleMode);

  // Count total logs (recent + baseline) to know actual data availability
  const totalLogCount = recentLogs.length + baselineLogs.length;

  const context = buildInsightContext(
    cycleInfo.phase,
    cycleInfo.currentDay,
    recentLogs,
    baselineLogs,
    baselineLogs.length >= 7 ? "global" : "none",
    getCycleNumber(user.lastPeriodStart, user.cycleLength),
    user.cycleLength,
    cycleMode,
  );

  const hormoneState = buildHormoneState(
    cycleInfo.phase,
    cycleInfo.currentDay,
    user.cycleLength,
    cycleMode,
    "none",
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
    cycleLength: user.cycleLength,
    cycleMode,
    daysUntilNextPhase: cycleInfo.daysUntilNextPhase,
    daysUntilNextPeriod: cycleInfo.daysUntilNextPeriod,
    isPeriodDelayed: false,
    daysOverdue: 0,
    isIrregular: false,
    memoryDriver: context.priorityDrivers[0] ?? null,
    memoryCount: 0,
    userName: user.name ?? null,
    userId: req.userId!,
    primaryInsightCause,
  });

  const reply = await askVyanaWithGpt({
    userName: user.name,
    question: message,
    cycleInfo,
    recentLogs,
    history: Array.isArray(history) ? history : undefined,
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