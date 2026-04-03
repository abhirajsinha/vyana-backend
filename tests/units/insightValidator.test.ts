// tests/units/insightValidator.test.ts
// Insight validator: hard checks, soft checks, fallback generator.

import {
  validateInsightField,
  generateFallbackInsight,
  type InsightValidationInput,
} from "../../src/services/insightValidator";

function makeInput(overrides: Partial<InsightValidationInput>): InsightValidationInput {
  return {
    output: "Your cramps are intense today at 7/10. This is typical for Day 2 as prostaglandins peak. Tomorrow should feel easier.",
    primaryNarrative: "severe_symptom",
    latestLogSignals: { cramps: 7 },
    conflictDetected: false,
    confidenceLevel: "medium",
    ...overrides,
  };
}

describe("validateInsightField", () => {
  it("passes when all checks satisfied", () => {
    const result = validateInsightField(makeInput({}));
    expect(result.valid).toBe(true);
    expect(result.hardFails).toEqual([]);
    expect(result.softFails).toEqual([]);
  });

  it("fails when banned phrase present", () => {
    const result = validateInsightField(
      makeInput({ output: "Many people find that Day 2 is the hardest." }),
    );
    expect(result.valid).toBe(false);
    expect(result.hardFails).toContain("noBannedPhrases");
  });

  it("fails when output starts with phase context", () => {
    const result = validateInsightField(
      makeInput({ output: "During this phase, your hormones are low and cramps may peak." }),
    );
    expect(result.valid).toBe(false);
    expect(result.hardFails).toContain("notPhaseFirst");
  });

  it("fails when conflict not acknowledged", () => {
    const result = validateInsightField(
      makeInput({
        conflictDetected: true,
        output: "Your energy is great today. Cramps are at 7.",
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.hardFails).toContain("acknowledgesConflict");
  });

  it("fails when log signals not reflected", () => {
    const result = validateInsightField(
      makeInput({
        latestLogSignals: { cramps: 8 },
        output: "Today is a good day for rest. Take it easy and hydrate.",
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.hardFails).toContain("reflectsLogSignals");
  });

  it("passes when latestLogSignals is null (new user)", () => {
    const result = validateInsightField(
      makeInput({
        latestLogSignals: null,
        output: "Around this time, energy tends to be lower. Tomorrow should feel easier.",
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("soft fail for missing temporal anchor", () => {
    const result = validateInsightField(
      makeInput({
        output: "Your cramps are at 7/10.",
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.softFails).toContain("hasTemporalAnchor");
  });

  it("fails when output exceeds 6 sentences", () => {
    const output = [
      "Sentence one about cramps.",
      "Sentence two about pain.",
      "Sentence three about rest.",
      "Sentence four about tomorrow.",
      "Sentence five about sleep.",
      "Sentence six about mood.",
      "Sentence seven about energy.",
      "Sentence eight extra.",
    ].join(" ");
    const result = validateInsightField(makeInput({ output }));
    expect(result.valid).toBe(false);
    expect(result.hardFails).toContain("withinLength");
  });

  it("soft fail when output is too broad (4+ themes)", () => {
    const result = validateInsightField(
      makeInput({
        output:
          "Your cramps are high, sleep was poor, mood is low, energy is drained, and estrogen is dropping. Tomorrow should ease.",
        latestLogSignals: { cramps: 8, sleep: 3, mood: 1, energy: 1 },
      }),
    );
    expect(result.valid).toBe(true);
    expect(result.softFails).toContain("tooBroad");
  });

  it("reflection check rejects vague output that doesn't name any signal", () => {
    const result = validateInsightField(
      makeInput({
        latestLogSignals: { cramps: 8, energy: 1 },
        output: "Today might feel a bit off. Take it easy and see how things go.",
      }),
    );
    expect(result.valid).toBe(false);
    expect(result.hardFails).toContain("reflectsLogSignals");
  });

  it("reflection check accepts output with semantic synonym", () => {
    const result = validateInsightField(
      makeInput({
        latestLogSignals: { cramps: 8 },
        output: "The pain you're feeling is intense today. Tomorrow should ease.",
      }),
    );
    expect(result.valid).toBe(true);
  });
});

describe("generateFallbackInsight", () => {
  it("returns valid output for cramps", () => {
    const output = generateFallbackInsight("severe_symptom", { cramps: 8 }, 2, "menstrual");
    expect(output).toContain("cramps");
    expect(output.split(/[.!?]+/).filter(s => s.trim()).length).toBeLessThanOrEqual(3);
    expect(output).toMatch(/eases|day or two/i);
  });

  it("returns valid output for null signals (new user)", () => {
    const output = generateFallbackInsight("phase", null, 5, "menstrual");
    expect(output).toContain("day 5");
    expect(output.split(/[.!?]+/).filter(s => s.trim()).length).toBeLessThanOrEqual(3);
    expect(output).not.toMatch(/many people find|it's common to|some women/i);
  });

  it("never contains banned phrases across all scenarios", () => {
    const scenarios = [
      generateFallbackInsight("severe_symptom", { cramps: 8 }, 2, "menstrual"),
      generateFallbackInsight("escalation", { energy: 1 }, 10, "follicular"),
      generateFallbackInsight("severe_symptom", { sleep: 1 }, 20, "mid_luteal"),
      generateFallbackInsight("conflict", null, 14, "ovulation"),
      generateFallbackInsight("phase", null, 5, "menstrual"),
    ];
    const banned = /many people find|it's common to|some women/i;
    for (const output of scenarios) {
      expect(output).not.toMatch(banned);
    }
  });
});
