import type { DailyLog, User } from "@prisma/client";
import { prisma } from "../lib/prisma";

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
    baselineLogs: allLogs,
  };
}
