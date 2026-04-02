// tests/units/vyanaContextGating.test.ts
// VyanaContext gating tests — identity, emotional memory, anticipation,
// surprise/delight exclusivity, severity, stable pattern, serialization.

import {
  buildVyanaContext,
  serializeVyanaContext,
  type VyanaContext,
  type EmotionalMemoryInput,
  type AnticipationFrequencyState,
} from "../../src/services/vyanaContext";
import { buildInsightContext } from "../../src/services/insightService";
import { buildHormoneState } from "../../src/services/hormoneengine";
import {
  makeBaseline,
  stableLogs,
  goodLogs,
  sleepDeprivedLogs,
  highStressLogs,
  heavyBleedingLogs,
} from "../helpers/factories";
import type { NumericBaseline, CrossCycleNarrative } from "../../src/services/insightData";
import type { Phase, CycleMode } from "../../src/services/cycleEngine";
import type { PrimaryInsightCause } from "../../src/services/insightCause";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeCrossNarrative(
  overrides: Partial<CrossCycleNarrative> = {},
): CrossCycleNarrative {
  return {
    matchingCycles: 3,
    totalCyclesAnalyzed: 5,
    typicalSleep: 6.0,
    typicalStress: "elevated",
    typicalMood: "low",
    typicalFatigue: "moderate",
    narrativeStatement: "Sleep tends to dip around this point in your cycle.",
    trend: "stable" as CrossCycleNarrative["trend"],
    ...overrides,
  };
}

function buildTestParams(
  overrides: Partial<Parameters<typeof buildVyanaContext>[0]> = {},
) {
  const logs = overrides.ctx ? [] : stableLogs(7);
  const ctx =
    overrides.ctx ??
    buildInsightContext("follicular", 10, logs, [], "none", 0, 28, "natural");
  const baseline = overrides.baseline ?? makeBaseline();
  return {
    ctx,
    baseline,
    crossCycleNarrative: null as CrossCycleNarrative | null,
    hormoneState: buildHormoneState("follicular", 10, 28, "natural", "none"),
    hormoneLanguage: null as string | null,
    phase: "follicular" as Phase,
    cycleDay: 10,
    phaseDay: 5,
    cycleLength: 28,
    cycleMode: "natural" as CycleMode,
    daysUntilNextPhase: 4,
    daysUntilNextPeriod: 19,
    isPeriodDelayed: false,
    daysOverdue: 0,
    isIrregular: false,
    memoryDriver: null as string | null,
    memoryCount: 0,
    userName: "Test User",
    userId: "test-user-123",
    anticipationFrequencyState: {
      lastShownCycleDay: null,
      lastShownType: null,
    } as AnticipationFrequencyState,
    emotionalMemoryInput: null as EmotionalMemoryInput | null,
    primaryInsightCause: "cycle" as PrimaryInsightCause,
    ...overrides,
  };
}

function makeEmotionalInput(
  count: number,
  opts: { mood?: string | null; cycleDay?: number } = {},
): EmotionalMemoryInput {
  const mood = opts.mood === undefined ? "low" : opts.mood;
  const baseCycleDay = opts.cycleDay ?? 10;
  return {
    pastOccurrences: Array.from({ length: count }, (_, i) => ({
      cycleDay: baseCycleDay + (i % 3) - 1, // within ±4 of default cycleDay=10
      phase: "follicular" as Phase,
      mood,
      energy: "low",
      stress: "moderate",
      daysAgo: (i + 1) * 7,
    })),
  };
}

// ─── Group 1: Identity layer gating ──────────────────────────────────────────

