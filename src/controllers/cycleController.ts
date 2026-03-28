import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  calculateCycleInfo,
  getCycleMode,
  getPhaseInsight,
  getPhaseLogFields,
} from "../services/cycleEngine";
import { runHealthPatternDetection } from "../services/healthPatternEngine";

export async function getCurrentCycle(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const cycleMode = getCycleMode(user);
  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, user.cycleLength, cycleMode);
  const insight = getPhaseInsight(cycleInfo.phase);
  const suggestedLogFields = getPhaseLogFields(cycleInfo.phase);

  res.json({ ...cycleInfo, insight, suggestedLogFields, cycleMode });
}

export async function periodStarted(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { date } = req.body as { date?: string };
  if (!date || typeof date !== "string") {
    res.status(400).json({ error: "date is required (YYYY-MM-DD or ISO)" });
    return;
  }
  const startDate = new Date(date);
  if (Number.isNaN(startDate.getTime())) {
    res.status(400).json({ error: "Invalid date" });
    return;
  }

  const latestHistory = await prisma.cycleHistory.findFirst({
    where: { userId: req.userId! },
    orderBy: { startDate: "desc" },
  });

  if (latestHistory && !latestHistory.endDate && startDate > latestHistory.startDate) {
    const ms = startDate.getTime() - latestHistory.startDate.getTime();
    const cycleLen = Math.max(1, Math.round(ms / 86400000));
    await prisma.cycleHistory.update({
      where: { id: latestHistory.id },
      data: {
        endDate: startDate,
        cycleLength: cycleLen,
      },
    });
  }

  await prisma.cycleHistory.create({
    data: {
      userId: req.userId!,
      startDate,
    },
  });

  const cycleMode = getCycleMode(user);
  await prisma.user.update({
    where: { id: req.userId! },
    data: {
      lastPeriodStart: startDate,
      cycleMode,
    },
  });

  // Trigger health pattern detection when user has 2+ completed cycles (fire-and-forget)
  const completedCycles = await prisma.cycleHistory.count({
    where: { userId: req.userId!, endDate: { not: null }, cycleLength: { not: null } },
  });
  let healthPatternResult = null;
  if (completedCycles >= 2) {
    try {
      const allLogs = await prisma.dailyLog.findMany({
        where: { userId: req.userId! },
        orderBy: { date: "asc" },
      });
      const allCycleHistory = await prisma.cycleHistory.findMany({
        where: { userId: req.userId! },
        orderBy: { startDate: "asc" },
      });
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
      if (result.hasAlerts) {
        healthPatternResult = {
          hasAlerts: true,
          alertCount: result.alerts.length,
          message: "We noticed a pattern worth knowing about. Check your health patterns for details.",
        };
      }
    } catch {
      // Health pattern detection is non-critical; don't fail the period-started response
    }
  }

  res.status(201).json({
    success: true,
    startDate: startDate.toISOString(),
    cycleMode,
    healthPatternCheck: healthPatternResult,
  });
}
