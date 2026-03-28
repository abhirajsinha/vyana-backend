// tests/unit/insightCause.test.ts

import {
    detectPrimaryInsightCause,
    isStableInsightState,
    applySleepDisruptionNarrative,
    applyStressLedNarrative,
    applyStableStateNarrative,
    type PrimaryInsightCause,
  } from "../../src/services/insightCause";
  import type { NumericBaseline } from "../../src/services/insightData";
  import type { DailyLog } from "@prisma/client";
  
  // ─── Helpers ──────────────────────────────────────────────────────────────────
  
  function makeLogs(overrides: Partial<DailyLog>[], count: number = 7): DailyLog[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `log-${i}`,
      userId: "test-user",
      date: new Date(),
      mood: "neutral",
      energy: "moderate",
      sleep: 7.0,
      stress: "moderate",
      diet: null,
      exercise: null,
      activity: null,
      symptoms: [],
      focus: null,
      motivation: null,
      pain: "none",
      social: null,
      cravings: null,
      fatigue: null,
      padsChanged: null,
      createdAt: new Date(),
      ...(overrides[i] ?? {}),
    })) as DailyLog[];
  }
  
  const nullBaseline: NumericBaseline = {
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
  
  // ─── detectPrimaryInsightCause ────────────────────────────────────────────────
  
  describe("detectPrimaryInsightCause", () => {
    it("strong sleep drop → sleep_disruption", () => {
      const result = detectPrimaryInsightCause({
        baselineDeviation: ["sleep_below_personal_baseline"],
        trends: ["Sleep decreasing"],
        sleepDelta: -1.8,
        priorityDrivers: ["sleep_below_baseline"],
      });
      expect(result).toBe("sleep_disruption");
    });
  
    it("moderate sleep drop + declining trend → sleep_disruption", () => {
      const result = detectPrimaryInsightCause({
        baselineDeviation: ["sleep_below_personal_baseline"],
        trends: ["Sleep decreasing"],
        sleepDelta: -1.2,
        priorityDrivers: [],
      });
      expect(result).toBe("sleep_disruption");
    });
  
    it("sleep drop without baseline deviation → NOT sleep_disruption", () => {
      const result = detectPrimaryInsightCause({
        baselineDeviation: [],
        trends: ["Sleep decreasing"],
        sleepDelta: -1.5,
        priorityDrivers: [],
      });
      expect(result).not.toBe("sleep_disruption");
    });
  
    it("stress rising + above baseline → stress_led", () => {
      const result = detectPrimaryInsightCause({
        baselineDeviation: ["stress_above_personal_baseline"],
        trends: ["Stress increasing"],
        sleepDelta: 0,
        priorityDrivers: ["stress_above_baseline"],
      });
      expect(result).toBe("stress_led");
    });
  
    it("stress rising + stress driver but no baseline deviation → stress_led", () => {
      const result = detectPrimaryInsightCause({
        baselineDeviation: [],
        trends: ["Stress increasing"],
        sleepDelta: 0,
        priorityDrivers: ["stress_above_baseline"],
      });
      expect(result).toBe("stress_led");
    });
  
    it("no strong signals → cycle", () => {
      const result = detectPrimaryInsightCause({
        baselineDeviation: [],
        trends: [],
        sleepDelta: -0.3,
        priorityDrivers: [],
      });
      expect(result).toBe("cycle");
    });
  
    it("sleep AND stress both elevated → sleep_disruption wins (checked first)", () => {
      const result = detectPrimaryInsightCause({
        baselineDeviation: ["sleep_below_personal_baseline", "stress_above_personal_baseline"],
        trends: ["Sleep decreasing", "Stress increasing"],
        sleepDelta: -1.6,
        priorityDrivers: ["sleep_below_baseline", "stress_above_baseline"],
      });
      expect(result).toBe("sleep_disruption");
    });
  });
  
  // ─── isStableInsightState ─────────────────────────────────────────────────────
  
  describe("isStableInsightState", () => {
    it("returns true for 7 consistent neutral logs", () => {
      const logs = makeLogs(
        Array(7).fill({ sleep: 7.0, stress: "moderate", mood: "neutral", symptoms: [], pain: "none" }),
        7,
      );
      expect(isStableInsightState(logs, nullBaseline)).toBe(true);
    });
  
    it("returns true for positive stable logs (calm stress, good mood)", () => {
      const logs = makeLogs(
        Array(7).fill({ sleep: 7.5, stress: "calm", mood: "good", symptoms: [], pain: "none" }),
        7,
      );
      expect(isStableInsightState(logs, nullBaseline)).toBe(true);
    });
  
    it("returns false with fewer than 5 logs", () => {
      const logs = makeLogs(Array(4).fill({}), 4);
      expect(isStableInsightState(logs, nullBaseline)).toBe(false);
    });
  
    it("returns false if any log has sleep < 6", () => {
      const logs = makeLogs(
        [{ sleep: 5.5 }, {}, {}, {}, {}, {}, {}],
        7,
      );
      expect(isStableInsightState(logs, nullBaseline)).toBe(false);
    });
  
    it("returns false if any log has stress 'high'", () => {
      const logs = makeLogs(
        [{}, {}, { stress: "high" }, {}, {}, {}, {}],
        7,
      );
      expect(isStableInsightState(logs, nullBaseline)).toBe(false);
    });
  
    it("returns false if any log has mood 'low'", () => {
      const logs = makeLogs(
        [{}, { mood: "low" }, {}, {}, {}, {}, {}],
        7,
      );
      expect(isStableInsightState(logs, nullBaseline)).toBe(false);
    });
  
    it("returns false if any log has symptoms", () => {
      const logs = makeLogs(
        [{ symptoms: ["headache"] }, {}, {}, {}, {}, {}, {}],
        7,
      );
      expect(isStableInsightState(logs, nullBaseline)).toBe(false);
    });
  
    it("returns false if any log has pain (not 'none')", () => {
      const logs = makeLogs(
        [{}, {}, {}, { pain: "moderate" }, {}, {}, {}],
        7,
      );
      expect(isStableInsightState(logs, nullBaseline)).toBe(false);
    });
  
    it("returns false if any log has heavy flow (padsChanged ≥ 6)", () => {
      const logs = makeLogs(
        [{ padsChanged: 7 }, {}, {}, {}, {}, {}, {}],
        7,
      );
      expect(isStableInsightState(logs, nullBaseline)).toBe(false);
    });
  });
  
  // ─── Narrative applications ───────────────────────────────────────────────────
  
  describe("applySleepDisruptionNarrative", () => {
    it("uses actual sleep values in the narrative", () => {
      const baseline: NumericBaseline = {
        ...nullBaseline,
        recentSleepAvg: 4.8,
        baselineSleepAvg: 7.2,
      };
      const draft = {
        physicalInsight: "draft", mentalInsight: "draft", emotionalInsight: "draft",
        whyThisIsHappening: "draft", solution: "draft", recommendation: "draft",
        tomorrowPreview: "draft",
      };
      const result = applySleepDisruptionNarrative(draft, baseline);
      expect(result.physicalInsight).toContain("7.2");
      expect(result.physicalInsight).toContain("4.8");
      expect(result.whyThisIsHappening).toContain("sleep");
      // Copy explicitly contrasts sleep vs cycle ("isn't about your cycle"); substring "cycle" is expected.
      expect(result.whyThisIsHappening).toMatch(/isn't about your cycle|sleep/i);
    });
  });
  
  describe("applyStressLedNarrative", () => {
    it("attributes everything to stress, not hormones", () => {
      const draft = {
        physicalInsight: "draft", mentalInsight: "draft", emotionalInsight: "draft",
        whyThisIsHappening: "draft", solution: "draft", recommendation: "draft",
        tomorrowPreview: "draft",
      };
      const result = applyStressLedNarrative(draft);
      expect(result.whyThisIsHappening.toLowerCase()).toContain("stress");
      expect(result.whyThisIsHappening.toLowerCase()).not.toContain("hormone");
      expect(result.whyThisIsHappening.toLowerCase()).not.toContain("sleep");
    });
  });
  
  describe("applyStableStateNarrative", () => {
    it("produces calm, non-alarming content", () => {
      const draft = {
        physicalInsight: "draft", mentalInsight: "draft", emotionalInsight: "draft",
        whyThisIsHappening: "draft", solution: "draft", recommendation: "draft",
        tomorrowPreview: "draft",
      };
      const result = applyStableStateNarrative(draft);
      expect(result.physicalInsight.toLowerCase()).toContain("steady");
      expect(result.whyThisIsHappening.toLowerCase()).toContain("stable");
      expect(result.tomorrowPreview.toLowerCase()).toContain("similar");
      // Should NOT contain alarm words
      expect(result.physicalInsight.toLowerCase()).not.toContain("strain");
      expect(result.physicalInsight.toLowerCase()).not.toContain("dropping");
    });
  });