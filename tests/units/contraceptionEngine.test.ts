// tests/unit/contraceptionEngine.test.ts

import {
    resolveContraceptionType,
    getContraceptionBehavior,
    checkForecastEligibility,
    computeLogSpanDays,
    type ContraceptionType,
  } from "../../src/services/contraceptionengine";
  
  // ─── Type resolution ──────────────────────────────────────────────────────────
  
  describe("resolveContraceptionType", () => {
    const cases: [string | null, ContraceptionType][] = [
      [null, "none"],
      ["none", "none"],
      ["pill", "combined_pill"],
      ["combined_pill", "combined_pill"],
      ["mini_pill", "mini_pill"],
      ["iud_hormonal", "iud_hormonal"],
      ["iud_copper", "iud_copper"],
      ["implant", "implant"],
      ["injection", "injection"],
      ["patch", "patch"],
      ["ring", "ring"],
      ["condom", "barrier"],
      ["barrier", "barrier"],
      ["natural", "natural"],
      ["unknown_method", "none"], // fallback
    ];
  
    for (const [input, expected] of cases) {
      it(`"${input}" → "${expected}"`, () => {
        expect(resolveContraceptionType(input)).toBe(expected);
      });
    }
  });
  
  // ─── Behavior rules ───────────────────────────────────────────────────────────
  
  describe("getContraceptionBehavior", () => {
    describe("non-hormonal methods use natural cycle engine", () => {
      const natural: ContraceptionType[] = ["none", "barrier", "natural", "iud_copper"];
      for (const type of natural) {
        it(`${type}: useNaturalCycleEngine = true`, () => {
          const b = getContraceptionBehavior(type);
          expect(b.useNaturalCycleEngine).toBe(true);
          expect(b.showOvulationPrediction).toBe(true);
          expect(b.showHormoneCurves).toBe(true);
          expect(b.insightTone).toBe("cycle-based");
        });
      }
    });
  
    describe("combined hormonal methods suppress natural cycle", () => {
      const hormonal: ContraceptionType[] = ["combined_pill", "patch", "ring"];
      for (const type of hormonal) {
        it(`${type}: useNaturalCycleEngine = false`, () => {
          const b = getContraceptionBehavior(type);
          expect(b.useNaturalCycleEngine).toBe(false);
          expect(b.showOvulationPrediction).toBe(false);
          expect(b.showHormoneCurves).toBe(false);
          expect(b.showPmsForecast).toBe(false);
          expect(b.showPeriodForecast).toBe(false);
          expect(b.insightTone).toBe("pattern-based");
        });
      }
    });
  
    describe("progestin-only methods suppress natural cycle", () => {
      const progestin: ContraceptionType[] = ["mini_pill", "iud_hormonal", "implant", "injection"];
      for (const type of progestin) {
        it(`${type}: useNaturalCycleEngine = false`, () => {
          const b = getContraceptionBehavior(type);
          expect(b.useNaturalCycleEngine).toBe(false);
          expect(b.showOvulationPrediction).toBe(false);
        });
      }
    });
  
    it("iud_copper has contextMessage about heavier flow", () => {
      const b = getContraceptionBehavior("iud_copper");
      expect(b.contextMessage).toBeTruthy();
      expect(b.contextMessage!.toLowerCase()).toContain("copper");
    });
  
    it("combined_pill has contextMessage about suppressed hormones", () => {
      const b = getContraceptionBehavior("combined_pill");
      expect(b.contextMessage).toBeTruthy();
      expect(b.contextMessage!.toLowerCase()).toContain("suppressed");
    });
  });
  
  // ─── Forecast eligibility ─────────────────────────────────────────────────────
  
  describe("checkForecastEligibility", () => {
    const baseBehavior = getContraceptionBehavior("none");
  
    it("< 7 logs: not eligible", () => {
      const result = checkForecastEligibility({
        logsCount: 4,
        logsSpanDays: 4,
        confidenceScore: 0.8,
        cyclePredictionConfidence: "reliable",
        contraceptionBehavior: baseBehavior,
      });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("insufficient_logs");
    });
  
    it("7 logs in 1 day: not eligible (insufficient spread)", () => {
      const result = checkForecastEligibility({
        logsCount: 7,
        logsSpanDays: 1,
        confidenceScore: 0.8,
        cyclePredictionConfidence: "reliable",
        contraceptionBehavior: baseBehavior,
      });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("insufficient_spread");
    });
  
    it("low confidence: not eligible", () => {
      const result = checkForecastEligibility({
        logsCount: 10,
        logsSpanDays: 10,
        confidenceScore: 0.2,
        cyclePredictionConfidence: "reliable",
        contraceptionBehavior: baseBehavior,
      });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("low_confidence");
    });
  
    it("good data: eligible", () => {
      const result = checkForecastEligibility({
        logsCount: 10,
        logsSpanDays: 10,
        confidenceScore: 0.8,
        cyclePredictionConfidence: "reliable",
        contraceptionBehavior: baseBehavior,
      });
      expect(result.eligible).toBe(true);
      expect(result.reason).toBeNull();
      expect(result.progressPercent).toBe(100);
    });
  
    it("disabled by contraception: not eligible", () => {
      const disabledBehavior = { ...baseBehavior, forecastMode: "disabled" as const };
      const result = checkForecastEligibility({
        logsCount: 30,
        logsSpanDays: 30,
        confidenceScore: 0.9,
        cyclePredictionConfidence: "reliable",
        contraceptionBehavior: disabledBehavior,
      });
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("forecast_disabled_contraception");
    });
  });
  
  // ─── Log span calculation ─────────────────────────────────────────────────────
  
  describe("computeLogSpanDays", () => {
    it("0 logs → 0 days", () => {
      expect(computeLogSpanDays([])).toBe(0);
    });
  
    it("1 log → 1 day", () => {
      expect(computeLogSpanDays([{ date: new Date() }])).toBe(1);
    });
  
    it("logs across 5 days → 5", () => {
      const now = Date.now();
      const logs = [0, 1, 2, 3, 4].map((n) => ({
        date: new Date(now - n * 86400000),
      }));
      expect(computeLogSpanDays(logs)).toBe(5);
    });
  
    it("same-day logs → 1 day", () => {
      const d = new Date();
      expect(computeLogSpanDays([{ date: d }, { date: d }, { date: d }])).toBe(1);
    });
  });