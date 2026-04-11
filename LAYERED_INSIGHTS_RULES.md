# Vyana — Layered Insights: Engine Rules

**Status:** Draft v1.0
**Companion to:** LAYERED_INSIGHTS.md (the prose spec)
**Base Insights:** Insights.md
**Purpose:** Machine-readable rule blocks the engine can be coded against directly. No prose, no rationale. For rationale, see the companion document.

---

## 1. Core invariants

```rule
INVARIANT_1: Every check-in produces a response. There is no path where a user logs and sees nothing.
INVARIANT_2: Every Layer 3 sentence must be traceable to specific log entries that support it. If the data does not exist, the sentence does not fire.
INVARIANT_3: Acknowledgment fires at n=1. Interpretation fires only when threshold is met.
INVARIANT_4: When in doubt, the system falls back one layer.
INVARIANT_5: Stress is never claimed as caused by cycle phase.
```

---

## 2. Data model

```typescript
type Phase = "menstrual" | "follicular" | "ovulation" | "luteal";

type SymptomType = "A_phase_bound" | "B_phase_modulated" | "C_phase_independent" | "habit_field";

type SymptomKey =
  | "flow" | "cramps" | "energy" | "mood" | "sleep_quality"     // Tier 1
  | "headache" | "bloating" | "acne" | "back_pain" | "stress"   // Tier 2
  | "breast_tenderness" | "water";                              // Tier 2

type SymptomLog = {
  userId: string;
  symptom: SymptomKey;
  value: string;          // e.g. "moderate", "low", "yes"
  cycleDay: number;       // user's actual cycle day, not absolute
  phase: Phase;
  phaseDay: number;
  timestamp: ISODateString;
};

type InsightResponse = {
  layer1: VariantContent;          // always present
  layer2_wrapper?: string;          // only if logs present
  layer3_sentence?: string;         // only if threshold met
  body_note: string;                // always present, from layer1 variant
  orientation: {
    cycleDay: number;
    phase: Phase;
    phaseLabel: string;             // "Mid-luteal", "Early follicular", etc.
    daysToNextPeriod: number;
  };
};
```

---

## 3. Symptom typology table

```rule
SYMPTOM_TYPES = {
  flow:               { type: "A_phase_bound",       boundPhases: ["menstrual"] },
  cramps:             { type: "A_phase_bound",       boundPhases: ["menstrual"] },
  bloating:           { type: "A_phase_bound",       boundPhases: ["luteal"] },
  breast_tenderness:  { type: "A_phase_bound",       boundPhases: ["luteal"] },
  back_pain:          { type: "A_phase_bound",       boundPhases: ["menstrual", "luteal"] },

  energy:             { type: "B_phase_modulated",   expectedHigh: ["follicular", "ovulation"], expectedLow: ["menstrual", "luteal"] },
  mood:               { type: "B_phase_modulated",   expectedHigh: ["follicular", "ovulation"], expectedLow: ["luteal"] },
  sleep_quality:      { type: "B_phase_modulated",   expectedHigh: ["follicular"],              expectedLow: ["luteal"] },
  headache:           { type: "B_phase_modulated",   expectedHigh: [],                          expectedLow: [] },
  acne:               { type: "B_phase_modulated",   expectedHigh: ["follicular"],              expectedLow: ["luteal"] },

  stress:             { type: "C_phase_independent" },

  water:              { type: "habit_field" }
};
```

---

## 4. Window rules

```rule
WINDOW_RULES = {
  A_phase_bound: {
    countWithin: "current_cycle, same_phase",
    crossCycleLookback: 3,
    outOfBoundPhase: "accumulate_silently_no_immediate_claim"
  },
  B_phase_modulated: {
    countWithin: "same_phase",
    crossCycleLookback: 2,
    mismatchAllowed: true
  },
  C_phase_independent: {
    countWithin: "rolling_days",
    rollingWindowDays: 7,
    secondaryWindowDays: 14,
    mismatchAllowed: false,
    phaseCausationAllowed: false
  },
  habit_field: {
    triggersThresholds: false,
    referencableAsContext: true
  }
};
```

