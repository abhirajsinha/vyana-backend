import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { calculateCycleInfo, getCycleMode } from "../services/cycleEngine";
import { runHealthPatternDetection } from "../services/healthPatternEngine";

const CACHE_TTL_DAYS = 1;

export async function getHealthPatterns(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  // Check for fresh cache
  const cached = await prisma.healthPatternCache.findUnique({
    where: { userId: req.userId! },
  });

  if (cached) {
    const ageMs = Date.now() - cached.updatedAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < CACHE_TTL_DAYS) {
      res.json(cached.result);
      return;
    }
  }

  const allLogs = await prisma.dailyLog.findMany({
    where: { userId: req.userId! },
    orderBy: { date: "asc" },
  });

  const allCycleHistory = await prisma.cycleHistory.findMany({
    where: { userId: req.userId! },
    orderBy: { startDate: "asc" },
  });

  const cycleMode = getCycleMode(user);
  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, user.cycleLength, cycleMode);

  const result = await runHealthPatternDetection(
    req.userId!,
    allLogs,
    allCycleHistory,
    cycleInfo.currentDay,
  );

  const resultJson = JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue;

  await prisma.healthPatternCache.upsert({
    where: { userId: req.userId! },
    update: { result: resultJson },
    create: { userId: req.userId!, result: resultJson },
  });

  res.json(result);
}