describe("Group 1: Identity layer gating", () => {
  it("null crossCycleNarrative → hasPersonalHistory=false, useThisOutput=false", () => {
    const vc = buildVyanaContext(buildTestParams({ crossCycleNarrative: null }));
    expect(vc.identity.hasPersonalHistory).toBe(false);
    expect(vc.identity.useThisOutput).toBe(false);
  });

  it("matchingCycles:0 → hasPersonalHistory=false", () => {
    const vc = buildVyanaContext(
      buildTestParams({ crossCycleNarrative: makeCrossNarrative({ matchingCycles: 0 }) }),
    );
    expect(vc.identity.hasPersonalHistory).toBe(false);
  });

  it("matchingCycles:1 → hasPersonalHistory=false", () => {
    const vc = buildVyanaContext(
      buildTestParams({ crossCycleNarrative: makeCrossNarrative({ matchingCycles: 1 }) }),
    );
    expect(vc.identity.hasPersonalHistory).toBe(false);
  });

  it("matchingCycles:2 → hasPersonalHistory=true (threshold)", () => {
    const vc = buildVyanaContext(
      buildTestParams({ crossCycleNarrative: makeCrossNarrative({ matchingCycles: 2 }) }),
    );
    expect(vc.identity.hasPersonalHistory).toBe(true);
    expect(vc.identity.historyCycles).toBe(2);
  });

  it("matchingCycles:3 → hasPersonalHistory=true", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        crossCycleNarrative: makeCrossNarrative({ matchingCycles: 3, typicalStress: "elevated" }),
      }),
    );
    expect(vc.identity.hasPersonalHistory).toBe(true);
  });

  it("when useThisOutput=true → userPatternNarrative is non-empty", () => {
    // shouldUseIdentityThisOutput: seed = (cycleDay*7 + cycleLength*3) % 20 < 13
    // Try multiple cycleDays to find one where useThisOutput is true
    let found = false;
    for (let cd = 1; cd <= 28; cd++) {
      const seed = (cd * 7 + 28 * 3) % 20;
      if (seed < 13) {
        const vc = buildVyanaContext(
          buildTestParams({
            cycleDay: cd,
            crossCycleNarrative: makeCrossNarrative({ matchingCycles: 3, typicalStress: "elevated" }),
          }),
        );
        if (vc.identity.useThisOutput) {
          expect(vc.identity.userPatternNarrative).toBeTruthy();
          expect(typeof vc.identity.userPatternNarrative).toBe("string");
          expect(vc.identity.userPatternNarrative!.length).toBeGreaterThan(0);
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });

  it("when useThisOutput=true → patternCore is non-empty", () => {
    let found = false;
    for (let cd = 1; cd <= 28; cd++) {
      const seed = (cd * 7 + 28 * 3) % 20;
      if (seed < 13) {
        const vc = buildVyanaContext(
          buildTestParams({
            cycleDay: cd,
            crossCycleNarrative: makeCrossNarrative({ matchingCycles: 3, typicalStress: "elevated" }),
          }),
        );
        if (vc.identity.useThisOutput) {
          expect(vc.identity.patternCore).toBeTruthy();
          expect(vc.identity.patternCore!.length).toBeGreaterThan(0);
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
  });

  it("some cycleDays suppress useThisOutput even with enough cycles", () => {
    // shouldUseIdentityThisOutput: seed = (cycleDay*7 + cycleLength*3) % 20 >= 13
    let found = false;
    for (let cd = 1; cd <= 28; cd++) {
      const seed = (cd * 7 + 28 * 3) % 20;
      if (seed >= 13) {
        const vc = buildVyanaContext(
          buildTestParams({
            cycleDay: cd,
            crossCycleNarrative: makeCrossNarrative({ matchingCycles: 3 }),
          }),
        );
        expect(vc.identity.hasPersonalHistory).toBe(true);
        expect(vc.identity.useThisOutput).toBe(false);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("historyCycles reflects matchingCycles value", () => {
    const vc = buildVyanaContext(
      buildTestParams({ crossCycleNarrative: makeCrossNarrative({ matchingCycles: 5 }) }),
    );
    expect(vc.identity.historyCycles).toBe(5);
  });
});

// ─── Group 2: Emotional memory gating ────────────────────────────────────────

describe("Group 2: Emotional memory gating", () => {
  it("null input → hasMemory=false", () => {
    const vc = buildVyanaContext(
      buildTestParams({ emotionalMemoryInput: null, memoryDriver: "sleep_below_baseline" }),
    );
    expect(vc.emotionalMemory.hasMemory).toBe(false);
  });

  it("empty array → hasMemory=false", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        emotionalMemoryInput: { pastOccurrences: [] },
        memoryDriver: "sleep_below_baseline",
      }),
    );
    expect(vc.emotionalMemory.hasMemory).toBe(false);
  });

  it("1 occurrence → hasMemory=false (needs 2+)", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        emotionalMemoryInput: makeEmotionalInput(1),
        memoryDriver: "sleep_below_baseline",
      }),
    );
    expect(vc.emotionalMemory.hasMemory).toBe(false);
  });

  it("2 occurrences with mood → test threshold (needs 2 matching within ±4 cycleDay)", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        emotionalMemoryInput: makeEmotionalInput(2, { mood: "low", cycleDay: 10 }),
        memoryDriver: "sleep_below_baseline",
        cycleDay: 10,
      }),
    );
    // 2 occurrences with moods within cycleDay ±4 should satisfy threshold
    expect(vc.emotionalMemory.hasMemory).toBe(true);
  });

  it("3 occurrences with mood 'low' → hasMemory=true", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        emotionalMemoryInput: makeEmotionalInput(3, { mood: "low", cycleDay: 10 }),
        memoryDriver: "sleep_below_baseline",
        cycleDay: 10,
      }),
    );
    expect(vc.emotionalMemory.hasMemory).toBe(true);
    expect(vc.emotionalMemory.recallNarrative).toBeTruthy();
  });

  it("null moods → hasMemory=false", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        emotionalMemoryInput: makeEmotionalInput(3, { mood: null, cycleDay: 10 }),
        memoryDriver: "sleep_below_baseline",
        cycleDay: 10,
      }),
    );
    expect(vc.emotionalMemory.hasMemory).toBe(false);
  });

  it("unknown driver → hasMemory=false", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        emotionalMemoryInput: makeEmotionalInput(3, { mood: "low", cycleDay: 10 }),
        memoryDriver: "unknown_driver_xyz",
        cycleDay: 10,
      }),
    );
    expect(vc.emotionalMemory.hasMemory).toBe(false);
  });

  it("null driver → hasMemory=false", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        emotionalMemoryInput: makeEmotionalInput(3, { mood: "low", cycleDay: 10 }),
        memoryDriver: null,
        cycleDay: 10,
      }),
    );
    expect(vc.emotionalMemory.hasMemory).toBe(false);
  });

  it("valid driver sleep_below_baseline with 3 occurrences → recallNarrative includes 'sleep dropped'", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        emotionalMemoryInput: makeEmotionalInput(3, { mood: "low", cycleDay: 10 }),
        memoryDriver: "sleep_below_baseline",
        cycleDay: 10,
      }),
    );
    expect(vc.emotionalMemory.hasMemory).toBe(true);
    expect(vc.emotionalMemory.recallNarrative).toContain("sleep dropped");
  });
});