---

## 5. Threshold rules

```rule
THRESHOLDS = {
  A_phase_bound: {
    layer2_mirror_basic:        { logs: 1, window: "current_check_in" },
    layer2_mirror_continuity:   { logs: 2, window: "current_phase, current_cycle" },
    layer3_interpretation:      { logs: 3, window: "same_phase across last 2-3 cycles" }
  },
  B_phase_modulated: {
    layer2_mirror_basic:        { logs: 1, window: "current_check_in" },
    layer2_mirror_continuity:   { logs: 2, window: "current_phase, current_cycle" },
    layer3_interpretation:      { logs: 3, window: "same_phase across last 2 cycles" },
    layer3_mismatch_minimum:    { logs: 3, window: "same_phase across last 2 cycles, with phase_expectation_mismatch=true" }
  },
  C_phase_independent: {
    layer2_mirror_basic:        { logs: 1, window: "current_check_in" },
    layer2_mirror_rolling:      { logs: 3, window: "rolling 7 days" },
    layer3_interpretation:      { logs: 5, window: "rolling 14 days" }
  }
};
```

---

## 6. Layer claim permissions

```rule
LAYER_CLAIMS = {
  layer1: {
    allowed: ["phase_general", "hormonal_mechanism", "body_in_general"],
    forbidden: ["user_specific", "pattern_claim", "mismatch_flag"]
  },
  layer2: {
    allowed: ["phase_general", "acknowledgment_of_log", "in_cycle_continuity"],
    forbidden: ["cross_cycle_pattern", "user_body_tendency", "mismatch_flag"]
  },
  layer3: {
    allowed: ["user_specific_pattern", "alignment_flag", "mismatch_flag", "trend_claim", "cross_cycle_continuity"],
    forbidden: ["any_claim_not_traceable_to_specific_logs", "phase_causation_for_stress"],
    hardRule: "every_sentence_must_cite_underlying_log_data"
  }
};
```

---

## 7. Stress exception rules

```rule
STRESS_RULES = {
  windowing: "rolling_7_days_only",
  ignorePhaseWindowing: true,
  layer3_mismatchAllowed: false,
  layer3_phaseCausationAllowed: false,
  layer3_phaseContextAllowed: true,
  layer3_phaseContextFraming: "soft_observation_only",

  forbidden_phrases: [
    "your cycle is causing your stress",
    "this is hormonal stress",
    "your phase is making you stressed",
    "stress doesn't usually match this phase"
  ],
  allowed_phrases: [
    "the late luteal often amplifies what's already there",
    "stress has shown up most days this week",
    "the body is also doing the work of menstruating, which can make stress feel heavier"
  ]
};
```

---

## 8. Insight assembly pipeline

```rule
PIPELINE assembleInsight(user, currentDate):
  1. Compute cycle context:
       phase = computePhase(user, currentDate)
       phaseDay = computePhaseDay(user, currentDate)
       daysToNextPeriod = computeDaysToNextPeriod(user, currentDate)

  2. Select Layer 1 variant:
       variant = selectVariant(user, phase, phaseDay)
       layer1 = tier1_insights_phaseday.phases[phase][phaseDay - 1].variants[variant]

  3. Fetch current check-in logs:
       logs = getLogsForCheckIn(user, currentDate)

  4. If logs is empty:
       RETURN { layer1, body_note: layer1.body_note, orientation }

  5. For each logged symptom, compute current threshold tier:
       For symptom in logs:
         tier = computeThresholdTier(user, symptom, phase, phaseDay)
         // returns one of: "layer2_basic", "layer2_continuity", "layer2_rolling",
         //                 "layer3_alignment", "layer3_mismatch", "layer3_pattern"

  6. Generate Layer 2 wrapper:
       wrapper = buildLayer2Wrapper(logs, phase)
       // wrapper is a short opening clause, not new content

  7. If any symptom reached layer3 tier:
       layer3_sentence = buildLayer3Sentence(symptom, tier, supportingLogs)
       // template-based, with data substitution
       // every claim cited to underlying logs

  8. RETURN {
       layer1,
       layer2_wrapper: wrapper,
       layer3_sentence,
       body_note: layer1.body_note,
       orientation
     }
```

