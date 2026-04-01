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

  // Reject future dates
  if (startDate > new Date()) {
    res.status(400).json({ error: "Period start date cannot be in the future" });
    return;
  }

  // Duplicate guard — prevent logging period started twice on the same day
  const startOfDay = new Date(startDate);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startDate);
  endOfDay.setUTCHours(23, 59, 59, 999);
  const existingForDay = await prisma.cycleHistory.findFirst({
    where: { userId: req.userId!, startDate: { gte: startOfDay, lte: endOfDay } },
  });
  if (existingForDay) {
    res.status(409).json({ error: "Period already logged for this date" });
    return;
  }

  const cycleMode = getCycleMode(user);

  const latestHistory = await prisma.cycleHistory.findFirst({
    where: { userId: req.userId! },
    orderBy: { startDate: "desc" },
  });

  if (latestHistory && !latestHistory.endDate && startDate > latestHistory.startDate) {
    // Hormonal users log withdrawal bleeds, not natural periods.
    // Don't store a calculated cycleLength — it would pollute prediction averages.
    const cycleLen = cycleMode === "hormonal"
      ? null
      : Math.max(1, Math.round((startDate.getTime() - latestHistory.startDate.getTime()) / 86400000));
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

  await prisma.user.update({
    where: { id: req.userId! },
    data: {
      lastPeriodStart: startDate,
      cycleMode,
    },
  });

  // Clear stale insight cache so next fetch recomputes with new period start
  await prisma.insightCache.deleteMany({ where: { userId: req.userId! } });

  // Log prediction accuracy: compare predicted period date vs actual
  if (user.lastPeriodStart && user.cycleLength && cycleMode !== "hormonal") {
    const predictedDate = new Date(user.lastPeriodStart.getTime() + user.cycleLength * 86400000);
    const actualDate = startDate;
    const diffDays = Math.round((actualDate.getTime() - predictedDate.getTime()) / 86400000);
    console.log(JSON.stringify({
      type: "prediction_accuracy",
      userId: req.userId,
      predictedDate: predictedDate.toISOString().split("T")[0],
      actualDate: actualDate.toISOString().split("T")[0],
      errorDays: diffDays,
      cycleLength: user.cycleLength,
      timestamp: new Date().toISOString(),
    }));
  }

  // Compute fresh cycle info for the response
  const freshCycleInfo = calculateCycleInfo(startDate, user.cycleLength, cycleMode);

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
    cycleDay: freshCycleInfo.currentDay,
    phase: freshCycleInfo.phase,
    cycleMode,
    healthPatternCheck: healthPatternResult,
  });
}

// ─── DELETE /api/cycle/period-started/:id — undo period logging ─────────────

export async function undoPeriodStarted(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  if (!id) {
    res.status(400).json({ error: "Cycle history ID is required" });
    return;
  }

  const entry = await prisma.cycleHistory.findUnique({ where: { id } });
  if (!entry) {
    res.status(404).json({ error: "Cycle history entry not found" });
    return;
  }
  if (entry.userId !== req.userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  // Find the previous cycle to restore lastPeriodStart
  const previousCycle = await prisma.cycleHistory.findFirst({
    where: { userId: req.userId!, id: { not: id } },
    orderBy: { startDate: "desc" },
  });

  // If this entry closed the previous cycle, reopen it
  if (previousCycle && previousCycle.endDate) {
    const prevEndMs = previousCycle.endDate.getTime();
    const entryStartMs = entry.startDate.getTime();
    // If the previous cycle was closed by this entry (endDate matches startDate within 1 day)
    if (Math.abs(prevEndMs - entryStartMs) < 86400000 * 2) {
      await prisma.cycleHistory.update({
        where: { id: previousCycle.id },
        data: { endDate: null, cycleLength: null },
      });
    }
  }

  // Delete the entry
  await prisma.cycleHistory.delete({ where: { id } });

  // Restore lastPeriodStart to the previous cycle's startDate (or leave if none)
  const restoreDate = previousCycle?.startDate ?? entry.startDate;
  const cycleMode = getCycleMode(
    await prisma.user.findUniqueOrThrow({ where: { id: req.userId! } }),
  );

  await prisma.user.update({
    where: { id: req.userId! },
    data: { lastPeriodStart: restoreDate, cycleMode },
  });

  // Clear caches
  await prisma.insightCache.deleteMany({ where: { userId: req.userId! } });
  await prisma.healthPatternCache.deleteMany({ where: { userId: req.userId! } }).catch(() => {});

  const freshCycleInfo = calculateCycleInfo(restoreDate, 28, cycleMode);

  res.json({
    success: true,
    restoredLastPeriodStart: restoreDate.toISOString(),
    cycleDay: freshCycleInfo.currentDay,
    phase: freshCycleInfo.phase,
    cycleMode,
  });
}
