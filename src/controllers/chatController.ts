import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { calculateCycleInfo } from "../services/cycleEngine";
import { askVyanaWithGpt, ChatHistoryItem } from "../services/aiService";

export async function chat(req: Request, res: Response): Promise<void> {
  const { message, history } = req.body as { message?: string; history?: ChatHistoryItem[] };
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const recentLogs = await prisma.dailyLog.findMany({
    where: { userId: req.userId },
    orderBy: { date: "desc" },
    take: 5,
  });

  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, user.cycleLength);
  const reply = await askVyanaWithGpt({
    userName: user.name,
    question: message,
    cycleInfo,
    recentLogs,
    history: Array.isArray(history) ? history : undefined,
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