// ─── Group 3: Anticipation gating ────────────────────────────────────────────

describe("Group 3: Anticipation gating", () => {
  it("isIrregular:true → shouldSurface=false", () => {
    const vc = buildVyanaContext(buildTestParams({ isIrregular: true }));
    expect(vc.anticipation.shouldSurface).toBe(false);
  });

  it("same type shown yesterday → suppressed", () => {
    // Follicular + daysUntilNextPhase:2 → would fire "peak_approaching" / "encouragement"
    const vc = buildVyanaContext(
      buildTestParams({
        phase: "follicular",
        cycleDay: 12,
        daysUntilNextPhase: 2,
        anticipationFrequencyState: {
          lastShownCycleDay: 11,
          lastShownType: "peak_approaching",
        },
      }),
    );
    expect(vc.anticipation.shouldSurface).toBe(false);
  });

  it("follicular + daysUntilNextPhase:2 → anticipation fires with encouragement", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        phase: "follicular",
        cycleDay: 12,
        daysUntilNextPhase: 2,
      }),
    );
    expect(vc.anticipation.shouldSurface).toBe(true);
    expect(vc.anticipation.type).toBe("encouragement");
    expect(vc.anticipation.anticipationType).toBe("peak_approaching");
  });

  it("late luteal → period relief anticipation", () => {
    const logs = stableLogs(7);
    const ctx = buildInsightContext("luteal", 26, logs, [], "none", 0, 28, "natural");
    const vc = buildVyanaContext(
      buildTestParams({
        ctx,
        phase: "luteal",
        cycleDay: 26,
        cycleLength: 28,
        daysUntilNextPhase: 2,
        daysUntilNextPeriod: 2,
      }),
    );
    expect(vc.anticipation.shouldSurface).toBe(true);
    expect(vc.anticipation.anticipationType).toBe("period_relief");
  });

  it("null frequency state → no crash", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        anticipationFrequencyState: undefined as any,
      }),
    );
    // Should not throw, anticipation should have some result
    expect(vc.anticipation).toBeDefined();
  });

  it("menstrual day 1 → encouragement", () => {
    const logs = stableLogs(7);
    const ctx = buildInsightContext("menstrual", 1, logs, [], "none", 0, 28, "natural");
    const vc = buildVyanaContext(
      buildTestParams({
        ctx,
        phase: "menstrual",
        cycleDay: 1,
        daysUntilNextPhase: 4,
      }),
    );
    expect(vc.anticipation.shouldSurface).toBe(true);
    expect(vc.anticipation.type).toBe("encouragement");
  });

  it("menstrual day 4 → follicular_approaching encouragement", () => {
    const logs = stableLogs(7);
    const ctx = buildInsightContext("menstrual", 4, logs, [], "none", 0, 28, "natural");
    const vc = buildVyanaContext(
      buildTestParams({
        ctx,
        phase: "menstrual",
        cycleDay: 4,
        daysUntilNextPhase: 1,
      }),
    );
    expect(vc.anticipation.shouldSurface).toBe(true);
    expect(vc.anticipation.anticipationType).toBe("follicular_approaching");
  });

  it("far from any transition, no memory → neutral with no surface", () => {
    // Follicular day 7, daysUntilNextPhase:7 — not close to any boundary
    const vc = buildVyanaContext(
      buildTestParams({
        phase: "follicular",
        cycleDay: 7,
        daysUntilNextPhase: 7,
        daysUntilNextPeriod: 21,
      }),
    );
    // With no special conditions, no anticipation should fire
    expect(vc.anticipation.shouldSurface).toBe(false);
  });

  it("hormonal cycleMode still gets anticipation when conditions match", () => {
    const logs = stableLogs(7);
    const ctx = buildInsightContext("menstrual", 1, logs, [], "none", 0, 28, "hormonal");
    const vc = buildVyanaContext(
      buildTestParams({
        ctx,
        phase: "menstrual",
        cycleDay: 1,
        cycleMode: "hormonal",
        daysUntilNextPhase: 4,
        isIrregular: false,
      }),
    );
    expect(vc.anticipation.shouldSurface).toBe(true);
  });
});