---

## 9. Threshold tier computation

```rule
FUNCTION computeThresholdTier(user, symptom, currentPhase, currentPhaseDay):
  type = SYMPTOM_TYPES[symptom].type

  IF type == "habit_field":
    RETURN null    // habit fields never reach a tier

  IF type == "C_phase_independent":
    rolling7 = countLogs(user, symptom, lastNDays: 7)
    rolling14 = countLogs(user, symptom, lastNDays: 14)

    IF rolling14 >= THRESHOLDS.C.layer3_interpretation.logs:
      RETURN "layer3_pattern"
    IF rolling7 >= THRESHOLDS.C.layer2_mirror_rolling.logs:
      RETURN "layer2_rolling"
    RETURN "layer2_basic"

  IF type == "A_phase_bound":
    inPhaseInCycle = countLogs(user, symptom, phase: currentPhase, cycle: currentCycle)
    inPhaseAcrossCycles = countLogsByPhase(user, symptom, phase: currentPhase, lastNCycles: 3)

    IF inPhaseAcrossCycles >= THRESHOLDS.A.layer3_interpretation.logs
       AND occurredInAtLeast2Cycles(user, symptom, currentPhase):
      RETURN "layer3_pattern"
    IF inPhaseInCycle >= THRESHOLDS.A.layer2_mirror_continuity.logs:
      RETURN "layer2_continuity"
    RETURN "layer2_basic"

  IF type == "B_phase_modulated":
    inPhaseInCycle = countLogs(user, symptom, phase: currentPhase, cycle: currentCycle)
    inPhaseAcross2Cycles = countLogsByPhase(user, symptom, phase: currentPhase, lastNCycles: 2)

    IF inPhaseAcross2Cycles >= THRESHOLDS.B.layer3_interpretation.logs
       AND occurredInAtLeast2Cycles(user, symptom, currentPhase):
      isMismatch = checkPhaseExpectationMismatch(symptom, value, currentPhase)
      IF isMismatch:
        RETURN "layer3_mismatch"
      RETURN "layer3_alignment"
    IF inPhaseInCycle >= THRESHOLDS.B.layer2_mirror_continuity.logs:
      RETURN "layer2_continuity"
    RETURN "layer2_basic"
```

---

## 10. Mismatch detection

```rule
FUNCTION checkPhaseExpectationMismatch(symptom, value, phase):
  // Only fires for Type B symptoms.
  // Returns true if the logged value contradicts the phase expectation.

  expectations = SYMPTOM_TYPES[symptom]

  IF symptom == "energy":
    IF phase IN expectations.expectedHigh AND value == "low":
      RETURN true
    IF phase IN expectations.expectedLow AND value == "high":
      RETURN false   // unexpected positives are not flagged as mismatch
    RETURN false

  IF symptom == "mood":
    IF phase IN expectations.expectedHigh AND value == "low":
      RETURN true
    RETURN false

  IF symptom == "sleep_quality":
    IF phase IN expectations.expectedHigh AND value == "poor":
      RETURN true
    RETURN false

  IF symptom == "acne":
    IF phase IN expectations.expectedHigh AND value == "yes":
      RETURN true
    RETURN false

  IF symptom == "headache":
    // headache has no strong phase expectation; never mismatch
    RETURN false

  // Type A and Type C symptoms never reach this function.
```

---

## 11. Layer 2 wrapper templates

