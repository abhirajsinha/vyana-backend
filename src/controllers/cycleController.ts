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

  const calendar = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = new Date(Date.UTC(year, monthIndex, day));
    const cycleInfo = calculateCycleInfoForDate(user.lastPeriodStart, date, user.cycleLength);
    return {
      date: date.toISOString().split("T")[0],
      currentDay: cycleInfo.currentDay,
      phase: cycleInfo.phase,
      phaseDay: cycleInfo.phaseDay,
      daysUntilNextPhase: cycleInfo.daysUntilNextPhase,
    };
  });

  res.json({ month, cycleLength: user.cycleLength, calendar });
}
