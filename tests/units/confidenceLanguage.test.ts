// tests/unit/confidenceLanguage.test.ts

import {
    containsForbiddenLanguage,
    softendeterministic,
    softenDailyInsights,
    cleanupInsightText,
    getForecastConfidenceLabel,
    getTone,
    getOpener,
    FORBIDDEN_DETERMINISTIC_PHRASES,
  } from "../../src/utils/confidencelanguage";
  import type { DailyInsights } from "../../src/services/insightService";
  
  // ─── containsForbiddenLanguage ────────────────────────────────────────────────
  
  describe("containsForbiddenLanguage", () => {
    it("detects all forbidden phrases", () => {
      for (const phrase of FORBIDDEN_DETERMINISTIC_PHRASES) {
        expect(containsForbiddenLanguage(`Something ${phrase} here`)).toBe(true);
      }
    });
  
    it("returns false for clean text", () => {
      expect(containsForbiddenLanguage("You may feel lighter today.")).toBe(false);
      expect(containsForbiddenLanguage("Energy tends to improve.")).toBe(false);
      expect(containsForbiddenLanguage("Your patterns suggest a shift.")).toBe(false);
    });
  
    it("is case-insensitive", () => {
      expect(containsForbiddenLanguage("You WILL FEEL tired")).toBe(true);
      expect(containsForbiddenLanguage("This Will Happen")).toBe(true);
    });
  
    it("catches hormone certainty", () => {
      expect(containsForbiddenLanguage("Your estrogen will peak tomorrow")).toBe(true);
      expect(containsForbiddenLanguage("Progesterone will drop")).toBe(true);
    });
  });
  
  // ─── softendeterministic ──────────────────────────────────────────────────────
  
  describe("softendeterministic", () => {
    it("replaces 'you will feel' with probability language", () => {
      const result = softendeterministic("You will feel tired tomorrow", 0.8);
      expect(result).not.toContain("will feel");
      expect(result).toContain("likely to feel");
    });
  
    it("replaces 'will improve' with 'may improve'", () => {
      const result = softendeterministic("Energy will improve", 0.5);
      expect(result).toContain("may improve");
    });
  
    it("replaces 'always' with 'often'", () => {
      const result = softendeterministic("This always happens", 0.5);
      expect(result).toContain("often");
      expect(result).not.toContain("always");
    });
  
    it("replaces hormone certainty", () => {
      const result = softendeterministic("Estrogen will peak soon", 0.5);
      expect(result).not.toContain("will peak");
    });
  
    it("low confidence uses more hedged language", () => {
      const result = softendeterministic("You will feel better", 0.2);
      expect(result).toContain("may feel");
    });
  
    it("high confidence uses 'likely' not 'will'", () => {
      const result = softendeterministic("You will feel better", 0.9);
      expect(result).toContain("likely to feel");
      expect(result).not.toContain("will feel");
    });
  
    it("leaves clean text unchanged", () => {
      const clean = "You may notice improved energy.";
      expect(softendeterministic(clean, 0.8)).toBe(clean);
    });
  });
  
  // ─── softenDailyInsights ──────────────────────────────────────────────────────
  
  describe("softenDailyInsights", () => {
    it("softens all 7 fields", () => {
      const dirty: DailyInsights = {
        physicalInsight: "You will feel tired",
        mentalInsight: "Focus will improve",
        emotionalInsight: "You will experience calm",
        whyThisIsHappening: "Estrogen will rise",
        solution: "This will help",
        recommendation: "You will feel better after",
        tomorrowPreview: "Energy will get worse",
      };
      const result = softenDailyInsights(dirty, 0.5);
      for (const key of Object.keys(result) as (keyof DailyInsights)[]) {
        expect(containsForbiddenLanguage(result[key])).toBe(false);
      }
    });
  });
  
  // ─── cleanupInsightText ───────────────────────────────────────────────────────
  
  describe("cleanupInsightText", () => {
    it("deduplicates near-identical sentences", () => {
      const insights: DailyInsights = {
        physicalInsight: "Your body is under strain. Your body is under significant strain.",
        mentalInsight: "Focus is steady.",
        emotionalInsight: "Mood is stable.",
        whyThisIsHappening: "Hormones are shifting.",
        solution: "Rest today.",
        recommendation: "Sleep early.",
        tomorrowPreview: "Things ease tomorrow.",
      };
      const result = cleanupInsightText(insights);
      // Should remove near-duplicate
      const sentences = result.physicalInsight.split(/[.!?]/).filter(Boolean);
      expect(sentences.length).toBeLessThanOrEqual(2);
    });
  
    it("fixes contradiction between positive physical and negative mental", () => {
      const insights: DailyInsights = {
        physicalInsight: "Your body is under high strain right now.",
        mentalInsight: "Focus feels steady and balanced today.",
        emotionalInsight: "Mood is stable.",
        whyThisIsHappening: "Reason.",
        solution: "Action.",
        recommendation: "Guidance.",
        tomorrowPreview: "Preview.",
      };
      const result = cleanupInsightText(insights);
      // Mental should no longer say "balanced" when physical says "strain"
      expect(result.mentalInsight.toLowerCase()).not.toContain("balanced");
    });
  });
  
  // ─── Confidence tone ──────────────────────────────────────────────────────────
  
  describe("getTone", () => {
    it("< 0.4 → exploratory", () => {
      expect(getTone(0.2)).toBe("exploratory");
      expect(getTone(0.39)).toBe("exploratory");
    });
  
    it("0.4–0.69 → suggestive", () => {
      expect(getTone(0.4)).toBe("suggestive");
      expect(getTone(0.69)).toBe("suggestive");
    });
  
    it("≥ 0.7 → informed", () => {
      expect(getTone(0.7)).toBe("informed");
      expect(getTone(1.0)).toBe("informed");
    });
  });
  
  describe("getForecastConfidenceLabel", () => {
    it("< 7 logs → Building your forecast", () => {
      expect(getForecastConfidenceLabel(0.8, 3)).toBe("Building your forecast");
    });
  
    it("low confidence → Early signals", () => {
      expect(getForecastConfidenceLabel(0.3, 10)).toBe("Early signals");
    });
  
    it("medium confidence → Emerging patterns", () => {
      expect(getForecastConfidenceLabel(0.5, 10)).toBe("Emerging patterns");
    });
  
    it("high confidence → Based on your patterns", () => {
      expect(getForecastConfidenceLabel(0.8, 10)).toBe("Based on your patterns");
    });
  });