// tests/unit/fuzz.test.ts
// Fuzz tests — generate 200 random user timelines and assert:
// 1. No crashes
// 2. All insight fields are non-empty strings
// 3. No forbidden deterministic language
// 4. No diagnostic claims
// 5. Phase is always one of the 4 valid values
//
// These catch emergent interactions between signals that structured tests miss.

import {
    buildInsightContext,
    generateRuleBasedInsights,
    type DailyInsights,
  } from "../../src/services/insightService";
  import {
    calculateCycleInfo,
    calculatePhaseFromCycleLength,
    type Phase,
  } from "../../src/services/cycleEngine";
  import { containsForbiddenLanguage } from "../../src/utils/confidencelanguage";
  import type { DailyLog } from "@prisma/client";
  
  // ─── Seeded PRNG (Mulberry32) ─────────────────────────────────────────────────
  
  function mulberry32(seed: number): () => number {
    return () => {
      let t = (seed += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  
  // ─── Random generators ────────────────────────────────────────────────────────
  
  const MOODS = ["very_low", "low", "neutral", "good", "happy", null];
  const ENERGIES = ["low", "moderate", "high", null];
  const STRESSES = ["low", "moderate", "high", "very_high", null];
  const PAINS = ["none", "mild", "moderate", "severe", null];
  
  function randomLog(rand: () => number, dayOffset: number): DailyLog {
    const pick = <T>(arr: T[]): T => arr[Math.floor(rand() * arr.length)]!;
  
    return {
      id: `fuzz-${dayOffset}-${Math.floor(rand() * 99999)}`,
      userId: "fuzz-user",
      date: (() => {
        const d = new Date();
        d.setDate(d.getDate() - dayOffset);
        return d;
      })(),
      mood: pick(MOODS),
      energy: pick(ENERGIES),
      sleep: rand() < 0.1 ? null : Math.round((rand() * 12) * 10) / 10, // 0–12 hours, 10% null
      stress: pick(STRESSES),
      diet: null,
      exercise: null,
      activity: null,
      symptoms: rand() < 0.2 ? ["headache"] : [],
      focus: null,
      motivation: null,
      pain: pick(PAINS),
      social: null,
      cravings: rand() < 0.3 ? "strong" : null,
      fatigue: rand() < 0.3 ? "high" : null,
      padsChanged: rand() < 0.15 ? Math.floor(rand() * 12) : null,
      createdAt: new Date(),
    } as DailyLog;
  }
  
  // ─── Assertions ───────────────────────────────────────────────────────────────
  
  const VALID_PHASES: Phase[] = ["menstrual", "follicular", "ovulation", "luteal"];
  
  const DIAGNOSTIC_PHRASES = [
    "you have pcos",
    "you have endometriosis",
    "you have pmdd",
    "you are depressed",
    "you have anxiety",
    "you are pregnant",
    "diagnosis",
    "you need medication",
  ];
  
  function assertInsightsValid(
    insights: DailyInsights,
    caseId: string,
  ): void {
    const keys: (keyof DailyInsights)[] = [
      "physicalInsight",
      "mentalInsight",
      "emotionalInsight",
      "whyThisIsHappening",
      "solution",
      "recommendation",
      "tomorrowPreview",
    ];
  
    for (const key of keys) {
      const value = insights[key];
      // Must be a non-empty string
      expect(typeof value).toBe("string");
      expect(value.trim().length).toBeGreaterThan(0);
  
      // No forbidden deterministic language
      if (containsForbiddenLanguage(value)) {
        throw new Error(
          `[${caseId}] Forbidden language in ${key}: "${value.slice(0, 100)}"`,
        );
      }
  
      // No diagnostic claims
      const lower = value.toLowerCase();
      for (const phrase of DIAGNOSTIC_PHRASES) {
        if (lower.includes(phrase)) {
          throw new Error(
            `[${caseId}] Diagnostic claim in ${key}: "${phrase}" found in "${value.slice(0, 100)}"`,
          );
        }
      }
    }
  }
  
  // ─── Fuzz test suite ──────────────────────────────────────────────────────────
  
  describe("fuzz testing: 200 random user timelines", () => {
    const SEED = 42;
    const CASE_COUNT = 200;
    const rand = mulberry32(SEED);
  
    const results: Array<{ id: string; crashed: boolean; error?: string }> = [];
  
    for (let i = 0; i < CASE_COUNT; i++) {
      const caseId = `FUZZ_${String(i + 1).padStart(4, "0")}`;
      const cycleLength = 21 + Math.floor(rand() * 25); // 21–45
      const cycleDay = 1 + Math.floor(rand() * cycleLength);
      const logCount = Math.floor(rand() * 15); // 0–14 logs
  
      it(`${caseId}: cycle ${cycleLength}d, day ${cycleDay}, ${logCount} logs`, () => {
        const logs: DailyLog[] = [];
        for (let j = 0; j < logCount; j++) {
          logs.push(randomLog(rand, j));
        }
  
        // Build baseline from older logs
        const baselineLogs: DailyLog[] = [];
        if (rand() > 0.3) {
          for (let j = 0; j < 10; j++) {
            baselineLogs.push(randomLog(rand, 7 + j));
          }
        }
  
        // Compute
        const lastPeriodStart = new Date();
        lastPeriodStart.setDate(lastPeriodStart.getDate() - (cycleDay - 1));
  
        const phase = calculatePhaseFromCycleLength(cycleDay, cycleLength, "natural");
        expect(VALID_PHASES).toContain(phase);
  
        const ctx = buildInsightContext(
          phase,
          cycleDay,
          logs,
          baselineLogs,
          baselineLogs.length >= 7 ? "global" : "none",
          0,
          cycleLength,
          "natural",
        );
  
        // Context should never have undefined critical fields
        expect(ctx.phase).toBeDefined();
        expect(ctx.cycleDay).toBeGreaterThanOrEqual(1);
        expect(ctx.mode).toMatch(/^(personalized|fallback)$/);
        expect(ctx.confidence).toMatch(/^(low|medium|high)$/);
        expect(ctx.confidenceScore).toBeGreaterThanOrEqual(0);
        expect(ctx.confidenceScore).toBeLessThanOrEqual(1);
        expect(Array.isArray(ctx.priorityDrivers)).toBe(true);
        expect(Array.isArray(ctx.trends)).toBe(true);
  
        // Generate insights — must not crash
        const insights = generateRuleBasedInsights(ctx);
        assertInsightsValid(insights, caseId);
      });
    }
  });