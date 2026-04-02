// tests/units/crossEndpointConsistency.test.ts
// Pure unit tests — NO DB dependency. Verifies cross-engine consistency.

import {
  calculateCycleInfo,
  getCycleMode,
  calculatePhaseFromCycleLength,
  type CycleMode,
  type Phase,
} from "../../src/services/cycleEngine";
import {
  resolveContraceptionType,
  getContraceptionBehavior,
} from "../../src/services/contraceptionengine";
import { periodStartForDay } from "../helpers/factories";

// ─── Group 1: getCycleMode consistency ──────────────────────────────────────

describe("getCycleMode consistency", () => {
  const cases: Array<{
    contraceptiveMethod: string | null;
    cycleRegularity: string;
    expected: CycleMode;
    label: string;
  }> = [
    { contraceptiveMethod: null, cycleRegularity: "regular", expected: "natural", label: "(null, regular) -> natural" },
    { contraceptiveMethod: "pill", cycleRegularity: "regular", expected: "hormonal", label: "(pill, regular) -> hormonal" },
    { contraceptiveMethod: "pill", cycleRegularity: "irregular", expected: "hormonal", label: "(pill, irregular) -> hormonal (hormonal overrides irregular)" },
    { contraceptiveMethod: "iud_copper", cycleRegularity: "regular", expected: "natural", label: "(iud_copper, regular) -> natural" },
    { contraceptiveMethod: "condom", cycleRegularity: "regular", expected: "natural", label: "(condom, regular) -> natural" },
    { contraceptiveMethod: null, cycleRegularity: "irregular", expected: "irregular", label: "(null, irregular) -> irregular" },
    { contraceptiveMethod: "implant", cycleRegularity: "regular", expected: "hormonal", label: "(implant, regular) -> hormonal" },
    { contraceptiveMethod: "iud_hormonal", cycleRegularity: "irregular", expected: "hormonal", label: "(iud_hormonal, irregular) -> hormonal" },
    { contraceptiveMethod: "iud_hormonal", cycleRegularity: "regular", expected: "hormonal", label: "(iud_hormonal, regular) -> hormonal" },
    { contraceptiveMethod: "implant", cycleRegularity: "irregular", expected: "hormonal", label: "(implant, irregular) -> hormonal" },
    { contraceptiveMethod: null, cycleRegularity: "not_sure", expected: "natural", label: "(null, not_sure) -> natural" },
    { contraceptiveMethod: "condom", cycleRegularity: "irregular", expected: "irregular", label: "(condom, irregular) -> irregular" },
  ];

  it.each(cases)("$label", ({ contraceptiveMethod, cycleRegularity, expected }) => {
    const mode = getCycleMode({ contraceptiveMethod, cycleRegularity });
    expect(mode).toBe(expected);
  });

  it("returns the same result on repeated calls (deterministic)", () => {
    for (const c of cases) {
      const user = { contraceptiveMethod: c.contraceptiveMethod, cycleRegularity: c.cycleRegularity };
      const first = getCycleMode(user);
      const second = getCycleMode(user);
      expect(first).toBe(second);
    }
  });
});

// ─── Group 2: Delayed period detection parity ───────────────────────────────

