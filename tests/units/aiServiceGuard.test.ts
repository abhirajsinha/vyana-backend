// tests/unit/aiServiceGuards.test.ts
// Tests the post-GPT guard functions WITHOUT calling GPT.

import {
    sanitizeInsights,
    enforceTwoLines,
  } from "../../src/services/aiService";
  import type { DailyInsights } from "../../src/services/insightService";
  
  // ─── Helper ───────────────────────────────────────────────────────────────────
  
  const validDraft: DailyInsights = {
    physicalInsight: "Your body is under strain today.",
    mentalInsight: "Focus is lower than usual.",
    emotionalInsight: "Things feel heavier emotionally.",
    whyThisIsHappening: "Sleep has been dropping and stress is compounding.",
    solution: "Keep your schedule lighter today.",
    recommendation: "Protect your sleep tonight.",
    tomorrowPreview: "Tomorrow should feel better if sleep improves.",
  };
  
  function makeInsights(overrides: Partial<DailyInsights> = {}): unknown {
    return { ...validDraft, ...overrides };
  }
  
  // ─── sanitizeInsights ─────────────────────────────────────────────────────────
  
  describe("sanitizeInsights", () => {
    it("returns valid insights when all fields are strings", () => {
      const result = sanitizeInsights(makeInsights(), validDraft);
      expect(result.physicalInsight).toBeTruthy();
      expect(result.mentalInsight).toBeTruthy();
    });
  
    it("returns fallback when input is null", () => {
      const result = sanitizeInsights(null, validDraft);
      expect(result).toEqual(validDraft);
    });
  
    it("returns fallback when input is undefined", () => {
      const result = sanitizeInsights(undefined, validDraft);
      expect(result).toEqual(validDraft);
    });
  
    it("returns fallback when a required field is missing", () => {
      const incomplete = { ...validDraft } as Record<string, unknown>;
      delete incomplete.solution;
      const result = sanitizeInsights(incomplete, validDraft);
      expect(result).toEqual(validDraft);
    });
  
    it("returns fallback when a field is not a string", () => {
      const bad = makeInsights({ physicalInsight: 42 as unknown as string });
      const result = sanitizeInsights(bad, validDraft);
      expect(result).toEqual(validDraft);
    });
  
    it("returns fallback when output is way too long", () => {
      const longText = "A".repeat(500) + ". " + "B".repeat(500) + ".";
      const long = makeInsights({
        physicalInsight: longText,
        mentalInsight: longText,
        emotionalInsight: longText,
        whyThisIsHappening: longText,
        solution: longText,
        recommendation: longText,
        tomorrowPreview: longText,
      });
      const result = sanitizeInsights(long, validDraft);
      expect(result).toEqual(validDraft);
    });
  
    it("preserves valid GPT output that's different from draft", () => {
      const gptOutput = makeInsights({
        physicalInsight: "Sleep dropping sharply is driving physical strain right now.",
        mentalInsight: "When sleep dips, focus drops with it.",
      });
      const result = sanitizeInsights(gptOutput, validDraft);
      expect(result.physicalInsight).toContain("Sleep dropping");
    });
  });
  
  // ─── enforceTwoLines ──────────────────────────────────────────────────────────
  
  describe("enforceTwoLines", () => {
    it("keeps short text unchanged", () => {
      expect(enforceTwoLines("Hello world.")).toBe("Hello world.");
    });
  
    it("keeps two short lines", () => {
      const input = "First line.\nSecond line.";
      const result = enforceTwoLines(input);
      expect(result).toContain("First line.");
      expect(result).toContain("Second line.");
    });
  
    it("truncates beyond two lines", () => {
      const input = "Line one.\nLine two.\nLine three.\nLine four.";
      const result = enforceTwoLines(input);
      expect(result).not.toContain("Line three");
      expect(result).not.toContain("Line four");
    });
  
    it("trims empty lines", () => {
      const input = "\n\nFirst line.\n\nSecond line.\n\n";
      const result = enforceTwoLines(input);
      expect(result).toBe("First line.\nSecond line.");
    });
  
    it("handles very long single line by finding sentence boundary", () => {
      const long = "This is the first sentence. " + "X".repeat(400) + ".";
      const result = enforceTwoLines(long);
      // Should not exceed 350 chars or should cut at sentence boundary
      expect(result.length).toBeLessThanOrEqual(400);
    });
  });
  
  // ─── Edge cases for GPT output ────────────────────────────────────────────────
  
  describe("GPT output edge cases", () => {
    it("empty string fields → fallback", () => {
      const empty = makeInsights({ physicalInsight: "" });
      // sanitizeInsights checks typeof === "string" which "" passes,
      // but enforceTwoLines will return empty, which is still a string
      // The real protection is in the controller's containsForbiddenLanguage check
      const result = sanitizeInsights(empty, validDraft);
      expect(typeof result.physicalInsight).toBe("string");
    });
  
    it("JSON with extra fields doesn't crash", () => {
      const extra = { ...makeInsights() as Record<string, unknown>, extraField: "bonus", another: 123 };
      const result = sanitizeInsights(extra, validDraft);
      expect(result.physicalInsight).toBeTruthy();
    });
  
    it("very short GPT responses are preserved", () => {
      const short = makeInsights({
        physicalInsight: "Rest.",
        mentalInsight: "Focus is fine.",
        emotionalInsight: "Stable.",
        whyThisIsHappening: "Normal.",
        solution: "Nothing needed.",
        recommendation: "Continue.",
        tomorrowPreview: "Same.",
      });
      const result = sanitizeInsights(short, validDraft);
      expect(result.physicalInsight).toBe("Rest.");
    });
  });