```rule
LAYER2_WRAPPERS = {
  // Format: { symptomKey: { phase: { tier: "template string" } } }
  // {value} is substituted from the log; {phaseDay} from cycle context.

  cramps: {
    menstrual: {
      basic:      "Cramps on day {phaseDay} — the body in real work.",
      continuity: "Cramps for the {ordinal} day in a row — the body in the thick of it."
    },
    luteal: {
      basic: "Cramps in the late luteal — early prostaglandin signal as the body prepares to begin the next cycle."
    }
  },

  energy: {
    menstrual: {
      basic:      "Low energy on a bleeding day — accurate, not avoidant.",
      continuity: "Low energy continuing through the bleeding days."
    },
    follicular: {
      basic:      "Energy is {value} this week.",
      continuity: "Energy has been {value} for several days now."
    },
    luteal: {
      basic:      "{capitalizedValue} energy in the luteal — the body is running on a different fuel mix this week.",
      continuity: "Energy continuing to feel {value} as the luteal phase progresses."
    }
  },

  // ... full table to be completed in v1.1, one entry per (symptom × phase) pair
};
```

```rule
NOTE: The full Layer 2 wrapper table is approximately 40–50 entries.
It is intentionally not generated by GPT — it is hand-written, stored as data, and substituted at runtime.
This is a separate work item to be tracked as LAYER2_WRAPPERS_v1.
```

---

## 12. Layer 3 sentence templates

```rule
LAYER3_TEMPLATES = {
  pattern_cross_cycle: {
    template: "{capitalizedSymptom} on day {phaseDay} — this is the {ordinal} cycle in a row your body has done this around this time. It's a pattern, and the pattern is yours.",
    requires: {
      symptom: "any_type_A_or_B",
      logsAcrossCycles: 3,
      sameOrAdjacentPhaseDay: true
    }
  },

  alignment_in_phase: {
    template: "{capitalizedSymptom} this week is what your {phaseLabel} usually looks like for you. Your body has done this in {n} of the last {m} cycles.",
    requires: {
      type: "B_phase_modulated",
      isAlignment: true,
      logsAcrossCycles: 3
    }
  },

  mismatch_in_phase: {
    template: "{capitalizedSymptom} again this week. The {phaseLabel} usually brings the opposite, so this isn't what we'd expect to see — but that doesn't make it wrong. It just means something else might be shaping how you feel this week. Sleep, stress, iron, or anything else going on in your life.",
    requires: {
      type: "B_phase_modulated",
      isMismatch: true,
      logsAcrossCycles: 3
    }
  },

  rolling_trend: {
    template: "{capitalizedSymptom} has shown up {n} days in the last {windowDays}. The body is signaling something — worth listening to, even if the cause is outside the cycle.",
    requires: {
      type: "C_phase_independent",
      rollingLogs: 5,
      rollingWindow: 14
    }
  },

  out_of_phase_typeA: {
    template: "{capitalizedSymptom} outside of where it usually shows up. This has happened in {n} of your last cycles around the same time. It's worth knowing about your own body — and worth mentioning to a doctor if it becomes regular.",
    requires: {
      type: "A_phase_bound",
      occurredOutsideBoundPhase: true,
      crossCycleCount: 3
    }
  }
};
```

```rule
HARD_RULE: Layer 3 sentences are NEVER free-form generated. Every Layer 3 output is a template + substitution.
HARD_RULE: Every variable substituted into a Layer 3 template must be backed by an actual log query result.
HARD_RULE: If template requirements are not exactly met, the template does not fire and the system falls back to Layer 2.
```

---

## 13. Variant rotation rules

```rule
VARIANT_ROTATION = {
  variants: ["A", "B", "C", "D", "E", "F"],
  weights: { A: 0.20, B: 0.20, E: 0.25, D: 0.20, C: 0.075, F: 0.075 },
  rotationStrategy: "cycle_indexed",
  consistencyWithinCycle: true,

  specialRules: [
    "In late luteal (phaseDay 10-14), increase D weight to 0.35 (reframing matters most here)",
    "On day 1 of a new cycle, prefer A or B (biological grounding for fresh start)",
    "Never repeat the same variant for the same user on consecutive cycles for the same phaseDay"
  ]
};
```

---

## 14. Background jobs

```rule
NIGHTLY_JOB recomputeThresholdTiers:
  For each active user:
    For each symptom in TRACKED_SYMPTOMS:
      tier = computeThresholdTier(user, symptom, currentPhase, currentPhaseDay)
      cache.set(user, symptom, tier)

  Runtime: should complete in <10ms per user per symptom.
  Failure mode: if cache miss at check-in time, fall back to Layer 2 basic.
```

