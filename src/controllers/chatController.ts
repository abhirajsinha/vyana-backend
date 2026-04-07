import "../types/express";
import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { calculateCycleInfo, getCycleMode } from "../services/cycleEngine";
import {
  askVyanaWithGpt,
  type ChatHistoryItem,
} from "../services/aiService";
import { classifyIntent } from "../services/chatService";
import { getCyclePredictionContext, getUserInsightData } from "../services/insightData";

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

  const { user, recentLogs, numericBaseline } = data;
  const cycleMode = getCycleMode(user);
  const cyclePrediction = await getCyclePredictionContext(req.userId!, user.cycleLength);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;
  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);
  const totalLogCount = recentLogs.length;

  const reply = await askVyanaWithGpt({
    userName: user.name ?? "",
    question: message,
    cycleInfo,
    recentLogs,
    history: safeHistory,
    numericBaseline,
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
