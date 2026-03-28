/**
 * Generates 500 test cases: 140 systematic + 80 edge + 280 random (seeded).
 * Run standalone: npx ts-node src/testRunner/generateTestCases.ts
 */

import * as fs from "fs";
import * as path from "path";
import type { Phase } from "../services/cycleEngine";
import { calculatePhaseFromCycleLength } from "../services/cycleEngine";

export type TestExpect = {
  cycleDay: number;
  cycleLength: number;
  phase: Phase;
  minLogs: number;
  shouldBeStable: boolean;
  shouldDetectSleepDisruption: boolean;
  /** Expect aiEnhanced === false (no GPT improvement / gated / fallback) */
  shouldGateGPT: boolean;
  shouldDetectBleeding: boolean;
  shouldBePeriodDelayed?: boolean;
};

export type GeneratedLog = {
  date: Date;
  mood?: string;
  energy?: string;
  sleep?: number;
  stress?: string;
  padsChanged?: number;
};

export type GeneratedUser = {
  name: string;
  age: number;
  height: number;
  weight: number;
  cycleLength: number;
  lastPeriodStart: Date;
  cycleRegularity: string;
  cycleMode: string;
  contraceptiveMethod?: string | null;
};

export interface GeneratedTestCase {
  id: string;
  description: string;
  user: GeneratedUser;
  logs: GeneratedLog[];
  expect: TestExpect;
}

