import type { DailyLog, User } from "@prisma/client";
import { prisma } from "../lib/prisma";
import type { Phase } from "./cycleEngine";
import { detectCycleIrregularity } from "./cycleEngine";

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
 * Expanded data fetch:
 * - recentLogs: last 7 days (was 5) for better recency signal
 * - baselineLogs: last 90 days for personal baseline
 * - numericBaseline: pre-computed averages for sleep/stress/mood (used for specificity in GPT)
 * - crossCycleNarrative: what happened around this same cycle day in past cycles
 */
export async function getUserInsightData(userId: string): Promise<{
  user: User;
  recentLogs: DailyLog[];
  baselineLogs: DailyLog[];
  numericBaseline: NumericBaseline;
  crossCycleNarrative: CrossCycleNarrative | null;
} | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  // Fetch 90 days of logs for a meaningful baseline
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const allLogs = await prisma.dailyLog.findMany({
    where: { userId, date: { gte: ninetyDaysAgo } },
    orderBy: { date: "desc" },
    take: 120,
  });

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
  // Recent (last 7 days)
  recentSleepAvg: number | null;
  recentStressAvg: number | null;  // 1=calm, 2=moderate, 3=elevated
  recentMoodAvg: number | null;    // 1=low, 2=neutral, 3=positive
  recentEnergyAvg: number | null;  // 1=low, 2=moderate, 3=high

  // Personal baseline (days 8–90)
  baselineSleepAvg: number | null;
  baselineStressAvg: number | null;
  baselineMoodAvg: number | null;

  // Delta (recent minus baseline) — negative = below personal norm
  sleepDelta: number | null;       // e.g. -1.4 means 1.4h less than usual
  stressDelta: number | null;      // positive = more stressed than usual
  moodDelta: number | null;        // negative = lower mood than usual

  // Days of data available
  recentLogCount: number;
  baselineLogCount: number;
}

function normStress(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (["high", "very_high", "elevated", "stressed"].some((x) => s.includes(x))) return 3;
  if (["medium", "moderate"].some((x) => s.includes(x))) return 2;
  if (["low", "calm", "none"].some((x) => s.includes(x))) return 1;
  return null;
}

function normMood(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (["sad", "low", "anxious", "irritable", "down", "very_low"].some((x) => s.includes(x))) return 1;
  if (["happy", "good", "great", "calm", "positive", "high"].some((x) => s.includes(x))) return 3;
  return 2;
}

function normEnergy(v: string | null | undefined): number | null {
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

// ─── Cross-cycle narrative ────────────────────────────────────────────────────

export interface CrossCycleNarrative {
  // How many past cycles had a similar experience around this cycle day
  matchingCycles: number;
  totalCyclesAnalyzed: number;

  // What the user typically experiences in this window
  typicalSleep: number | null;       // hours
  typicalStress: string | null;      // "calm" | "moderate" | "elevated"
  typicalMood: string | null;        // "low" | "neutral" | "positive"
  typicalFatigue: string | null;

  // Specific past-cycle statement (for GPT to use)
  narrativeStatement: string | null;

  // Trend across cycles — is this window getting better or worse?
  trend: "improving" | "worsening" | "stable" | "unknown";
}

async function buildCrossCycleNarrative(
  userId: string,
  user: User,
): Promise<CrossCycleNarrative | null> {
  // Need at least 2 completed cycles for cross-cycle narrative
  const cycleHistory = await prisma.cycleHistory.findMany({
    where: { userId, endDate: { not: null }, cycleLength: { not: null } },
    orderBy: { startDate: "desc" },
    take: 6,
  });

  if (cycleHistory.length < 2) return null;

  // Current cycle day
  const now = new Date();
  const diffMs = now.getTime() - new Date(user.lastPeriodStart).getTime();
  const currentCycleDay = Math.max(1, Math.floor(diffMs / 86400000) + 1);

  // For each past cycle, find logs around the same cycle day (±2 days)
  const windowLogs: DailyLog[] = [];
  const cycleWindowData: Array<{ sleepAvg: number | null; stressScore: number | null; moodScore: number | null }> = [];

  for (const cycle of cycleHistory) {
    const windowStart = new Date(cycle.startDate.getTime() + (currentCycleDay - 3) * 86400000);
    const windowEnd = new Date(cycle.startDate.getTime() + (currentCycleDay + 2) * 86400000);

    const logsInWindow = await prisma.dailyLog.findMany({
      where: {
        userId,
        date: { gte: windowStart, lte: windowEnd },
      },
      orderBy: { date: "asc" },
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

  // Compute typical values across those windows
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

  // Most common fatigue level in window
  const fatigueCounts: Record<string, number> = {};
  for (const log of windowLogs) {
    if (log.fatigue) fatigueCounts[log.fatigue] = (fatigueCounts[log.fatigue] || 0) + 1;
  }
  const typicalFatigue = Object.entries(fatigueCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Build narrative statement
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

  // Trend: compare earliest vs most recent cycle windows
  let trend: CrossCycleNarrative["trend"] = "unknown";
  if (cycleWindowData.length >= 3) {
    const early = cycleWindowData.slice(-2); // oldest
    const recent = cycleWindowData.slice(0, 2); // most recent
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