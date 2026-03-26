import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { calculateCycleInfo, calculateCycleInfoForDate, getPhaseInsight, getPhaseLogFields } from "../services/cycleEngine";

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

  const calendar = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = new Date(Date.UTC(year, monthIndex, day));
    const isoDate = date.toISOString().split("T")[0];
    const log = logMap.get(isoDate);
    const cycleInfo = calculateCycleInfoForDate(user.lastPeriodStart, date, user.cycleLength);
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