```rule
CHECK_IN_JOB respondToCheckIn(user, logs):
  // This runs in real time during the check-in flow.
  // Must complete in <300ms to preserve the "fused moment" UX.

  1. Read precomputed threshold tiers from cache.
  2. Assemble insight via PIPELINE assembleInsight().
  3. Return to client.
  4. Asynchronously: enqueue threshold recomputation for affected symptoms.
```

---

## 15. Failure modes and fallbacks

```rule
FALLBACK_RULES:
  IF Layer 3 template requirements not met:
    FALL BACK to Layer 2.
  IF Layer 2 wrapper template missing for (symptom × phase):
    FALL BACK to Layer 1 only, do not improvise.
  IF threshold cache miss:
    FALL BACK to Layer 2 basic for any logged symptoms.
  IF cycle context computation fails:
    BLOCK the check-in response and surface an error — never guess phase.

GOLDEN_RULE: Falling back is always safer than overclaiming.
```

---

## 16. Things the engine MUST NOT do

```rule
FORBIDDEN_BEHAVIORS:
  - NEVER claim a pattern with fewer logs than the threshold table requires.
  - NEVER use free-form GPT generation for Layer 3 sentences.
  - NEVER claim cycle phase as the cause of stress.
  - NEVER fire mismatch on n=1 or n=2.
  - NEVER fire mismatch for stress under any circumstances.
  - NEVER show streak counters, badges, or gamification surfaces tied to logging.
  - NEVER punish a missed check-in with guilt language.
  - NEVER reference weight or weight changes anywhere in any insight.
  - NEVER recommend food in a phase-coded way beyond the variant E content already authored.
  - NEVER claim the user "should" feel a certain way; only describe what bodies in this phase often feel.
```

---

## 17. Acceptance tests

```rule
TEST_1: zero_log_user_day_18
  Input:  user with no logs, currentPhase=luteal, currentPhaseDay=4
  Expect: response.layer1 != null, response.layer2_wrapper == undefined, response.layer3_sentence == undefined

TEST_2: first_time_cramps_log_day_2
  Input:  user with first ever log {symptom:cramps, value:moderate, phase:menstrual, phaseDay:2}
  Expect: response.layer2_wrapper matches LAYER2_WRAPPERS.cramps.menstrual.basic
          response.layer3_sentence == undefined

TEST_3: three_day_period_user_day_4
  Input:  user whose period ended on day 3, currentCycleDay=4
  Expect: response.orientation.phase == "follicular"
          response.orientation.phaseLabel includes "follicular"
          response.layer1 sourced from phases.follicular[0]

TEST_4: stress_crossing_cycle_boundary
  Input:  user logs stress=high on cycle day 28, then again on cycle day 1 next cycle
  Expect: NO layer3_sentence
          response.layer2_wrapper acknowledges stress without phase causation
          rolling 7-day count = 2 (below threshold)

TEST_5: cramps_three_cycles_same_phaseday
  Input:  user has logged cramps on day 2 in 3 consecutive cycles
  Expect: response.layer3_sentence matches LAYER3_TEMPLATES.pattern_cross_cycle
          {ordinal} == "third"

TEST_6: follicular_low_energy_three_cycles
  Input:  user logs energy=low in mid-follicular across 2 cycles, n=3 total
  Expect: response.layer3_sentence matches LAYER3_TEMPLATES.mismatch_in_phase

TEST_7: stress_threshold_crossed
  Input:  user logs stress=high on 5 of last 14 days
  Expect: response.layer3_sentence matches LAYER3_TEMPLATES.rolling_trend
          NO claim of phase causation

TEST_8: forbidden_phrase_check
  Input:  any insight response containing any phrase from STRESS_RULES.forbidden_phrases
  Expect: TEST FAILS — system must never produce these strings
```

---

*End of v1.0 rules document. Companion prose spec: LAYERED_INSIGHTS.md*