describe("Delayed period detection (pure logic)", () => {
  // This mirrors the inline logic in homeController / calendarController / insightController:
  //   const daysOverdue = Math.max(0, rawDiffDays - effectiveCycleLength);
  //   const isPeriodDelayed = daysOverdue > 0 && confidence !== "irregular" && cycleMode !== "hormonal";
  function detectDelayed(
    rawDiffDays: number,
    effectiveCycleLength: number,
    confidence: string,
    cycleMode: string,
  ): boolean {
    const daysOverdue = Math.max(0, rawDiffDays - effectiveCycleLength);
    return daysOverdue > 0 && confidence !== "irregular" && cycleMode !== "hormonal";
  }

  const delayedCases: Array<{
    rawDiffDays: number;
    effectiveCycleLength: number;
    confidence: string;
    cycleMode: string;
    expected: boolean;
    label: string;
  }> = [
    { rawDiffDays: 35, effectiveCycleLength: 28, confidence: "reliable", cycleMode: "natural", expected: true, label: "day 35 of 28-day cycle, reliable, natural -> delayed" },
    { rawDiffDays: 35, effectiveCycleLength: 28, confidence: "reliable", cycleMode: "hormonal", expected: false, label: "day 35 of 28-day cycle, reliable, hormonal -> NOT delayed" },
    { rawDiffDays: 28, effectiveCycleLength: 28, confidence: "reliable", cycleMode: "natural", expected: false, label: "day 28 of 28-day cycle -> NOT delayed (not overdue yet)" },
    { rawDiffDays: 35, effectiveCycleLength: 28, confidence: "irregular", cycleMode: "natural", expected: false, label: "day 35, irregular confidence -> NOT delayed" },
    { rawDiffDays: 29, effectiveCycleLength: 28, confidence: "reliable", cycleMode: "natural", expected: true, label: "day 29 of 28-day cycle -> delayed by 1" },
    { rawDiffDays: 40, effectiveCycleLength: 30, confidence: "variable", cycleMode: "natural", expected: true, label: "day 40 of 30-day cycle, variable confidence -> delayed" },
    { rawDiffDays: 25, effectiveCycleLength: 28, confidence: "reliable", cycleMode: "natural", expected: false, label: "day 25 of 28-day cycle -> NOT delayed" },
  ];

  it.each(delayedCases)("$label", ({ rawDiffDays, effectiveCycleLength, confidence, cycleMode, expected }) => {
    expect(detectDelayed(rawDiffDays, effectiveCycleLength, confidence, cycleMode)).toBe(expected);
  });
});

// ─── Group 3: Phase + contraception behavior alignment ──────────────────────

describe("Phase + contraception behavior alignment", () => {
  const methods: Array<{ method: string | null; cycleRegularity: string }> = [
    { method: null, cycleRegularity: "regular" },
    { method: "pill", cycleRegularity: "regular" },
    { method: "iud_copper", cycleRegularity: "regular" },
    { method: "iud_hormonal", cycleRegularity: "regular" },
    { method: "implant", cycleRegularity: "regular" },
    { method: "condom", cycleRegularity: "regular" },
  ];

  it.each(methods)(
    "for method=$method: getCycleMode==='hormonal' <=> useNaturalCycleEngine===false",
    ({ method, cycleRegularity }) => {
      const mode = getCycleMode({ contraceptiveMethod: method, cycleRegularity });
      const contraceptionType = resolveContraceptionType(method);
      const behavior = getContraceptionBehavior(contraceptionType);

      if (mode === "hormonal") {
        expect(behavior.useNaturalCycleEngine).toBe(false);
      } else if (mode === "natural") {
        expect(behavior.useNaturalCycleEngine).toBe(true);
      }
      // For "irregular" mode, the contraception engine is independent — no strict alignment required
    },
  );

  it("hormonal methods all suppress natural cycle engine", () => {
    const hormonalMethods = ["pill", "implant", "iud_hormonal"];
    for (const m of hormonalMethods) {
      const type = resolveContraceptionType(m);
      const behavior = getContraceptionBehavior(type);
      expect(behavior.useNaturalCycleEngine).toBe(false);
      expect(behavior.showOvulationPrediction).toBe(false);
    }
  });

  it("non-hormonal methods preserve natural cycle engine", () => {
    const nonHormonalMethods = [null, "condom", "iud_copper"];
    for (const m of nonHormonalMethods) {
      const type = resolveContraceptionType(m);
      const behavior = getContraceptionBehavior(type);
      expect(behavior.useNaturalCycleEngine).toBe(true);
      expect(behavior.showOvulationPrediction).toBe(true);
    }
  });
});

// ─── Group 4: calculateCycleInfo determinism ────────────────────────────────

