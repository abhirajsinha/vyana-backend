// src/services/insightData.ts
// CHANGE SUMMARY:
//   - buildCrossCycleNarrative: 1 query instead of N (was looping per cycle)
//   - getUserInsightData: parallelizes user + logs fetch
//   - getCyclePredictionContext: unchanged
//   - All exports identical — drop-in replacement

import type { DailyLog, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { Phase } from "./cycleEngine";
import { detectCycleIrregularity, utcDayDiff, toUTCDateOnly } from "./cycleEngine";

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

/**
 * Expanded data fetch — OPTIMIZED:
 * - User + allLogs fetched in parallel (was sequential)
 * - buildCrossCycleNarrative uses 1 batch query (was N queries in loop)
 */
export async function getUserInsightData(userId: string): Promise<{
  user: User;
  recentLogs: DailyLog[];
  baselineLogs: DailyLog[];
  numericBaseline: NumericBaseline;
  crossCycleNarrative: CrossCycleNarrative | null;
} | null> {
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // ── Parallel: fetch user + logs at the same time ──────────────────────────
  const [user, allLogs] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.dailyLog.findMany({
      where: { userId, date: { gte: ninetyDaysAgo } },
      orderBy: { date: "desc" },
      take: 120,
    }),
  ]);

  if (!user) return null;

  const recentLogs = allLogs.slice(0, 7);
  const baselineLogs = allLogs.slice(7);

  const numericBaseline = computeNumericBaseline(recentLogs, baselineLogs);
  const crossCycleNarrative = await buildCrossCycleNarrative(userId, user);

  return {
    user,
    recentLogs,
    baselineLogs,
    numericBaseline,
    crossCycleNarrative,
  };
}

// ─── Numeric baseline ─────────────────────────────────────────────────────────

export interface NumericBaseline {
  recentSleepAvg: number | null;
  recentStressAvg: number | null;
  recentMoodAvg: number | null;
  recentEnergyAvg: number | null;
  baselineSleepAvg: number | null;
  baselineStressAvg: number | null;
  baselineMoodAvg: number | null;
  sleepDelta: number | null;
  stressDelta: number | null;
  moodDelta: number | null;
  recentLogCount: number;
  baselineLogCount: number;
}

export function normStress(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (["high", "very_high", "elevated", "stressed"].some((x) => s.includes(x))) return 3;
  if (["medium", "moderate"].some((x) => s.includes(x))) return 2;
  if (["low", "calm", "none"].some((x) => s.includes(x))) return 1;
  return null;
}

export function normMood(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (["sad", "low", "anxious", "irritable", "down", "very_low"].some((x) => s.includes(x))) return 1;
  if (["happy", "good", "great", "calm", "positive", "high"].some((x) => s.includes(x))) return 3;
  return 2;
}

export function normEnergy(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (["low", "very_low", "exhausted", "tired"].some((x) => s.includes(x))) return 1;
  if (["high", "very_high", "energized"].some((x) => s.includes(x))) return 3;
  return 2;
}

function avg(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => typeof v === "number");
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10;
}

function computeNumericBaseline(recent: DailyLog[], baseline: DailyLog[]): NumericBaseline {
  const recentSleepAvg = avg(recent.map((l) => (typeof l.sleep === "number" ? l.sleep : null)));
  const recentStressAvg = avg(recent.map((l) => normStress(l.stress)));
  const recentMoodAvg = avg(recent.map((l) => normMood(l.mood)));
  const recentEnergyAvg = avg(recent.map((l) => normEnergy(l.energy)));

  const baselineSleepAvg = avg(baseline.map((l) => (typeof l.sleep === "number" ? l.sleep : null)));
  const baselineStressAvg = avg(baseline.map((l) => normStress(l.stress)));
  const baselineMoodAvg = avg(baseline.map((l) => normMood(l.mood)));

  const sleepDelta =
    recentSleepAvg !== null && baselineSleepAvg !== null
      ? Math.round((recentSleepAvg - baselineSleepAvg) * 10) / 10
      : null;

  const stressDelta =
    recentStressAvg !== null && baselineStressAvg !== null
      ? Math.round((recentStressAvg - baselineStressAvg) * 10) / 10
      : null;

  const moodDelta =
    recentMoodAvg !== null && baselineMoodAvg !== null
      ? Math.round((recentMoodAvg - baselineMoodAvg) * 10) / 10
      : null;

  return {
    recentSleepAvg,
    recentStressAvg,
    recentMoodAvg,
    recentEnergyAvg,
    baselineSleepAvg,
    baselineStressAvg,
    baselineMoodAvg,
    sleepDelta,
    stressDelta,
    moodDelta,
    recentLogCount: recent.length,
    baselineLogCount: baseline.length,
  };
}

// ─── Cross-cycle narrative — OPTIMIZED ────────────────────────────────────────
// Was: N queries (one per past cycle window)
// Now: 1 query fetches all logs across all windows, then filters in memory

export interface CrossCycleNarrative {
  matchingCycles: number;
  totalCyclesAnalyzed: number;
  typicalSleep: number | null;
  typicalStress: string | null;
  typicalMood: string | null;
  typicalFatigue: string | null;
  narrativeStatement: string | null;
  trend: "improving" | "worsening" | "stable" | "unknown";
}