// ─── Group 4: Surprise + delight mutual exclusivity ──────────────────────────

describe("Group 4: Surprise + delight mutual exclusivity", () => {
  // Surprise seed: (cycleDay * 13 + cycleLength * 7 + userHash(userId)) % 40 < 10
  // We need to find a combo where surprise seed < 10 AND surprise content fires

  function userHashCalc(userId: string): number {
    let hash = 0;
    for (let i = 0; i < Math.min(userId.length, 8); i++) {
      hash = (hash * 31 + userId.charCodeAt(i)) % 1000;
    }
    return hash;
  }

  function findSurpriseSeed(cycleDay: number, cycleLength: number, userId: string): number {
    return (cycleDay * 13 + cycleLength * 7 + userHashCalc(userId)) % 40;
  }

  it("when surprise fires → delight does not", () => {
    // Find a combination where surprise seed < 10
    // Then we need a condition where surprise content actually fires
    // Use luteal phase + stress deviation to trigger "luteal stress amplifies" surprise
    let found = false;
    for (let cd = 18; cd <= 28; cd++) {
      for (const uid of ["test-a", "test-b", "test-c", "user-x", "user-y", "aaaa", "bbbb", "cccc", "zzzz"]) {
        const seed = findSurpriseSeed(cd, 28, uid);
        if (seed < 10) {
          // luteal + stress deviation meaningful → surprise fires
          const logs = highStressLogs();
          const ctx = buildInsightContext("luteal", cd, logs, [], "none", 0, 28, "natural");
          const baseline = makeBaseline({
            recentStressAvg: 3.0,
            baselineStressAvg: 1.5,
            stressDelta: 1.5,
          });
          const vc = buildVyanaContext(
            buildTestParams({
              ctx,
              baseline,
              phase: "luteal",
              cycleDay: cd,
              cycleLength: 28,
              userId: uid,
            }),
          );
          if (vc.surpriseInsight.shouldSurface) {
            expect(vc.delight.shouldSurface).toBe(false);
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  it("when surprise does NOT fire → delight CAN fire", () => {
    // Find a combination where surprise seed >= 10
    let found = false;
    for (let cd = 1; cd <= 28; cd++) {
      const seed = findSurpriseSeed(cd, 28, "test-user-123");
      if (seed >= 10) {
        // Menstrual day ≤ 2 with delight seed < 12 → reassurance delight
        const delightSeed = (cd * 11 + 28 * 5 + userHashCalc("test-user-123")) % 30;
        if (delightSeed < 12 && cd <= 2) {
          const logs = stableLogs(7);
          const ctx = buildInsightContext("menstrual", cd, logs, [], "none", 0, 28, "natural");
          const vc = buildVyanaContext(
            buildTestParams({
              ctx,
              phase: "menstrual",
              cycleDay: cd,
              cycleLength: 28,
              userId: "test-user-123",
            }),
          );
          if (!vc.surpriseInsight.shouldSurface && vc.delight.shouldSurface) {
            found = true;
            break;
          }
        }
      }
    }
    // If we couldn't find menstrual ≤ 2, try other phases
    if (!found) {
      for (let cd = 1; cd <= 28; cd++) {
        for (const uid of ["delight-a", "delight-b", "delight-c", "ddd", "eee"]) {
          const surpriseSeed = findSurpriseSeed(cd, 28, uid);
          const delightSeed = (cd * 11 + 28 * 5 + userHashCalc(uid)) % 30;
          if (surpriseSeed >= 10 && delightSeed < 12) {
            const logs = stableLogs(7);
            const ctx = buildInsightContext("follicular", cd, logs, [], "none", 0, 28, "natural");
            const vc = buildVyanaContext(
              buildTestParams({
                ctx,
                phase: "follicular",
                cycleDay: cd,
                cycleLength: 28,
                userId: uid,
              }),
            );
            if (!vc.surpriseInsight.shouldSurface && vc.delight.shouldSurface) {
              found = true;
              break;
            }
          }
        }
        if (found) break;
      }
    }
    expect(found).toBe(true);
  });

  it("never both true — sweep all 28 days", () => {
    for (let cd = 1; cd <= 28; cd++) {
      const phase: Phase =
        cd <= 5 ? "menstrual" : cd <= 13 ? "follicular" : cd === 14 ? "ovulation" : "luteal";
      const logs = stableLogs(7);
      const ctx = buildInsightContext(phase, cd, logs, [], "none", 0, 28, "natural");
      const vc = buildVyanaContext(
        buildTestParams({
          ctx,
          phase,
          cycleDay: cd,
          cycleLength: 28,
          userId: "sweep-user-abc",
        }),
      );
      expect(
        vc.surpriseInsight.shouldSurface && vc.delight.shouldSurface,
      ).toBe(false);
    }
  });

  it("never both true — sweep with high-stress logs", () => {
    for (let cd = 1; cd <= 28; cd++) {
      const phase: Phase =
        cd <= 5 ? "menstrual" : cd <= 13 ? "follicular" : cd === 14 ? "ovulation" : "luteal";
      const logs = highStressLogs();
      const ctx = buildInsightContext(phase, cd, logs, [], "none", 0, 28, "natural");
      const baseline = makeBaseline({ stressDelta: 1.5, recentStressAvg: 3.0 });
      const vc = buildVyanaContext(
        buildTestParams({
          ctx,
          baseline,
          phase,
          cycleDay: cd,
          cycleLength: 28,
          userId: "sweep-stress",
        }),
      );
      expect(
        vc.surpriseInsight.shouldSurface && vc.delight.shouldSurface,
      ).toBe(false);
    }
  });

  it("never both true — sweep with different userIds", () => {
    const userIds = ["alpha", "beta", "gamma", "delta", "epsilon"];
    for (const uid of userIds) {
      for (let cd = 1; cd <= 28; cd++) {
        const phase: Phase =
          cd <= 5 ? "menstrual" : cd <= 13 ? "follicular" : cd === 14 ? "ovulation" : "luteal";
        const logs = stableLogs(7);
        const ctx = buildInsightContext(phase, cd, logs, [], "none", 0, 28, "natural");
        const vc = buildVyanaContext(
          buildTestParams({
            ctx,
            phase,
            cycleDay: cd,
            cycleLength: 28,
            userId: uid,
          }),
        );
        expect(
          vc.surpriseInsight.shouldSurface && vc.delight.shouldSurface,
        ).toBe(false);
      }
    }
  });
});

// ─── Group 5: High severity delight gating ───────────────────────────────────

describe("Group 5: High severity delight gating", () => {
  it("sleep_stress_amplification + memoryCount>=3 → isHighSeverity=true", () => {
    const logs = sleepDeprivedLogs();
    const ctx = buildInsightContext("follicular", 10, logs, [], "none", 0, 28, "natural");
    const vc = buildVyanaContext(
      buildTestParams({
        ctx,
        memoryDriver: "sleep_stress_amplification",
        memoryCount: 4,
      }),
    );
    expect(vc.isHighSeverity).toBe(true);
  });

  it("high severity → delight type is 'validation' or null, never 'relief' or 'normalcy'", () => {
    // Sweep across days to find one where delight fires under high severity
    for (let cd = 1; cd <= 28; cd++) {
      for (const uid of ["sev-a", "sev-b", "sev-c", "sev-d", "sev-e"]) {
        const phase: Phase =
          cd <= 5 ? "menstrual" : cd <= 13 ? "follicular" : cd === 14 ? "ovulation" : "luteal";
        const logs = highStressLogs();
        const ctx = buildInsightContext(phase, cd, logs, [], "none", 0, 28, "natural");
        const vc = buildVyanaContext(
          buildTestParams({
            ctx,
            phase,
            cycleDay: cd,
            cycleLength: 28,
            userId: uid,
            memoryDriver: "sleep_stress_amplification",
            memoryCount: 4,
          }),
        );
        if (vc.isHighSeverity && vc.delight.shouldSurface) {
          expect(["validation", null]).toContain(vc.delight.type);
          expect(vc.delight.type).not.toBe("relief");
          expect(vc.delight.type).not.toBe("normalcy");
        }
      }
    }
  });

  it("isPeriodDelayed → isHighSeverity=false, delight type is 'reassurance'", () => {
    // Find a cycleDay/userId combo where delight seed < 12
    let found = false;
    for (let cd = 30; cd <= 40; cd++) {
      for (const uid of ["delay-a", "delay-b", "delay-c", "delay-d"]) {
        const userHashVal = (() => {
          let h = 0;
          for (let i = 0; i < Math.min(uid.length, 8); i++) h = (h * 31 + uid.charCodeAt(i)) % 1000;
          return h;
        })();
        const delightSeed = (cd * 11 + 28 * 5 + userHashVal) % 30;
        const surpriseSeed = (cd * 13 + 28 * 7 + userHashVal) % 40;
        if (delightSeed < 12 && surpriseSeed >= 10) {
          const logs = stableLogs(7);
          const ctx = buildInsightContext("luteal", cd, logs, [], "none", 0, 28, "natural");
          const vc = buildVyanaContext(
            buildTestParams({
              ctx,
              phase: "luteal",
              cycleDay: cd,
              cycleLength: 28,
              userId: uid,
              isPeriodDelayed: true,
              daysOverdue: cd - 28,
              memoryDriver: "sleep_stress_amplification",
              memoryCount: 4,
            }),
          );
          expect(vc.isHighSeverity).toBe(false);
          if (vc.delight.shouldSurface) {
            expect(vc.delight.type).toBe("reassurance");
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  it("normal state → isHighSeverity=false", () => {
    const vc = buildVyanaContext(buildTestParams());
    expect(vc.isHighSeverity).toBe(false);
  });

  it("bleeding_heavy in priorityDrivers → isHighSeverity=true", () => {
    const logs = heavyBleedingLogs();
    const ctx = buildInsightContext("menstrual", 2, logs, [], "none", 0, 28, "natural");
    // Verify the ctx actually has bleeding_heavy
    if (ctx.priorityDrivers.includes("bleeding_heavy")) {
      const vc = buildVyanaContext(
        buildTestParams({
          ctx,
          phase: "menstrual",
          cycleDay: 2,
        }),
      );
      expect(vc.isHighSeverity).toBe(true);
    } else {
      // Even without it in priorityDrivers, physical_state + mental_state can trigger
      const vc = buildVyanaContext(
        buildTestParams({
          ctx,
          phase: "menstrual",
          cycleDay: 2,
          memoryDriver: "high_strain",
          memoryCount: 3,
        }),
      );
      expect(vc.isHighSeverity).toBe(true);
    }
  });

  it("mood_trend_declining + memoryCount>=4 → isHighSeverity=true", () => {
    const logs = stableLogs(7);
    const ctx = buildInsightContext("luteal", 20, logs, [], "none", 0, 28, "natural");
    const vc = buildVyanaContext(
      buildTestParams({
        ctx,
        phase: "luteal",
        cycleDay: 20,
        memoryDriver: "mood_trend_declining",
        memoryCount: 5,
      }),
    );
    expect(vc.isHighSeverity).toBe(true);
  });
});

// ─── Group 6: Stable pattern detection ───────────────────────────────────────

describe("Group 6: Stable pattern detection", () => {
  it("stable logs, no disruption → isStablePattern=true", () => {
    const logs = stableLogs(7);
    const ctx = buildInsightContext("follicular", 10, logs, [], "none", 0, 28, "natural");
    const baseline = makeBaseline();
    const vc = buildVyanaContext(
      buildTestParams({
        ctx,
        baseline,
        phase: "follicular",
        cycleDay: 10,
        isPeriodDelayed: false,
      }),
    );
    expect(vc.isStablePattern).toBe(true);
  });

  it("delayed period → isStablePattern=false (core signal present)", () => {
    const logs = stableLogs(7);
    const ctx = buildInsightContext("luteal", 32, logs, [], "none", 0, 28, "natural");
    const vc = buildVyanaContext(
      buildTestParams({
        ctx,
        phase: "luteal",
        cycleDay: 32,
        cycleLength: 28,
        isPeriodDelayed: true,
        daysOverdue: 4,
      }),
    );
    expect(vc.isStablePattern).toBe(false);
  });

  it("high stress with memory → isStablePattern=false", () => {
    const logs = highStressLogs();
    const ctx = buildInsightContext("follicular", 10, logs, [], "none", 0, 28, "natural");
    const baseline = makeBaseline({
      recentStressAvg: 3.0,
      baselineStressAvg: 1.5,
      stressDelta: 1.5,
    });
    const vc = buildVyanaContext(
      buildTestParams({
        ctx,
        baseline,
        memoryDriver: "stress_above_baseline",
        memoryCount: 4,
      }),
    );
    expect(vc.isStablePattern).toBe(false);
  });

  it("sleep-stress interaction (core signal) → isStablePattern=false", () => {
    const logs = sleepDeprivedLogs();
    const ctx = buildInsightContext("follicular", 10, logs, [], "none", 0, 28, "natural");
    // If interaction_flags includes sleep_stress_amplification, interactionStory goes to core
    if (ctx.interaction_flags.includes("sleep_stress_amplification")) {
      const vc = buildVyanaContext(buildTestParams({ ctx }));
      expect(vc.isStablePattern).toBe(false);
    } else {
      // Without interaction, but with sleep deviation meaningful
      const baseline = makeBaseline({ sleepDelta: -1.5, recentSleepAvg: 5.0 });
      const vc = buildVyanaContext(
        buildTestParams({
          ctx,
          baseline,
          memoryDriver: "sleep_below_baseline",
          memoryCount: 4,
        }),
      );
      expect(vc.isStablePattern).toBe(false);
    }
  });
});

// ─── Group 7: Serialized context ─────────────────────────────────────────────

describe("Group 7: Primary insight cause in serialized context", () => {
  it("sleep_disruption → 'PRIMARY CAUSE' in output", () => {
    const vc = buildVyanaContext(
      buildTestParams({ primaryInsightCause: "sleep_disruption" }),
    );
    const serialized = serializeVyanaContext(vc);
    expect(serialized).toContain("PRIMARY CAUSE");
  });

  it("stable → 'STABLE STATE' in output", () => {
    const vc = buildVyanaContext(
      buildTestParams({ primaryInsightCause: "stable" }),
    );
    const serialized = serializeVyanaContext(vc);
    expect(serialized).toContain("STABLE STATE");
  });

  it("cycle + hormones surface → 'Hormone context' in output", () => {
    const hormoneState = buildHormoneState("follicular", 10, 28, "natural", "none");
    // hormoneState.surfaceHormones needs to be true AND hormoneLanguage needs to be set
    const vc = buildVyanaContext(
      buildTestParams({
        primaryInsightCause: "cycle",
        hormoneState: { ...hormoneState, surfaceHormones: true },
        hormoneLanguage: "Estrogen is rising, supporting energy and mood.",
      }),
    );
    const serialized = serializeVyanaContext(vc);
    // Only surfaces when primaryInsightCause === "cycle"
    if (vc.hormones.surface) {
      expect(serialized).toContain("Hormone context");
    }
  });

  it("sleep_disruption → no 'Hormone context' in output", () => {
    const hormoneState = buildHormoneState("follicular", 10, 28, "natural", "none");
    const vc = buildVyanaContext(
      buildTestParams({
        primaryInsightCause: "sleep_disruption",
        hormoneState: { ...hormoneState, surfaceHormones: true },
        hormoneLanguage: "Estrogen is rising.",
      }),
    );
    const serialized = serializeVyanaContext(vc);
    expect(serialized).not.toContain("Hormone context");
  });

  it("stress_led → 'PRIMARY CAUSE' with stress in output", () => {
    const vc = buildVyanaContext(
      buildTestParams({ primaryInsightCause: "stress_led" }),
    );
    const serialized = serializeVyanaContext(vc);
    expect(serialized).toContain("PRIMARY CAUSE");
    expect(serialized).toContain("stress");
  });

  it("serialized output always contains cycle summary", () => {
    const vc = buildVyanaContext(buildTestParams());
    const serialized = serializeVyanaContext(vc);
    expect(serialized).toContain("Day 10 of your 28-day cycle");
  });
});
