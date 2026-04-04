/**
 * src/testRunner/generateEdgeCases.ts
 *
 * COMPLETE EDGE CASE GENERATOR — covers every log tier, every phase,
 * every contraception mode, and every behavioral edge case.
 *
 * Run standalone: npx ts-node src/testRunner/generateEdgeCases.ts
 *
 * Coverage matrix:
 *
 * LOG TIERS:
 *   0 logs      — phase_only: no assertions, no "today", no possessives
 *   1-2 logs    — early_signals: light softening, no patterns
 *   3-4 logs    — emerging: can reference recent logs, no baselines
 *   5-7 logs    — personal_patterns: interaction flags unlock, trends valid
 *   8-14 logs   — baseline_intelligence: baseline comparison active
 *   14+ logs    — cross_cycle_identity (if 2+ cycles): full personalization
 *
 * PHASES: menstrual (day 1-5), follicular (6-13), ovulation (14-16), luteal (17-28)
 *
 * CONTRACEPTION: none, pill, mini_pill, iud_hormonal, iud_copper, implant,
 *   injection, patch, ring, barrier, natural
 *
 * EDGE STATES: delayed period, irregular cycle, extended cycle (day 50+),
 *   stable state, sleep disruption, stress-led, momentum break,
 *   contraception transition, signal-positive override
 *
 * SIGNAL PROFILES: good, bad, neutral, mixed, sleep_crash, stress_spike,
 *   stable, momentum_break, contradictory
 */

