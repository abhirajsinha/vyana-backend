// tests/unit/narrativeConsistency.test.ts
// Tests that the insight pipeline produces CONSISTENT attribution across
// consecutive days when the underlying signals haven't changed.
//
// The core principle: if nothing changed in the user's logs, the explanation
// of "why" should not flip. Users lose trust when the app says "sleep is the
// problem" on Tuesday and "hormones are the problem" on Wednesday with the
// same data.

import {
    buildInsightContext,
    generateRuleBasedInsights,
    type InsightContext,
  } from "../../src/services/insightService";
  import {
    detectPrimaryInsightCause,
    type PrimaryInsightCause,
  } from "../../src/services/insightCause";
  import { calculateCycleInfo, getCycleMode } from "../../src/services/cycleEngine";
  import type { DailyLog } from "@prisma/client";
  import { makeLog, makeLogs, makeBaseline, sleepDeprivedLogs } from "../helpers/factories";
  
  // ─── Helpers ──────────────────────────────────────────────────────────────────
  
  function buildContextForDay(
    cycleDay: number,
    cycleLength: number,
    recentLogs: DailyLog[],
    baselineLogs: DailyLog[] = [],
  ): { ctx: InsightContext; cause: PrimaryInsightCause; insights: ReturnType<typeof generateRuleBasedInsights> } {
    const cycleMode = "natural" as const;
    const phase = calculateCycleInfo(
      (() => {
        const d = new Date();
        d.setDate(d.getDate() - (cycleDay - 1));
        return d;
      })(),
      cycleLength,
      cycleMode,
    ).phase;
  
    const ctx = buildInsightContext(
      phase,
      cycleDay,
      recentLogs,
      baselineLogs,
      baselineLogs.length >= 7 ? "global" : "none",
      0,
      cycleLength,
      cycleMode,
    );
  
    const cause = detectPrimaryInsightCause({
      baselineDeviation: ctx.baselineDeviation,
      trends: ctx.trends,
      sleepDelta: -1.5, // simulated
      priorityDrivers: ctx.priorityDrivers,
    });
  
    const insights = generateRuleBasedInsights(ctx);
  
    return { ctx, cause, insights };
  }
  
  // ─── Sleep disruption stays consistent ────────────────────────────────────────
  
  describe("narrative consistency: sleep disruption across days", () => {
    // Same sleep-deprived logs, just shifting the cycle day forward
    const sleepCrashLogs: DailyLog[] = makeLogs([
      { sleep: 4.0, mood: "low", energy: "low", stress: "moderate" },
      { sleep: 4.5, mood: "low", energy: "low", stress: "moderate" },
      { sleep: 5.0, mood: "neutral", energy: "low", stress: "low" },
      { sleep: 5.5, mood: "neutral", energy: "moderate", stress: "low" },
      { sleep: 6.0, mood: "neutral", energy: "moderate", stress: "low" },
      { sleep: 6.5, mood: "good", energy: "moderate", stress: "low" },
      { sleep: 7.0, mood: "good", energy: "high", stress: "low" },
    ]);
    const baselineLogs = makeLogs(
      Array(14).fill({ sleep: 7.0, mood: "good", energy: "moderate", stress: "low" }),
      7,
    );
  
    it("sleep_disruption cause is consistent across follicular days 8-10", () => {
      const causes: PrimaryInsightCause[] = [];
      for (let d = 8; d <= 10; d++) {
        const { cause } = buildContextForDay(d, 28, sleepCrashLogs, baselineLogs);
        causes.push(cause);
      }
      // All days should detect sleep disruption — the logs haven't changed
      const unique = new Set(causes);
      expect(unique.size).toBe(1);
      expect(causes[0]).toBe("sleep_disruption");
    });
  
    it("physicalInsight mentions sleep on consecutive days", () => {
      const physicals: string[] = [];
      for (let d = 8; d <= 10; d++) {
        const { insights } = buildContextForDay(d, 28, sleepCrashLogs, baselineLogs);
        physicals.push(insights.physicalInsight.toLowerCase());
      }
      // Every day should mention sleep when sleep is the primary driver
      for (const p of physicals) {
        expect(p).toMatch(/sleep|rest|recovery|strain/);
      }
    });
  
    it("whyThisIsHappening does NOT flip to hormones while sleep is crashing", () => {
      for (let d = 8; d <= 10; d++) {
        const { insights } = buildContextForDay(d, 28, sleepCrashLogs, baselineLogs);
        const why = insights.whyThisIsHappening.toLowerCase();
        // Should attribute to sleep/recovery, not hormones
        expect(why).not.toMatch(/estrogen|progesterone|lh surge|hormonal peak/);
      }
    });
  });
  
  // ─── Stress-led stays consistent ──────────────────────────────────────────────
  
  describe("narrative consistency: stress-led across days", () => {
    const stressLogs = makeLogs([
      { sleep: 7.0, mood: "low", energy: "low", stress: "very_high" },
      { sleep: 7.0, mood: "low", energy: "low", stress: "very_high" },
      { sleep: 7.0, mood: "neutral", energy: "moderate", stress: "high" },
      { sleep: 7.0, mood: "neutral", energy: "moderate", stress: "high" },
      { sleep: 7.0, mood: "neutral", energy: "moderate", stress: "moderate" },
    ]);
    const baselineLogs = makeLogs(
      Array(14).fill({ sleep: 7.0, mood: "good", energy: "moderate", stress: "low" }),
      7,
    );
  
    it("priorityDrivers include stress on consecutive luteal days", () => {
      const drivers: string[][] = [];
      for (let d = 22; d <= 24; d++) {
        const { ctx } = buildContextForDay(d, 28, stressLogs, baselineLogs);
        drivers.push(ctx.priorityDrivers);
      }
      for (const d of drivers) {
        expect(d.some((drv) => drv.includes("stress"))).toBe(true);
      }
    });
  
    it("physical_state is consistent (does not flip stable ↔ high_strain)", () => {
      const states: string[] = [];
      for (let d = 22; d <= 24; d++) {
        const { ctx } = buildContextForDay(d, 28, stressLogs, baselineLogs);
        states.push(ctx.physical_state);
      }
      const unique = new Set(states);
      // Should be the same state across days — logs haven't changed
      expect(unique.size).toBe(1);
    });
  });
  
  // ─── Stable state stays stable ────────────────────────────────────────────────
  
  describe("narrative consistency: stable state across days", () => {
    const stableLogs = makeLogs(
      Array(7).fill({ sleep: 7.0, mood: "neutral", energy: "moderate", stress: "moderate", pain: "none" }),
    );
  
    it("mode and priorityDrivers stay consistent across follicular days", () => {
      const modes: string[] = [];
      const driverCounts: number[] = [];
      for (let d = 8; d <= 12; d++) {
        const { ctx } = buildContextForDay(d, 28, stableLogs);
        modes.push(ctx.mode);
        driverCounts.push(ctx.priorityDrivers.length);
      }
      // Mode should be consistent
      expect(new Set(modes).size).toBe(1);
      // No drivers should fire on stable logs
      for (const c of driverCounts) {
        expect(c).toBe(0);
      }
    });
  });
  
  // ─── Phase transition doesn't flip cause without signal change ────────────────
  
  describe("narrative consistency: phase transition", () => {
    const goodLogs = makeLogs(
      Array(7).fill({ sleep: 7.5, mood: "good", energy: "high", stress: "low", pain: "none" }),
    );
  
    it("cause stays 'cycle' across follicular → ovulation boundary (days 11-14)", () => {
      const causes: PrimaryInsightCause[] = [];
      for (let d = 11; d <= 14; d++) {
        const { cause } = buildContextForDay(d, 28, goodLogs);
        causes.push(cause);
      }
      // No sleep or stress issues → should be "cycle" throughout
      for (const c of causes) {
        expect(c).toBe("cycle");
      }
    });
  
    it("emotional_state stays positive/stable across ovulation → luteal (days 14-17)", () => {
      const states: string[] = [];
      for (let d = 14; d <= 17; d++) {
        const { ctx } = buildContextForDay(d, 28, goodLogs);
        states.push(ctx.emotional_state);
      }
      // Good logs + no strain → should stay uplifted or stable
      for (const s of states) {
        expect(["uplifted", "stable"]).toContain(s);
      }
    });
  });
  
  // ─── Signal change correctly flips the narrative ──────────────────────────────
  
  describe("narrative correctly changes when signal changes", () => {
    it("sleep crash mid-follicular: cause flips from cycle to sleep_disruption", () => {
      const normalLogs = makeLogs(
        Array(7).fill({ sleep: 7.0, mood: "good", energy: "moderate", stress: "low" }),
      );
      const baselineLogs = makeLogs(
        Array(14).fill({ sleep: 7.0, mood: "good", energy: "moderate", stress: "low" }),
        7,
      );
  
      // Day 9 with normal sleep → cycle
      const { cause: cause1 } = buildContextForDay(9, 28, normalLogs, baselineLogs);
      expect(cause1).toBe("cycle");
  
      // Day 10 with crashed sleep → should flip to sleep_disruption (weighted recent avg must stay ≤ baseline − 0.9)
      const crashedLogs = sleepDeprivedLogs();
      const { cause: cause2 } = buildContextForDay(10, 28, crashedLogs, baselineLogs);
      expect(cause2).toBe("sleep_disruption");
    });
  
    it("stress spike: mental_state changes from balanced to stressed", () => {
      const calmLogs = makeLogs(
        Array(5).fill({ sleep: 7.0, mood: "good", energy: "moderate", stress: "low" }),
      );
      const stressedLogs = makeLogs([
        { sleep: 7.0, mood: "low", energy: "moderate", stress: "very_high" },
        { sleep: 7.0, mood: "low", energy: "moderate", stress: "high" },
        { sleep: 7.0, mood: "neutral", energy: "moderate", stress: "high" },
        { sleep: 7.0, mood: "good", energy: "moderate", stress: "low" },
        { sleep: 7.0, mood: "good", energy: "moderate", stress: "low" },
      ]);
  
      const { ctx: calm } = buildContextForDay(15, 28, calmLogs);
      expect(calm.mental_state).toBe("balanced");
  
      const { ctx: stressed } = buildContextForDay(15, 28, stressedLogs);
      expect(["stressed", "fatigued_and_stressed"]).toContain(stressed.mental_state);
    });
  });