async function buildCrossCycleNarrative(
  userId: string,
  user: User,
): Promise<CrossCycleNarrative | null> {
  const cycleHistory = await prisma.cycleHistory.findMany({
    where: { userId, endDate: { not: null }, cycleLength: { not: null } },
    orderBy: { startDate: "desc" },
    take: 6,
  });

  if (cycleHistory.length < 2) return null;

  const now = new Date();
  const currentCycleDay = Math.max(1, utcDayDiff(now, user.lastPeriodStart) + 1);

  // ── OPTIMIZATION: compute all windows, then fetch ALL logs in one query ────
  const windows: Array<{ cycleIndex: number; start: Date; end: Date }> = [];

  for (let i = 0; i < cycleHistory.length; i++) {
    const cycle = cycleHistory[i]!;
    const base = toUTCDateOnly(cycle.startDate);
    const windowStart = new Date(base + (currentCycleDay - 3) * 86400000);
    const windowEnd = new Date(base + (currentCycleDay + 2) * 86400000);
    windows.push({ cycleIndex: i, start: windowStart, end: windowEnd });
  }

  // Find the global earliest and latest across all windows
  const globalEarliest = windows.reduce(
    (min, w) => (w.start < min ? w.start : min),
    windows[0]!.start,
  );
  const globalLatest = windows.reduce(
    (max, w) => (w.end > max ? w.end : max),
    windows[0]!.end,
  );

  // ONE query instead of N
  const allWindowLogs = await prisma.dailyLog.findMany({
    where: {
      userId,
      date: { gte: globalEarliest, lte: globalLatest },
    },
    orderBy: { date: "asc" },
  });

  // ── Filter logs into their respective cycle windows (in memory) ────────────
  const cycleWindowData: Array<{
    sleepAvg: number | null;
    stressScore: number | null;
    moodScore: number | null;
  }> = [];
  const windowLogs: DailyLog[] = [];

  for (const window of windows) {
    const logsInWindow = allWindowLogs.filter((log) => {
      const logTime = new Date(log.date).getTime();
      return logTime >= window.start.getTime() && logTime <= window.end.getTime();
    });

    if (logsInWindow.length > 0) {
      windowLogs.push(...logsInWindow);
      cycleWindowData.push({
        sleepAvg: avg(logsInWindow.map((l) => (typeof l.sleep === "number" ? l.sleep : null))),
        stressScore: avg(logsInWindow.map((l) => normStress(l.stress))),
        moodScore: avg(logsInWindow.map((l) => normMood(l.mood))),
      });
    }
  }

  if (windowLogs.length === 0) return null;

  const totalCyclesAnalyzed = cycleHistory.length;
  const matchingCycles = cycleWindowData.length;

  const typicalSleepRaw = avg(cycleWindowData.map((d) => d.sleepAvg));
  const typicalStressRaw = avg(cycleWindowData.map((d) => d.stressScore));
  const typicalMoodRaw = avg(cycleWindowData.map((d) => d.moodScore));

  const typicalSleep = typicalSleepRaw;
  const typicalStress =
    typicalStressRaw === null ? null :
    typicalStressRaw >= 2.4 ? "elevated" :
    typicalStressRaw >= 1.6 ? "moderate" : "calm";
  const typicalMood =
    typicalMoodRaw === null ? null :
    typicalMoodRaw >= 2.4 ? "positive" :
    typicalMoodRaw <= 1.6 ? "low" : "neutral";

  const fatigueCounts: Record<string, number> = {};
  for (const log of windowLogs) {
    if (log.fatigue) fatigueCounts[log.fatigue] = (fatigueCounts[log.fatigue] || 0) + 1;
  }
  const typicalFatigue = Object.entries(fatigueCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  let narrativeStatement: string | null = null;
  if (matchingCycles >= 2) {
    const parts: string[] = [];
    if (typicalSleep !== null) parts.push(`sleep averaging ${typicalSleep}h`);
    if (typicalStress === "elevated") parts.push("elevated stress");
    if (typicalMood === "low") parts.push("lower mood");
    if (typicalFatigue && ["high", "very_high"].includes(typicalFatigue)) parts.push("high fatigue");

    if (parts.length > 0) {
      narrativeStatement = `In your last ${matchingCycles} cycles, around day ${currentCycleDay} you typically had ${parts.join(", ")}.`;
    }
  }

  let trend: CrossCycleNarrative["trend"] = "unknown";
  if (cycleWindowData.length >= 3) {
    const early = cycleWindowData.slice(-2);
    const recent = cycleWindowData.slice(0, 2);
    const earlyMood = avg(early.map((d) => d.moodScore));
    const recentMood = avg(recent.map((d) => d.moodScore));
    const earlySleep = avg(early.map((d) => d.sleepAvg));
    const recentSleep = avg(recent.map((d) => d.sleepAvg));

    if (earlyMood !== null && recentMood !== null && earlySleep !== null && recentSleep !== null) {
      const moodImproved = recentMood - earlyMood > 0.3;
      const sleepImproved = recentSleep - earlySleep > 0.4;
      const moodWorse = recentMood - earlyMood < -0.3;
      const sleepWorse = recentSleep - earlySleep < -0.4;

      if (moodImproved && sleepImproved) trend = "improving";
      else if (moodWorse || sleepWorse) trend = "worsening";
      else trend = "stable";
    }
  }

  return {
    matchingCycles,
    totalCyclesAnalyzed,
    typicalSleep,
    typicalStress,
    typicalMood,
    typicalFatigue,
    narrativeStatement,
    trend,
  };
}

// ─── Existing exports (unchanged) ─────────────────────────────────────────────

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
    where: { userId, cycleLength: { not: null } },
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