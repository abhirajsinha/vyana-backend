# VYANA PHASE 1 — COMPLETE REWRITE GUIDE

## This document contains everything. Execute top to bottom. Nothing else needed.

---

## TABLE OF CONTENTS

1. [Philosophy](#1-philosophy)
2. [Repo Cleanup — Files to DELETE](#2-repo-cleanup)
3. [Repo Cleanup — Files to KEEP](#3-files-to-keep)
4. [New File: featureFlags.ts](#4-feature-flags)
5. [REWRITE: cycleInsightLibrary.ts (Full 28-Day Templates)](#5-template-rewrite)
6. [REWRITE: insightService.ts (Simplified)](#6-insight-service)
7. [NEW: insightControllerPhase1.ts](#7-insight-controller)
8. [UPDATE: insightView.ts](#8-insight-view)
9. [UPDATE: insightGptService.ts (Simplified Prompt)](#9-gpt-service)
10. [UPDATE: chatService.ts (Ask Vyana)](#10-chat-service)
11. [UPDATE: chatController.ts (Simplified)](#11-chat-controller)
12. [UPDATE: routes/insights.ts](#12-routes)
13. [UPDATE: notificationTemplates.ts](#13-notifications)
14. [Smoke Test Script](#14-smoke-test)
15. [Testing Checklist](#15-testing)
16. [Execution Order](#16-execution)

---

## 1. PHILOSOPHY

### Phase 1 = Ship Clean

Two tiers only:
- **Tier 1 (Zero logs):** Phase-based observation. "Energy can feel lighter here."
- **Tier 2 (Any logs):** Reflect their data. "Energy has felt lower recently."

Five insight fields (from final voice doc):
- `physical` — What the body might be feeling
- `mental` — What focus/clarity might be like
- `emotional` — What emotions might feel like
- `orientation` — Grounded context (time-location, no teaching)
- `allowance` — What feels okay right now (zero action verbs)

Plus `nudge` — what logging unlocks next.

### The Master Rules
1. If a sentence explains, it breaks. If it notices, it works.
2. Never "many people." Never "because." Never "your energy is."
3. Always "Energy feels..." / "Things can feel..."
4. Allowance = zero verbs. Only "Slower can feel more natural."
5. If it sounds wise, delete it.

---

## 2. REPO CLEANUP — FILES TO DELETE

Delete these files. They are Phase 2+ complexity that Phase 1 does not use.

### Services to DELETE
```
src/services/correlationEngine.ts
src/services/pmsEngine.ts
src/services/insightMemory.ts
src/services/insightMonitor.ts
src/services/narrativeSelector.ts
src/services/interactionRules.ts
src/services/insightCause.ts
src/services/tomorrowEngine.ts
```

### Controllers to DELETE
```
src/controllers/insightController.ts  (replaced by insightControllerPhase1.ts)
src/controllers/healthController.ts   (Phase 2 — health pattern detection)
```

### Test infrastructure to DELETE
```
src/testRunner/generateTestCases.ts
src/testRunner/generateEdgeCases.ts
src/testRunner/runTestCases.ts
src/testRunner/validateResults.ts
src/testRunner/validateInsightText.ts
src/testRunner/testCases.ts
```

### Scripts to DELETE
```
scripts/compile-test-outputs.ts
scripts/fetch-test-insights.ts
scripts/run-menstrual-insight-demo.ts
scripts/run-scenarios.ts
scripts/scenario-fixtures.ts
scripts/seed-follicular-sleep-stress-user.ts
scripts/seed-health-pattern-user.ts
scripts/seed-midcycle-stable-user.ts
scripts/seed-test-cases.ts
scripts/test-gpt-menstrual-day2-second-cycle.ts
scripts/clear-health-cache.ts
```

### Routes to UPDATE (remove health patterns)
```
src/routes/health.ts  — DELETE this file
```

Remove from `src/index.ts`:
```typescript
// DELETE these lines:
import healthRoutes from "./routes/health";
app.use("/api/health", healthRoutes);
```

### Service barrel to UPDATE
`src/services/aiService.ts` — rewrite to only export what Phase 1 uses (see Step 9).

---

## 3. FILES TO KEEP (Untouched)

### Core
```
src/index.ts                          (minus health route removal)
src/lib/prisma.ts
src/config/featureFlags.ts            (NEW — Step 4)
```

### Middleware
```
src/middleware/auth.ts
src/middleware/errorHandler.ts
src/middleware/rateLimit.ts
src/middleware/requestLogger.ts
```

### Types
```
src/types/express.ts
src/types/cycleUser.ts
```

### Routes (keep all except health.ts)
```
src/routes/admin.ts
src/routes/auth.ts
src/routes/calendar.ts
src/routes/chat.ts
src/routes/cycle.ts
src/routes/home.ts
src/routes/insights.ts                (UPDATE import — Step 12)
src/routes/logs.ts
src/routes/user.ts
```

### Controllers (keep all except insightController.ts and healthController.ts)
```
src/controllers/authController.ts
src/controllers/calendarController.ts
src/controllers/chatController.ts     (UPDATE — Step 11)
src/controllers/cycleController.ts
src/controllers/homeController.ts
src/controllers/insightControllerPhase1.ts  (NEW — Step 7)
src/controllers/logController.ts
src/controllers/notificationController.ts
src/controllers/userController.ts
```

### Services (keep)
```
src/services/cycleEngine.ts
src/services/contraceptionengine.ts
src/services/contraceptionTransition.ts
src/services/cycleInsightLibrary.ts   (REWRITE — Step 5)
src/services/insightService.ts        (REWRITE — Step 6)
src/services/insightView.ts           (UPDATE — Step 8)
src/services/insightData.ts
src/services/insightGptService.ts     (UPDATE — Step 9)
src/services/insightGuard.ts
src/services/chatService.ts           (UPDATE — Step 10)
src/services/openaiClient.ts
src/services/googleAuthService.ts
src/services/transitionWarmup.ts
src/services/notificationScheduler.ts
src/services/notificationService.ts
src/services/notificationTemplates.ts (UPDATE — Step 13)
src/services/healthPatternEngine.ts   (keep — cycleController calls it)
src/services/hormoneengine.ts         (keep — GPT path uses it)
src/services/vyanaContext.ts          (keep — GPT path uses it)
src/services/insightValidator.ts      (keep — GPT path uses it)
```

### Utils (keep all)
```
src/utils/confidencelanguage.ts
src/utils/homeScreen.ts
src/utils/jwt.ts
src/utils/password.ts
src/utils/userPublic.ts
```

### Database (keep all — never delete migrations)
```
prisma/schema.prisma
prisma/migrations/*
```

### Cron
```
src/cron/notificationCron.ts
```

---

## 4. FEATURE FLAGS

**Create:** `src/config/featureFlags.ts`

```typescript
export const FEATURE_FLAGS = {
  PHASE1_MODE: true,
  ENABLE_GPT_ENHANCEMENT: true,  // GPT for 3+ logs
  MIN_LOGS_FOR_GPT: 3,
} as const;
```

---

## 5. TEMPLATE REWRITE — cycleInsightLibrary.ts

**REWRITE:** `src/services/cycleInsightLibrary.ts`

This is the complete file. Replace the entire contents.

```typescript
import type { CycleMode, Phase } from "./cycleEngine";

// ─── Field Structure (Final Vyana Voice) ────────────────────────────────────
//
// physical    — What the body might be feeling
// mental      — What focus/clarity might be like
// emotional   — What emotions might feel like
// orientation — Grounded context (time-location only, no teaching)
// allowance   — What feels okay right now (ZERO action verbs)
// nudge       — What logging unlocks next
//
// Tiers:
//   [0] = Zero logs — observational, "can feel", no identity
//   [1] = Medium — "You've noticed...", memory hints, no patterns
//   [2] = High — "For you...", earned, uses "often" not "always"

export interface DayInsight {
  cycleDay: number;
  phase: Phase;
  physical: [string, string, string];
  mental: [string, string, string];
  emotional: [string, string, string];
  orientation: [string, string, string];
  allowance: [string, string, string];
  nudge: [string, string, string];
  energyLevel: "very_low" | "low" | "moderate" | "rising" | "high" | "declining";
  focusLevel: "poor" | "moderate" | "good" | "sharp";
}

export interface ResolvedDayInsight {
  physical: string;
  mental: string;
  emotional: string;
  orientation: string;
  allowance: string;
  nudge: string;
  energyLevel: DayInsight["energyLevel"];
  focusLevel: DayInsight["focusLevel"];
}

// ─── CONTRACEPTION TEMPLATES ────────────────────────────────────────────────

export interface ContraceptionTemplates {
  physical: [string, string, string];
  mental: [string, string, string];
  emotional: [string, string, string];
  orientation: [string, string, string];
  allowance: [string, string, string];
}

export const HORMONAL_CONTRACEPTION_TEMPLATES: ContraceptionTemplates = {
  physical: [
    "Energy shifts can still happen. On contraception, they tend to follow sleep and stress more than your cycle.",
    "Energy has been shifting for you. It tends to track with how you've slept and what you're carrying.",
    "For you, energy often follows sleep and stress more than cycle timing. That's clear across your entries.",
  ],
  mental: [
    "Focus can still move day to day. Without strong hormonal swings, sleep and mental load tend to drive it.",
    "Focus varies for you. It tends to follow how rested you are.",
    "Focus tracks with rest and stress for you. Reliably.",
  ],
  emotional: [
    "Emotions can still shift. On contraception, the swings tend to be flatter, but they're still real.",
    "Emotional shifts show up for you even on contraception. They're real. Just driven by different things.",
    "Emotional shifts are present for you. Tied to life factors, not hormones. That's your rhythm.",
  ],
  orientation: [
    "On hormonal contraception.",
    "On hormonal contraception.",
    "On hormonal contraception.",
  ],
  allowance: [
    "What shows up is still real.",
    "Your rhythms are still yours.",
    "You know what drives your days.",
  ],
};

export const POST_IPILL_TEMPLATES: ContraceptionTemplates = {
  physical: [
    "Things can feel unpredictable for a little while. Energy can shift without a clear rhythm.",
    "Things can feel unpredictable for a little while. Energy can shift without a clear rhythm.",
    "Things can feel unpredictable for a little while. Energy can shift without a clear rhythm.",
  ],
  mental: [
    "Focus can feel scattered. Things are adjusting.",
    "Focus can feel scattered. Things are adjusting.",
    "Focus can feel scattered. Things are adjusting.",
  ],
  emotional: [
    "Emotions can feel more unpredictable. That's a normal response.",
    "Emotions can feel more unpredictable. That's a normal response.",
    "Emotions can feel more unpredictable. That's a normal response.",
  ],
  orientation: [
    "Cycle is resetting after emergency contraception.",
    "Cycle is resetting after emergency contraception.",
    "Cycle is resetting after emergency contraception.",
  ],
  allowance: [
    "Things are recalibrating.",
    "Things are recalibrating.",
    "Things are recalibrating.",
  ],
};

export const POST_BC_STOP_TEMPLATES: ContraceptionTemplates = {
  physical: [
    "Things can feel unpredictable for a few cycles as your natural rhythm returns.",
    "Things can feel unpredictable for a few cycles as your natural rhythm returns.",
    "Things can feel unpredictable for a few cycles as your natural rhythm returns.",
  ],
  mental: [
    "Focus can shift in unfamiliar ways as things find a new rhythm.",
    "Focus can shift in unfamiliar ways as things find a new rhythm.",
    "Focus can shift in unfamiliar ways as things find a new rhythm.",
  ],
  emotional: [
    "Emotions can feel more intense after stopping contraception. That's normal while things adjust.",
    "Emotions can feel more intense after stopping contraception. That's normal while things adjust.",
    "Emotions can feel more intense after stopping contraception. That's normal while things adjust.",
  ],
  orientation: [
    "Transitioning off hormonal contraception. Natural cycle returning.",
    "Transitioning off hormonal contraception. Natural cycle returning.",
    "Transitioning off hormonal contraception. Natural cycle returning.",
  ],
  allowance: [
    "This is a transition.",
    "This is a transition.",
    "This is a transition.",
  ],
};

// ─── NUDGE TEMPLATES ────────────────────────────────────────────────────────

export const NUDGE_ZERO = [
  "Log what you're noticing. That's where personal insights begin.",
  "One entry starts building your picture.",
  "Track what shows up today. That's the first step.",
];

export const NUDGE_EARLY = [
  "A few more entries across different days and your rhythm starts to show.",
  "Keep logging across your cycle. The picture gets clearer.",
  "More entries across different phases unlock the next level.",
];

export const NUDGE_MEDIUM = [
  "One more full cycle and these observations become your personal pattern.",
  "When this phase repeats next cycle, we'll see if what you've noticed holds.",
  "You're close. Another cycle and we'll know exactly what happens for you here.",
];

export const NUDGE_HIGH = [
  "Your insights are personalized to your cycle now.",
  "Your rhythm is mapped. Keep logging to catch changes.",
  "This is your pattern. Logging keeps it accurate.",
];

// ─── 28-DAY TEMPLATE LIBRARY ────────────────────────────────────────────────

const library: DayInsight[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // MENSTRUAL PHASE (Days 1–5)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    cycleDay: 1, phase: "menstrual",
    physical: [
      "Energy can feel heavier here. Moving around can take more effort.",
      "Energy has felt heavier around here. That heaviness is showing up again.",
      "Energy dips at the start of your period for you. It's here again.",
    ],
    mental: [
      "Thoughts can drift. Focus can feel harder to hold.",
      "Focus gets harder to hold during your period. If that's here today, it's familiar.",
      "Focus loosens for you on day 1. It does this often.",
    ],
    emotional: [
      "Small things can land harder. Emotions can feel closer to the surface.",
      "Emotions tend to sit heavier for you at the start. That weight is recognizable.",
      "Emotions feel heavier here. This shows up often.",
    ],
    orientation: [
      "Start of your period.",
      "Day 1 of your period.",
      "Day 1 of your period.",
    ],
    allowance: [
      "Slower can feel more natural.",
      "This part is familiar now.",
      "You know this part.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "very_low", focusLevel: "poor",
  },

  {
    cycleDay: 2, phase: "menstrual",
    physical: [
      "Bleeding can feel heaviest around day 2. Energy can still feel low.",
      "Day 2 heaviness has showed up before. It's here again.",
      "Day 2 is often one of your heavier days. Energy follows that.",
    ],
    mental: [
      "Concentration can take more effort. Shorter tasks can feel more manageable.",
      "Thinking takes more effort around here. That fog is recognizable.",
      "This is where focus feels most scattered for you. It passes.",
    ],
    emotional: [
      "Patience can feel thinner. Things that normally roll off might stick.",
      "Patience wears thinner during bleeding for you. If that's present, it makes sense.",
      "Emotions are raw here. You've seen this enough to recognize it.",
    ],
    orientation: [
      "Day 2 of your period.",
      "Day 2 of your period.",
      "Day 2 of your period.",
    ],
    allowance: [
      "Less can feel enough.",
      "Familiar territory.",
      "You know how this goes.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "very_low", focusLevel: "poor",
  },

  {
    cycleDay: 3, phase: "menstrual",
    physical: [
      "Energy can still feel low, but the heaviest part can start to ease.",
      "A slight easing has showed up around day 3 before. Energy isn't back, but the bottom can pass.",
      "For you, day 3 is where the heaviest part starts to ease. Not recovered, but turning.",
    ],
    mental: [
      "Thinking can start to feel slightly less foggy. Still not sharp, but shifting.",
      "Focus starts returning around here. Still fragile, but present.",
      "Focus begins to come back here for you. Often.",
    ],
    emotional: [
      "Emotional intensity can begin to soften. The edge can feel less sharp.",
      "The emotional weight begins to lift. This shift has showed up before.",
      "The emotional rawness softens around day 3 for you. Often.",
    ],
    orientation: [
      "Day 3 of your period.",
      "Day 3 of your period.",
      "Day 3 of your period.",
    ],
    allowance: [
      "Something can be starting to ease.",
      "Something is shifting.",
      "The turn is starting.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "low", focusLevel: "poor",
  },

  {
    cycleDay: 4, phase: "menstrual",
    physical: [
      "Energy can start to creep back around day 4. Bleeding can be lighter.",
      "Energy starts creeping back around here. That lift has showed up before.",
      "For you, day 4 is where energy starts its return. Often.",
    ],
    mental: [
      "Thoughts can start to feel less scattered. Clarity isn't fully back, but the fog lifts a little.",
      "The mental fog is clearing. Thinking gets easier around day 4 for you.",
      "Thinking sharpens here. This is where the fog lifts for you.",
    ],
    emotional: [
      "Emotions can feel less tender. The intensity from heavier bleeding can ease here.",
      "Emotions settle as bleeding eases. That steadying is familiar.",
      "Emotional steadiness returns around day 4 for you.",
    ],
    orientation: [
      "Day 4 of your period.",
      "Day 4 of your period.",
      "Day 4 of your period.",
    ],
    allowance: [
      "Recovery is quiet work.",
      "Settling in.",
      "Coming back.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "low", focusLevel: "moderate",
  },

  {
    cycleDay: 5, phase: "menstrual",
    physical: [
      "Bleeding can taper off around day 5. Energy can start to feel more available.",
      "Energy returning around day 5 has showed up before. That lift is here again.",
      "For you, day 5 marks the shift. Energy returns here often.",
    ],
    mental: [
      "Focus can return more fully here. The transition out of your period can feel mental first.",
      "Focus is coming back. This transition happens around here for you.",
      "Focus sharpens. You've seen this transition enough to trust it.",
    ],
    emotional: [
      "Emotional intensity from the first few days can soften by now. Things feel lighter.",
      "The heaviness eases around now. Things start feeling clearer emotionally.",
      "Emotional clarity comes back around day 5 for you.",
    ],
    orientation: [
      "Late period. Transitioning.",
      "Late period. Transitioning.",
      "End of period. Transition begins.",
    ],
    allowance: [
      "The shift is underway.",
      "Lighter already.",
      "You know what's coming next.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "low", focusLevel: "moderate",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // FOLLICULAR PHASE (Days 6–13)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    cycleDay: 6, phase: "follicular",
    physical: [
      "Energy can feel like it's waking up. The heaviness from your period can feel behind you.",
      "Energy picking up around here has showed up before. That lift is arriving.",
      "Energy wakes up here for you. Often. It's arriving again.",
    ],
    mental: [
      "Thinking can feel less cloudy. Space for ideas can start to open.",
      "Clarity starts after your period for you. It's coming in.",
      "The fog clears in your early follicular phase for you.",
    ],
    emotional: [
      "There can be a quiet lift. Not dramatic, just lighter.",
      "Mood lightens around now. This has showed up before.",
      "That quiet lift in mood is here. Familiar.",
    ],
    orientation: [
      "Early follicular. A few days past your period.",
      "Early follicular.",
      "Early follicular.",
    ],
    allowance: [
      "Something is waking up.",
      "Arriving.",
      "Waking up.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "rising", focusLevel: "moderate",
  },

  {
    cycleDay: 7, phase: "follicular",
    physical: [
      "Energy can feel like it's building steadily. The heaviness from last week is fading.",
      "Energy building through this stretch has showed up before. That momentum is here.",
      "Energy builds through here for you. Often. The momentum is real.",
    ],
    mental: [
      "Thinking can feel clearer than last week. Ideas can come a little easier.",
      "Clarity has been building through this part for you. It's continuing.",
      "Focus sharpens through here for you.",
    ],
    emotional: [
      "Mood can feel more even. The emotional weight from earlier can be lifting.",
      "Mood stabilizing around now has showed up before. That steadiness is arriving.",
      "Emotional stability builds here for you. Often.",
    ],
    orientation: [
      "Follicular phase. A few days past your period.",
      "Follicular phase.",
      "Follicular phase.",
    ],
    allowance: [
      "Building quietly.",
      "Continuing.",
      "This is your build.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "rising", focusLevel: "good",
  },

  {
    cycleDay: 8, phase: "follicular",
    physical: [
      "Energy can feel like it's climbing. Things can feel more physically available.",
      "Energy climbs around here for you. This upward shift has showed up before.",
      "For you, energy climbs steadily through your follicular phase. It's building.",
    ],
    mental: [
      "Focus can start to sharpen. Things that felt effortful last week can feel easier.",
      "Thinking has been getting clearer through this phase for you. It's continuing.",
      "Focus sharpens here. This is where clarity grows for you.",
    ],
    emotional: [
      "Mood can feel more stable and positive. There can be a sense of steadiness.",
      "Mood is steadier now. That stability is recognizable.",
      "Mood stabilizes here for you. Often.",
    ],
    orientation: [
      "Follicular phase.",
      "Follicular phase.",
      "Follicular phase.",
    ],
    allowance: [
      "Building.",
      "Climbing.",
      "On the way up.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "rising", focusLevel: "good",
  },

  {
    cycleDay: 9, phase: "follicular",
    physical: [
      "Energy can feel stronger. Things can feel more capable than earlier this week.",
      "Energy getting stronger through this stretch has showed up before. It's continuing.",
      "Energy continues to build here for you. Often stronger each day.",
    ],
    mental: [
      "Thinking can feel sharper. Things that needed effort before can come easier now.",
      "Clarity has been getting stronger around here for you. It's present.",
      "Focus is strong here for you.",
    ],
    emotional: [
      "Mood can feel more positive. Social energy can feel more available.",
      "Mood lifting through this part has showed up before. That ease is recognizable.",
      "Mood lifts through here for you. Familiar.",
    ],
    orientation: [
      "Follicular phase.",
      "Follicular phase.",
      "Follicular phase.",
    ],
    allowance: [
      "Things can feel easier.",
      "Building steadily.",
      "This is your stride.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "rising", focusLevel: "good",
  },

  {
    cycleDay: 10, phase: "follicular",
    physical: [
      "Energy can feel stronger around this point. Things can feel more physically capable.",
      "Energy picks up around here for you. This has showed up before.",
      "This is where your energy feels strongest. It's here again.",
    ],
    mental: [
      "Thinking can feel sharper. Complex things can feel more approachable.",
      "Clarity has been stronger in this part of your cycle. It's showing up again.",
      "Clarity is at its strongest around mid-follicular for you.",
    ],
    emotional: [
      "Mood can feel more even and positive. Being around people can feel easier.",
      "Mood feels steadier around now. That ease is recognizable.",
      "Your mood often lifts here. That brightness is familiar.",
    ],
    orientation: [
      "Mid follicular phase.",
      "Mid follicular.",
      "Mid follicular.",
    ],
    allowance: [
      "Things can feel easier.",
      "Familiar ground.",
      "This is your space.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "high", focusLevel: "sharp",
  },

  {
    cycleDay: 11, phase: "follicular",
    physical: [
      "Energy can feel at or near its strongest. Everything can feel more available.",
      "This kind of energy has showed up before around here. It's holding strong.",
      "For you, energy stays at its strongest through here. Often.",
    ],
    mental: [
      "Thinking can feel quick and clear. New ideas can come more naturally.",
      "Focus has been sharp around now for you. That clarity is present.",
      "This is your sharpest mental stretch. It shows up here often.",
    ],
    emotional: [
      "Confidence and social energy can feel more present.",
      "Feeling more socially available around here has showed up before. It's here again.",
      "Social energy and confidence are strong here for you. Often.",
    ],
    orientation: [
      "Follicular phase. Approaching the middle of your cycle.",
      "Follicular phase. Getting close.",
      "Follicular phase. Almost there.",
    ],
    allowance: [
      "Something is cresting.",
      "Holding strong.",
      "At your strongest.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "high", focusLevel: "sharp",
  },

  {
    cycleDay: 12, phase: "follicular",
    physical: [
      "Energy can feel at its strongest here. Everything can feel physically available.",
      "Energy building toward this point has showed up before. It's nearing its strongest.",
      "For you, this is where physical energy is fullest. Often. It's here.",
    ],
    mental: [
      "Thinking can feel quick and sharp. New ideas can come more naturally.",
      "Thinking has been sharp around here for you. That clarity is present.",
      "Sharpest thinking for you. Right before ovulation, often.",
    ],
    emotional: [
      "Confidence and social energy can feel more present. Being around people can feel easier.",
      "Confidence tends to be higher before ovulation for you. It's showing up again.",
      "Confidence and ease are fullest here for you. Often.",
    ],
    orientation: [
      "Late follicular. Approaching ovulation.",
      "Late follicular. Approaching ovulation.",
      "Late follicular. Ovulation approaching.",
    ],
    allowance: [
      "Something is cresting.",
      "Nearing the top.",
      "At the top.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "high", focusLevel: "sharp",
  },

  {
    cycleDay: 13, phase: "follicular",
    physical: [
      "Energy can feel at its strongest. Everything can feel fully capable.",
      "This kind of energy has showed up before around here. It's holding.",
      "For you, this is still the strongest point. It holds here before the shift.",
    ],
    mental: [
      "Thinking can feel clear and quick. This can be one of the sharpest mental days.",
      "Focus stays sharp on this last day before the shift for you. It's present.",
      "Focus is still sharp here. You've seen this enough to trust it.",
    ],
    emotional: [
      "Social and emotional energy can feel at their fullest.",
      "Feeling most open and socially available around now has showed up before.",
      "Connection energy is fullest for you. Often, right here.",
    ],
    orientation: [
      "Late follicular. The middle of your cycle is arriving.",
      "Late follicular. Almost at the middle.",
      "Late follicular. Right before the shift.",
    ],
    allowance: [
      "This can be a bright spot.",
      "Still at the brightest.",
      "The last bright day.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "high", focusLevel: "sharp",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OVULATION PHASE (Days 14–16)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    cycleDay: 14, phase: "ovulation",
    physical: [
      "Energy can feel at its highest around ovulation. A brief, bright physical lift can show up.",
      "This energy lift around ovulation has showed up before. It's here again.",
      "This is where your energy feels lightest. It's here again.",
    ],
    mental: [
      "Thinking can feel clear. Being around people can feel easier.",
      "Clarity tends to be strong around now for you. It's here.",
      "Clarity is at its strongest around ovulation for you.",
    ],
    emotional: [
      "Mood can feel buoyant. There can be a lightness that shows up around this time.",
      "Mood lifting around ovulation has showed up before. That brightness is recognizable.",
      "Your mood often lifts here. That brightness is familiar.",
    ],
    orientation: [
      "Ovulation. Middle of your cycle.",
      "Ovulation. Middle of your cycle.",
      "Ovulation.",
    ],
    allowance: [
      "A bright spot.",
      "Recognizable brightness.",
      "This is your space.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "high", focusLevel: "sharp",
  },

  {
    cycleDay: 15, phase: "ovulation",
    physical: [
      "Energy can still feel high, but a subtle shift can begin. The strongest part can be passing.",
      "Energy starting to dip just after ovulation has showed up before. That subtle shift can be arriving.",
      "For you, the strongest part passes right around here. The dip begins.",
    ],
    mental: [
      "Thinking can still feel clear, but the sharpest edge can soften slightly.",
      "The sharpest clarity starts to soften around here for you. Familiar.",
      "Clarity starts to soften after ovulation for you. Often.",
    ],
    emotional: [
      "Mood can still feel positive, but there can be a quiet shift beginning underneath.",
      "Mood stays positive but something quieter starts to settle in. This has showed up before.",
      "Mood begins its quiet shift here. You've seen this transition often.",
    ],
    orientation: [
      "Just past ovulation. A transition is starting.",
      "Post-ovulation. Transition beginning.",
      "Post-ovulation.",
    ],
    allowance: [
      "Still bright, but shifting.",
      "The shift is starting.",
      "The turn.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "high", focusLevel: "sharp",
  },

  {
    cycleDay: 16, phase: "ovulation",
    physical: [
      "Energy can start to feel less available. Things are shifting.",
      "Energy starting to fade around here has showed up before. That shift is arriving.",
      "Energy fades around here for you. This transition arrives often.",
    ],
    mental: [
      "Focus can feel slightly harder to sustain. The ease of the last few days can fade.",
      "Focus gets harder to hold after ovulation for you. It's starting.",
      "Focus starts requiring more effort. You've seen this often.",
    ],
    emotional: [
      "Emotions can start to feel more inward. Social energy can feel less automatic.",
      "A quieting here has showed up before. Social energy pulls back. It's familiar.",
      "The emotional shift inward begins here for you. Often.",
    ],
    orientation: [
      "Transitioning from ovulation into the luteal phase.",
      "Transitioning into luteal phase.",
      "Into the luteal phase.",
    ],
    allowance: [
      "Something is changing.",
      "Shifting gears.",
      "The quiet part begins.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "high", focusLevel: "good",
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LUTEAL PHASE (Days 17–28)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    cycleDay: 17, phase: "luteal",
    physical: [
      "Energy can feel more moderate. Not low, but the brightness from ovulation can be gone.",
      "Energy settling into something more moderate here has showed up before. It's here again.",
      "Energy settles into moderate for you here. Often, after ovulation, this is where things land.",
    ],
    mental: [
      "Focus can feel steady but less sharp. Detail work can feel more tiring.",
      "Focus feels steady but less effortless around now for you. Recognizable.",
      "Focus is present but requires more effort. You've seen this often.",
    ],
    emotional: [
      "Emotions can feel more present. Things that were easy to brush off might linger.",
      "Emotions are more present in the luteal phase for you. That shift is arriving.",
      "Emotions are closer for you in the luteal phase. Often.",
    ],
    orientation: [
      "Early luteal phase.",
      "Early luteal.",
      "Early luteal.",
    ],
    allowance: [
      "A quieter stretch.",
      "Settling.",
      "Familiar quiet.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "moderate", focusLevel: "good",
  },

  {
    cycleDay: 18, phase: "luteal",
    physical: [
      "Energy can feel steady but not strong. Mild fullness or tenderness can begin.",
      "Some physical changes starting around here have showed up before. They're arriving again.",
      "For you, physical changes start showing up around day 18. Recognizable.",
    ],
    mental: [
      "Thinking can feel reliable but slower. Careful, steady work can feel more natural.",
      "Focus has been steady but slower in this stretch for you. It's familiar.",
      "Thinking slows down here for you. Often. Steady work fits best.",
    ],
    emotional: [
      "Emotions can feel grounded but more present. Things can sit with you longer.",
      "Emotions becoming more present around now has showed up before. That shift is here.",
      "Emotional presence deepens here for you. Often, around this point.",
    ],
    orientation: [
      "Early luteal phase.",
      "Early luteal.",
      "Early luteal.",
    ],
    allowance: [
      "A steady stretch.",
      "Grounded here.",
      "Familiar ground.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "moderate", focusLevel: "good",
  },

  {
    cycleDay: 19, phase: "luteal",
    physical: [
      "Energy can feel like it's slowly declining. Not a crash, more of a gradual settling.",
      "Energy declining through this phase has showed up before. That gradual settling is here.",
      "For you, energy declines steadily through the luteal phase. It's doing that now.",
    ],
    mental: [
      "Focus can feel present but less resilient. Interruptions can feel more disruptive.",
      "Focus becoming more fragile around now has showed up before. It's recognizable.",
      "Focus gets more fragile here. Often. You know this stretch.",
    ],
    emotional: [
      "Emotions can feel a little closer. Sensitivity can increase without a clear reason.",
      "Emotions are closer here for you. This shift has showed up before.",
      "Emotional sensitivity rises here for you. Often.",
    ],
    orientation: [
      "Luteal phase.",
      "Luteal phase.",
      "Luteal phase.",
    ],
    allowance: [
      "Settling is natural here.",
      "Gradual.",
      "Familiar territory.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "moderate", focusLevel: "moderate",
  },

  {
    cycleDay: 20, phase: "luteal",
    physical: [
      "Energy can feel more limited. Things can feel heavier or more sluggish.",
      "This kind of heaviness around here has showed up before. It's here again.",
      "For you, energy feels more limited around day 20. Often.",
    ],
    mental: [
      "Thinking can feel slower. Steady, unhurried work can feel more manageable.",
      "Thinking slowing down around here has showed up before. That pace is familiar.",
      "Thinking slows here for you. Often. You know how to work with it.",
    ],
    emotional: [
      "Emotions can feel quieter or more muted.",
      "A quieter emotional tone around now has showed up before. It's recognizable.",
      "Emotional tone goes quieter here for you. Often.",
    ],
    orientation: [
      "Luteal phase.",
      "Luteal phase.",
      "Luteal phase.",
    ],
    allowance: [
      "Quieter is natural here.",
      "Settling in.",
      "You know this part.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "moderate", focusLevel: "moderate",
  },

  {
    cycleDay: 21, phase: "luteal",
    physical: [
      "Energy can feel less consistent. Some days feel okay, others feel heavier.",
      "Energy becoming more variable around here has showed up before. It's starting.",
      "For you, energy gets unpredictable around day 21. This has showed up before.",
    ],
    mental: [
      "Focus can feel more variable. Concentration can come and go.",
      "Thinking becoming less steady around now has showed up before. That wobble is familiar.",
      "Focus wobbles here for you. Often. It steadies again later.",
    ],
    emotional: [
      "Emotions can start to shift more. Stability can feel harder to hold.",
      "Emotional shifts starting around here have showed up before. They're arriving.",
      "Emotional stability starts shifting here for you. Often.",
    ],
    orientation: [
      "Luteal phase. Approaching the second half.",
      "Luteal phase.",
      "Luteal phase.",
    ],
    allowance: [
      "Things can feel more changeable here.",
      "Variable territory.",
      "You know this shift.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "declining", focusLevel: "moderate",
  },

  {
    cycleDay: 22, phase: "luteal",
    physical: [
      "Energy can feel like it's declining more noticeably. Bloating, tenderness, or fatigue can show up.",
      "Energy dropping around mid-luteal has showed up before. That dip is arriving.",
      "For you, mid-luteal is where energy often drops. It's here.",
    ],
    mental: [
      "Focus can feel harder. Tasks that felt easy last week can feel more draining.",
      "Thinking gets harder around here for you. The effort is noticeable.",
      "Focus requires significantly more effort here. This arrives often.",
    ],
    emotional: [
      "Emotions can start to feel more intense or reactive. Small irritations can feel bigger.",
      "Emotions intensifying in this part of your cycle has showed up before. It's here again.",
      "Emotional intensity is at its strongest in mid-luteal for you. Often.",
    ],
    orientation: [
      "Mid luteal phase.",
      "Mid luteal.",
      "Mid luteal.",
    ],
    allowance: [
      "Things feel heavier. That's real.",
      "Heavier. Familiar.",
      "You know this stretch.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "declining", focusLevel: "moderate",
  },

  {
    cycleDay: 23, phase: "luteal",
    physical: [
      "Physical discomfort can increase. Headaches, bloating, or aches can show up here.",
      "This kind of physical discomfort around here has showed up before. It's arriving.",
      "For you, physical discomfort builds around day 23. Recognizable.",
    ],
    mental: [
      "Mood can feel lower or more reactive. Things that roll off can stick.",
      "Mood dipping around here has showed up before. That heaviness is familiar.",
      "Mood dips here for you. Often. It lifts again.",
    ],
    emotional: [
      "Feelings can run closer to the surface. Small triggers can land harder.",
      "Emotional sensitivity being strongest around here has showed up before. It's here.",
      "Emotional sensitivity is fullest around day 23 for you. Often.",
    ],
    orientation: [
      "Mid to late luteal phase.",
      "Mid to late luteal.",
      "Mid to late luteal.",
    ],
    allowance: [
      "Heavier is natural here.",
      "Recognizable weight.",
      "You've been here before.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "declining", focusLevel: "moderate",
  },

  {
    cycleDay: 24, phase: "luteal",
    physical: [
      "Bloating, tenderness, and fatigue can feel at their strongest around now.",
      "This kind of physical heaviness around here has showed up before. It's at its strongest.",
      "For you, this is where physical discomfort is heaviest. Often. It's here.",
    ],
    mental: [
      "Stress can feel harder to manage. Small problems can feel much larger.",
      "Things feeling harder to manage around now has showed up before. That weight is familiar.",
      "Mental load is at its heaviest here for you. Often. It eases soon.",
    ],
    emotional: [
      "Emotional reactions can feel stronger than usual. That intensity can show up here.",
      "Emotional reactions feeling out of proportion around here has showed up before. Familiar.",
      "This is the most emotionally amplified stretch for you. You've seen it enough to know.",
    ],
    orientation: [
      "Late luteal phase.",
      "Late luteal.",
      "Late luteal.",
    ],
    allowance: [
      "This is a harder stretch. It passes.",
      "The hardest part. Familiar.",
      "You know it passes.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "declining", focusLevel: "poor",
  },

  {
    cycleDay: 25, phase: "luteal",
    physical: [
      "Energy can feel at its lowest before your period. Fatigue and physical discomfort can show up.",
      "Low energy before your period has showed up before. It's arriving again.",
      "For you, the days before your period are your lowest energy. Often. It's here.",
    ],
    mental: [
      "Concentration can feel scattered. Things can feel foggy or slow.",
      "Thinking getting foggy in late luteal has showed up before. That heaviness is here.",
      "Focus is hardest here for you. This is where the fog is thickest. Often.",
    ],
    emotional: [
      "Emotions can feel most intense in the days before your period. Irritability or sadness can surface.",
      "Emotions intensifying before your period has showed up before. If that's present, it's recognizable.",
      "Emotional intensity is strongest right before your period for you. You've seen this enough to know it passes.",
    ],
    orientation: [
      "Late luteal. Period approaching.",
      "Late luteal. Period approaching.",
      "Late luteal. Period is close.",
    ],
    allowance: [
      "This is a harder part. It passes.",
      "Almost through.",
      "The hardest part. You know it passes.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "low", focusLevel: "poor",
  },

  {
    cycleDay: 26, phase: "luteal",
    physical: [
      "Pre-period symptoms like cramping or heaviness can show up today.",
      "Pre-period heaviness has showed up before. Things are getting ready to shift.",
      "For you, this is deep in the pre-period stretch. The heaviness is familiar.",
    ],
    mental: [
      "Focus can feel scattered and concentration harder to hold.",
      "Thinking getting hardest right around here has showed up before. It's recognizable.",
      "Focus is at its hardest for you right here. Often.",
    ],
    emotional: [
      "Irritability and emotional heaviness can feel at their strongest.",
      "This emotional weight around now has showed up before. It's familiar.",
      "Emotional heaviness is strongest here for you. Often. It lifts soon.",
    ],
    orientation: [
      "Late luteal. Period is close.",
      "Late luteal. Almost there.",
      "Late luteal. Period is imminent.",
    ],
    allowance: [
      "Almost through.",
      "Nearly there.",
      "You know this ends.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "low", focusLevel: "poor",
  },

  {
    cycleDay: 27, phase: "luteal",
    physical: [
      "Energy can feel very depleted. Cramping or lower back discomfort can begin before bleeding starts.",
      "Pre-period heaviness has showed up before. Things are getting ready to shift.",
      "For you, this is the lowest point physically. Often, right before your period. It's here.",
    ],
    mental: [
      "Focus can feel scattered. Simple things can require more effort.",
      "Thinking is hardest right here for you. The fog is at its thickest.",
      "Focus is at its hardest. Often, this is where it's heaviest for you.",
    ],
    emotional: [
      "Emotions can feel raw and close. This can be the most emotionally intense time before a period.",
      "Emotions feeling rawest just before your period has showed up before. It's here.",
      "Emotional rawness is strongest here. You've seen this. It resets soon.",
    ],
    orientation: [
      "Pre-menstrual. Period is very close.",
      "Pre-menstrual.",
      "Pre-menstrual. Period is imminent.",
    ],
    allowance: [
      "Almost there.",
      "Almost there.",
      "Tomorrow starts fresh.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "low", focusLevel: "poor",
  },

  {
    cycleDay: 28, phase: "luteal",
    physical: [
      "Cramping or spotting can signal your period is arriving. Energy can feel very low.",
      "These final pre-period signals have showed up before. They're here again.",
      "For you, this is the final day before the reset. The signals are here. Familiar.",
    ],
    mental: [
      "Mental load can feel heaviest right before bleeding starts.",
      "Mental heaviness being strongest right before your period has showed up before. Recognizable.",
      "Mental exhaustion is heaviest here for you. Often, right before the reset.",
    ],
    emotional: [
      "Emotional tension can feel highest right before bleeding. Relief can come with day 1.",
      "This emotional buildup before your period has showed up before. It releases soon.",
      "Emotional tension is at its strongest. You've seen this. It releases when bleeding begins.",
    ],
    orientation: [
      "Pre-menstrual. Period can arrive very soon.",
      "Pre-menstrual. Period is imminent.",
      "Pre-menstrual. The cycle is completing.",
    ],
    allowance: [
      "Relief is coming.",
      "Almost through. Relief is close.",
      "You know what's coming. It resets.",
    ],
    nudge: NUDGE_ZERO.concat(NUDGE_EARLY, NUDGE_MEDIUM) as [string, string, string],
    energyLevel: "very_low", focusLevel: "poor",
  },
];

// ─── Functions ──────────────────────────────────────────────────────────────

export function getCycleNumber(lastPeriodStart: Date, cycleLength: number): number {
  const EPOCH = new Date("2024-01-01").getTime();
  const daysSinceEpoch = Math.floor((lastPeriodStart.getTime() - EPOCH) / 86400000);
  return Math.max(0, Math.floor(daysSinceEpoch / cycleLength));
}

export function getNormalizedDay(
  cycleDay: number,
  cycleLength: number,
  phase: Phase,
): number {
  if (cycleDay > cycleLength) return 28;
  if (cycleLength === 28) return Math.max(1, Math.min(28, cycleDay));
  if (phase === "menstrual") return Math.min(Math.max(1, cycleDay), 5);
  if (phase === "follicular") {
    const follicularLength = Math.max(1, cycleLength - 19);
    const follicularDay = Math.max(1, cycleDay - 5);
    const normalized = Math.round((follicularDay / follicularLength) * 8) + 5;
    return Math.min(Math.max(6, normalized), 13);
  }
  if (phase === "ovulation") {
    return Math.min(16, Math.max(14, cycleDay));
  }
  const daysFromEnd = cycleLength - cycleDay;
  return Math.min(28, Math.max(17, 28 - daysFromEnd));
}

export function getDayInsight(
  cycleDay: number,
  variantIndex: 0 | 1 | 2 = 0,
  cycleMode: CycleMode = "natural",
): ResolvedDayInsight {
  const clamped = Math.max(1, Math.min(28, cycleDay));
  const effectiveDay =
    cycleMode === "hormonal" && clamped >= 14 && clamped <= 16
      ? 12
      : clamped;
  const day = library[effectiveDay - 1]!;
  return {
    physical: day.physical[variantIndex],
    mental: day.mental[variantIndex],
    emotional: day.emotional[variantIndex],
    orientation: day.orientation[variantIndex],
    allowance: day.allowance[variantIndex],
    nudge: day.nudge[variantIndex],
    energyLevel: day.energyLevel,
    focusLevel: day.focusLevel,
  };
}
```

---

## 6. INSIGHT SERVICE UPDATE

In `src/services/insightService.ts`, the `generateRuleBasedInsights` function currently returns fields named `physicalInsight`, `mentalInsight`, `emotionalInsight`, `whyThisIsHappening`, `solution`, `recommendation`, `tomorrowPreview`.

### Step 6.1: Update DailyInsights type

Find the `DailyInsights` interface and update it:

```typescript
export interface DailyInsights {
  physical: string;
  mental: string;
  emotional: string;
  orientation: string;
  allowance: string;
  nudge: string;
  // Legacy compatibility — GPT still uses these names
  physicalInsight: string;
  mentalInsight: string;
  emotionalInsight: string;
  whyThisIsHappening: string;
  solution: string;
  recommendation: string;
  tomorrowPreview: string;
}
```

### Step 6.2: Update generateRuleBasedInsights

In the `generateRuleBasedInsights` function, add the new fields mapped from the template:

```typescript
export function generateRuleBasedInsights(ctx: InsightContext): DailyInsights {
  const dayInsight = getDayInsight(ctx.normalizedDay, ctx.variantIndex, ctx.cycleMode);
  
  // Build legacy fields for backward compat
  const physicalInsight = buildPhysicalInsight(ctx);
  const mentalInsight = buildMentalInsight(ctx);
  const emotionalInsight = buildEmotionalInsight(ctx);
  const whyThisIsHappening = buildWhyThisIsHappening(ctx);
  const solution = buildRecommendation(ctx);
  const recommendation = buildBroaderGuidance(ctx);
  const tomorrowPreview = dayInsight.nudge; // Use nudge as tomorrowPreview for now

  return {
    // New Vyana Voice fields (from template)
    physical: dayInsight.physical,
    mental: dayInsight.mental,
    emotional: dayInsight.emotional,
    orientation: dayInsight.orientation,
    allowance: dayInsight.allowance,
    nudge: dayInsight.nudge,
    // Legacy fields (for GPT + guards + backward compat)
    physicalInsight,
    mentalInsight,
    emotionalInsight,
    whyThisIsHappening,
    solution,
    recommendation,
    tomorrowPreview,
  };
}
```

**NOTE:** This dual-field approach means the insight view can choose which set to serve. The `vyana` layer in the view uses the new fields. The `system` layer and GPT path use legacy fields. Clean separation.

---

## 7. INSIGHT CONTROLLER (Phase 1)

Already provided in the previous guide. Create `src/controllers/insightControllerPhase1.ts` with the simplified pipeline from the previous document. One key update: the response should include the new Vyana voice fields:

In the response payload, add:

```typescript
const responsePayload = {
  // ... existing fields ...
  vyana: {
    physical: insights.physical ?? view.vyana.physical,
    mental: insights.mental ?? view.vyana.mental,
    emotional: insights.emotional ?? view.vyana.emotional,
    orientation: view.vyana.orientation,
    allowance: view.vyana.allowance,
    nudge: insights.nudge ?? "",
  },
  // ... rest of response ...
};
```

---

## 8. INSIGHT VIEW UPDATE

In `src/services/insightView.ts`, update the `buildInsightView` function to use new field names from the template:

Find where it builds the `vyana` layer and update:

```typescript
vyana: {
  physical: insights.physical || insights.physicalInsight,
  mental: insights.mental || insights.mentalInsight,
  emotional: insights.emotional || insights.emotionalInsight,
  orientation: dayInsight.orientation,    // was: dayInsight.hormoneNote
  allowance: dayInsight.allowance,        // was: dayInsight.actionTip
},
```

Also update the `VyanaLayer` type:

```typescript
export type VyanaLayer = {
  physical: string;
  mental: string;
  emotional: string;
  orientation: string;
  allowance: string;
};
```

---

## 9. GPT SERVICE SIMPLIFICATION

In `src/services/insightGptService.ts`, the GPT system prompt is 200+ lines. For Phase 1, it still fires for 3+ logs users, but the prompt can be dramatically simplified.

### Step 9.1: Simplify VYANA_SYSTEM_PROMPT

Replace the massive prompt with a clean Phase 1 version:

```typescript
export const VYANA_SYSTEM_PROMPT = `You are Vyana — a personal cycle companion.

RULES:
1. Start with what the user is actually experiencing based on their logged data.
2. Never use: "Many people find...", "It's common to...", "The body is..."
3. Always use: "Energy feels...", "Things can feel...", "Focus feels..."
4. Never claim patterns from less than 2 cycles of data.
5. Each field: max 2 sentences. One clear idea.
6. Be specific to their data. Never generic.
7. If you don't have data for something, don't invent it.

FIELDS:
- physicalInsight: what body feels (from their logs)
- mentalInsight: focus/clarity (from their logs)
- emotionalInsight: emotional experience (from their logs)
- whyThisIsHappening: grounded context (where in cycle, not teaching)
- solution: one thing for today (permission, not instruction)
- recommendation: next few days guidance
- tomorrowPreview: what to expect next

Return strict JSON only.`.trim();
```

### Step 9.2: Update aiService.ts barrel

Replace `src/services/aiService.ts`:

```typescript
export { askVyanaWithGpt, classifyIntent, type ChatHistoryItem } from "./chatService";
export {
  generateInsightsWithGpt,
  buildVyanaContextForInsights,
  buildFallbackContextBlock,
  sanitizeInsights,
  type InsightGenerationStatus,
} from "./insightGptService";
```

Remove the `generateForecastWithGpt` and `enforceTwoLines` exports — not used in Phase 1.

---

## 10. CHAT SERVICE (Ask Vyana)

In `src/services/chatService.ts`, replace `CHAT_SYSTEM_PROMPT_FULL`:

```typescript
const CHAT_SYSTEM_PROMPT_FULL = `You are Vyana — a warm, personal menstrual health companion.

VOICE:
- Speak directly: "you", "your"
- Sound like a knowledgeable friend, not a doctor
- Be specific when you have data, honest when you don't
- Never diagnose. Suggest seeing a doctor for persistent symptoms.
- Never use: "estrogen surge", "progesterone peak", "hormonal rhythms"
- Use natural language: "energy feels lower", "things can feel heavier"

CONFIDENCE:
- Zero logs: general cycle knowledge. "Energy can feel lower during your period."
- Some logs: reference what they've shared. "You mentioned stress recently."
- Never claim patterns you haven't seen across 2+ cycles.

DATA:
- Sleep values: use as given
- Never show numeric stress/mood scores
- If you don't have data, say so warmly

CONVERSATION:
- Lead with empathy. Answer their question first.
- Only mention cycle context if genuinely relevant
- For vague messages ("I'm tired"), ask what's going on before assuming cycle cause
- Keep responses concise: 2-4 sentences for casual, 4-6 for health
- Never lecture. Never list symptoms unprompted.`;
```

---

## 11. CHAT CONTROLLER SIMPLIFICATION

In `src/controllers/chatController.ts`, simplify the health/ambiguous message path.

Remove imports for: `correlationEngine`, `narrativeSelector`, `interactionRules`, `insightCause`, `hormoneengine` (if only used in the complex path).

Simplify the full pipeline section to:

```typescript
  // Full pipeline for health and ambiguous messages
  const data = await getUserInsightData(req.userId!);
  if (!data) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { user, recentLogs, numericBaseline } = data;
  const cycleMode = getCycleMode(user);
  const cyclePrediction = await getCyclePredictionContext(req.userId!, user.cycleLength);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;
  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);
  const totalLogCount = recentLogs.length;

  const reply = await askVyanaWithGpt({
    userName: user.name ?? "",
    question: message,
    cycleInfo,
    recentLogs,
    history: safeHistory,
    numericBaseline,
    totalLogCount,
  });

  await prisma.chatMessage.createMany({
    data: [
      { userId: req.userId!, role: "user", content: message },
      { userId: req.userId!, role: "assistant", content: reply },
    ],
  });

  res.json({ reply });
```

---

## 12. ROUTES UPDATE

**Edit:** `src/routes/insights.ts`

```typescript
import { getInsights, getInsightsContext, getInsightsForecast } from "../controllers/insightControllerPhase1";
```

**Edit:** `src/index.ts`

Remove:
```typescript
import healthRoutes from "./routes/health";
app.use("/api/health", healthRoutes);
```

---

## 13. NOTIFICATION TEMPLATES

**Edit:** `src/services/notificationTemplates.ts`

Replace templates with Vyana voice:

```typescript
const PHASE_TEMPLATES: Record<Phase, NotificationTemplate[]> = {
  menstrual: [
    { title: "How's today feeling?", body: "A quick log helps build your rhythm." },
    { title: "Check in with yourself", body: "Even a few taps make a difference." },
    { title: "Your cycle is listening", body: "Log what you're noticing today." },
  ],
  follicular: [
    { title: "Energy shifting?", body: "Log how you're feeling — it builds your picture." },
    { title: "Things might feel different", body: "Capture what's showing up today." },
    { title: "Your rhythm is forming", body: "A quick check-in keeps it accurate." },
  ],
  ovulation: [
    { title: "How are things today?", body: "This part of your cycle is useful to track." },
    { title: "Quick check-in", body: "A few taps now, better insights tomorrow." },
    { title: "Noticing anything?", body: "Log it — even the small stuff matters." },
  ],
  luteal: [
    { title: "How are you holding up?", body: "Tracking now helps us understand this stretch." },
    { title: "Worth noting", body: "What you're feeling today is useful data." },
    { title: "Check in", body: "Even a quick log makes your next cycle smarter." },
  ],
};
```

---

## 14. SMOKE TEST SCRIPT

**Create:** `scripts/phase1-smoke-test.ts`

```typescript
import "dotenv/config";

const BASE = process.env.API_BASE_URL ?? "http://localhost:3000";

async function post(path: string, body: object, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  return r.json();
}

async function get(path: string, token: string) {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

async function main() {
  const email = `smoke-${Date.now()}@test.vyana`;
  console.log("\n🔥 PHASE 1 SMOKE TEST\n");

  // Register
  const reg = await post("/api/auth/register", {
    email, password: "testpass123", name: "Smoke Test",
    age: 28, height: 165, weight: 58, cycleLength: 28,
    lastPeriodStart: new Date(Date.now() - 10 * 86400000).toISOString(),
  }) as any;
  const token = reg.tokens?.accessToken;
  if (!token) { console.error("❌ Registration failed:", reg); return; }
  console.log("✅ Registered");

  // Zero-log insights
  const ins0 = await get("/api/insights", token) as any;
  console.log(`✅ Zero-log: cycleDay=${ins0.cycleDay}, aiEnhanced=${ins0.aiEnhanced}`);
  console.log(`   vyana.physical: "${ins0.view?.vyana?.physical?.slice(0, 60)}..."`);

  // Quick check-in
  await post("/api/logs/quick-check-in", { mood: "low", energy: "low", stress: "high" }, token);
  console.log("✅ Logged (1 entry)");

  // 1-log insights
  const ins1 = await get("/api/insights", token) as any;
  console.log(`✅ 1-log: confidence=${ins1.confidence}`);

  // Chat
  const chat = await post("/api/chat", { message: "How am I doing?" }, token) as any;
  console.log(`✅ Chat: "${chat.reply?.slice(0, 60)}..."`);

  // Home
  const home = await get("/api/home", token) as any;
  console.log(`✅ Home: title="${home.title}"`);

  // Forecast (warmup)
  const forecast = await get("/api/insights/forecast", token) as any;
  console.log(`✅ Forecast: available=${forecast.available}`);

  console.log("\n🎯 Smoke test complete.\n");
}

main().catch(console.error);
```

---

## 15. TESTING CHECKLIST

### Zero Logs
- [ ] Day 1 menstrual — observational, no assertions, new field names in response
- [ ] Day 10 follicular — energy rising language
- [ ] Day 14 ovulation — bright spot language
- [ ] Day 22 luteal — declining energy language
- [ ] Hormonal user — no phase language

### 1-2 Logs
- [ ] User logs stress — acknowledged in insight, rest is phase-based
- [ ] User logs fatigue + headache — both reflected

### 3+ Logs
- [ ] GPT fires and enhances
- [ ] No forbidden language in output

### Chat
- [ ] Casual: "Hey" — warm, no cycle dump
- [ ] Health: "I'm tired" — empathetic, asks context
- [ ] Zero-data: "How's my sleep?" — honest about no data

### Edge Cases
- [ ] Delayed period — acknowledged
- [ ] Post-iPill — disruption template
- [ ] Post-BC stop — transition template

---

## 16. EXECUTION ORDER

```
1.  Delete files listed in Section 2
2.  Update src/index.ts (remove health route)
3.  Create src/config/featureFlags.ts (Section 4)
4.  REWRITE src/services/cycleInsightLibrary.ts (Section 5 — full file)
5.  UPDATE src/services/insightService.ts (Section 6)
6.  CREATE src/controllers/insightControllerPhase1.ts (Section 7)
7.  UPDATE src/services/insightView.ts (Section 8)
8.  UPDATE src/services/insightGptService.ts (Section 9)
9.  UPDATE src/services/aiService.ts barrel (Section 9.2)
10. UPDATE src/services/chatService.ts (Section 10)
11. UPDATE src/controllers/chatController.ts (Section 11)
12. UPDATE src/routes/insights.ts (Section 12)
13. UPDATE src/services/notificationTemplates.ts (Section 13)
14. CREATE scripts/phase1-smoke-test.ts (Section 14)
15. npm run build — fix any TypeScript errors
16. Run smoke test
17. Manual testing checklist
18. Ship
```

**Estimated time:** 2-3 days with Claude Code.

---

*This is the complete guide. Every template, every file change, every deletion. Execute top to bottom. Ship clean.*