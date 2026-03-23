import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { calculateCycleInfo, getPhaseInsight, getPhaseLogFields } from "../services/cycleEngine";

export async function getCurrentCycle(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, user.cycleLength);
  const insight = getPhaseInsight(cycleInfo.phase);
  const suggestedLogFields = getPhaseLogFields(cycleInfo.phase);

  res.json({ ...cycleInfo, insight, suggestedLogFields });
}