function localMidnight(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysAgo(n: number): Date {
  const d = localMidnight();
  d.setDate(d.getDate() - n);
  return d;
}

function periodStartForDay(cycleDay: number): Date {
  const d = localMidnight();
  d.setDate(d.getDate() - (cycleDay - 1));
  return d;
}

function expectedPhase(
  cycleDay: number,
  cycleLength: number,
  mode: "natural" | "hormonal",
): Phase {
  return calculatePhaseFromCycleLength(cycleDay, cycleLength, mode);
}

function buildGoodAllLogs(): GeneratedLog[] {
  return [0, 1, 2, 3, 4].map((n) => ({
    date: daysAgo(n),
    mood: n <= 1 ? "good" : "neutral",
    energy: "high",
    sleep: 7.2 + (n % 3) * 0.1,
    stress: "low",
  }));
}

function buildSleepDeprivedLogs(): GeneratedLog[] {
  const recent = [4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0].map((sleep, i) => ({
    date: daysAgo(i),
    mood: i <= 2 ? "low" : i <= 4 ? "neutral" : "good",
    energy: i <= 2 ? "low" : "moderate",
    sleep,
    stress: i <= 1 ? "moderate" : "low",
  }));
  const baseline = [7, 7, 7.2, 6.9, 7.1, 7, 7].map((sleep, i) => ({
    date: daysAgo(7 + i),
    mood: "good",
    energy: "moderate",
    sleep,
    stress: "low",
  }));
  return [...recent, ...baseline];
}

function buildHighStressLogs(): GeneratedLog[] {
  const stress = ["very_high", "very_high", "high", "high", "moderate"];
  return [0, 1, 2, 3, 4].map((n) => ({
    date: daysAgo(n),
    mood: n <= 1 ? "low" : "neutral",
    energy: n <= 1 ? "low" : "moderate",
    sleep: 7.0,
    stress: stress[n]!,
  }));
}

function buildStableNeutralLogs(): GeneratedLog[] {
  return [0, 1, 2, 3, 4, 5, 6].map((n) => ({
    date: daysAgo(n),
    mood: "neutral",
    energy: "moderate",
    sleep: 7.0 + (n % 2) * 0.1,
    stress: "moderate",
  }));
}

function buildMixedLogs(): GeneratedLog[] {
  return [
    { sleep: 4.5, stress: "high", mood: "low", energy: "low" },
    { sleep: 7.0, stress: "low", mood: "good", energy: "high" },
    { sleep: 4.8, stress: "high", mood: "low", energy: "low" },
    { sleep: 7.2, stress: "low", mood: "good", energy: "moderate" },
    { sleep: 5.0, stress: "high", mood: "low", energy: "low" },
  ].map((row, n) => ({ date: daysAgo(n), ...row }));
}

type ProfileKey = "good_all" | "sleep_deprived" | "high_stress" | "stable_neutral" | "mixed";

function logsForProfile(p: ProfileKey): GeneratedLog[] {
  switch (p) {
    case "good_all":
      return buildGoodAllLogs();
    case "sleep_deprived":
      return buildSleepDeprivedLogs();
    case "high_stress":
      return buildHighStressLogs();
    case "stable_neutral":
      return buildStableNeutralLogs();
    case "mixed":
      return buildMixedLogs();
  }
}

function baseUser(overrides: Partial<GeneratedUser> = {}): GeneratedUser {
  return {
    name: "Generated User",
    age: 28,
    height: 165,
    weight: 58,
    cycleLength: 28,
    lastPeriodStart: periodStartForDay(14),
    cycleRegularity: "regular",
    cycleMode: "natural",
    contraceptiveMethod: null,
    ...overrides,
  };
}

function expectForProfile(
  cycleDay: number,
  cycleLength: number,
  profile: ProfileKey,
  mode: "natural" | "hormonal" = "natural",
): TestExpect {
  const phase = expectedPhase(cycleDay, cycleLength, mode);
  const logs = logsForProfile(profile);
  return {
    cycleDay,
    cycleLength,
    phase,
    minLogs: logs.length,
    shouldBeStable: profile === "stable_neutral" && !(cycleDay <= 2),
    shouldDetectSleepDisruption: profile === "sleep_deprived",
    shouldGateGPT: logs.length < 3,
    shouldDetectBleeding: false,
  };
}

const PROFILES: ProfileKey[] = [
  "good_all",
  "sleep_deprived",
  "high_stress",
  "stable_neutral",
  "mixed",
];

function addBleedingIfMenstrual(logs: GeneratedLog[], cycleDay: number): GeneratedLog[] {
  if (cycleDay > 5) return logs;
  const pads = cycleDay <= 2 ? 7 : cycleDay <= 4 ? 4 : 2;
  return logs.map((l, i) => (i === 0 ? { ...l, padsChanged: pads } : l));
}

function buildSystematic(): GeneratedTestCase[] {
  const out: GeneratedTestCase[] = [];
  for (let d = 1; d <= 28; d++) {
    for (const profile of PROFILES) {
      const id = `T_SYS_D${String(d).padStart(2, "0")}_${profile.toUpperCase()}`;
      const logs = addBleedingIfMenstrual(logsForProfile(profile), d);
      const expect = expectForProfile(d, 28, profile, "natural");
      if (d <= 2 && logs[0]?.padsChanged && logs[0].padsChanged >= 7) {
        expect.shouldDetectBleeding = true;
      }
      out.push({
        id,
        description: `Systematic cycle day ${d}, profile ${profile}`,
        user: baseUser({
          lastPeriodStart: periodStartForDay(d),
          cycleLength: 28,
        }),
        logs,
        expect,
      });
    }
  }
  return out;
}

const BOUNDARY_DAYS = [5, 6, 11, 12, 14, 15];
const BOUNDARY_PROFILES: ProfileKey[] = ["good_all", "stable_neutral", "sleep_deprived", "high_stress"];

function buildBoundaryEdges(): GeneratedTestCase[] {
  const out: GeneratedTestCase[] = [];
  let i = 0;
  for (const d of BOUNDARY_DAYS) {
    for (const profile of BOUNDARY_PROFILES) {
      i += 1;
      out.push({
        id: `T_EDGE_BOUND_${String(i).padStart(2, "0")}`,
        description: `Phase boundary day ${d}, ${profile}`,
        user: baseUser({ lastPeriodStart: periodStartForDay(d), cycleLength: 28 }),
        logs: logsForProfile(profile),
        expect: expectForProfile(d, 28, profile, "natural"),
      });
    }
  }
  return out;
}

function buildNewUserEdges(): GeneratedTestCase[] {
  const days = [3, 7, 14, 21, 27, 1, 12, 18, 9, 22, 15, 25];
  const out: GeneratedTestCase[] = [];
  days.forEach((d, idx) => {
    const oneLog = [{ date: daysAgo(0), mood: "neutral", energy: "moderate", sleep: 7, stress: "moderate" }];
    out.push({
      id: `T_EDGE_NEW1_${String(idx + 1).padStart(2, "0")}`,
      description: `New user 1 log, cycle day ${d}`,
      user: baseUser({ lastPeriodStart: periodStartForDay(d) }),
      logs: oneLog,
      expect: {
        cycleDay: d,
        cycleLength: 28,
        phase: expectedPhase(d, 28, "natural"),
        minLogs: 1,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: true,
        shouldDetectBleeding: false,
      },
    });
  });
  return out;
}

function buildBleedingEdges(): GeneratedTestCase[] {
  const out: GeneratedTestCase[] = [];
  const pads = [6, 7, 8, 9, 10, 8];
  const cycleDays = [1, 2, 3, 1, 2, 3];
  pads.forEach((p, idx) => {
    const d = cycleDays[idx]!;
    out.push({
      id: `T_EDGE_BLEED_${String(idx + 1).padStart(2, "0")}`,
      description: `Heavy bleeding pads ${p}, day ${d}`,
      user: baseUser({ lastPeriodStart: periodStartForDay(d) }),
      logs: [
        {
          date: daysAgo(0),
          mood: "low",
          energy: "low",
          sleep: 5.5,
          stress: "moderate",
          padsChanged: p,
        },
        { date: daysAgo(1), mood: "low", energy: "low", sleep: 6, stress: "low" },
        { date: daysAgo(2), mood: "neutral", energy: "moderate", sleep: 6.5, stress: "low" },
      ],
      expect: {
        cycleDay: d,
        cycleLength: 28,
        phase: expectedPhase(d, 28, "natural"),
        minLogs: 3,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: p >= 7,
      },
    });
  });
  return out;
}

function buildDelayedEdges(): GeneratedTestCase[] {
  const out: GeneratedTestCase[] = [];
  const offsets = [35, 40, 32, 45, 50, 38];
  offsets.forEach((rawDaysAgo, idx) => {
    const d = localMidnight();
    d.setDate(d.getDate() - (rawDaysAgo - 1));
    const diffDays = rawDaysAgo - 1;
    const cycleDay = ((diffDays % 28) + 28) % 28 + 1;
    out.push({
      id: `T_EDGE_DELAY_${String(idx + 1).padStart(2, "0")}`,
      description: `Late period raw offset ${rawDaysAgo}d vs cycle 28`,
      user: baseUser({
        lastPeriodStart: d,
        cycleLength: 28,
      }),
      logs: buildGoodAllLogs(),
      expect: {
        cycleDay,
        cycleLength: 28,
        phase: expectedPhase(cycleDay, 28, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
        shouldBePeriodDelayed: true,
      },
    });
  });
  return out;
}

function buildExtremeEdges(): GeneratedTestCase[] {
  const out: GeneratedTestCase[] = [];
  const templates: GeneratedTestCase[] = [
    {
      id: "T_EDGE_EXT_SLEEP2",
      description: "Extreme low sleep 2h",
      user: baseUser({ lastPeriodStart: periodStartForDay(10) }),
      logs: [0, 1, 2, 3, 4].map((n) => ({
        date: daysAgo(n),
        mood: "low",
        energy: "low",
        sleep: 2 + n * 0.3,
        stress: "high",
      })),
      expect: {
        cycleDay: 10,
        cycleLength: 28,
        phase: expectedPhase(10, 28, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
      },
    },
    {
      id: "T_EDGE_EXT_SLEEP10",
      description: "Very high sleep 10h",
      user: baseUser({ lastPeriodStart: periodStartForDay(16) }),
      logs: [0, 1, 2, 3, 4].map((n) => ({
        date: daysAgo(n),
        mood: "good",
        energy: "high",
        sleep: 9.5 + (n % 2) * 0.3,
        stress: "low",
      })),
      expect: {
        cycleDay: 16,
        cycleLength: 28,
        phase: expectedPhase(16, 28, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
      },
    },
    {
      id: "T_EDGE_EXT_VH_STRESS",
      description: "All very_high stress",
      user: baseUser({ lastPeriodStart: periodStartForDay(20) }),
      logs: [0, 1, 2, 3, 4].map((n) => ({
        date: daysAgo(n),
        mood: "very_low",
        energy: "low",
        sleep: 6,
        stress: "very_high",
      })),
      expect: {
        cycleDay: 20,
        cycleLength: 28,
        phase: expectedPhase(20, 28, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
      },
    },
    {
      id: "T_EDGE_EXT_ALL_LOW",
      description: "All low mood energy",
      user: baseUser({ lastPeriodStart: periodStartForDay(26) }),
      logs: [0, 1, 2, 3, 4].map((n) => ({
        date: daysAgo(n),
        mood: "low",
        energy: "low",
        sleep: 5,
        stress: "high",
      })),
      expect: {
        cycleDay: 26,
        cycleLength: 28,
        phase: expectedPhase(26, 28, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
      },
    },
  ];
  out.push(...templates);
  // pad to 8 with two more
  out.push({
    id: "T_EDGE_EXT_FLAT7",
    description: "Seven identical moderate",
    user: baseUser({ lastPeriodStart: periodStartForDay(8) }),
    logs: buildStableNeutralLogs(),
    expect: {
      cycleDay: 8,
      cycleLength: 28,
      phase: expectedPhase(8, 28, "natural"),
      minLogs: 7,
      shouldBeStable: true,
      shouldDetectSleepDisruption: false,
      shouldGateGPT: false,
      shouldDetectBleeding: false,
    },
  });
  out.push({
    id: "T_EDGE_EXT_SPIKE",
    description: "Single day spike then normal",
    user: baseUser({ lastPeriodStart: periodStartForDay(17) }),
    logs: [
      { date: daysAgo(0), mood: "low", energy: "low", sleep: 3, stress: "very_high" },
      { date: daysAgo(1), mood: "neutral", energy: "moderate", sleep: 7, stress: "moderate" },
      { date: daysAgo(2), mood: "neutral", energy: "moderate", sleep: 7, stress: "moderate" },
      { date: daysAgo(3), mood: "good", energy: "moderate", sleep: 7.2, stress: "low" },
      { date: daysAgo(4), mood: "good", energy: "high", sleep: 7, stress: "low" },
    ],
    expect: {
      cycleDay: 17,
      cycleLength: 28,
      phase: expectedPhase(17, 28, "natural"),
      minLogs: 5,
      shouldBeStable: false,
      shouldDetectSleepDisruption: false,
      shouldGateGPT: false,
      shouldDetectBleeding: false,
    },
  });
  out.push({
    id: "T_EDGE_EXT_ZEROVAR",
    description: "Identical logs 5 days",
    user: baseUser({ lastPeriodStart: periodStartForDay(4) }),
    logs: [0, 1, 2, 3, 4].map((n) => ({
      date: daysAgo(n),
      mood: "neutral",
      energy: "moderate",
      sleep: 6.5,
      stress: "moderate",
    })),
    expect: {
      cycleDay: 4,
      cycleLength: 28,
      phase: expectedPhase(4, 28, "natural"),
      minLogs: 5,
      shouldBeStable: false,
      shouldDetectSleepDisruption: false,
      shouldGateGPT: false,
      shouldDetectBleeding: false,
    },
  });
  out.push({
    id: "T_EDGE_EXT_LONGWIN",
    description: "14 days gradual drift",
    user: baseUser({ lastPeriodStart: periodStartForDay(9) }),
    logs: Array.from({ length: 14 }, (_, n) => ({
      date: daysAgo(n),
      mood: n < 5 ? "good" : "neutral",
      energy: "moderate",
      sleep: 7.5 - n * 0.08,
      stress: n < 3 ? "low" : "moderate",
    })),
    expect: {
      cycleDay: 9,
      cycleLength: 28,
      phase: expectedPhase(9, 28, "natural"),
      minLogs: 14,
      shouldBeStable: false,
      shouldDetectSleepDisruption: false,
      shouldGateGPT: false,
      shouldDetectBleeding: false,
    },
  });
  return out;
}

function buildContradictionEdges(): GeneratedTestCase[] {
  return [
    {
      id: "T_EDGE_CONTRA_01",
      description: "Good sleep terrible mood",
      user: baseUser({ lastPeriodStart: periodStartForDay(22) }),
      logs: [0, 1, 2, 3, 4].map((n) => ({
        date: daysAgo(n),
        mood: n <= 2 ? "very_low" : "low",
        energy: "low",
        sleep: 7.5,
        stress: "high",
      })),
      expect: {
        cycleDay: 22,
        cycleLength: 28,
        phase: expectedPhase(22, 28, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
      },
    },
    {
      id: "T_EDGE_CONTRA_02",
      description: "Bad sleep great mood",
      user: baseUser({ lastPeriodStart: periodStartForDay(11) }),
      logs: [0, 1, 2, 3, 4].map((n) => ({
        date: daysAgo(n),
        mood: "good",
        energy: "high",
        sleep: 4 + n * 0.2,
        stress: "low",
      })),
      expect: {
        cycleDay: 11,
        cycleLength: 28,
        phase: expectedPhase(11, 28, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
      },
    },
    {
      id: "T_EDGE_CONTRA_03",
      description: "High energy low mood",
      user: baseUser({ lastPeriodStart: periodStartForDay(13) }),
      logs: [0, 1, 2, 3, 4].map((n) => ({
        date: daysAgo(n),
        mood: "low",
        energy: "high",
        sleep: 7,
        stress: "moderate",
      })),
      expect: {
        cycleDay: 13,
        cycleLength: 28,
        phase: expectedPhase(13, 28, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
      },
    },
    {
      id: "T_EDGE_CONTRA_04",
      description: "Calm stress very low mood",
      user: baseUser({ lastPeriodStart: periodStartForDay(24) }),
      logs: [0, 1, 2, 3, 4].map((n) => ({
        date: daysAgo(n),
        mood: "very_low",
        energy: "low",
        sleep: 7,
        stress: "low",
      })),
      expect: {
        cycleDay: 24,
        cycleLength: 28,
        phase: expectedPhase(24, 28, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
      },
    },
    {
      id: "T_EDGE_CONTRA_05",
      description: "Very high stress good sleep",
      user: baseUser({ lastPeriodStart: periodStartForDay(19) }),
      logs: [0, 1, 2, 3, 4].map((n) => ({
        date: daysAgo(n),
        mood: "neutral",
        energy: "moderate",
        sleep: 8,
        stress: n <= 1 ? "very_high" : "high",
      })),
      expect: {
        cycleDay: 19,
        cycleLength: 28,
        phase: expectedPhase(19, 28, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
      },
    },
    {
      id: "T_EDGE_CONTRA_06",
      description: "Oscillating mood flat sleep stress",
      user: baseUser({ lastPeriodStart: periodStartForDay(7) }),
      logs: [
        { date: daysAgo(0), mood: "good", energy: "moderate", sleep: 7, stress: "moderate" },
        { date: daysAgo(1), mood: "low", energy: "low", sleep: 7, stress: "moderate" },
        { date: daysAgo(2), mood: "good", energy: "high", sleep: 7, stress: "moderate" },
        { date: daysAgo(3), mood: "low", energy: "moderate", sleep: 7, stress: "moderate" },
        { date: daysAgo(4), mood: "neutral", energy: "moderate", sleep: 7, stress: "moderate" },
      ],
      expect: {
        cycleDay: 7,
        cycleLength: 28,
        phase: expectedPhase(7, 28, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
      },
    },
    {
      id: "T_EDGE_CONTRA_07",
      description: "Peak ovulation logs but stressed",
      user: baseUser({ lastPeriodStart: periodStartForDay(14) }),
      logs: [0, 1, 2, 3, 4].map((n) => ({
        date: daysAgo(n),
        mood: "neutral",
        energy: "high",
        sleep: 7,
        stress: n <= 2 ? "very_high" : "high",
      })),
      expect: {
        cycleDay: 14,
        cycleLength: 28,
        phase: expectedPhase(14, 28, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
      },
    },
    {
      id: "T_EDGE_CONTRA_08",
      description: "Menstrual day 2 positive metrics",
      user: baseUser({ lastPeriodStart: periodStartForDay(2) }),
      logs: [0, 1, 2, 3, 4].map((n) => ({
        date: daysAgo(n),
        mood: "good",
        energy: "high",
        sleep: 8,
        stress: "low",
      })),
      expect: {
        cycleDay: 2,
        cycleLength: 28,
        phase: expectedPhase(2, 28, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
      },
    },
  ];
}

function buildVariableLengthEdges(): GeneratedTestCase[] {
  const lengths = [24, 26, 30, 32, 35, 25, 27, 29, 31, 33];
  return lengths.map((len, idx) => {
    const d = Math.min(14, len);
    return {
      id: `T_EDGE_VARLEN_${String(idx + 1).padStart(2, "0")}`,
      description: `Cycle length ${len}, day ${d}`,
      user: baseUser({
        cycleLength: len,
        lastPeriodStart: periodStartForDay(d),
      }),
      logs: buildGoodAllLogs(),
      expect: {
        cycleDay: d,
        cycleLength: len,
        phase: expectedPhase(d, len, "natural"),
        minLogs: 5,
        shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false,
        shouldDetectBleeding: false,
      },
    };
  });
}

function buildHormonalEdges(): GeneratedTestCase[] {
  const days = [1, 3, 8, 12, 20, 25];
  return days.map((d, idx) => ({
    id: `T_EDGE_HORM_${String(idx + 1).padStart(2, "0")}`,
    description: `Hormonal contraception day ${d}`,
    user: baseUser({
      lastPeriodStart: periodStartForDay(d),
      contraceptiveMethod: "pill",
      cycleLength: 28,
    }),
    logs: buildGoodAllLogs(),
    expect: {
      cycleDay: d,
      cycleLength: 28,
      phase: expectedPhase(d, 28, "hormonal"),
      minLogs: 5,
      shouldBeStable: false,
      shouldDetectSleepDisruption: false,
      shouldGateGPT: false,
      shouldDetectBleeding: false,
    },
  }));
}

/** Mulberry32 PRNG */
function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STRESS_LEVELS = ["low", "moderate", "high", "very_high"] as const;
const MOOD_LEVELS = ["very_low", "low", "neutral", "good"] as const;
const ENERGY_LEVELS = ["low", "moderate", "high"] as const;

function buildRandomCases(count: number, seed: number): GeneratedTestCase[] {
  const rand = mulberry32(seed);
  const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
  const out: GeneratedTestCase[] = [];
  for (let i = 0; i < count; i++) {
    const cycleLength = 25 + Math.floor(rand() * 11);
    const cycleDay = 1 + Math.floor(rand() * cycleLength);
    const logCount = 3 + Math.floor(rand() * 12);
    const logs: GeneratedLog[] = [];
    for (let n = 0; n < logCount; n++) {
      logs.push({
        date: daysAgo(n),
        mood: pick(MOOD_LEVELS),
        energy: pick(ENERGY_LEVELS),
        sleep: Math.round((3.5 + rand() * 5) * 10) / 10,
        stress: pick(STRESS_LEVELS),
      });
    }
    const stableLike =
      logCount >= 5 &&
      logs.every(
        (l) =>
          typeof l.sleep === "number" &&
          l.sleep >= 6.35 &&
          l.sleep <= 7.85 &&
          l.stress === "moderate" &&
          l.mood === "neutral",
      );
    out.push({
      id: `T_RND_${String(i + 1).padStart(4, "0")}`,
      description: `Random case ${i + 1} seed ${seed}`,
      user: baseUser({
        lastPeriodStart: periodStartForDay(cycleDay),
        cycleLength,
      }),
      logs,
      expect: {
        cycleDay,
        cycleLength,
        phase: expectedPhase(cycleDay, cycleLength, "natural"),
        minLogs: logCount,
        shouldBeStable: stableLike,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: logCount < 3,
        shouldDetectBleeding: false,
      },
    });
  }
  return out;
}

export function generateAllTestCases(): GeneratedTestCase[] {
  const systematic = buildSystematic();
  const edges = [
    ...buildBoundaryEdges(),
    ...buildNewUserEdges(),
    ...buildBleedingEdges(),
    ...buildDelayedEdges(),
    ...buildExtremeEdges(),
    ...buildContradictionEdges(),
    ...buildVariableLengthEdges(),
    ...buildHormonalEdges(),
  ];
  const random = buildRandomCases(280, 42);
  const all = [...systematic, ...edges, ...random];
  if (all.length !== 500) {
    throw new Error(`Expected 500 cases, got ${all.length} (sys ${systematic.length}, edge ${edges.length}, rnd ${random.length})`);
  }
  return all;
}

function toJSONSerializable(cases: GeneratedTestCase[]): unknown {
  return cases.map((c) => ({
    ...c,
    user: {
      ...c.user,
      lastPeriodStart: c.user.lastPeriodStart.toISOString(),
    },
    logs: c.logs.map((l) => ({ ...l, date: l.date.toISOString() })),
  }));
}

if (require.main === module) {
  const cases = generateAllTestCases();
  const outDir = path.join(process.cwd(), "test-output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "generated-500-cases.json");
  fs.writeFileSync(outPath, JSON.stringify(toJSONSerializable(cases), null, 2));
  console.log(`Wrote ${cases.length} cases to ${outPath}`);
}
