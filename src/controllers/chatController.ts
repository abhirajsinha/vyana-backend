import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { calculateCycleInfo } from "../services/cycleEngine";
import { askVyanaWithGpt, ChatHistoryItem } from "../services/aiService";
import { getCycleMode } from "../services/cycleEngine";
import { getUserInsightData } from "../services/insightData";

export async function chat(req: Request, res: Response): Promise<void> {
  const { message, history } = req.body as { message?: string; history?: ChatHistoryItem[] };
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  // Use the rich getUserInsightData so chat has access to real numbers and cross-cycle narrative
  const data = await getUserInsightData(req.userId!);
  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { user, recentLogs, numericBaseline, crossCycleNarrative } = data;
  const cycleMode = getCycleMode(user);
  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, user.cycleLength, cycleMode);

  const reply = await askVyanaWithGpt({
    userName: user.name,
    question: message,
    cycleInfo,
    recentLogs,
    history: Array.isArray(history) ? history : undefined,
    numericBaseline,
    crossCycleNarrative,
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