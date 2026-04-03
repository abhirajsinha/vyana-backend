// tests/units/promptContract.test.ts
// Verifies the GPT system prompt contains the V2 hard output rules
// and that serialized VyanaContext carries signal-first data.

import { VYANA_SYSTEM_PROMPT } from "../../src/services/insightGptService";
import {
  buildVyanaContext,
  serializeVyanaContext,
} from "../../src/services/vyanaContext";
import { buildInsightContext } from "../../src/services/insightService";
import { buildHormoneState } from "../../src/services/hormoneengine";
import { makeBaseline, stableLogs } from "../helpers/factories";
import type { CrossCycleNarrative } from "../../src/services/insightData";
import type { Phase, CycleMode } from "../../src/services/cycleEngine";
import type { PrimaryInsightCause } from "../../src/services/insightCause";
import type { EmotionalMemoryInput, AnticipationFrequencyState } from "../../src/services/vyanaContext";

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
    userId: "prompt-test-user",
    anticipationFrequencyState: { lastShownCycleDay: null, lastShownType: null } as AnticipationFrequencyState,
    emotionalMemoryInput: null as EmotionalMemoryInput | null,
    primaryInsightCause: "cycle" as PrimaryInsightCause,
    ...overrides,
  };
}

describe("GPT Prompt Contract — V2 Hard Rules", () => {
  it("system prompt contains HARD OUTPUT RULES section", () => {
    expect(VYANA_SYSTEM_PROMPT).toContain("HARD OUTPUT RULES");
  });

  it("system prompt contains BANNED PHRASES section", () => {
    expect(VYANA_SYSTEM_PROMPT).toContain("Many people find");
  });

  it("system prompt contains all 10 hard rules", () => {
    expect(VYANA_SYSTEM_PROMPT).toContain("SIGNAL-FIRST");
    expect(VYANA_SYSTEM_PROMPT).toContain("NARRATIVE LOCK");
    expect(VYANA_SYSTEM_PROMPT).toContain("REFLECTION REQUIRED");
    expect(VYANA_SYSTEM_PROMPT).toContain("TEMPORAL ANCHOR");
    expect(VYANA_SYSTEM_PROMPT).toContain("MAX LENGTH");
    expect(VYANA_SYSTEM_PROMPT).toContain("CONFLICT MODE");
    expect(VYANA_SYSTEM_PROMPT).toContain("CONFIDENCE MATCHING");
    expect(VYANA_SYSTEM_PROMPT).toContain("ENFORCEMENT");
  });

  it("primaryNarrative appears in serialized context when conflict", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        primaryNarrative: "conflict",
        conflictDetected: true,
        conflictDescription: "Low energy during follicular",
      }),
    );
    const output = serializeVyanaContext(vc);
    expect(output).toContain("Primary narrative: conflict");
  });

  it("conflict description appears in serialized context", () => {
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

  it("signal context appears before phase context in serialized output", () => {
    const vc = buildVyanaContext(
      buildTestParams({
        primaryNarrative: "severe_symptom",
        latestLogSignals: { cramps: 8 },
      }),
    );
    const output = serializeVyanaContext(vc);
    const signalIdx = output.indexOf("SIGNAL CONTEXT");
    const cycleIdx = output.indexOf("Cycle:");
    expect(signalIdx).toBeGreaterThanOrEqual(0);
    expect(cycleIdx).toBeGreaterThan(signalIdx);
  });
});