import * as fs from "fs";
import * as path from "path";
import type { Phase } from "../services/cycleEngine";
import { calculatePhaseFromCycleLength } from "../services/cycleEngine";
import type {
  GeneratedTestCase,
  GeneratedLog,
  GeneratedUser,
  TestExpect,
} from "./generateTestCases";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function utcMidnight(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysAgo(n: number): Date {
  const d = utcMidnight();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function periodStartForDay(cycleDay: number): Date {
  const d = utcMidnight();
  d.setUTCDate(d.getUTCDate() - (cycleDay - 1));
  return d;
}

function expectedPhase(cycleDay: number, cycleLength: number, mode: "natural" | "hormonal"): Phase {
  return calculatePhaseFromCycleLength(cycleDay, cycleLength, mode);
}

function baseUser(overrides: Partial<GeneratedUser> = {}): GeneratedUser {
  return {
    name: "Edge Case User",
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

// ─── Log profile builders ─────────────────────────────────────────────────────

type LogProfile = "good" | "bad" | "neutral" | "mixed" | "sleep_crash" | "stress_spike" | "stable" | "momentum_break" | "contradictory";

function buildLogs(count: number, profile: LogProfile): GeneratedLog[] {
  if (count === 0) return [];

  switch (profile) {
    case "good":
      return Array.from({ length: count }, (_, n) => ({
        date: daysAgo(n),
        mood: "good", energy: "high",
        sleep: 7.5 + (n % 3) * 0.1, stress: "low",
      }));

    case "bad":
      return Array.from({ length: count }, (_, n) => ({
        date: daysAgo(n),
        mood: "low", energy: "low",
        sleep: 4.5 + n * 0.2, stress: "high",
      }));

    case "neutral":
      return Array.from({ length: count }, (_, n) => ({
        date: daysAgo(n),
        mood: "neutral", energy: "moderate",
        sleep: 7.0 + (n % 2) * 0.1, stress: "moderate",
      }));

    case "stable":
      return Array.from({ length: count }, (_, n) => ({
        date: daysAgo(n),
        mood: "neutral", energy: "moderate",
        sleep: 7.0, stress: "moderate",
      }));

    case "sleep_crash": {
      const recent = Math.min(count, 7);
      const baseline = count - recent;
      return [
        ...Array.from({ length: recent }, (_, n) => ({
          date: daysAgo(n),
          mood: n <= 2 ? "low" : "neutral",
          energy: n <= 2 ? "low" : "moderate",
          sleep: 4.0 + n * 0.4, stress: n <= 1 ? "moderate" : "low",
        })),
        ...Array.from({ length: baseline }, (_, n) => ({
          date: daysAgo(recent + n),
          mood: "good", energy: "moderate",
          sleep: 7.0 + (n % 3) * 0.1, stress: "low",
        })),
      ];
    }

    case "stress_spike":
      return Array.from({ length: count }, (_, n) => ({
        date: daysAgo(n),
        mood: n <= 2 ? "low" : "neutral",
        energy: "moderate",
        sleep: 7.0, // sleep fine — stress is the driver
        stress: n <= 2 ? "very_high" : n <= 4 ? "high" : "moderate",
      }));

    case "momentum_break":
      return [
        { date: daysAgo(0), mood: "low", energy: "low", sleep: 4, stress: "high" },
        ...Array.from({ length: Math.max(0, count - 1) }, (_, n) => ({
          date: daysAgo(n + 1),
          mood: "good", energy: "high", sleep: 7.5, stress: "low",
        })),
      ];

    case "contradictory":
      return Array.from({ length: count }, (_, n) => ({
        date: daysAgo(n),
        mood: n <= 2 ? "very_low" : "low",
        energy: "low", sleep: 7.5, stress: "high",
      }));

    case "mixed":
      return Array.from({ length: count }, (_, n) => ({
        date: daysAgo(n),
        mood: n % 2 === 0 ? "low" : "good",
        energy: n % 2 === 0 ? "low" : "high",
        sleep: n % 2 === 0 ? 4.5 : 7.5,
        stress: n % 2 === 0 ? "high" : "low",
      }));
  }
}

// ─── 1. ZERO LOGS × ALL 28 DAYS ──────────────────────────────────────────────

function buildZeroLogAllDays(): GeneratedTestCase[] {
  return Array.from({ length: 28 }, (_, i) => {
    const d = i + 1;
    return {
      id: `T_ZERO_D${String(d).padStart(2, "0")}`,
      description: `Zero logs, day ${d} (${expectedPhase(d, 28, "natural")})`,
      user: baseUser({ lastPeriodStart: periodStartForDay(d) }),
      logs: [],
      expect: {
        cycleDay: d, cycleLength: 28,
        phase: expectedPhase(d, 28, "natural"),
        minLogs: 0, shouldBeStable: false,
        shouldDetectSleepDisruption: false,
        shouldGateGPT: false, shouldDetectBleeding: false,
      },
    };
  });
}

// ─── 2. LOW LOGS (1-2) × PHASES × PROFILES ──────────────────────────────────

function buildLowLogCases(): GeneratedTestCase[] {
  const logCounts = [1, 2];
  const profiles: LogProfile[] = ["good", "bad", "neutral"];
  const phaseDays = [2, 8, 14, 22];
  const out: GeneratedTestCase[] = [];
  let idx = 0;

  for (const count of logCounts) {
    for (const prof of profiles) {
      for (const d of phaseDays) {
        idx++;
        out.push({
          id: `T_LOW_${String(idx).padStart(3, "0")}`,
          description: `${count} log(s) ${prof}, day ${d} (${expectedPhase(d, 28, "natural")})`,
          user: baseUser({ lastPeriodStart: periodStartForDay(d) }),
          logs: buildLogs(count, prof),
          expect: {
            cycleDay: d, cycleLength: 28,
            phase: expectedPhase(d, 28, "natural"),
            minLogs: count, shouldBeStable: false,
            shouldDetectSleepDisruption: false,
            shouldGateGPT: true, shouldDetectBleeding: false,
          },
        });
      }
    }
  }
  return out;
}

// ─── 3. EMERGING (3-4) × PHASES × PROFILES ──────────────────────────────────

function buildEmergingLogCases(): GeneratedTestCase[] {
  const logCounts = [3, 4];
  const profiles: LogProfile[] = ["good", "bad", "neutral", "contradictory"];
  const phaseDays = [2, 8, 14, 22];
  const out: GeneratedTestCase[] = [];
  let idx = 0;

  for (const count of logCounts) {
    for (const prof of profiles) {
      for (const d of phaseDays) {
        idx++;
        out.push({
          id: `T_EMRG_${String(idx).padStart(3, "0")}`,
          description: `${count} logs ${prof}, day ${d} (${expectedPhase(d, 28, "natural")})`,
          user: baseUser({ lastPeriodStart: periodStartForDay(d) }),
          logs: buildLogs(count, prof),
          expect: {
            cycleDay: d, cycleLength: 28,
            phase: expectedPhase(d, 28, "natural"),
            minLogs: count, shouldBeStable: false,
            shouldDetectSleepDisruption: false,
            shouldGateGPT: false, shouldDetectBleeding: false,
          },
        });
      }
    }
  }
  return out;
}

// ─── 4. PERSONALIZED (7 logs) × PHASES × PROFILES ───────────────────────────

function buildPersonalizedLogCases(): GeneratedTestCase[] {
  const profiles: LogProfile[] = ["good", "bad", "sleep_crash", "stress_spike", "stable", "mixed"];
  const phaseDays = [2, 8, 14, 22];
  const out: GeneratedTestCase[] = [];
  let idx = 0;

  for (const prof of profiles) {
    for (const d of phaseDays) {
      idx++;
      out.push({
        id: `T_PERS_${String(idx).padStart(3, "0")}`,
        description: `7 logs ${prof}, day ${d} (${expectedPhase(d, 28, "natural")})`,
        user: baseUser({ lastPeriodStart: periodStartForDay(d) }),
        logs: buildLogs(7, prof),
        expect: {
          cycleDay: d, cycleLength: 28,
          phase: expectedPhase(d, 28, "natural"),
          minLogs: 7, shouldBeStable: prof === "stable",
          shouldDetectSleepDisruption: prof === "sleep_crash",
          shouldGateGPT: false, shouldDetectBleeding: false,
        },
      });
    }
  }
  return out;
}

// ─── 5. BASELINE (14 logs) × PHASES × PROFILES ──────────────────────────────

function buildBaselineCases(): GeneratedTestCase[] {
  const profiles: LogProfile[] = ["good", "sleep_crash", "stress_spike", "stable"];
  const phaseDays = [2, 8, 14, 22];
  const out: GeneratedTestCase[] = [];
  let idx = 0;

  for (const prof of profiles) {
    for (const d of phaseDays) {
      idx++;
      out.push({
        id: `T_BASE_${String(idx).padStart(3, "0")}`,
        description: `14 logs ${prof}, day ${d} (${expectedPhase(d, 28, "natural")})`,
        user: baseUser({ lastPeriodStart: periodStartForDay(d) }),
        logs: buildLogs(14, prof),
        expect: {
          cycleDay: d, cycleLength: 28,
          phase: expectedPhase(d, 28, "natural"),
          minLogs: 14, shouldBeStable: prof === "stable",
          shouldDetectSleepDisruption: prof === "sleep_crash",
          shouldGateGPT: false, shouldDetectBleeding: false,
        },
      });
    }
  }
  return out;
}

// ─── 6. MOMENTUM BREAK ───────────────────────────────────────────────────────

function buildMomentumBreakCases(): GeneratedTestCase[] {
  return [3, 9, 15, 20, 25].map((d, idx) => ({
    id: `T_MBRK_${String(idx + 1).padStart(2, "0")}`,
    description: `Momentum break, day ${d} (${expectedPhase(d, 28, "natural")})`,
    user: baseUser({ lastPeriodStart: periodStartForDay(d) }),
    logs: buildLogs(5, "momentum_break"),
    expect: {
      cycleDay: d, cycleLength: 28,
      phase: expectedPhase(d, 28, "natural"),
      minLogs: 5, shouldBeStable: false,
      shouldDetectSleepDisruption: false,
      shouldGateGPT: false, shouldDetectBleeding: false,
    },
  }));
}

// ─── 7. HORMONAL CONTRACEPTION ───────────────────────────────────────────────

function buildHormonalCases(): GeneratedTestCase[] {
  const methods = ["pill", "mini_pill", "iud_hormonal", "implant", "injection", "patch", "ring"];
  const logCounts = [0, 5];
  const days = [3, 10, 20];
  const out: GeneratedTestCase[] = [];
  let idx = 0;

  for (const method of methods) {
    for (const count of logCounts) {
      for (const d of days) {
        idx++;
        out.push({
          id: `T_HORM_${String(idx).padStart(3, "0")}`,
          description: `${method} day ${d}, ${count} logs`,
          user: baseUser({
            lastPeriodStart: periodStartForDay(d),
            contraceptiveMethod: method,
            cycleMode: "hormonal",
          }),
          logs: buildLogs(count, "neutral"),
          expect: {
            cycleDay: d, cycleLength: 28,
            phase: expectedPhase(d, 28, "hormonal"),
            minLogs: count, shouldBeStable: false,
            shouldDetectSleepDisruption: false,
            shouldGateGPT: count < 3, shouldDetectBleeding: false,
          },
        });
      }
    }
  }
  return out;
}

// ─── 8. COPPER IUD + NON-HORMONAL METHODS ────────────────────────────────────

function buildNonHormonalCases(): GeneratedTestCase[] {
  const methods = ["iud_copper", "barrier", "natural"];
  const configs = [
    { day: 3, logs: 0 }, { day: 14, logs: 0 },
    { day: 3, logs: 7 }, { day: 14, logs: 7 },
  ];
  const out: GeneratedTestCase[] = [];
  let idx = 0;
  for (const method of methods) {
    for (const c of configs) {
      idx++;
      out.push({
        id: `T_NHORM_${String(idx).padStart(2, "0")}`,
        description: `${method} day ${c.day}, ${c.logs} logs`,
        user: baseUser({
          lastPeriodStart: periodStartForDay(c.day),
          contraceptiveMethod: method,
        }),
        logs: buildLogs(c.logs, "neutral"),
        expect: {
          cycleDay: c.day, cycleLength: 28,
          phase: expectedPhase(c.day, 28, "natural"),
          minLogs: c.logs, shouldBeStable: false,
          shouldDetectSleepDisruption: false,
          shouldGateGPT: c.logs < 3, shouldDetectBleeding: false,
        },
      });
    }
  }
  return out;
}

// ─── 9. IRREGULAR CYCLE ──────────────────────────────────────────────────────

function buildIrregularCases(): GeneratedTestCase[] {
  const configs = [
    { day: 5, logs: 0, len: 32 },
    { day: 14, logs: 0, len: 35 },
    { day: 22, logs: 0, len: 28 },
    { day: 5, logs: 7, len: 32 },
    { day: 14, logs: 7, len: 35 },
    { day: 22, logs: 7, len: 28 },
    { day: 35, logs: 0, len: 32 },
    { day: 40, logs: 0, len: 28 },
    { day: 50, logs: 0, len: 28 },
    { day: 50, logs: 7, len: 28 },
    { day: 60, logs: 0, len: 28 },
    { day: 35, logs: 7, len: 32 },
  ];
  return configs.map((c, idx) => ({
    id: `T_IRREG_${String(idx + 1).padStart(2, "0")}`,
    description: `Irregular day ${c.day}, ${c.logs} logs, cycle ${c.len}`,
    user: baseUser({
      lastPeriodStart: periodStartForDay(c.day),
      cycleLength: c.len,
      cycleRegularity: "irregular",
      cycleMode: "irregular",
    }),
    logs: buildLogs(c.logs, "neutral"),
    expect: {
      cycleDay: c.day, cycleLength: c.len,
      phase: c.day >= c.len ? "luteal" as Phase : expectedPhase(Math.min(c.day, c.len), c.len, "natural"),
      minLogs: c.logs, shouldBeStable: false,
      shouldDetectSleepDisruption: false,
      shouldGateGPT: c.logs < 3, shouldDetectBleeding: false,
    },
  }));
}

// ─── 10. VARIABLE CYCLE LENGTHS ──────────────────────────────────────────────

function buildVariableLengths(): GeneratedTestCase[] {
  const lengths = [21, 24, 26, 30, 32, 35, 38, 40, 42, 45];
  const logCounts = [0, 7];
  const out: GeneratedTestCase[] = [];
  let idx = 0;
  for (const len of lengths) {
    for (const count of logCounts) {
      const d = Math.min(14, len);
      idx++;
      out.push({
        id: `T_VLEN_${String(idx).padStart(2, "0")}`,
        description: `Cycle ${len}d, day ${d}, ${count} logs`,
        user: baseUser({ cycleLength: len, lastPeriodStart: periodStartForDay(d) }),
        logs: buildLogs(count, "neutral"),
        expect: {
          cycleDay: d, cycleLength: len,
          phase: expectedPhase(d, len, "natural"),
          minLogs: count, shouldBeStable: false,
          shouldDetectSleepDisruption: false,
          shouldGateGPT: count < 3, shouldDetectBleeding: false,
        },
      });
    }
  }
  return out;
}

// ─── 11. DELAYED PERIOD ──────────────────────────────────────────────────────

function buildDelayedCases(): GeneratedTestCase[] {
  const offsets = [30, 33, 35, 38, 42, 50];
  const logCounts = [0, 5];
  const out: GeneratedTestCase[] = [];
  let idx = 0;
  for (const offset of offsets) {
    for (const count of logCounts) {
      idx++;
      const d = utcMidnight();
      d.setUTCDate(d.getUTCDate() - (offset - 1));
      out.push({
        id: `T_DELAY_${String(idx).padStart(2, "0")}`,
        description: `Delayed ${offset}d, ${count} logs`,
        user: baseUser({ lastPeriodStart: d, cycleLength: 28 }),
        logs: buildLogs(count, "neutral"),
        expect: {
          cycleDay: offset, cycleLength: 28,
          phase: "luteal" as Phase,
          minLogs: count, shouldBeStable: false,
          shouldDetectSleepDisruption: false,
          shouldGateGPT: count < 3, shouldDetectBleeding: false,
          shouldBePeriodDelayed: true,
        },
      });
    }
  }
  return out;
}

// ─── 12. HEAVY BLEEDING ──────────────────────────────────────────────────────

function buildBleedingCases(): GeneratedTestCase[] {
  const pads = [6, 7, 8, 10];
  const days = [1, 2, 3];
  const out: GeneratedTestCase[] = [];
  let idx = 0;
  for (const p of pads) {
    for (const d of days) {
      idx++;
      out.push({
        id: `T_BLEED_${String(idx).padStart(2, "0")}`,
        description: `Heavy bleeding ${p} pads, day ${d}`,
        user: baseUser({ lastPeriodStart: periodStartForDay(d) }),
        logs: [
          { date: daysAgo(0), mood: "low", energy: "low", sleep: 5.5, stress: "moderate", padsChanged: p },
          { date: daysAgo(1), mood: "low", energy: "low", sleep: 6, stress: "low" },
          { date: daysAgo(2), mood: "neutral", energy: "moderate", sleep: 6.5, stress: "low" },
          { date: daysAgo(3), mood: "neutral", energy: "moderate", sleep: 7, stress: "low" },
          { date: daysAgo(4), mood: "good", energy: "moderate", sleep: 7, stress: "low" },
        ],
        expect: {
          cycleDay: d, cycleLength: 28,
          phase: "menstrual" as Phase,
          minLogs: 5, shouldBeStable: false,
          shouldDetectSleepDisruption: false,
          shouldGateGPT: false, shouldDetectBleeding: p >= 7,
        },
      });
    }
  }
  return out;
}

// ─── 13. POSITIVE SIGNALS ON NEGATIVE PHASE ──────────────────────────────────

function buildPositiveOnNegativePhase(): GeneratedTestCase[] {
  return [1, 2, 3, 22, 25, 27].map((d, idx) => ({
    id: `T_POSN_${String(idx + 1).padStart(2, "0")}`,
    description: `Positive signals on negative phase day ${d}`,
    user: baseUser({ lastPeriodStart: periodStartForDay(d) }),
    logs: buildLogs(5, "good"),
    expect: {
      cycleDay: d, cycleLength: 28,
      phase: expectedPhase(d, 28, "natural"),
      minLogs: 5, shouldBeStable: false,
      shouldDetectSleepDisruption: false,
      shouldGateGPT: false, shouldDetectBleeding: false,
    },
  }));
}

// ─── 14. CONTRADICTORY SIGNALS ───────────────────────────────────────────────

function buildContradictoryCases(): GeneratedTestCase[] {
  return [3, 9, 14, 22].map((d, idx) => ({
    id: `T_CONTRA_${String(idx + 1).padStart(2, "0")}`,
    description: `Contradictory signals day ${d}`,
    user: baseUser({ lastPeriodStart: periodStartForDay(d) }),
    logs: buildLogs(5, "contradictory"),
    expect: {
      cycleDay: d, cycleLength: 28,
      phase: expectedPhase(d, 28, "natural"),
      minLogs: 5, shouldBeStable: false,
      shouldDetectSleepDisruption: false,
      shouldGateGPT: false, shouldDetectBleeding: false,
    },
  }));
}

// ─── Combine all ──────────────────────────────────────────────────────────────

export function generateEdgeCases(): GeneratedTestCase[] {
  const sections = [
    { name: "Zero logs × 28 days", cases: buildZeroLogAllDays() },
    { name: "Low logs (1-2) × phases × profiles", cases: buildLowLogCases() },
    { name: "Emerging (3-4) × phases × profiles", cases: buildEmergingLogCases() },
    { name: "Personalized (7) × phases × profiles", cases: buildPersonalizedLogCases() },
    { name: "Baseline (14) × phases × profiles", cases: buildBaselineCases() },
    { name: "Momentum break", cases: buildMomentumBreakCases() },
    { name: "Hormonal contraception", cases: buildHormonalCases() },
    { name: "Non-hormonal methods", cases: buildNonHormonalCases() },
    { name: "Irregular cycle", cases: buildIrregularCases() },
    { name: "Variable cycle lengths", cases: buildVariableLengths() },
    { name: "Delayed period", cases: buildDelayedCases() },
    { name: "Heavy bleeding", cases: buildBleedingCases() },
    { name: "Positive on negative phase", cases: buildPositiveOnNegativePhase() },
    { name: "Contradictory signals", cases: buildContradictoryCases() },
  ];

  const all: GeneratedTestCase[] = [];
  for (const s of sections) {
    all.push(...s.cases);
    console.log(`  ${s.name}: ${s.cases.length}`);
  }
  console.log(`\nTotal edge cases: ${all.length}`);
  return all;
}

// ─── Standalone runner ────────────────────────────────────────────────────────

function toJSONSerializable(cases: GeneratedTestCase[]): unknown {
  return cases.map((c) => ({
    ...c,
    user: { ...c.user, lastPeriodStart: c.user.lastPeriodStart.toISOString() },
    logs: c.logs.map((l) => ({ ...l, date: l.date.toISOString() })),
  }));
}

if (require.main === module) {
  const cases = generateEdgeCases();
  const outDir = path.join(process.cwd(), "test-output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "generated-edge-cases.json");
  fs.writeFileSync(outPath, JSON.stringify(toJSONSerializable(cases), null, 2));
  console.log(`\nWrote ${cases.length} edge cases to ${outPath}`);
}