describe("calculateCycleInfo determinism", () => {
  it("same inputs produce identical outputs", () => {
    const lastPeriodStart = periodStartForDay(14);
    const result1 = calculateCycleInfo(lastPeriodStart, 28, "natural");
    const result2 = calculateCycleInfo(lastPeriodStart, 28, "natural");

    expect(result1.currentDay).toBe(result2.currentDay);
    expect(result1.phase).toBe(result2.phase);
    expect(result1.phaseDay).toBe(result2.phaseDay);
    expect(result1.daysUntilNextPeriod).toBe(result2.daysUntilNextPeriod);
    expect(result1.daysUntilNextPhase).toBe(result2.daysUntilNextPhase);
    expect(result1.cycleMode).toBe(result2.cycleMode);
  });

  it("different cycleMode produces different phase at day ~14", () => {
    const lastPeriodStart = periodStartForDay(14);
    const natural = calculateCycleInfo(lastPeriodStart, 28, "natural");
    const hormonal = calculateCycleInfo(lastPeriodStart, 28, "hormonal");

    // Day 14 for 28-day cycle: natural = ovulation, hormonal = follicular
    expect(natural.currentDay).toBe(14);
    expect(natural.phase).toBe("ovulation");
    expect(hormonal.currentDay).toBe(14);
    expect(hormonal.phase).toBe("follicular");
  });

  it("different cycleLength shifts phase boundaries", () => {
    const lastPeriodStart = periodStartForDay(14);
    const short = calculateCycleInfo(lastPeriodStart, 24, "natural");
    const long = calculateCycleInfo(lastPeriodStart, 35, "natural");

    // With cycleLength=24, lutealStart = max(10, 24-13) = 11, so day 14 is luteal
    // With cycleLength=35, lutealStart = max(10, 35-13) = 22, ovStart = max(6, 22-3) = 19, day 14 is follicular
    expect(short.phase).not.toBe(long.phase);
  });

  it("cycleInfo fields are internally consistent", () => {
    const lastPeriodStart = periodStartForDay(10);
    const info = calculateCycleInfo(lastPeriodStart, 28, "natural");

    expect(info.currentDay).toBe(10);
    expect(info.cycleLength).toBe(28);
    expect(info.cycleMode).toBe("natural");
    // daysUntilNextPeriod = cycleLength - currentDay + 1 = 19
    expect(info.daysUntilNextPeriod).toBe(19);
    expect(info.phase).toBe("follicular");
  });

  it("overdue cycle holds at luteal with increasing currentDay", () => {
    // Day 35 of a 28-day cycle
    const lastPeriodStart = periodStartForDay(35);
    const info = calculateCycleInfo(lastPeriodStart, 28, "natural");

    expect(info.currentDay).toBe(35);
    expect(info.phase).toBe("luteal");
    expect(info.daysUntilNextPeriod).toBe(0);
    expect(info.daysUntilNextPhase).toBe(0);
  });
});

// ─── Group 5: Phase calculation cross-checks ───────────────────────────────

describe("calculatePhaseFromCycleLength cross-checks", () => {
  it("day 1 is always menstrual regardless of mode", () => {
    expect(calculatePhaseFromCycleLength(1, 28, "natural")).toBe("menstrual");
    expect(calculatePhaseFromCycleLength(1, 28, "hormonal")).toBe("menstrual");
    expect(calculatePhaseFromCycleLength(1, 28, "irregular")).toBe("menstrual");
  });

  it("day 5 is always menstrual regardless of mode", () => {
    expect(calculatePhaseFromCycleLength(5, 28, "natural")).toBe("menstrual");
    expect(calculatePhaseFromCycleLength(5, 28, "hormonal")).toBe("menstrual");
  });

  it("hormonal mode only produces menstrual or follicular", () => {
    for (let day = 1; day <= 28; day++) {
      const phase = calculatePhaseFromCycleLength(day, 28, "hormonal");
      expect(["menstrual", "follicular"]).toContain(phase);
    }
  });

  it("natural mode progresses through all four phases", () => {
    const phases = new Set<Phase>();
    for (let day = 1; day <= 28; day++) {
      phases.add(calculatePhaseFromCycleLength(day, 28, "natural"));
    }
    expect(phases).toEqual(new Set(["menstrual", "follicular", "ovulation", "luteal"]));
  });

  it("phase transitions are monotonic (no backward jumps)", () => {
    const phaseOrder: Phase[] = ["menstrual", "follicular", "ovulation", "luteal"];
    let lastIndex = 0;
    for (let day = 1; day <= 28; day++) {
      const phase = calculatePhaseFromCycleLength(day, 28, "natural");
      const idx = phaseOrder.indexOf(phase);
      expect(idx).toBeGreaterThanOrEqual(lastIndex);
      lastIndex = idx;
    }
  });
});
