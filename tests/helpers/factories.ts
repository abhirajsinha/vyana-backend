// tests/helpers/factories.ts
// Reusable builders for test data. No DB dependency.

import type { DailyLog, User } from "@prisma/client";
import type { NumericBaseline } from "../../src/services/insightData";
import type { Phase } from "../../src/services/cycleEngine";

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function localMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function daysAgo(n: number): Date {
  const d = localMidnight();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

export function periodStartForDay(cycleDay: number): Date {
  const d = localMidnight();
  d.setUTCDate(d.getUTCDate() - (cycleDay - 1));
  return d;
}

// ─── User factory ─────────────────────────────────────────────────────────────

export function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "test-user-id",
    email: "test@vyana.app",
    passwordHash: null,
    googleId: null,
    name: "Test User",
    age: 28,
    height: 165,
    weight: 58,
    cycleLength: 28,
    lastPeriodStart: periodStartForDay(14),
    contraceptiveMethod: null,
    cycleRegularity: "regular",
    cycleMode: "natural",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as User;
}

// ─── Log factory ──────────────────────────────────────────────────────────────

export interface LogOverrides {
  mood?: string;
  energy?: string;
  sleep?: number;
  stress?: string;
  pain?: string;
  padsChanged?: number;
  symptoms?: string[];
  cravings?: string;
  fatigue?: string;
  social?: string;
  focus?: string;
  motivation?: string;
}

export function makeLog(dayOffset: number, overrides: LogOverrides = {}): DailyLog {
  return {
    id: `log-${dayOffset}-${Math.random().toString(36).slice(2, 8)}`,
    userId: "test-user-id",
    date: daysAgo(dayOffset),
    mood: overrides.mood ?? "neutral",
    energy: overrides.energy ?? "moderate",
    sleep: overrides.sleep ?? 7.0,
    stress: overrides.stress ?? "moderate",
    diet: null,
    exercise: null,
    activity: null,
    symptoms: overrides.symptoms ?? [],
    focus: overrides.focus ?? null,
    motivation: overrides.motivation ?? null,
    pain: overrides.pain ?? "none",
    social: overrides.social ?? null,
    cravings: overrides.cravings ?? null,
    fatigue: overrides.fatigue ?? null,
    padsChanged: overrides.padsChanged ?? null,
    createdAt: new Date(),
  } as DailyLog;
}

export function makeLogs(profiles: LogOverrides[], startDay: number = 0): DailyLog[] {
  return profiles.map((p, i) => makeLog(startDay + i, p));
}

// ─── Preset log profiles ─────────────────────────────────────────────────────

export function goodLogs(count: number = 7): DailyLog[] {
  return makeLogs(
    Array(count).fill({ mood: "good", energy: "high", sleep: 7.5, stress: "low", pain: "none" }),
  );
}

export function stableLogs(count: number = 7): DailyLog[] {
  return makeLogs(
    Array(count).fill({ mood: "neutral", energy: "moderate", sleep: 7.0, stress: "moderate", pain: "none" }),
  );
}

export function sleepDeprivedLogs(): DailyLog[] {
  return makeLogs([
    { sleep: 4.0, mood: "low", energy: "low", stress: "moderate" },
    { sleep: 4.5, mood: "low", energy: "low", stress: "moderate" },
    { sleep: 5.0, mood: "neutral", energy: "low", stress: "low" },
    { sleep: 5.5, mood: "neutral", energy: "moderate", stress: "low" },
    { sleep: 6.0, mood: "neutral", energy: "moderate", stress: "low" },
    { sleep: 6.5, mood: "good", energy: "moderate", stress: "low" },
    { sleep: 7.0, mood: "good", energy: "high", stress: "low" },
  ]);
}

export function highStressLogs(): DailyLog[] {
  return makeLogs([
    { sleep: 7.0, mood: "low", energy: "low", stress: "very_high" },
    { sleep: 7.0, mood: "low", energy: "low", stress: "very_high" },
    { sleep: 7.0, mood: "neutral", energy: "moderate", stress: "high" },
    { sleep: 7.0, mood: "neutral", energy: "moderate", stress: "high" },
    { sleep: 7.0, mood: "neutral", energy: "moderate", stress: "moderate" },
  ]);
}

export function heavyBleedingLogs(): DailyLog[] {
  return makeLogs([
    { sleep: 5.5, mood: "low", energy: "low", stress: "moderate", padsChanged: 8, pain: "severe" },
    { sleep: 5.8, mood: "low", energy: "low", stress: "moderate", padsChanged: 7 },
    { sleep: 6.0, mood: "neutral", energy: "moderate", stress: "low", padsChanged: 4 },
  ]);
}

export function mixedSignalLogs(): DailyLog[] {
  return makeLogs([
    { sleep: 4.5, mood: "low", energy: "low", stress: "high" },
    { sleep: 7.0, mood: "good", energy: "high", stress: "low" },
    { sleep: 4.8, mood: "low", energy: "low", stress: "high" },
    { sleep: 7.2, mood: "good", energy: "moderate", stress: "low" },
    { sleep: 5.0, mood: "low", energy: "low", stress: "high" },
  ]);
}

// ─── Baseline factory ─────────────────────────────────────────────────────────

export function makeBaseline(overrides: Partial<NumericBaseline> = {}): NumericBaseline {
  return {
    recentSleepAvg: 7.0,
    recentStressAvg: 1.5,
    recentMoodAvg: 2.5,
    recentEnergyAvg: 2.0,
    baselineSleepAvg: 7.0,
    baselineStressAvg: 1.5,
    baselineMoodAvg: 2.5,
    sleepDelta: 0,
    stressDelta: 0,
    moodDelta: 0,
    recentLogCount: 7,
    baselineLogCount: 30,
    ...overrides,
  };
}

export const nullBaseline: NumericBaseline = {
  recentSleepAvg: null,
  recentStressAvg: null,
  recentMoodAvg: null,
  recentEnergyAvg: null,
  baselineSleepAvg: null,
  baselineStressAvg: null,
  baselineMoodAvg: null,
  sleepDelta: null,
  stressDelta: null,
  moodDelta: null,
  recentLogCount: 0,
  baselineLogCount: 0,
};