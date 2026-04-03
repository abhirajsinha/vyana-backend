// tests/units/vyanaContextV2.test.ts
// V2 signal-first fields: interface additions, builder defaults, serialization.

import {
  buildVyanaContext,
  serializeVyanaContext,
} from "../../src/services/vyanaContext";
import { buildInsightContext } from "../../src/services/insightService";
import { buildHormoneState } from "../../src/services/hormoneengine";
import { makeBaseline, stableLogs } from "../helpers/factories";
import type { NumericBaseline, CrossCycleNarrative } from "../../src/services/insightData";
import type { Phase, CycleMode } from "../../src/services/cycleEngine";
import type { PrimaryInsightCause } from "../../src/services/insightCause";
import type { EmotionalMemoryInput, AnticipationFrequencyState } from "../../src/services/vyanaContext";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildTestParams(
  overrides: Partial<Parameters<typeof buildVyanaContext>[0]> = {},
) {
  const logs = stableLogs(7);
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
    userId: "test-user-v2",
    anticipationFrequencyState: {
      lastShownCycleDay: null,
      lastShownType: null,
    } as AnticipationFrequencyState,
    emotionalMemoryInput: null as EmotionalMemoryInput | null,
    primaryInsightCause: "cycle" as PrimaryInsightCause,
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("VyanaContext V2 signal-first fields", () => {
  it("existing fields still work when new fields not provided", () => {
    const vc = buildVyanaContext(buildTestParams());
    // Existing fields present
    expect(vc.userName).toBe("Test User");
    expect(vc.cycle).toBeDefined();
    expect(vc.sleep).toBeDefined();
    expect(vc.mode).toBeDefined();
    // New fields default
    expect(vc.latestLogSignals).toBeNull();
    expect(vc.recentTrend).toBeNull();
    expect(vc.previousDaySignals).toBeNull();
    expect(vc.primaryNarrative).toBe("phase");
    expect(vc.conflictDetected).toBe(false);
    expect(vc.conflictDescription).toBeNull();
    expect(vc.interactionOverride).toBeNull();
    expect(vc.amplifyMoodSensitivity).toBe(false);
    expect(vc.mechanismRequired).toBe(false);
    expect(vc.reinforcePositive).toBe(false);
  });

  it("new fields are included when provided", () => {
    const signals = { mood: 3, energy: 2, sleep: 4.5, cramps: 8 };
    const vc = buildVyanaContext(
      buildTestParams({
        latestLogSignals: signals,
        primaryNarrative: "conflict",
        conflictDetected: true,
        conflictDescription: "Low energy during follicular rise",
        interactionOverride: "Sleep-fatigue override active",
        amplifyMoodSensitivity: true,
        mechanismRequired: true,
        reinforcePositive: false,
      }),
    );
    expect(vc.latestLogSignals).toEqual(signals);
    expect(vc.primaryNarrative).toBe("conflict");
    expect(vc.conflictDetected).toBe(true);
    expect(vc.conflictDescription).toBe("Low energy during follicular rise");
    expect(vc.interactionOverride).toBe("Sleep-fatigue override active");
    expect(vc.amplifyMoodSensitivity).toBe(true);
    expect(vc.mechanismRequired).toBe(true);
    expect(vc.reinforcePositive).toBe(false);
  });

  it("serializeVyanaContext includes signal context block", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        primaryNarrative: "severe_symptom",
        latestLogSignals: { cramps: 8 },
      }),
    );
    const output = serializeVyanaContext(vc);
    expect(output).toContain("Primary narrative: severe_symptom");
    expect(output).toContain("cramps");
    expect(output).toContain("8");
  });

  it("signal context appears BEFORE phase context in serialized output", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        primaryNarrative: "conflict",
        conflictDetected: true,
        conflictDescription: "Signals contradict phase",
        latestLogSignals: { mood: 2 },
      }),
    );
    const output = serializeVyanaContext(vc);
    const signalIdx = output.indexOf("SIGNAL CONTEXT");
    const cycleIdx = output.indexOf("Cycle:");
    expect(signalIdx).toBeGreaterThanOrEqual(0);
    expect(cycleIdx).toBeGreaterThan(signalIdx);
  });

  it("conflict description appears when conflict detected", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        primaryNarrative: "conflict",
        conflictDetected: true,
        conflictDescription: "Low energy during follicular",
      }),
    );
    const output = serializeVyanaContext(vc);
    expect(output).toContain("CONFLICT: Low energy during follicular");
  });

  it("backward compatibility — calling without new fields doesn't crash", () => {
    const vc = buildVyanaContext(buildTestParams());
    const output = serializeVyanaContext(vc);
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
    // Should NOT contain signal context block when primaryNarrative is 'phase' and no signals
    expect(output).not.toContain("SIGNAL CONTEXT");
  });
});
