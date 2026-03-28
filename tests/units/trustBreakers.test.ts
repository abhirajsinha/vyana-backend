// tests/unit/trustBreakers.test.ts
// Tests for outputs that would break user trust — even if technically "correct".
//
// These catch:
// - Dangerous medical claims
// - Emotional tone mismatches (cheerful when she's suffering)
// - Overly certain language about uncertain things
// - Contradictions the user would notice

import {
    buildInsightContext,
    generateRuleBasedInsights,
  } from "../../src/services/insightService";
  import { buildTomorrowPreview } from "../../src/services/tomorrowEngine";
  import {
    containsForbiddenLanguage,
    cleanupInsightText,
  } from "../../src/utils/confidencelanguage";
  import { calculateCycleInfo } from "../../src/services/cycleEngine";
  import type { DailyInsights } from "../../src/services/insightService";
  import { makeLogs, makeLog } from "../helpers/factories";
  
  // ─── Helpers ──────────────────────────────────────────────────────────────────
  
  function getInsightsForProfile(
    cycleDay: number,
    logs: ReturnType<typeof makeLogs>,
    baselineLogs: ReturnType<typeof makeLogs> = [],
  ): DailyInsights {
    const lastPeriodStart = new Date();
    lastPeriodStart.setDate(lastPeriodStart.getDate() - (cycleDay - 1));
  
    const cycleInfo = calculateCycleInfo(lastPeriodStart, 28, "natural");
    const ctx = buildInsightContext(
      cycleInfo.phase,
      cycleInfo.currentDay,
      logs,
      baselineLogs,
      baselineLogs.length >= 7 ? "global" : "none",
      0,
      28,
      "natural",
    );
    return generateRuleBasedInsights(ctx);
  }
  
  function allFieldsText(insights: DailyInsights): string {
    return Object.values(insights).join(" ");
  }
  
  // ─── DANGEROUS OUTPUT TESTS ───────────────────────────────────────────────────
  
  describe("dangerous output prevention", () => {
    const DANGEROUS_PHRASES = [
      "you are pregnant",
      "you are likely pregnant",
      "you might be pregnant",
      "pregnancy is likely",
      "you should take a pregnancy test",
      "consult a doctor immediately",
      "this could be serious",
      "you have PCOS",
      "you have endometriosis",
      "you have PMDD",
      "you are depressed",
      "you have anxiety",
      "you need medication",
      "stop taking your medication",
      "your hormone levels are",
      "your estrogen is high",
      "your progesterone is low",
    ];
  
    it("rule-based insights never contain pregnancy claims", () => {
      // Test across all phases with various signal profiles
      const profiles = [
        { cycleDay: 1, logs: makeLogs([{ mood: "low", stress: "high", padsChanged: 8 }]) },
        { cycleDay: 14, logs: makeLogs(Array(5).fill({ mood: "good", energy: "high" })) },
        { cycleDay: 27, logs: makeLogs([{ mood: "low", stress: "high" }]) },
        { cycleDay: 30, logs: makeLogs(Array(5).fill({ mood: "neutral" })) }, // overdue
      ];
  
      for (const { cycleDay, logs } of profiles) {
        const insights = getInsightsForProfile(cycleDay, logs);
        const text = allFieldsText(insights).toLowerCase();
        for (const phrase of DANGEROUS_PHRASES) {
          expect(text).not.toContain(phrase.toLowerCase());
        }
      }
    });
  
    it("rule-based insights never contain diagnostic claims", () => {
      // Heavy symptoms that might tempt the engine toward diagnosis
      const heavyLogs = makeLogs([
        { mood: "very_low", stress: "very_high", pain: "severe", padsChanged: 10, fatigue: "very_high" },
        { mood: "low", stress: "high", pain: "severe", padsChanged: 9, fatigue: "high" },
        { mood: "low", stress: "high", pain: "moderate", padsChanged: 7, fatigue: "high" },
      ]);
  
      const insights = getInsightsForProfile(2, heavyLogs);
      const text = allFieldsText(insights).toLowerCase();
  
      expect(text).not.toContain("you have");
      expect(text).not.toContain("diagnosis");
      expect(text).not.toContain("condition");
      expect(text).not.toContain("disorder");
      expect(text).not.toContain("disease");
    });
  
    it("no forbidden deterministic language in any profile", () => {
      const cycleDays = [1, 3, 7, 14, 21, 27, 28];
      const logProfiles = [
        makeLogs(Array(5).fill({ mood: "good", energy: "high", sleep: 7.5, stress: "low" })),
        makeLogs([{ mood: "low", energy: "low", sleep: 4.0, stress: "very_high" }]),
        makeLogs(Array(7).fill({ mood: "neutral", energy: "moderate", sleep: 7.0, stress: "moderate" })),
      ];
  
      for (const day of cycleDays) {
        for (const logs of logProfiles) {
          const insights = getInsightsForProfile(day, logs);
          for (const [key, value] of Object.entries(insights)) {
            expect(
              containsForbiddenLanguage(value),
            ).toBe(false);
          }
        }
      }
    });
  });
  
  // ─── EMOTIONAL TONE MISMATCH TESTS ───────────────────────────────────────────
  
  describe("emotional tone mismatch prevention", () => {
    const CHEERFUL_MARKERS = [
      "great day",
      "wonderful",
      "amazing",
      "fantastic",
      "celebrate",
      "thriving",
      "best day",
      "enjoy!",
      "embrace the positivity",
    ];
  
    const SUFFERING_MARKERS = [
      "strain",
      "dropping",
      "crashing",
      "heavier",
      "overwhelming",
      "severe",
      "worst",
    ];
  
    it("heavy bleeding day 1: no cheerful language in insights", () => {
      const heavyBleedLogs = makeLogs([
        { mood: "low", energy: "low", sleep: 5.0, stress: "high", padsChanged: 9, pain: "severe" },
        { mood: "low", energy: "low", sleep: 5.5, stress: "moderate", padsChanged: 7 },
        { mood: "neutral", energy: "moderate", sleep: 6.0, stress: "low" },
      ]);
  
      const insights = getInsightsForProfile(1, heavyBleedLogs);
      const text = allFieldsText(insights).toLowerCase();
  
      for (const marker of CHEERFUL_MARKERS) {
        expect(text).not.toContain(marker);
      }
    });
  
    it("severe stress + low mood: solution is not 'enjoy your day'", () => {
      const distressLogs = makeLogs([
        { mood: "very_low", energy: "low", sleep: 4.5, stress: "very_high" },
        { mood: "low", energy: "low", sleep: 5.0, stress: "very_high" },
        { mood: "low", energy: "low", sleep: 5.5, stress: "high" },
        { mood: "neutral", energy: "moderate", sleep: 6.0, stress: "moderate" },
        { mood: "neutral", energy: "moderate", sleep: 6.5, stress: "low" },
      ]);
  
      const insights = getInsightsForProfile(22, distressLogs);
      const solution = insights.solution.toLowerCase();
      const recommendation = insights.recommendation.toLowerCase();
  
      // Should be protective, not performative
      expect(solution).not.toMatch(/enjoy|celebrate|embrace|make the most/);
      expect(recommendation).not.toMatch(/take on harder|go all in|push/);
    });
  
    it("ovulation peak with good logs: tone is positive, not cautionary", () => {
      const peakLogs = makeLogs(
        Array(5).fill({ mood: "good", energy: "high", sleep: 7.5, stress: "low" }),
      );
  
      const insights = getInsightsForProfile(14, peakLogs);
      const text = allFieldsText(insights).toLowerCase();
  
      // Should NOT contain warnings when everything is positive
      expect(text).not.toMatch(/careful|warning|watch out|be cautious/);
      // Should contain positive framing
      expect(text).toMatch(/energy|strong|peak|confident|clarity|momentum/);
    });
  
    it("good sleep + terrible mood (contradiction): acknowledges mood, doesn't dismiss", () => {
      const logs = makeLogs(
        Array(5).fill({ mood: "very_low", energy: "low", sleep: 8.0, stress: "high" }),
      );
  
      const insights = getInsightsForProfile(22, logs);
      const emotional = insights.emotionalInsight.toLowerCase();
      const physical = insights.physicalInsight.toLowerCase();
  
      // Should NOT say "everything looks good" when mood is terrible
      expect(emotional).not.toMatch(/looks good|stable|steady|no issues/);
    });
  });
  
  // ─── CONTRADICTION TESTS ──────────────────────────────────────────────────────
  
  describe("cross-field contradiction prevention", () => {
    it("physical strain + mental balanced → mental adjusts", () => {
      const strainLogs = makeLogs([
        { mood: "neutral", energy: "low", sleep: 4.5, stress: "high", padsChanged: 8 },
        { mood: "low", energy: "low", sleep: 5.0, stress: "high" },
        { mood: "neutral", energy: "moderate", sleep: 6.0, stress: "moderate" },
      ]);
  
      const insights = getInsightsForProfile(1, strainLogs);
      const cleaned = cleanupInsightText(insights);
  
      const physHasStrain = /strain|heavier|dropping|effort/i.test(cleaned.physicalInsight);
      const mentalSaysBalanced = /\bbalanced\b/i.test(cleaned.mentalInsight);
  
      // If physical says strain, mental should NOT say balanced
      if (physHasStrain) {
        expect(mentalSaysBalanced).toBe(false);
      }
    });
  
    it("tomorrow preview doesn't contradict today's assessment", () => {
      // If today says "you're under strain", tomorrow shouldn't say "things are great"
      const strainLogs = makeLogs([
        { sleep: 4.0, mood: "low", energy: "low", stress: "very_high" },
        { sleep: 4.5, mood: "low", energy: "low", stress: "high" },
        { sleep: 5.0, mood: "neutral", energy: "moderate", stress: "moderate" },
      ]);
  
      const lastPeriodStart = new Date();
      lastPeriodStart.setDate(lastPeriodStart.getDate() - 19);
      const cycleInfo = calculateCycleInfo(lastPeriodStart, 28, "natural");
      const ctx = buildInsightContext(
        cycleInfo.phase,
        cycleInfo.currentDay,
        strainLogs,
        [],
        "none",
        0,
        28,
        "natural",
      );
  
      const preview = buildTomorrowPreview(ctx, cycleInfo.daysUntilNextPhase, 0);
      const previewLower = preview.toLowerCase();
  
      // Tomorrow preview should acknowledge difficulty, not promise instant recovery
      expect(previewLower).not.toMatch(/great day ahead|everything will be fine|back to normal/);
    });
  });
  
  // ─── CONFIDENCE CALIBRATION TESTS ─────────────────────────────────────────────
  
  describe("confidence calibration", () => {
    it("0 logs: insights use soft language", () => {
      const insights = getInsightsForProfile(14, []);
      const text = allFieldsText(insights).toLowerCase();
  
      // With no logs, should use uncertain language
      // Should NOT sound like it knows her personally
      expect(text).not.toMatch(/your patterns show|for you|your cycles tend/);
    });
  
    it("1 log: mode is fallback, not personalized", () => {
      const oneLogs = makeLogs([{ mood: "neutral" }]);
      const lastPeriodStart = new Date();
      lastPeriodStart.setDate(lastPeriodStart.getDate() - 13);
      const cycleInfo = calculateCycleInfo(lastPeriodStart, 28, "natural");
      const ctx = buildInsightContext(
        cycleInfo.phase,
        cycleInfo.currentDay,
        oneLogs,
        [],
        "none",
        0,
        28,
        "natural",
      );
  
      expect(ctx.mode).toBe("fallback");
      expect(ctx.confidence).toBe("low");
    });
  
    it("5+ logs with trends: mode is personalized, confidence is high", () => {
      const richLogs = makeLogs([
        { sleep: 4.0, mood: "low", energy: "low", stress: "high" },
        { sleep: 4.5, mood: "low", energy: "low", stress: "high" },
        { sleep: 5.0, mood: "neutral", energy: "moderate", stress: "moderate" },
        { sleep: 6.0, mood: "neutral", energy: "moderate", stress: "low" },
        { sleep: 7.0, mood: "good", energy: "high", stress: "low" },
      ]);
  
      const lastPeriodStart = new Date();
      lastPeriodStart.setDate(lastPeriodStart.getDate() - 8);
      const cycleInfo = calculateCycleInfo(lastPeriodStart, 28, "natural");
      const ctx = buildInsightContext(
        cycleInfo.phase,
        cycleInfo.currentDay,
        richLogs,
        [],
        "none",
        0,
        28,
        "natural",
      );
  
      expect(ctx.mode).toBe("personalized");
      expect(ctx.confidence).toBe("high");
    });
  });
  
  // ─── EDGE CASE SAFETY TESTS ──────────────────────────────────────────────────
  
  describe("edge case safety", () => {
    it("empty logs array: no crash, returns valid insights", () => {
      const insights = getInsightsForProfile(14, []);
      for (const [key, value] of Object.entries(insights)) {
        expect(typeof value).toBe("string");
        expect(value.trim().length).toBeGreaterThan(0);
      }
    });
  
    it("log with all null fields: no crash", () => {
      const nullLog = makeLog(0, {});
      // Override everything to null-ish
      (nullLog as Record<string, unknown>).mood = null;
      (nullLog as Record<string, unknown>).energy = null;
      (nullLog as Record<string, unknown>).sleep = null;
      (nullLog as Record<string, unknown>).stress = null;
  
      expect(() => {
        getInsightsForProfile(14, [nullLog]);
      }).not.toThrow();
    });
  
    it("extreme sleep value (0 hours): no crash, detects strain", () => {
      const extremeLogs = makeLogs([
        { sleep: 0, mood: "low", energy: "low", stress: "high" },
        { sleep: 0, mood: "low", energy: "low", stress: "high" },
        { sleep: 0, mood: "low", energy: "low", stress: "high" },
      ]);
  
      expect(() => {
        getInsightsForProfile(14, extremeLogs);
      }).not.toThrow();
  
      const lastPeriodStart = new Date();
      lastPeriodStart.setDate(lastPeriodStart.getDate() - 13);
      const cycleInfo = calculateCycleInfo(lastPeriodStart, 28, "natural");
      const ctx = buildInsightContext(
        cycleInfo.phase,
        cycleInfo.currentDay,
        extremeLogs,
        [],
        "none",
        0,
        28,
        "natural",
      );
  
      expect(ctx.physical_state).toBe("high_strain");
    });
  
    it("extreme sleep value (24 hours): no crash", () => {
      const extremeLogs = makeLogs([
        { sleep: 24, mood: "good", energy: "high", stress: "low" },
      ]);
  
      expect(() => {
        getInsightsForProfile(14, extremeLogs);
      }).not.toThrow();
    });
  });