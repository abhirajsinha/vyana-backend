// tests/unit/cycleEngine.test.ts
// Pure function tests — no DB, no network.

import {
    calculatePhaseFromCycleLength,
    calculateCycleInfo,
    calculateCycleInfoForDate,
    getCycleMode,
    getDaysUntilNextPhase,
    detectCycleIrregularity,
    utcDayDiff,
    toUTCDateOnly,
    type Phase,
    type CycleMode,
  } from "../../src/services/cycleEngine";
  
  // ─── Helper ───────────────────────────────────────────────────────────────────
  
  function periodStartForDay(cycleDay: number): Date {
    const now = new Date();
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - (cycleDay - 1));
    return d;
  }
  
  // ─── Phase calculation ────────────────────────────────────────────────────────
  
  describe("calculatePhaseFromCycleLength", () => {
    describe("28-day cycle (natural)", () => {
      const len = 28;
      const mode: CycleMode = "natural";
  
      it("days 1–5 are menstrual", () => {
        for (let d = 1; d <= 5; d++) {
          expect(calculatePhaseFromCycleLength(d, len, mode)).toBe("menstrual");
        }
      });
  
      it("days 6–11 are follicular", () => {
        for (let d = 6; d <= 11; d++) {
          expect(calculatePhaseFromCycleLength(d, len, mode)).toBe("follicular");
        }
      });
  
      it("days 12–14 are ovulation", () => {
        for (let d = 12; d <= 14; d++) {
          expect(calculatePhaseFromCycleLength(d, len, mode)).toBe("ovulation");
        }
      });
  
      it("days 15–28 are luteal", () => {
        for (let d = 15; d <= 28; d++) {
          expect(calculatePhaseFromCycleLength(d, len, mode)).toBe("luteal");
        }
      });
    });
  
    describe("variable cycle lengths", () => {
      const lengths = [21, 24, 26, 28, 30, 32, 35, 40, 45];
  
      for (const len of lengths) {
        it(`cycle length ${len}: day 1 is always menstrual`, () => {
          expect(calculatePhaseFromCycleLength(1, len, "natural")).toBe("menstrual");
        });
  
        it(`cycle length ${len}: day 5 is always menstrual`, () => {
          expect(calculatePhaseFromCycleLength(5, len, "natural")).toBe("menstrual");
        });
  
        it(`cycle length ${len}: day 6 is follicular`, () => {
          expect(calculatePhaseFromCycleLength(6, len, "natural")).toBe("follicular");
        });
  
        it(`cycle length ${len}: last day is luteal`, () => {
          expect(calculatePhaseFromCycleLength(len, len, "natural")).toBe("luteal");
        });
  
        it(`cycle length ${len}: luteal phase is ~13 days`, () => {
          const lutealStart = Math.max(10, len - 13);
          expect(calculatePhaseFromCycleLength(lutealStart, len, "natural")).toBe("luteal");
          expect(calculatePhaseFromCycleLength(lutealStart - 1, len, "natural")).not.toBe("luteal");
        });
      }
    });
  
    describe("hormonal mode", () => {
      it("days 1–5 are menstrual", () => {
        for (let d = 1; d <= 5; d++) {
          expect(calculatePhaseFromCycleLength(d, 28, "hormonal")).toBe("menstrual");
        }
      });
  
      it("days 6+ are all follicular", () => {
        for (let d = 6; d <= 28; d++) {
          expect(calculatePhaseFromCycleLength(d, 28, "hormonal")).toBe("follicular");
        }
      });
  
      it("no ovulation or luteal phase exists", () => {
        for (let d = 1; d <= 28; d++) {
          const phase = calculatePhaseFromCycleLength(d, 28, "hormonal");
          expect(phase).not.toBe("ovulation");
          expect(phase).not.toBe("luteal");
        }
      });
    });
  });
  
  // ─── Phase boundaries scale correctly ─────────────────────────────────────────
  
  describe("phase boundary scaling", () => {
    it("short cycle (21 days): ovulation starts at day 6 minimum", () => {
      const phase = calculatePhaseFromCycleLength(6, 21, "natural");
      // With cycleLength 21: lutealStart = max(10, 21-13) = 10, ovStart = max(6, 10-3) = 7
      // Day 6 should be follicular
      expect(phase).toBe("follicular");
    });
  
    it("long cycle (45 days): luteal starts at day 32", () => {
      // lutealStart = max(10, 45-13) = 32
      expect(calculatePhaseFromCycleLength(32, 45, "natural")).toBe("luteal");
      expect(calculatePhaseFromCycleLength(31, 45, "natural")).not.toBe("luteal");
    });
  
    it("every cycle length has all 4 phases in natural mode", () => {
      for (let len = 21; len <= 45; len++) {
        const phases = new Set<Phase>();
        for (let d = 1; d <= len; d++) {
          phases.add(calculatePhaseFromCycleLength(d, len, "natural"));
        }
        expect(phases.has("menstrual")).toBe(true);
        expect(phases.has("follicular")).toBe(true);
        expect(phases.has("ovulation")).toBe(true);
        expect(phases.has("luteal")).toBe(true);
      }
    });
  });
  
  // ─── UTC day diff ─────────────────────────────────────────────────────────────
  
  describe("utcDayDiff", () => {
    it("same day returns 0", () => {
      const d = new Date("2025-03-15T12:00:00Z");
      expect(utcDayDiff(d, d)).toBe(0);
    });
  
    it("one day apart returns 1", () => {
      const a = new Date("2025-03-16T00:00:00Z");
      const b = new Date("2025-03-15T00:00:00Z");
      expect(utcDayDiff(a, b)).toBe(1);
    });
  
    it("ignores time component", () => {
      const a = new Date("2025-03-16T23:59:59Z");
      const b = new Date("2025-03-15T00:01:00Z");
      expect(utcDayDiff(a, b)).toBe(1);
    });
  
    it("negative when a is before b", () => {
      const a = new Date("2025-03-10T00:00:00Z");
      const b = new Date("2025-03-15T00:00:00Z");
      expect(utcDayDiff(a, b)).toBe(-5);
    });
  });
  
  // ─── calculateCycleInfo ───────────────────────────────────────────────────────
  
  describe("calculateCycleInfo", () => {
    it("returns correct cycle day", () => {
      const info = calculateCycleInfo(periodStartForDay(14), 28, "natural");
      expect(info.currentDay).toBe(14);
    });
  
    it("daysUntilNextPeriod = cycleLength - currentDay + 1", () => {
      const info = calculateCycleInfo(periodStartForDay(20), 28, "natural");
      expect(info.daysUntilNextPeriod).toBe(28 - 20 + 1);
    });
  
    it("cycleDay never exceeds cycleLength for dates within one cycle", () => {
      for (let d = 1; d <= 28; d++) {
        const info = calculateCycleInfo(periodStartForDay(d), 28, "natural");
        expect(info.currentDay).toBeGreaterThanOrEqual(1);
        expect(info.currentDay).toBeLessThanOrEqual(28);
      }
    });
  
    it("wraps correctly for dates beyond one cycle", () => {
      // 35 days since period start, 28-day cycle → day 7
      const lastPeriod = new Date();
      lastPeriod.setDate(lastPeriod.getDate() - 34); // 35 days ago (day 35)
      const info = calculateCycleInfo(lastPeriod, 28, "natural");
      expect(info.currentDay).toBe(7); // (34 % 28) + 1 = 7
    });
  });
  
  // ─── getCycleMode ─────────────────────────────────────────────────────────────
  
  describe("getCycleMode", () => {
    it("returns hormonal for pill users", () => {
      expect(getCycleMode({ contraceptiveMethod: "pill", cycleRegularity: "regular" })).toBe("hormonal");
    });
  
    it("returns hormonal for iud_hormonal", () => {
      expect(getCycleMode({ contraceptiveMethod: "iud_hormonal", cycleRegularity: "regular" })).toBe("hormonal");
    });
  
    it("returns hormonal for implant", () => {
      expect(getCycleMode({ contraceptiveMethod: "implant", cycleRegularity: "regular" })).toBe("hormonal");
    });
  
    it("returns hormonal for injection", () => {
      expect(getCycleMode({ contraceptiveMethod: "injection", cycleRegularity: "regular" })).toBe("hormonal");
    });
  
    it("returns natural for no contraception", () => {
      expect(getCycleMode({ contraceptiveMethod: null, cycleRegularity: "regular" })).toBe("natural");
    });
  
    it("returns natural for condom/barrier", () => {
      expect(getCycleMode({ contraceptiveMethod: "condom", cycleRegularity: "regular" })).toBe("natural");
    });
  
    it("returns natural for iud_copper", () => {
      expect(getCycleMode({ contraceptiveMethod: "iud_copper", cycleRegularity: "regular" })).toBe("natural");
    });
  
    it("returns irregular for irregular regularity", () => {
      expect(getCycleMode({ contraceptiveMethod: null, cycleRegularity: "irregular" })).toBe("irregular");
    });
  
    it("hormonal overrides irregular", () => {
      expect(getCycleMode({ contraceptiveMethod: "pill", cycleRegularity: "irregular" })).toBe("hormonal");
    });
  });
  
  // ─── Cycle irregularity detection ─────────────────────────────────────────────
  
  describe("detectCycleIrregularity", () => {
    it("single cycle: not irregular, unknown confidence", () => {
      const result = detectCycleIrregularity([28]);
      expect(result.isIrregular).toBe(false);
      expect(result.confidence).toBe("unknown");
    });
  
    it("consistent cycles: reliable", () => {
      const result = detectCycleIrregularity([28, 27, 28, 29, 28]);
      expect(result.isIrregular).toBe(false);
      expect(result.confidence).toBe("reliable");
    });
  
    it("variable cycles (8-day spread): variable confidence", () => {
      const result = detectCycleIrregularity([25, 28, 33, 27, 30]);
      expect(result.confidence).toBe("variable");
    });
  
    it("very irregular (15+ day spread): irregular confidence", () => {
      const result = detectCycleIrregularity([22, 37, 25, 40, 28]);
      expect(result.isIrregular).toBe(true);
      expect(result.confidence).toBe("irregular");
    });
  
    it("avgLength is rounded", () => {
      const result = detectCycleIrregularity([27, 29]);
      expect(result.avgLength).toBe(28);
    });
  });
  
  // ─── getDaysUntilNextPhase ────────────────────────────────────────────────────
  
  describe("getDaysUntilNextPhase", () => {
    it("menstrual day 3: 3 days until follicular", () => {
      expect(getDaysUntilNextPhase(3, "menstrual", 28, "natural")).toBe(3);
    });
  
    it("last day of menstrual: 1 day until follicular", () => {
      expect(getDaysUntilNextPhase(5, "menstrual", 28, "natural")).toBe(1);
    });
  
    it("last day of luteal: 1 day until next period", () => {
      expect(getDaysUntilNextPhase(28, "luteal", 28, "natural")).toBe(1);
    });
  
    it("never returns negative", () => {
      for (let d = 1; d <= 28; d++) {
        const phase = calculatePhaseFromCycleLength(d, 28, "natural");
        const days = getDaysUntilNextPhase(d, phase, 28, "natural");
        expect(days).toBeGreaterThanOrEqual(0);
      }
    });
  });