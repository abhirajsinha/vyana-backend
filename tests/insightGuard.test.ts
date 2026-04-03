// tests/insightGuard.test.ts
// ─────────────────────────────────────────────────────────────────────────────
// Comprehensive test suite for the insight guard layer.
// Tests every scenario identified in the quality feedback:
//   - Zero-data overconfidence (Day 5, Day 13, all 28 days)
//   - Direction errors (negative tone during improving phase)
//   - Peak exaggeration (ovulation with 0 logs)
//   - Internal contradictions
//   - Hallucinated physical claims
//   - Technical language in user-facing text
//   - Capitalization bugs
// ─────────────────────────────────────────────────────────────────────────────

import {
    applyAllGuards,
    validateZeroDataSafety,
    validateDirectionCorrectness,
    validateConsistency,
    getPhaseDirection,
    type DailyInsightsShape,
    type InsightGuardInput,
  } from "../src/services/insightGuard";
  import { calculatePhaseFromCycleLength, type Phase } from "../src/services/cycleEngine";
  
  // ─── Test infrastructure ─────────────────────────────────────────────────────
  
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
  
  // ─── Test data: actual BAD outputs from the feedback docs ────────────────────
  
  const BAD_OUTPUT_DAY5_V1: DailyInsightsShape = {
    physicalInsight: "Energy is noticeably lower today as your period comes to an end. Your body is doing a lot of work right now, and it's normal to feel physically low.",
    mentalInsight: "Focus is lower today — your body is prioritizing recovery over clarity. It's okay to take it easier and allow yourself to rest.",
    emotionalInsight: "You find that small things feel easier today, as emotional resilience is returning. Everything feels a bit lighter as your hormone floor recedes.",
    whyThisIsHappening: "Both estrogen and progesterone are at their lowest point, which is what triggers bleeding. This hormonal shift is part of your body's natural recovery process.",
    solution: "Take it slow today — your body is doing real work to recover.",
    recommendation: "The recovery phase is close — most people notice a real shift in energy within a day or two of their period ending. Follicular energy starts returning sooner than most people expect.",
    tomorrowPreview: "Tomorrow is Day 6, and your next phase begins — you should notice a shift in energy and mood as you move into the follicular phase.",
  };
  
  const BAD_OUTPUT_DAY5_V2: DailyInsightsShape = {
    physicalInsight: "Energy is noticeably lower today as your period comes to an end. Your body is doing a lot right now, and it's normal to feel physically low.",
    mentalInsight: "Focus is lower today — your body is prioritizing recovery over clarity. It feels like everything takes more effort.",
    emotionalInsight: "You find that Small things feel harder than they should. Everything takes more effort right now.",
    whyThisIsHappening: "Both estrogen and progesterone are at their lowest point, which is what triggers bleeding. This is why your body is focusing on recovery right now.",
    solution: "It's okay to take it easier today — listen to your body and rest when you need to.",
    recommendation: "The recovery phase is close — most people notice a real shift in energy within a day or two of their period ending. Keep your expectations light as you ease into this transition.",
    tomorrowPreview: "You're on Day 6 of your cycle — the recovery phase is just around the corner. Most people feel a noticeable shift in energy and mood within 24 hours.",
  };
  
  const BAD_OUTPUT_DAY13: DailyInsightsShape = {
    physicalInsight: "Your energy is high right now, making you feel vibrant and ready to tackle the day. a slight awareness in your pelvic area, but it's overshadowed by your overall vitality.",
    mentalInsight: "Clarity and focus are at their peak — ideas flow more easily and conversations feel smoother. You're in a great space to tackle tasks that require your full attention.",
    emotionalInsight: "Things feel lighter and more enjoyable — it's easier to connect with people right now. Your social drive is at its fullest, making interactions feel effortless.",
    whyThisIsHappening: "The LH surge typically peaks around ovulation, accompanied by an estrogen peak, which fuels your high energy and social confidence.",
    solution: "Lean into this momentum — it's a good time for things that need energy or presence. Embrace the connections and activities that bring you joy.",
    recommendation: "Use this window to complete high-priority items and engage with others — your capacity is strong right now. Logging your mood, sleep, and stress over the next few days will provide sharper insights as you transition.",
    tomorrowPreview: "Tomorrow is ovulation — energy and confidence hit their monthly high. The next phase tends to bring a quieter, more inward energy — it's coming soon.",
  };
  
  // ─── SECTION 1: Zero-data guard on actual bad outputs ────────────────────────
  
  section("1. ZERO-DATA GUARD — Actual bad outputs from feedback");
  
  // Test Day 5 Version 1
  {
    const result = applyAllGuards({
      insights: BAD_OUTPUT_DAY5_V1,
      cycleDay: 5,
      cycleLength: 28,
      phase: "menstrual",
      logsCount: 0,
    });
    const validation = validateZeroDataSafety(result.insights);
    assert(validation.pass, "Day 5 V1: No hard assertions after guard",
      validation.failures.join("; "));
  
    // Specific checks from feedback
    assert(
      !result.insights.physicalInsight.includes("Energy is noticeably lower"),
      "Day 5 V1: 'Energy is noticeably lower' removed",
      `Got: ${result.insights.physicalInsight.substring(0, 60)}`
    );
    assert(
      !result.insights.mentalInsight.includes("Focus is lower today"),
      "Day 5 V1: 'Focus is lower today' softened",
      `Got: ${result.insights.mentalInsight.substring(0, 60)}`
    );
    assert(
      !result.insights.emotionalInsight.includes("hormone floor"),
      "Day 5 V1: Technical 'hormone floor' removed",
      `Got: ${result.insights.emotionalInsight.substring(0, 80)}`
    );
  }
  
  // Test Day 5 Version 2 — the one with "Small" capitalization bug
  {
    const result = applyAllGuards({
      insights: BAD_OUTPUT_DAY5_V2,
      cycleDay: 5,
      cycleLength: 28,
      phase: "menstrual",
      logsCount: 0,
    });
    const validation = validateZeroDataSafety(result.insights);
    assert(validation.pass, "Day 5 V2: No hard assertions after guard",
      validation.failures.join("; "));
  
    assert(
      !result.insights.emotionalInsight.includes("Everything takes more effort"),
      "Day 5 V2: 'Everything takes more effort' softened",
      `Got: ${result.insights.emotionalInsight.substring(0, 80)}`
    );
  }
  
  // Test Day 13 — ovulation over-optimism
  {
    const result = applyAllGuards({
      insights: BAD_OUTPUT_DAY13,
      cycleDay: 13,
      cycleLength: 28,
      phase: "follicular",
      logsCount: 0,
    });
    const validation = validateZeroDataSafety(result.insights);
    assert(validation.pass, "Day 13: No hard assertions after guard",
      validation.failures.join("; "));
  
    assert(
      !result.insights.physicalInsight.toLowerCase().includes("pelvic"),
      "Day 13: 'pelvic' hallucination removed",
      `Got: ${result.insights.physicalInsight.substring(0, 80)}`
    );
    assert(
      !result.insights.mentalInsight.includes("at their peak"),
      "Day 13: 'at their peak' capped",
      `Got: ${result.insights.mentalInsight.substring(0, 80)}`
    );
    assert(
      !result.insights.emotionalInsight.includes("at its fullest"),
      "Day 13: 'at its fullest' capped",
      `Got: ${result.insights.emotionalInsight.substring(0, 80)}`
    );
    assert(
      !result.insights.emotionalInsight.toLowerCase().includes("effortless"),
      "Day 13: 'effortless' capped",
      `Got: ${result.insights.emotionalInsight.substring(0, 80)}`
    );
    assert(
      !result.insights.tomorrowPreview.includes("hit their monthly high"),
      "Day 13: Tomorrow 'hit their monthly high' softened",
      `Got: ${result.insights.tomorrowPreview.substring(0, 80)}`
    );
  }
  
  // ─── SECTION 2: All 28 cycle days with zero data ────────────────────────────
  
  section("2. ALL 28 DAYS — Zero-data safety sweep");
  
  for (let day = 1; day <= 28; day++) {
    const phase = calculatePhaseFromCycleLength(day, 28);
    const direction = getPhaseDirection(day, 28);
  
    // Generate a plausible bad output for this day
    const badInsights: DailyInsightsShape = {
      physicalInsight: day <= 5
        ? "Your energy is noticeably lower today. Your body is doing a lot of work right now."
        : day <= 13
        ? "Your energy is high right now, making you feel vibrant. Physical vitality is at its monthly peak."
        : day <= 16
        ? "Energy is at its peak today. Your body is at full capacity."
        : "You feel drained today. Everything takes more effort right now.",
      mentalInsight: day <= 5
        ? "Focus is lower today. Everything takes more effort."
        : day <= 16
        ? "Clarity and focus are at their peak. You're in a great mental space."
        : "Focus is harder today. Mental load feels heavier.",
      emotionalInsight: day <= 5
        ? "Small things feel harder than they should. Your hormone floor recedes."
        : day <= 16
        ? "Things feel effortless. Your social drive is at its fullest, making interactions effortless."
        : "Emotional sensitivity is at its highest. Everything feels heavier.",
      whyThisIsHappening: "Both estrogen and progesterone are at their lowest point, which is what triggers bleeding.",
      solution: "Take it slow today — your body is doing real work.",
      recommendation: "Keep your expectations light as you ease into this transition.",
      tomorrowPreview: day <= 27
        ? "Tomorrow energy and confidence will hit their monthly high."
        : "Your period will start tomorrow.",
    };
  
    const result = applyAllGuards({
      insights: badInsights,
      cycleDay: day,
      cycleLength: 28,
      phase,
      logsCount: 0,
    });
  
    const validation = validateZeroDataSafety(result.insights);
    assert(validation.pass, `Day ${day} (${phase}/${direction}): Zero-data safe`,
      validation.failures.slice(0, 2).join("; "));
  
    // Direction check
    const dirValidation = validateDirectionCorrectness(result.insights, direction);
    assert(dirValidation.pass, `Day ${day} (${phase}/${direction}): Direction correct`,
      dirValidation.failures.slice(0, 2).join("; "));
  }
  
  // ─── SECTION 3: Consistency checks ──────────────────────────────────────────
  
  section("3. CONSISTENCY — No contradictions");
  
  // Test: improving + harder contradiction
  {
    const contradictory: DailyInsightsShape = {
      physicalInsight: "Energy is returning and improving rapidly.",
      mentalInsight: "Focus is harder than usual. Everything takes more effort.",
      emotionalInsight: "Small things feel harder. Resilience is returning.",
      whyThisIsHappening: "Hormones are stabilizing.",
      solution: "Keep things light.",
      recommendation: "Rest is key.",
      tomorrowPreview: "Tomorrow will be better.",
    };
  
    const result = applyAllGuards({
      insights: contradictory,
      cycleDay: 5,
      cycleLength: 28,
      phase: "menstrual",
      logsCount: 0,
    });
  
    const consistency = validateConsistency(result.insights);
    assert(consistency.pass, "Contradiction resolved: improving + harder",
      consistency.failures.join("; "));
  }
  
  // ─── SECTION 4: Direction guard edge cases ───────────────────────────────────
  
  section("4. DIRECTION GUARD — Phase-specific");
  
  // Late menstrual (day 4-5) should NOT have strong negatives
  {
    const lateMenustral: DailyInsightsShape = {
      physicalInsight: "Everything is harder than usual. Energy is draining away.",
      mentalInsight: "Focus is exhausting. Everything takes more effort.",
      emotionalInsight: "Things are worse than yesterday. Struggling with basic tasks.",
      whyThisIsHappening: "Low hormones.",
      solution: "Rest.",
      recommendation: "Take it easy.",
      tomorrowPreview: "Things will get worse tomorrow.",
    };
  
    const result = applyAllGuards({
      insights: lateMenustral,
      cycleDay: 5,
      cycleLength: 28,
      phase: "menstrual",
      logsCount: 0,
    });
  
    const allText = Object.values(result.insights).join(" ").toLowerCase();
    assert(
      !allText.includes("harder than") && !allText.includes("draining") && !allText.includes("exhausting") && !allText.includes("worse"),
      "Day 5 direction: No strong negatives in improving phase",
      `Found negatives in: ${allText.substring(0, 100)}`
    );
  }
  
  // ─── SECTION 5: Peak limiter ─────────────────────────────────────────────────
  
  section("5. PEAK LIMITER — Ovulation with zero data");
  
  {
    const peakExaggerated: DailyInsightsShape = {
      physicalInsight: "Energy is at its peak. Your body is at its strongest. This is the highest point of your cycle.",
      mentalInsight: "Focus is at its best. Confidence is at its fullest.",
      emotionalInsight: "Social drive is effortless. Connection is effortless.",
      whyThisIsHappening: "LH surge peaks.",
      solution: "Go all in.",
      recommendation: "Use this peak.",
      tomorrowPreview: "Energy and confidence hit their monthly high.",
    };
  
    const result = applyAllGuards({
      insights: peakExaggerated,
      cycleDay: 14,
      cycleLength: 28,
      phase: "ovulation",
      logsCount: 0,
    });
  
    const allText = Object.values(result.insights).join(" ").toLowerCase();
    assert(!allText.includes("at its peak"), "Ovulation 0-data: 'at its peak' removed",
      `Found: ${allText.substring(0, 100)}`);
    assert(!allText.includes("at its fullest"), "Ovulation 0-data: 'at its fullest' removed");
    assert(!allText.includes("effortless"), "Ovulation 0-data: 'effortless' removed");
    assert(!allText.includes("monthly high"), "Ovulation 0-data: 'monthly high' removed");
    assert(!allText.includes("highest point"), "Ovulation 0-data: 'highest point' removed");
  }
  
  // ─── SECTION 6: Hallucination filter ─────────────────────────────────────────
  
  section("6. HALLUCINATION FILTER");
  
  {
    const hallucinated: DailyInsightsShape = {
      physicalInsight: "You may notice a slight awareness in your pelvic area. A tingling sensation in your lower abdomen is normal.",
      mentalInsight: "Focus is good.",
      emotionalInsight: "Mood is stable.",
      whyThisIsHappening: "Hormonal shift.",
      solution: "Stay active.",
      recommendation: "Keep moving.",
      tomorrowPreview: "Tomorrow looks good.",
    };
  
    const result = applyAllGuards({
      insights: hallucinated,
      cycleDay: 14,
      cycleLength: 28,
      phase: "ovulation",
      logsCount: 0,
    });
  
    assert(
      !result.insights.physicalInsight.toLowerCase().includes("pelvic"),
      "Hallucination: 'pelvic' removed",
      `Got: ${result.insights.physicalInsight}`
    );
    assert(
      !result.insights.physicalInsight.toLowerCase().includes("tingling"),
      "Hallucination: 'tingling' removed",
      `Got: ${result.insights.physicalInsight}`
    );
  }
  
  // ─── SECTION 7: With-data users should NOT be over-softened ──────────────────
  
  section("7. WITH-DATA — Guards don't over-soften");
  
  {
    const personalizedInsights: DailyInsightsShape = {
      physicalInsight: "Your sleep has dropped from 7h to 4.5h. Energy is noticeably lower.",
      mentalInsight: "Focus is harder than usual because sleep has been poor.",
      emotionalInsight: "Everything takes more effort right now.",
      whyThisIsHappening: "Sleep disruption is the primary driver.",
      solution: "Get to bed earlier tonight.",
      recommendation: "Lighter load until sleep recovers.",
      tomorrowPreview: "If sleep improves tonight, tomorrow will feel better.",
    };
  
    const result = applyAllGuards({
      insights: personalizedInsights,
      cycleDay: 9,
      cycleLength: 28,
      phase: "follicular",
      logsCount: 7, // <-- HAS DATA
    });
  
    // Should keep assertive language — user has data backing it
    assert(
      result.insights.physicalInsight.includes("dropped") || result.insights.physicalInsight.includes("lower"),
      "With data: Keeps assertive sleep language",
      `Got: ${result.insights.physicalInsight.substring(0, 80)}`
    );
    assert(
      result.insights.emotionalInsight.includes("effort"),
      "With data: Keeps effort claim",
      `Got: ${result.insights.emotionalInsight.substring(0, 80)}`
    );
  }
  
  // ─── SECTION 8: Variable cycle lengths ───────────────────────────────────────
  
  section("8. VARIABLE CYCLE LENGTHS — 24 to 35 days");
  
  for (const cycleLength of [24, 26, 28, 30, 32, 35]) {
    for (const day of [1, 5, 10, 14, 20, cycleLength - 2, cycleLength]) {
      if (day > cycleLength) continue;
      const phase = calculatePhaseFromCycleLength(day, cycleLength);
  
      const generic: DailyInsightsShape = {
        physicalInsight: "Your energy is noticeably lower today.",
        mentalInsight: "Focus is at their peak today.",
        emotionalInsight: "Everything feels effortless and lighter.",
        whyThisIsHappening: "Hormone floor recedes.",
        solution: "Push through.",
        recommendation: "Go all in.",
        tomorrowPreview: "Energy will hit its monthly high tomorrow.",
      };
  
      const result = applyAllGuards({
        insights: generic,
        cycleDay: day,
        cycleLength,
        phase,
        logsCount: 0,
      });
  
      const validation = validateZeroDataSafety(result.insights);
      assert(validation.pass, `Cycle ${cycleLength} Day ${day}: Zero-data safe`,
        validation.failures.slice(0, 1).join("; "));
    }
  }
  
  // ─── SECTION 9: Tomorrow preview specifically ────────────────────────────────
  
  section("9. TOMORROW PREVIEW — Softened for zero-data");
  
  {
    const tomorrowTests = [
      "Tomorrow energy and confidence will hit their monthly high.",
      "You'll definitely feel better tomorrow.",
      "Your period will start tomorrow and everything will improve.",
      "Tomorrow is ovulation — energy and confidence hit their monthly high.",
    ];
  
    for (const preview of tomorrowTests) {
      const insights: DailyInsightsShape = {
        physicalInsight: "Energy can feel lower around this time.",
        mentalInsight: "Focus may not be at its sharpest.",
        emotionalInsight: "Things may feel a bit heavier.",
        whyThisIsHappening: "Hormonal shift.",
        solution: "Take it easy.",
        recommendation: "Rest.",
        tomorrowPreview: preview,
      };
  
      const result = applyAllGuards({
        insights,
        cycleDay: 13,
        cycleLength: 28,
        phase: "follicular",
        logsCount: 0,
      });
  
      assert(
        !result.insights.tomorrowPreview.includes("will ") || result.insights.tomorrowPreview.includes("may"),
        `Tomorrow softened: "${preview.substring(0, 40)}..."`,
        `Got: ${result.insights.tomorrowPreview.substring(0, 80)}`
      );
    }
  }
  
  // ─── SECTION 10: Regression — ensure the "correct" versions from feedback pass ─
  
  section("10. REGRESSION — Known-good outputs should pass");
  
  {
    const goodDay5: DailyInsightsShape = {
      physicalInsight: "Energy can still feel a bit lower toward the end of your period, especially if the earlier days were heavier. Your body is still in recovery, even as things begin to settle.",
      mentalInsight: "Focus may not be at its sharpest yet — this phase often leans more toward recovery than high mental effort.",
      emotionalInsight: "Compared to earlier in your period, emotional heaviness often starts to ease around this time, though things may not feel fully steady just yet.",
      whyThisIsHappening: "Hormone levels are still relatively low, but they're beginning to stabilize — this gradual shift is what brings energy and clarity back over the next few days.",
      solution: "Keep things lighter if you can — this is still a transition phase, not a push phase.",
      recommendation: "Over the next couple of days, you may start to notice a natural return of energy and motivation.",
      tomorrowPreview: "Tomorrow (Day 6) typically marks the start of the follicular phase, when many people begin to feel more clear-headed and physically lighter.",
    };
  
    const result = applyAllGuards({
      insights: goodDay5,
      cycleDay: 5,
      cycleLength: 28,
      phase: "menstrual",
      logsCount: 0,
    });
  
    const validation = validateZeroDataSafety(result.insights);
    assert(validation.pass, "Known-good Day 5: Passes validation",
      validation.failures.join("; "));
  
    // Verify it wasn't mangled — key phrases should survive
    assert(
      result.insights.physicalInsight.includes("can") || result.insights.physicalInsight.includes("may"),
      "Known-good Day 5: Probabilistic language preserved"
    );
  }
  
  {
    const goodDay13: DailyInsightsShape = {
      physicalInsight: "Energy can feel higher around this time in your cycle, with a lighter and more active physical state for many people.",
      mentalInsight: "Clarity and focus often improve around this phase, making it easier to think through things or stay engaged.",
      emotionalInsight: "Social and emotional openness may feel more natural right now, with interactions sometimes feeling easier or more enjoyable.",
      whyThisIsHappening: "Around this time, estrogen levels tend to rise and peak, which is often associated with increased energy, confidence, and sociability.",
      solution: "If you're feeling that lift, it can be a good time to engage with things that need presence or interaction — but there's no pressure to push.",
      recommendation: "This phase can be useful for momentum, but it's still worth paying attention to your own energy and pacing.",
      tomorrowPreview: "Tomorrow (around ovulation) is often when this upward shift peaks for many people, though your experience may vary.",
    };
  
    const result = applyAllGuards({
      insights: goodDay13,
      cycleDay: 13,
      cycleLength: 28,
      phase: "follicular",
      logsCount: 0,
    });
  
    const validation = validateZeroDataSafety(result.insights);
    assert(validation.pass, "Known-good Day 13: Passes validation",
      validation.failures.join("; "));
  }
  
  // ─── RESULTS ─────────────────────────────────────────────────────────────────

  it("all guard tests pass", () => {
    if (failures.length > 0) {
      console.log(`\n  FAILURES:`);
      for (const f of failures) {
        console.log(`  ${f}`);
      }
    }
    expect(failedTests).toBe(0);
  });