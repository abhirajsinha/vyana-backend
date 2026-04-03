// tests/insightGuard.edge.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// ROUND 2: Harder edge cases that simulate real GPT outputs
// ─────────────────────────────────────────────────────────────────────────────

import {
    applyAllGuards,
    validateZeroDataSafety,
    validateDirectionCorrectness,
    validateConsistency,
    getPhaseDirection,
    type DailyInsightsShape,
  } from "../src/services/insightGuard";
  import { calculatePhaseFromCycleLength } from "../src/services/cycleEngine";
  
  let totalTests = 0;
  let passedTests = 0;
  let failedTests = 0;
  const failures: string[] = [];
  
  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
    } else {
      failedTests++;
      const msg = detail ? `FAIL: ${testName} — ${detail}` : `FAIL: ${testName}`;
      failures.push(msg);
      console.log(`  ❌ ${msg}`);
    }
  }
  
  function section(name: string) {
    console.log(`\n${"═".repeat(60)}`);
    console.log(`  ${name}`);
    console.log(`${"═".repeat(60)}`);
  }
  
  // ─── SECTION A: Subtle GPT wording that sneaks past naive regex ──────────────
  
  section("A. SUBTLE GPT ASSERTIONS — sneaky wording");
  
  const SUBTLE_CASES: Array<{
    name: string;
    field: keyof DailyInsightsShape;
    text: string;
    shouldBeFixed: boolean;
  }> = [
    { name: "Your energy is high", field: "physicalInsight", text: "Your energy is high right now, making you feel vibrant.", shouldBeFixed: true },
    { name: "Focus is sharp today", field: "mentalInsight", text: "Focus is sharp today — decisions come easily.", shouldBeFixed: false }, // "is sharp" is not in our block list on purpose — it's less assertive
    { name: "Your energy is lower", field: "physicalInsight", text: "Your energy is lower than expected for this phase.", shouldBeFixed: true },
    { name: "You feel drained", field: "physicalInsight", text: "You feel drained and your body needs rest.", shouldBeFixed: true },
    { name: "Everything feels heavy", field: "emotionalInsight", text: "Everything feels like a weight today.", shouldBeFixed: true },
    { name: "at their peak (mental)", field: "mentalInsight", text: "Your cognitive abilities are at their peak right now.", shouldBeFixed: true },
    { name: "is noticeably better", field: "physicalInsight", text: "Energy is noticeably better today.", shouldBeFixed: true },
    { name: "LH surge peaks", field: "whyThisIsHappening", text: "The LH surge peaks today, driving ovulation.", shouldBeFixed: true },
    { name: "cervical mucus", field: "whyThisIsHappening", text: "Cervical mucus changes indicate fertility.", shouldBeFixed: true },
  ];
  
  for (const tc of SUBTLE_CASES) {
    const base: DailyInsightsShape = {
      physicalInsight: "Energy may feel different around this time.",
      mentalInsight: "Focus can vary during this phase.",
      emotionalInsight: "Emotional patterns may shift.",
      whyThisIsHappening: "Hormonal changes are typical.",
      solution: "Take it easy.",
      recommendation: "Listen to your body.",
      tomorrowPreview: "Tomorrow may bring changes.",
    };
    base[tc.field] = tc.text;
  
    const result = applyAllGuards({
      insights: base,
      cycleDay: 14,
      cycleLength: 28,
      phase: "ovulation",
      logsCount: 0,
    });
  
    if (tc.shouldBeFixed) {
      assert(
        result.insights[tc.field] !== tc.text,
        `Subtle: "${tc.name}" was modified`,
        `Still unchanged: "${result.insights[tc.field].substring(0, 60)}"`
      );
    }
  }
  
  // ─── SECTION B: Delayed period — should NOT be over-softened ─────────────────
  
  section("B. DELAYED PERIOD — appropriate tone");
  
  {
    const delayedInsights: DailyInsightsShape = {
      physicalInsight: "Your period is 3 days late — this can happen with stress, travel, or lifestyle changes.",
      mentalInsight: "It's natural to feel uncertain when your cycle doesn't follow the expected pattern.",
      emotionalInsight: "Emotional uncertainty around a late period is completely normal.",
      whyThisIsHappening: "Even regular cycles can be shifted by stress, illness, travel, or changes in routine.",
      solution: "Keep logging how you feel — the more data you have, the better we can support you.",
      recommendation: "If you're concerned, a pregnancy test or doctor visit might help.",
      tomorrowPreview: "Keep logging how you feel — the more data you have, the better we can support you.",
    };
  
    const result = applyAllGuards({
      insights: delayedInsights,
      cycleDay: 31,
      cycleLength: 28,
      phase: "luteal",
      logsCount: 5,
    });
  
    // Delayed period messages should survive — they're factual, not phase-speculative
    assert(
      result.insights.physicalInsight.includes("late") || result.insights.physicalInsight.includes("period"),
      "Delayed: Period delay message preserved",
      `Got: ${result.insights.physicalInsight.substring(0, 60)}`
    );
  }
  
  // ─── SECTION C: 1-2 logs (low data but NOT zero) ────────────────────────────
  
  section("C. LOW DATA (1-2 logs) — lighter softening");
  
  {
    const lowDataInsights: DailyInsightsShape = {
      physicalInsight: "Your latest log suggests sleep has been lower. Energy may be affected.",
      mentalInsight: "Focus may be affected by recent changes.",
      emotionalInsight: "Emotional state may be shifting based on your recent entry.",
      whyThisIsHappening: "This combines your cycle phase with limited data.",
      solution: "Log mood, sleep, and stress for the next 3 days.",
      recommendation: "The insights will get sharper fast.",
      tomorrowPreview: "Tomorrow may bring some changes as your cycle progresses.",
    };
  
    const result = applyAllGuards({
      insights: lowDataInsights,
      cycleDay: 10,
      cycleLength: 28,
      phase: "follicular",
      logsCount: 2,
    });
  
    // Should NOT apply zero-data guard (that's for 0 logs only)
    // But SHOULD apply intensity limiter
    assert(
      result.insights.physicalInsight.includes("sleep"),
      "Low data: Sleep reference preserved",
      `Got: ${result.insights.physicalInsight.substring(0, 60)}`
    );
  }
  
  // ─── SECTION D: High-data user — guards must NOT mangle ──────────────────────
  
  section("D. HIGH DATA (10+ logs) — minimal interference");
  
  {
    const highDataInsights: DailyInsightsShape = {
      physicalInsight: "Your sleep has dropped from 7.2h to 4.5h over the last 3 days. Energy is noticeably lower.",
      mentalInsight: "Focus is harder than usual because sleep has been declining sharply.",
      emotionalInsight: "Everything takes more effort — stress and fatigue are feeding into each other.",
      whyThisIsHappening: "Sleep disruption is driving how you feel right now, not your cycle phase.",
      solution: "Get to bed 30 minutes earlier tonight. It will change how tomorrow feels.",
      recommendation: "Keep your load lighter until sleep recovers — energy will come back quickly.",
      tomorrowPreview: "If your sleep improves tonight, you'll feel noticeably better tomorrow.",
    };
  
    const result = applyAllGuards({
      insights: highDataInsights,
      cycleDay: 9,
      cycleLength: 28,
      phase: "follicular",
      logsCount: 14,
    });
  
    // High-data personalized insights should pass through nearly unchanged
    assert(
      result.insights.physicalInsight.includes("dropped") && result.insights.physicalInsight.includes("4.5"),
      "High data: Specific sleep numbers preserved",
      `Got: ${result.insights.physicalInsight.substring(0, 80)}`
    );
    assert(
      result.insights.mentalInsight.includes("harder"),
      "High data: 'harder' preserved with data backing",
      `Got: ${result.insights.mentalInsight.substring(0, 80)}`
    );
    assert(
      result.insights.emotionalInsight.includes("effort"),
      "High data: 'effort' preserved",
    );
  }
  
  // ─── SECTION E: Every phase transition boundary ──────────────────────────────
  
  section("E. PHASE TRANSITIONS — boundary days");
  
  const BOUNDARY_CASES = [
    { day: 5, desc: "menstrual→follicular boundary" },
    { day: 6, desc: "first follicular day" },
    { day: 11, desc: "late follicular" },
    { day: 12, desc: "follicular→ovulation boundary" },
    { day: 14, desc: "ovulation peak" },
    { day: 15, desc: "ovulation→luteal boundary" },
    { day: 16, desc: "first luteal day" },
    { day: 22, desc: "mid luteal" },
    { day: 27, desc: "late luteal" },
    { day: 28, desc: "last day" },
  ];
  
  for (const bc of BOUNDARY_CASES) {
    const phase = calculatePhaseFromCycleLength(bc.day, 28);
    const direction = getPhaseDirection(bc.day, 28);
  
    const aggressive: DailyInsightsShape = {
      physicalInsight: "Your energy is at its peak. Everything feels effortless.",
      mentalInsight: "Focus is at their fullest. You feel unstoppable.",
      emotionalInsight: "Everything feels lighter. Your social drive is at its maximum.",
      whyThisIsHappening: "Your hormone floor recedes. LH surge peaks today.",
      solution: "Push through everything today.",
      recommendation: "Go all in on everything.",
      tomorrowPreview: "Tomorrow will hit the monthly high. Energy will be at its strongest.",
    };
  
    const result = applyAllGuards({
      insights: aggressive,
      cycleDay: bc.day,
      cycleLength: 28,
      phase,
      logsCount: 0,
    });
  
    const validation = validateZeroDataSafety(result.insights);
    assert(validation.pass, `Boundary ${bc.day} (${bc.desc}): zero-data safe`,
      validation.failures.slice(0, 2).join("; "));
  }
  
  // ─── SECTION F: GPT outputs with mixed good/bad in same sentence ─────────────
  
  section("F. MIXED QUALITY — good structure, bad assertions");
  
  {
    // This is the hardest case: the sentence structure is good but contains
    // one assertion word that needs fixing without breaking grammar
    const mixedQuality: DailyInsightsShape = {
      physicalInsight: "Energy can feel lower around this time, though your body is doing real work right now.",
      mentalInsight: "Focus is lower today — your body is prioritizing recovery over clarity.",
      emotionalInsight: "You find that emotional resilience is returning as your hormone floor recedes.",
      whyThisIsHappening: "Both estrogen and progesterone are at their lowest point, which triggers bleeding.",
      solution: "Take it slow — your body is doing real work to recover.",
      recommendation: "The recovery phase is close — most people notice a real shift in energy soon.",
      tomorrowPreview: "Tomorrow is Day 6, and your next phase begins — you should notice a shift.",
    };
  
    const result = applyAllGuards({
      insights: mixedQuality,
      cycleDay: 5,
      cycleLength: 28,
      phase: "menstrual",
      logsCount: 0,
    });
  
    // "hormone floor" should be gone
    assert(
      !result.insights.emotionalInsight.toLowerCase().includes("hormone floor"),
      "Mixed: 'hormone floor' removed from emotional insight",
      `Got: ${result.insights.emotionalInsight.substring(0, 80)}`
    );
  
    // "Focus is lower today" should be softened
    const validation = validateZeroDataSafety(result.insights);
    assert(validation.pass, "Mixed quality: passes zero-data safety",
      validation.failures.slice(0, 2).join("; "));
  }
  
  // ─── SECTION G: Verify guard output quality — not just safety ────────────────
  
  section("G. OUTPUT QUALITY — readable English after guards");
  
  {
    const rawBad: DailyInsightsShape = {
      physicalInsight: "Your energy is noticeably lower today as your period comes to an end.",
      mentalInsight: "Focus is lower today — your body is prioritizing recovery.",
      emotionalInsight: "You find that Small things feel harder than they should.",
      whyThisIsHappening: "Both estrogen and progesterone are at their lowest point.",
      solution: "Take it slow today.",
      recommendation: "Rest and recovery are important.",
      tomorrowPreview: "Tomorrow energy will hit its monthly high.",
    };
  
    const result = applyAllGuards({
      insights: rawBad,
      cycleDay: 5,
      cycleLength: 28,
      phase: "menstrual",
      logsCount: 0,
    });
  
    // Check outputs aren't broken English
    for (const [key, text] of Object.entries(result.insights)) {
      assert(
        !text.includes("  "),
        `Quality ${key}: no double spaces`,
        `Found double space in: "${text.substring(0, 60)}"`
      );
      assert(
        text.length > 5,
        `Quality ${key}: not empty/truncated`,
        `Too short: "${text}"`
      );
      assert(
        !/ [A-Z]/.test(text.replace(/^./, "").replace(/[.!?]\s+[A-Z]/g, "XX")),
        `Quality ${key}: no mid-sentence random capitals`,
        `Found: "${text.substring(0, 60)}"`
      );
    }
  
    // Specific: the "Small" capitalization bug from feedback should be fixed
    assert(
      !result.insights.emotionalInsight.match(/\bSmall\b/),
      "Quality: 'Small' mid-sentence capital fixed",
      `Got: "${result.insights.emotionalInsight.substring(0, 60)}"`
    );
  }
  
  // ─── SECTION H: Stress-led and sleep-disruption with data — should pass through
  
  section("H. CAUSAL OVERRIDES — sleep/stress with data preserved");
  
  {
    const sleepCrash: DailyInsightsShape = {
      physicalInsight: "Your sleep has dropped sharply — from around 7h to closer to 4.5. That kind of drop puts your body under real strain.",
      mentalInsight: "When sleep dips like this, focus drops with it — even simple things take more effort right now.",
      emotionalInsight: "Small things feel harder than they should — everything takes more effort right now.",
      whyThisIsHappening: "This isn't about your cycle — your sleep has taken a hit over the last few days.",
      solution: "The most important thing right now is getting your sleep back on track.",
      recommendation: "Keep your load lighter until your sleep recovers.",
      tomorrowPreview: "If your sleep improves tonight, you'll feel noticeably better tomorrow.",
    };
  
    const result = applyAllGuards({
      insights: sleepCrash,
      cycleDay: 9,
      cycleLength: 28,
      phase: "follicular",
      logsCount: 10,
    });
  
    // Sleep numbers and causal language should survive
    assert(
      result.insights.physicalInsight.includes("7h") || result.insights.physicalInsight.includes("4.5"),
      "Sleep crash: specific numbers preserved",
      `Got: ${result.insights.physicalInsight.substring(0, 80)}`
    );
    assert(
      result.insights.whyThisIsHappening.includes("sleep"),
      "Sleep crash: causal attribution preserved",
    );
  }
  
  // ─── SECTION I: Stable state — should not inject drama ───────────────────────
  
  section("I. STABLE STATE — no invented problems");
  
  {
    const stable: DailyInsightsShape = {
      physicalInsight: "Your body feels steady right now — nothing is pulling it in either direction.",
      mentalInsight: "Focus is stable — things feel manageable without extra effort or strain.",
      emotionalInsight: "Your mood is balanced — nothing feels too heavy or too elevated.",
      whyThisIsHappening: "There aren't any strong shifts right now — your system is in a stable, consistent state.",
      solution: "Keep doing what's working — consistency is what's supporting this balance.",
      recommendation: "Maintain your current rhythm — sleep, stress, and energy are all holding steady.",
      tomorrowPreview: "Things should feel similar tomorrow — no major shifts expected.",
    };
  
    const result = applyAllGuards({
      insights: stable,
      cycleDay: 11,
      cycleLength: 28,
      phase: "follicular",
      logsCount: 7,
    });
  
    // Stable state should pass through basically unchanged
    assert(
      result.insights.physicalInsight.includes("steady"),
      "Stable: 'steady' preserved",
    );
    assert(
      result.insights.whyThisIsHappening.includes("stable"),
      "Stable: 'stable' preserved",
    );
  }
  
  // ─── RESULTS ─────────────────────────────────────────────────────────────────

  it("all edge case guard tests pass", () => {
    if (failures.length > 0) {
      console.log(`\n  FAILURES:`);
      for (const f of failures) {
        console.log(`  ${f}`);
      }
    }
    expect(failedTests).toBe(0);
  });