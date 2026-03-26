import type { DailyLog, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { Phase } from "./cycleEngine";

/**
 * Fetches historical driver data from insightHistory for recurring pattern detection.
 * Returns entries with stored cycleDay + phase so detectRecurringPattern can match
 * by phase and day proximity without recomputing cycle math.
 */
export async function getPreviousCycleDriverHistory(
  userId: string,
  daysBack: number = 90,
): Promise<Array<{ driver: string; cycleDay: number; phase: Phase }>> {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const history = await prisma.insightHistory.findMany({
    where: {
      userId,
      driver: { not: null },
      cycleDay: { not: null },
      phase: { not: null },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: "desc" },
    select: { driver: true, cycleDay: true, phase: true },
  });

  return history
    .filter((h) => h.driver !== null && h.cycleDay !== null && h.phase !== null)
    .map((h) => ({
      driver: h.driver!,
      cycleDay: h.cycleDay!,
      phase: h.phase! as Phase,
    }));
}

/** Single DB round-trip: last 30 logs; recent = first 5 of that window. */
export async function getUserInsightData(userId: string): Promise<{
  user: User;
  recentLogs: DailyLog[];
  baselineLogs: DailyLog[];
} | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const allLogs = await prisma.dailyLog.findMany({
    where: { userId },
    orderBy: { date: "desc" },
    take: 30,
  });

  return {
    user,
    recentLogs: allLogs.slice(0, 5),
    baselineLogs: allLogs.slice(5),
  };
}
