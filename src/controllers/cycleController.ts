import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import {
  calculateCycleInfo,
  calculateCycleInfoForDate,
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

export async function getCycleCalendar(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { month } = req.query;
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "month must be in YYYY-MM format" });
    return;
  }

  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const startDate = new Date(Date.UTC(year, monthIndex, 1));
  const endDate = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59));

  const logs = await prisma.dailyLog.findMany({
    where: {
      userId: req.userId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
  });

  const logMap = new Map<string, (typeof logs)[number]>();
  logs.forEach((log) => {
    const key = new Date(log.date).toISOString().split("T")[0];
    logMap.set(key, log);
  });

  const now = new Date();
  const todayIso = now.toISOString().split("T")[0];
  const cycleMode = getCycleMode(user);

  const calendar = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = new Date(Date.UTC(year, monthIndex, day));
    const isoDate = date.toISOString().split("T")[0];
    const log = logMap.get(isoDate);
    const cycleInfo = calculateCycleInfoForDate(
      user.lastPeriodStart,
      date,
      user.cycleLength,
      cycleMode,
    );
    return {
      date: isoDate,
      currentDay: cycleInfo.currentDay,
      phase: cycleInfo.phase,
      phaseDay: cycleInfo.phaseDay,
      daysUntilNextPhase: cycleInfo.daysUntilNextPhase,
      isToday: isoDate === todayIso,
      isFuture: date > now,
      hasLog: !!log,
      logSummary: log
        ? {
            mood: log.mood ?? null,
            energy: log.energy ?? null,
            stress: log.stress ?? null,
          }
        : null,
    };
  });

  res.json({ month, cycleLength: user.cycleLength, calendar });
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
