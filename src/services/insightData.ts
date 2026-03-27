import type { DailyLog, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { Phase } from "./cycleEngine";
import { detectCycleIrregularity } from "./cycleEngine";

/**
 * Fetches historical driver data from insightHistory for recurring pattern detection.
 * Returns entries with stored cycleDay + phase so detectRecurringPattern can match
 * by phase and day proximity without recomputing cycle math.
 */
export async function getPreviousCycleDriverHistory(
  userId: string,
  daysBack: number = 90,
): Promise<Array<{ driver: string; cycleDay: number; phase: Phase; createdAt: Date }>> {
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
    select: { driver: true, cycleDay: true, phase: true, createdAt: true },
  });

  return history
    .filter((h) => h.driver !== null && h.cycleDay !== null && h.phase !== null)
    .map((h) => ({
      driver: h.driver!,
      cycleDay: h.cycleDay!,
      phase: h.phase! as Phase,
      createdAt: h.createdAt,
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

export async function getCyclePredictionContext(
  userId: string,
  fallbackCycleLength: number,
): Promise<{
  avgLength: number;
  confidence: "reliable" | "variable" | "irregular" | "unknown";
  stdDev: number;
  isIrregular: boolean;
}> {
  const rows = await prisma.cycleHistory.findMany({
    where: {
      userId,
      cycleLength: { not: null },
    },
    orderBy: { startDate: "desc" },
    take: 6,
    select: { cycleLength: true },
  });
  const lengths = rows
    .map((r) => r.cycleLength)
    .filter((v): v is number => typeof v === "number");

  if (lengths.length === 0) {
    return {
      avgLength: fallbackCycleLength,
      confidence: "unknown",
      stdDev: 0,
      isIrregular: false,
    };
  }

  const result = detectCycleIrregularity(lengths);
  return {
    avgLength: result.avgLength,
    confidence: result.confidence,
    stdDev: result.stdDev,
    isIrregular: result.isIrregular,
  };
}
