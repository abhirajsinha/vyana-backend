// src/services/vyanaContext.ts  (v5 — complete)
// ─────────────────────────────────────────────────────────────────────────────
// New in v5:
//   Fix 1: Presentation layers — core/narrative/enhancement/emotional
//   Fix 2: Surprise + delight mutual exclusivity
//   Fix 3: Surprise insights shortened — observation first, explanation lighter
//   Fix 4: User hash added to identity rotation — user-specific, not global
//   Fix 5: Delight gating for heavy emotional states
//   NEW:   Emotional state memory — "last time this happened, you logged..."
// ─────────────────────────────────────────────────────────────────────────────

import type { NumericBaseline, CrossCycleNarrative } from "./insightData";
import type { PrimaryInsightCause } from "./insightCause";
import type { InsightContext } from "./insightService";
import type { Phase, CycleMode } from "./cycleEngine";
import type { HormoneState } from "./hormoneengine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PrioritySignal {
  text: string;
  weight: "high" | "medium" | "low";
  tone: "empathetic" | "neutral" | "sensitive" | "encouraging" | "delightful";
  layer: "core" | "narrative" | "enhancement" | "emotional"; // Fix 1
}

export interface VyanaSleepContext {
  human: string | null;
  comparison: string | null;
  deviationMeaningful: boolean;
  deviationLabel: string | null;
}

export interface VyanaStressContext {
  human: string | null;
  comparison: string | null;
  deviationMeaningful: boolean;
}

export interface VyanaMoodContext {
  human: string | null;
  comparison: string | null;
  deviationMeaningful: boolean;
}

export interface VyanaTrendContext {
  sleepStory: string | null;
  stressStory: string | null;
  moodStory: string | null;
  interactionStory: string | null;
  combinedNarrative: string | null;
}

export interface VyanaCycleContext {
  cycleSummary: string;
  phaseLabel: string;
  phasePositionHuman: string;
  nextPeriodHuman: string | null;
  delayedPeriodHuman: string | null;
  isIrregular: boolean;
  irregularCaveat: string | null;
}

export interface VyanaHormoneContext {
  narrative: string | null;
  surface: boolean;
}

export interface VyanaCrossCycleContext {
  narrative: string | null;
  trend: string | null;
  trendHuman: string | null;
}

export interface VyanaMemoryContext {
  persistenceNarrative: string | null;
  severity: "new" | "building" | "persistent" | null;
}

export interface VyanaAnticipation {
  narrative: string | null;
  shouldSurface: boolean;
  type: "warning" | "encouragement" | "neutral";
  anticipationType: string | null;
}

export interface VyanaIdentity {
  userPatternNarrative: string | null;
  patternCore: string | null;
  hasPersonalHistory: boolean;
  historyCycles: number;
  useThisOutput: boolean;
}

export interface VyanaDelight {
  moment: string | null;
  shouldSurface: boolean;
  type: "reassurance" | "validation" | "relief" | "normalcy" | null;
}

export interface VyanaSurpriseInsight {
  insight: string | null;
  shouldSurface: boolean;
}

export interface VyanaConfidenceMapping {
  level: "low" | "medium" | "high";
  forwardClaims: string;
  patternClaims: string;
  example: string;
}

/**
 * NEW: Emotional state memory
 * "last time this happened, you logged feeling overwhelmed"
 * Sources from insightHistory + dailyLog join — tells user we remember
 * not just what happened, but how she felt about it.
 */
export interface VyanaEmotionalMemory {
  /** Whether we have enough history to surface emotional memory */
  hasMemory: boolean;
  /** The recall sentence — "last time sleep dropped like this, you logged feeling exhausted" */
  recallNarrative: string | null;
  /** What she felt then — used to validate current feeling */
  pastMoodLabel: string | null;
  /** How many past occurrences match */
  occurrenceCount: number;
}

export interface VyanaContext {
  userName: string | null;
  cycle: VyanaCycleContext;
  sleep: VyanaSleepContext;
  stress: VyanaStressContext;
  mood: VyanaMoodContext;
  trends: VyanaTrendContext;
  memory: VyanaMemoryContext;
  hormones: VyanaHormoneContext;
  crossCycle: VyanaCrossCycleContext;
  /** Fix 1: signals in layer order — core → narrative → enhancement → emotional */
  prioritySignals: PrioritySignal[];
  isStablePattern: boolean;
  anticipation: VyanaAnticipation;
  identity: VyanaIdentity;
  delight: VyanaDelight;
  surpriseInsight: VyanaSurpriseInsight;
  emotionalMemory: VyanaEmotionalMemory; // NEW
  confidenceMapping: VyanaConfidenceMapping;
  mode: "personalized" | "fallback";
  confidence: "low" | "medium" | "high";
  /** Whether current state is high-severity — gates delight type (Fix 5) */
  isHighSeverity: boolean;
  /** Life-factor vs cycle attribution — steers GPT and suppresses wrong cycle narratives */
  primaryInsightCause: PrimaryInsightCause;
}

// ─── Fix 5: Anticipation persistence contract ─────────────────────────────────

export interface AnticipationFrequencyState {
  lastShownCycleDay: number | null;
  lastShownType: string | null;
}

// ─── NEW: Emotional memory input ──────────────────────────────────────────────
// Pass this in from the controller — sourced from insightHistory + dailyLog.

export interface EmotionalMemoryInput {
  /** Past logs where the same driver fired, with mood recorded */
  pastOccurrences: Array<{
    cycleDay: number;
    phase: Phase;
    mood: string | null;
    energy: string | null;
    stress: string | null;
    daysAgo: number;
  }>;
}

// ─── Fix 4: User hash for identity rotation ───────────────────────────────────
// Makes rotation user-specific, not globally predictable.
// Simple deterministic hash from userId string.

function userHash(userId: string): number {
  let hash = 0;
  for (let i = 0; i < Math.min(userId.length, 8); i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) % 1000;
  }
  return hash;
}

// ─── Fix 1: Presentation layer definitions ────────────────────────────────────
// Signals are now categorized into layers before ordering.
// Final composition: core → narrative → enhancement (max 1) → emotional (optional)

type SignalLayer = "core" | "narrative" | "enhancement" | "emotional";

interface LayeredSignals {
  core: PrioritySignal[];
  narrative: PrioritySignal[];
  enhancement: PrioritySignal[];
  emotional: PrioritySignal[];
}

function composeSignals(layered: LayeredSignals): PrioritySignal[] {
  const result: PrioritySignal[] = [];

  // Core — always first, all included
  result.push(...layered.core);

  // Narrative — identity + trends, all included
  result.push(...layered.narrative);

  // Enhancement — max 1 (surprise takes priority over anticipation)
  // Fix 2: surprise and delight are mutually exclusive — handled before this call
  const enhancement = layered.enhancement.slice(0, 1);
  result.push(...enhancement);

  // Emotional — max 1, optional, always last
  const emotional = layered.emotional.slice(0, 1);
  result.push(...emotional);

  return result;
}

// ─── Fix 3: Shortened surprise insights ──────────────────────────────────────
// Observation first. Explanation lighter. No over-teaching.

function buildSurpriseInsight(params: {
  ctx: InsightContext;
  sleep: VyanaSleepContext;
  stress: VyanaStressContext;
  mood: VyanaMoodContext;
  phase: Phase;
  cycleDay: number;
  cycleLength: number;
  memoryDriver: string | null;
  memoryCount: number;
  userId: string;
  primaryInsightCause: PrimaryInsightCause;
}): VyanaSurpriseInsight {
  const {
    ctx,
    sleep,
    stress,
    mood,
    phase,
    cycleDay,
    cycleLength,
    memoryDriver,
    memoryCount,
    userId,
    primaryInsightCause,
  } = params;

  // Fix 4 applied here too — user-specific seed
  const surpriseSeed = (cycleDay * 13 + cycleLength * 7 + userHash(userId)) % 40;
  if (surpriseSeed >= 10) return { insight: null, shouldSurface: false };

  const hasSleepStressInteraction = ctx.interaction_flags.includes("sleep_stress_amplification");
  const stressIncreasing = ctx.trends.some(t => t === "Stress increasing");
  const sleepDecreasing = ctx.trends.some(t => t === "Sleep decreasing");
  const moodDecreasing = ctx.trends.some(t => t === "Mood decreasing");

  // Fix 3: observation first, explanation brief
  if (sleep.deviationMeaningful && stress.deviationMeaningful && !hasSleepStressInteraction) {
    return {
      insight: `sleep and stress together are hitting harder than either would alone`,
      shouldSurface: true,
    };
  }
  if (stress.deviationMeaningful && !sleep.deviationMeaningful && moodDecreasing) {
    return {
      insight: `stress is affecting mood before sleep — mood usually drops first`,
      shouldSurface: true,
    };
  }
  if (phase === "luteal" && stress.deviationMeaningful && cycleDay >= 18) {
    return {
      insight: `the same stress feels stronger right now — luteal phase amplifies it`,
      shouldSurface: true,
    };
  }
  if (ctx.sleep_variability === "high" && !sleep.deviationMeaningful) {
    return {
      insight: `sleep hours look okay, but the night-to-night inconsistency is what's making it feel worse`,
      shouldSurface: true,
    };
  }
  if (mood.deviationMeaningful && !sleep.deviationMeaningful && !stress.deviationMeaningful && phase === "luteal") {
    return {
      insight: `sleep and stress look steady — the mood dip is hormonal, not circumstantial`,
      shouldSurface: true,
    };
  }
  if (phase === "follicular" && cycleDay <= 8 && sleep.deviationMeaningful && sleepDecreasing) {
    if (primaryInsightCause === "sleep_disruption") {
      return { insight: null, shouldSurface: false };
    }
    return {
      insight: `energy can lag even when sleep is improving — iron takes a few days to recover after a period`,
      shouldSurface: true,
    };
  }
  if (phase === "ovulation" && stress.deviationMeaningful) {
    return {
      insight: `this is your peak window, but stress is dampening it — you're likely still outperforming how you feel`,
      shouldSurface: true,
    };
  }
  if (memoryDriver && memoryCount >= 4 && !ctx.priorityDrivers.includes(memoryDriver)) {
    return {
      insight: `the signal that's been elevated is quieter today — could be the pattern breaking`,
      shouldSurface: true,
    };
  }

  return { insight: null, shouldSurface: false };
}

// ─── NEW: Emotional memory builder ────────────────────────────────────────────
// Transforms past occurrence data into "last time this happened, you logged..."
// This is true empathy — not just pattern detection, but feeling recall.

function buildEmotionalMemory(params: {
  driver: string | null;
  input: EmotionalMemoryInput | null;
  cycleDay: number;
}): VyanaEmotionalMemory {
  const { driver, input, cycleDay } = params;

  if (!driver || !input || input.pastOccurrences.length < 2) {
    return { hasMemory: false, recallNarrative: null, pastMoodLabel: null, occurrenceCount: 0 };
  }

  // Filter occurrences with mood data, within same cycle window (±4 days)
  const matchingOccurrences = input.pastOccurrences.filter(
    o => o.mood !== null && Math.abs(o.cycleDay - cycleDay) <= 4
  );

  if (matchingOccurrences.length < 2) {
    return { hasMemory: false, recallNarrative: null, pastMoodLabel: null, occurrenceCount: 0 };
  }

  // Find the most common mood across matching occurrences
  const moodCounts: Record<string, number> = {};
  for (const o of matchingOccurrences) {
    if (o.mood) moodCounts[o.mood] = (moodCounts[o.mood] ?? 0) + 1;
  }
  const dominantMood = Object.entries(moodCounts).sort((a, b) => b[1]! - a[1]!)[0]?.[0] ?? null;

  // Normalize mood to human label
  const moodLabel = dominantMood
    ? normalizeMoodLabel(dominantMood)
    : null;

  if (!moodLabel) {
    return { hasMemory: false, recallNarrative: null, pastMoodLabel: null, occurrenceCount: matchingOccurrences.length };
  }

  // Build driver-specific recall narrative — concrete + bridge phrase
  const driverPhrases: Record<string, string> = {
    sleep_below_baseline: `the last ${matchingOccurrences.length} times sleep dropped like this`,
    stress_above_baseline: `the last ${matchingOccurrences.length} times stress ran this high`,
    sleep_stress_amplification: `the last ${matchingOccurrences.length} times sleep and stress were both elevated`,
    mood_trend_declining: `the last ${matchingOccurrences.length} times mood dipped in this window`,
    high_strain: `the last ${matchingOccurrences.length} times your body was under this much strain`,
    bleeding_heavy: `the last ${matchingOccurrences.length} times your flow was heavier like this`,
    sleep_trend_declining: `the last ${matchingOccurrences.length} times sleep was declining like this`,
  };

  const driverPhrase = driverPhrases[driver];
  if (!driverPhrase) {
    return { hasMemory: false, recallNarrative: null, pastMoodLabel: null, occurrenceCount: matchingOccurrences.length };
  }

  // Bug 5 fix: add bridge phrase — connects past to present, makes it feel like real recall
  const bridges = [
    "this probably feels familiar",
    "this time likely feels similar",
    "your body tends to respond this way",
  ];
  const bridge = bridges[cycleDay % bridges.length]!;

  // Full recall: specific driver phrase + mood word + bridge
  const recallNarrative = `${driverPhrase}, you logged feeling ${moodLabel} — ${bridge}`;

  return {
    hasMemory: true,
    recallNarrative,
    pastMoodLabel: moodLabel,
    occurrenceCount: matchingOccurrences.length,
  };
}

function normalizeMoodLabel(mood: string): string {
  const m = mood.toLowerCase();
  if (["sad", "low", "very_low", "down", "anxious"].some(v => m.includes(v))) return "low";
  if (["overwhelmed", "stressed"].some(v => m.includes(v))) return "overwhelmed";
  if (["irritable", "irritated"].some(v => m.includes(v))) return "irritable";
  if (["tired", "exhausted", "drained"].some(v => m.includes(v))) return "exhausted";
  if (["calm", "okay", "neutral"].some(v => m.includes(v))) return "okay";
  if (["good", "happy", "positive", "great"].some(v => m.includes(v))) return "good";
  return mood.replace(/_/g, " ");
}

// ─── Fix 5: Severity detection ────────────────────────────────────────────────
// High severity = heavy state where relief-type delight feels dismissive

function isHighSeverityState(params: {
  memoryDriver: string | null;
  memoryCount: number;
  ctx: InsightContext;
  isPeriodDelayed: boolean;
}): boolean {
  const { memoryDriver, memoryCount, ctx, isPeriodDelayed } = params;

  if (isPeriodDelayed) return false; // delayed period needs reassurance, not silencing

  // Persistent heavy signals
  if (memoryDriver === "sleep_stress_amplification" && memoryCount >= 3) return true;
  if (memoryDriver === "mood_trend_declining" && memoryCount >= 4) return true;
  if (memoryDriver === "high_strain" && memoryCount >= 3) return true;
  if (memoryDriver === "stress_above_baseline" && memoryCount >= 5) return true;

  // Active heavy physical signals
  if (ctx.priorityDrivers.includes("bleeding_heavy")) return true;
  if (ctx.physical_state === "high_strain" && ctx.mental_state === "fatigued_and_stressed") return true;

  return false;
}

// ─── Fix 5: Gated delight builder ────────────────────────────────────────────

const DELIGHT_MOMENTS: Record<string, string[]> = {
  reassurance_menstrual: [
    "nothing is wrong — this is just your body resetting",
    "this is your cycle doing exactly what it's supposed to",
    "the discomfort is real, and it's also temporary",
    "your body is doing a lot of work right now — it's allowed to feel it",
  ],
  reassurance_luteal: [
    "nothing is wrong — this is just how this phase moves",
    "the heaviness is real, and it also passes",
    "this part of your cycle can feel heavier than it should",
    "you're not imagining it — this phase is genuinely harder",
  ],
  reassurance_delayed: [
    "a late period doesn't always mean something is wrong",
    "cycles shift — that's more common than it feels",
    "your body isn't broken — it's just taking a little longer",
  ],
  validation_stress: [
    "it makes sense that things feel heavier right now",
    "what you're carrying right now is real — not just in your head",
    "your body is responding to something real, not overreacting",
  ],
  validation_mood: [
    "the emotional weight you're feeling has a real cause",
    "low mood in this window isn't weakness — it's hormonal",
    "what you're feeling is valid and it has a reason",
  ],
  validation_sleep: [
    "sleep affects everything — that's not an exaggeration",
    "when sleep is off, everything feels harder — that's biology, not you",
  ],
  relief_luteal_late: [
    "you're closer to the easier days than it feels",
    "relief tends to come faster than expected once bleeding starts",
    "the hardest stretch is almost over",
    "a few more days and you'll feel the shift",
  ],
  relief_menstrual_late: [
    "the energy lift is just around the corner",
    "the worst days of this cycle are behind you",
    "follicular energy starts returning sooner than most people expect",
  ],
  relief_stress_easing: [
    "stress has started easing — your body noticed before you did",
    "the pressure is starting to lift",
  ],
  normalcy_follicular: [
    "this rising energy is real — not a fluke",
    "this is your cycle working the way it's supposed to",
    "you're supposed to feel this way right now",
  ],
  normalcy_ovulation: [
    "the confidence you might feel right now is your biology working",
    "peak energy like this is normal — use it",
    "this is your cycle at its highest point",
  ],
  normalcy_stable: [
    "a stable pattern is a good sign — your body is in a steady rhythm",
    "no strong signals today — that's a quiet kind of win",
  ],
};

function buildDelightMoment(params: {
  phase: Phase;
  cycleDay: number;
  cycleLength: number;
  memoryDriver: string | null;
  memoryCount: number;
  isPeriodDelayed: boolean;
  isStablePattern: boolean;
  isHighSeverity: boolean; // Fix 5
  trends: VyanaTrendContext;
  daysLeft: number;
  userId: string;
}): VyanaDelight {
  const { phase, cycleDay, cycleLength, memoryDriver, memoryCount, isPeriodDelayed, isStablePattern, isHighSeverity, trends, daysLeft, userId } = params;

  // Fix 4: user-specific seed
  const delightSeed = (cycleDay * 11 + cycleLength * 5 + userHash(userId)) % 30;
  if (delightSeed >= 12) return { moment: null, shouldSurface: false, type: null };

  function pick(key: string): string {
    const variants = DELIGHT_MOMENTS[key] ?? [];
    if (variants.length === 0) return "";
    return variants[cycleDay % variants.length]!;
  }

  // Delayed period → always reassurance (never blocked by severity)
  if (isPeriodDelayed) {
    const moment = pick("reassurance_delayed");
    return { moment, shouldSurface: !!moment, type: "reassurance" };
  }

  // Fix 5: high severity — only validation allowed, not relief or normalcy
  if (isHighSeverity) {
    if (memoryDriver === "stress_above_baseline" || memoryDriver === "sleep_stress_amplification") {
      const moment = pick("validation_stress");
      return { moment, shouldSurface: !!moment, type: "validation" };
    }
    if (memoryDriver === "mood_trend_declining") {
      const moment = pick("validation_mood");
      return { moment, shouldSurface: !!moment, type: "validation" };
    }
    if (memoryDriver === "sleep_below_baseline" || memoryDriver === "sleep_trend_declining") {
      const moment = pick("validation_sleep");
      return { moment, shouldSurface: !!moment, type: "validation" };
    }
    // Other high severity states: suppress delight entirely
    return { moment: null, shouldSurface: false, type: null };
  }

  // Normal routing (non-high-severity)
  if (memoryDriver === "stress_above_baseline" && memoryCount >= 2) {
    return { moment: pick("validation_stress"), shouldSurface: true, type: "validation" };
  }
  if (memoryDriver === "mood_trend_declining" && memoryCount >= 2) {
    return { moment: pick("validation_mood"), shouldSurface: true, type: "validation" };
  }
  if (memoryDriver === "sleep_below_baseline" && memoryCount >= 2) {
    return { moment: pick("validation_sleep"), shouldSurface: true, type: "validation" };
  }
  if (trends.stressStory?.includes("easing")) {
    return { moment: pick("relief_stress_easing"), shouldSurface: true, type: "relief" };
  }
  if (phase === "luteal" && daysLeft <= 4) {
    return { moment: pick("relief_luteal_late"), shouldSurface: true, type: "relief" };
  }
  if (phase === "menstrual" && cycleDay >= 3) {
    return { moment: pick("relief_menstrual_late"), shouldSurface: true, type: "relief" };
  }
  if (phase === "menstrual" && cycleDay <= 2) {
    return { moment: pick("reassurance_menstrual"), shouldSurface: true, type: "reassurance" };
  }
  if (phase === "luteal" && daysLeft > 4) {
    return { moment: pick("reassurance_luteal"), shouldSurface: true, type: "reassurance" };
  }
  if (isStablePattern) return { moment: pick("normalcy_stable"), shouldSurface: true, type: "normalcy" };
  if (phase === "follicular") return { moment: pick("normalcy_follicular"), shouldSurface: true, type: "normalcy" };
  if (phase === "ovulation") return { moment: pick("normalcy_ovulation"), shouldSurface: true, type: "normalcy" };

  return { moment: null, shouldSurface: false, type: null };
}

// ─── Anticipation (unchanged from v4) ────────────────────────────────────────

const ANTICIPATION_VARIANTS: Record<string, string[]> = {
  sleep_stress_mood_warning: ["when sleep and stress stay in this pattern for a few days, mood usually starts to dip — something to watch for", "this combination of sleep and stress tends to catch up with mood within a day or two", "if this pattern continues, you may notice your emotional resilience dipping", "sleep and stress at this level together often affect mood before long — protecting sleep tonight helps"],
  sleep_declining_mood_warning: ["if sleep keeps dropping, mood and focus tend to follow within a day or two — worth protecting tonight", "sleep dipping like this usually starts showing up in mood and energy before long", "a night or two of better sleep now would likely shift how the next few days feel", "when sleep slips like this, focus tends to be the first thing affected"],
  stress_building_sleep_warning: ["stress at this level for this long usually starts affecting sleep — breaking the pattern now is easier than later", "when stress builds like this, sleep tends to be next — a short reset now prevents a harder recovery later", "sustained stress like this often creeps into sleep quality — one deliberate wind-down tonight makes a difference", "this is the kind of stress pattern that tends to compound — one lighter day now saves several harder ones"],
  follicular_peak_approaching: ["energy tends to peak around ovulation — you're almost there", "the best few days of your cycle are just ahead — you'll likely feel the shift soon", "this is the buildup phase — peak energy and clarity are a day or two away", "ovulation is close — this is where things tend to click into place"],
  ovulation_luteal_incoming: ["the luteal shift is coming — energy and mood will gradually soften over the next few days", "you're moving into the second half of your cycle — things will naturally slow down a little from here", "the post-ovulatory shift is close — a good time to start protecting your energy", "the next phase tends to bring a quieter, more inward energy — it's coming soon"],
  early_luteal_sleep_warning: ["this is usually where energy starts softening — protecting sleep now makes the second half of luteal much easier", "this part of your cycle tends to slow things down — small adjustments now pay off later", "energy often dips around here — building sleep consistency now smooths out the rest of the phase", "the luteal dip tends to start around this window — rest early rather than catching up later"],
  late_luteal_sensitivity_warning: ["emotional sensitivity tends to peak in the few days before your period — this is the window to keep your schedule light", "this is usually the most sensitive stretch of your cycle — lighter commitments help more than pushing through", "the days just before your period tend to amplify feelings — what's manageable now can feel heavier than it is", "pre-period sensitivity is peaking around now — protecting your energy today matters more than usual"],
  period_relief_approaching: ["relief usually comes within hours of bleeding starting — you're very close", "the hardest part is almost over — bleeding brings a hormonal reset that usually lifts mood quickly", "most people feel better within a day of their period starting — hang in there", "the pre-period tension tends to release as soon as bleeding begins — very close now"],
  menstrual_day12_encouragement: ["the heaviest days are usually the first two — things typically ease noticeably from day 3", "if today is hard, it's usually the peak — things tend to ease from here", "day 1 and 2 are typically the most intense — relief usually comes faster than it feels", "the first couple of days tend to be the hardest — the physical toll eases soon"],
  menstrual_follicular_approaching: ["energy starts returning in the follicular phase — it's just a few days away", "the recovery phase is close — most people notice a real shift in energy within a day or two of their period ending", "you're almost through the menstrual phase — the follicular energy boost is coming", "the heaviness of this phase lifts soon — follicular energy tends to return faster than expected"],
  cross_cycle_worsening: ["your past cycles show this window has been getting harder — it's worth being more protective of your energy here", "this part of your cycle has been trending harder across recent cycles — a signal worth paying attention to", "the pattern across your recent cycles suggests this window deserves extra care", "your cycles have been showing more intensity in this window recently — worth protecting yourself here"],
  cross_cycle_improving: ["this window has been getting easier across your recent cycles — a good sign", "your recent cycles show improvement in this window — the trend is moving in the right direction", "things have been getting better here across your last few cycles — something is working", "compared to earlier cycles, this window has been easier — keep doing what you're doing"],
};

function pickVariant(variants: string[], seed: number): string {
  return variants[seed % variants.length]!;
}

function shouldSuppressAnticipation(type: string, currentCycleDay: number, state: AnticipationFrequencyState): boolean {
  if (!state.lastShownCycleDay || !state.lastShownType) return false;
  if (state.lastShownType !== type) return false;
  return Math.abs(currentCycleDay - state.lastShownCycleDay) < 2;
}

function buildAnticipation(params: {
  phase: Phase; cycleDay: number; cycleLength: number; daysUntilNextPhase: number;
  memoryDriver: string | null; memoryCount: number; ctx: InsightContext;
  crossCycleNarrative: CrossCycleNarrative | null; isIrregular: boolean;
  frequencyState: AnticipationFrequencyState; userId: string;
}): VyanaAnticipation {
  const { phase, cycleDay, cycleLength, daysUntilNextPhase, memoryDriver, memoryCount, ctx, crossCycleNarrative, isIrregular, frequencyState, userId } = params;

  if (isIrregular) return { narrative: null, shouldSurface: false, type: "neutral", anticipationType: null };

  const daysLeft = cycleLength - cycleDay;
  const hasInteraction = ctx.interaction_flags.includes("sleep_stress_amplification");
  const stressIncreasing = ctx.trends.some(t => t === "Stress increasing");
  const sleepDecreasing = ctx.trends.some(t => t === "Sleep decreasing");
  const moodDecreasing = ctx.trends.some(t => t === "Mood decreasing");

  function make(type: string, variantKey: string, aType: VyanaAnticipation["type"]): VyanaAnticipation {
    if (shouldSuppressAnticipation(type, cycleDay, frequencyState)) {
      return { narrative: null, shouldSurface: false, type: aType, anticipationType: type };
    }
    const variants = ANTICIPATION_VARIANTS[variantKey] ?? [];
    // Fix 4: user-specific seed for anticipation too
    const seed = cycleDay + userHash(userId);
    const narrative = variants.length > 0 ? pickVariant(variants, seed) : null;
    return { narrative, shouldSurface: !!narrative, type: aType, anticipationType: type };
  }

  if (hasInteraction && memoryCount >= 2) return make("sleep_stress_mood", "sleep_stress_mood_warning", "warning");
  if (sleepDecreasing && !moodDecreasing && memoryCount >= 2) return make("sleep_mood_risk", "sleep_declining_mood_warning", "warning");
  if (stressIncreasing && memoryCount >= 3) return make("stress_sleep_risk", "stress_building_sleep_warning", "warning");
  if (phase === "follicular" && daysUntilNextPhase <= 3) return make("peak_approaching", "follicular_peak_approaching", "encouragement");
  if (phase === "ovulation" && daysUntilNextPhase <= 2) return make("luteal_incoming", "ovulation_luteal_incoming", "neutral");
  if (phase === "luteal" && daysLeft >= 10 && daysLeft <= 14) return make("early_luteal_dip", "early_luteal_sleep_warning", "warning");
  if (phase === "luteal" && daysLeft <= 7 && daysLeft >= 4) return make("late_luteal_sensitivity", "late_luteal_sensitivity_warning", "warning");
  if (phase === "luteal" && daysLeft <= 3) return make("period_relief", "period_relief_approaching", "encouragement");
  if (phase === "menstrual" && cycleDay <= 2) return make("menstrual_peak", "menstrual_day12_encouragement", "encouragement");
  if (phase === "menstrual" && cycleDay >= 3) return make("follicular_approaching", "menstrual_follicular_approaching", "encouragement");

  if (crossCycleNarrative?.matchingCycles && crossCycleNarrative.matchingCycles >= 2) {
    if (crossCycleNarrative.trend === "worsening") return make("cross_cycle_hard", "cross_cycle_worsening", "warning");
    if (crossCycleNarrative.trend === "improving") return make("cross_cycle_easy", "cross_cycle_improving", "encouragement");
  }

  return { narrative: null, shouldSurface: false, type: "neutral", anticipationType: null };
}

// ─── All other helpers (unchanged from v4) ────────────────────────────────────

const SLEEP_OPENERS = ["around", "roughly", "close to", "about", "somewhere near"];

function humanSleep(hours: number, cycleDay: number, userId: string): string {
  const rounded = Math.round(hours * 2) / 2;
  // Fix 4: user-specific rotation
  const index = (cycleDay + userHash(userId)) % SLEEP_OPENERS.length;
  return `${SLEEP_OPENERS[index]!} ${rounded}h`;
}

function naturalizeDeviationLabel(delta: number): string {
  if (delta <= -1.5) return "noticeably less than your usual";
  if (delta <= -0.8) return "a bit less than your usual";
  if (delta >= 1.5) return "more than your usual";
  if (delta >= 0.8) return "a bit more than your usual";
  return "about your usual";
}

function naturalizeStressHuman(avg: number, persistDays: number): string {
  if (avg >= 2.6) return persistDays >= 5 ? "high — and it's been building" : persistDays >= 3 ? "high for a few days now" : "high";
  if (avg >= 2.0) return persistDays >= 3 ? "moderate but persistent" : "moderate";
  return "calm";
}

function naturalizeMoodHuman(avg: number): string {
  if (avg <= 1.4) return "quite low";
  if (avg <= 1.7) return "a little lower than usual";
  if (avg >= 2.6) return "good";
  if (avg >= 2.3) return "steady";
  return "neutral";
}

function naturalizePersistence(driver: string, count: number): string | null {
  const p: Record<string, { short: string; building: string; persistent: string }> = {
    sleep_below_baseline: { short: "sleep has been a bit low", building: `sleep has been lower than usual for ${count} days now`, persistent: `sleep has been low for ${count} days — it's starting to catch up with you` },
    stress_above_baseline: { short: "stress has been higher than usual", building: `stress has been elevated for ${count} days now`, persistent: `stress has been high for ${count} days — this is building up` },
    sleep_stress_amplification: { short: "sleep and stress are affecting each other", building: `sleep and stress have been feeding into each other for ${count} days`, persistent: `sleep and stress have been in a loop for ${count} days — this takes real effort to break` },
    mood_trend_declining: { short: "mood has been a little lower", building: `mood has been lower than usual for ${count} days`, persistent: `mood has been low for ${count} days now — something is weighing on you` },
    sleep_trend_declining: { short: "sleep has been slipping", building: `sleep has been dropping for ${count} days`, persistent: `sleep has been declining for ${count} days — your body is feeling it` },
    high_strain: { short: "your body has been under strain", building: `your body has been under more strain than usual for ${count} days`, persistent: `${count} days of higher strain — your recovery is overdue` },
    bleeding_heavy: { short: "flow has been heavier", building: `flow has been heavier than usual for ${count} days`, persistent: `heavy flow for ${count} days — iron support matters now` },
  };
  const phrases = p[driver];
  if (!phrases) return null;
  if (count <= 1) return phrases.short;
  if (count <= 4) return phrases.building;
  return phrases.persistent;
}

function phaseLabel(phase: Phase): string {
  return { menstrual: "Period", follicular: "Follicular phase", ovulation: "Ovulation", luteal: "Luteal phase" }[phase];
}

function phasePositionHuman(phase: Phase, phaseDay: number, daysUntilNextPhase: number): string {
  const label = phaseLabel(phase).toLowerCase();
  if (daysUntilNextPhase <= 1) return `last day of your ${label}`;
  if (phaseDay === 1) return `first day of your ${label}`;
  return `day ${phaseDay} of your ${label}`;
}

function buildTrendStories(ctx: InsightContext, memoryCount: number, memoryDriver: string | null): VyanaTrendContext {
  const sleepDecreasing = ctx.trends.some(t => t === "Sleep decreasing");
  const sleepIncreasing = ctx.trends.some(t => t === "Sleep increasing");
  const stressIncreasing = ctx.trends.some(t => t === "Stress increasing");
  const stressDecreasing = ctx.trends.some(t => t === "Stress decreasing");
  const moodDecreasing = ctx.trends.some(t => t === "Mood decreasing");
  const moodIncreasing = ctx.trends.some(t => t === "Mood increasing");
  const hasSleepStressInteraction = ctx.interaction_flags.includes("sleep_stress_amplification");
  const hasMoodStressCoupling = ctx.interaction_flags.includes("mood_stress_coupling");

  function dur(driver: string, count: number): string {
    if (memoryDriver === driver && count >= 2) {
      return count === 2 ? "for the past couple of days" : count <= 4 ? `for ${count} days now` : `for ${count} days`;
    }
    return "recently";
  }

  const sleepStory = sleepDecreasing ? `Sleep has been slipping ${dur("sleep_below_baseline", memoryCount)}` : sleepIncreasing ? "Sleep has been improving" : null;
  const stressStory = stressIncreasing ? `Stress has been climbing ${dur("stress_above_baseline", memoryCount)}` : stressDecreasing ? "Stress has been easing" : null;
  const moodStory = moodDecreasing ? `Mood has been lower ${dur("mood_trend_declining", memoryCount)}` : moodIncreasing ? "Mood has been lifting" : null;
  const interactionStory = hasSleepStressInteraction ? "Poor sleep and rising stress are feeding into each other — each one is making the other worse" : hasMoodStressCoupling ? "Stress is pulling mood down — they're connected right now, not two separate things" : null;
  const parts = [sleepStory, stressStory, moodStory, interactionStory].filter(Boolean) as string[];
  return { sleepStory, stressStory, moodStory, interactionStory, combinedNarrative: parts.length > 0 ? parts.join(". ") + "." : null };
}

function buildConfidenceMapping(confidence: "low" | "medium" | "high"): VyanaConfidenceMapping {
  const m: Record<"low" | "medium" | "high", VyanaConfidenceMapping> = {
    low: { level: "low", forwardClaims: "you may find, it could be, some people notice", patternClaims: "it looks like, early signs suggest", example: "you may find your energy is a little lower today" },
    medium: { level: "medium", forwardClaims: "you might notice, there's a good chance, you may start to feel", patternClaims: "it seems like, your recent patterns suggest", example: "you might notice a dip in energy around this time" },
    high: { level: "high", forwardClaims: "you're likely to notice, your patterns suggest, this tends to happen", patternClaims: "your cycles show, for you this tends to", example: "this tends to be a lower-energy window for you" },
  };
  return m[confidence];
}

const IDENTITY_OPENERS: string[] = [
  "for you, this part of your cycle tends to",
  "your cycles usually show that",
  "based on your pattern,",
  "you tend to notice that",
  "this is typically how your body responds around now —",
  "your past cycles show that",
  "this is a pattern specific to you —",
];

function shouldUseIdentityThisOutput(cycleDay: number, cycleLength: number): boolean {
  const seed = (cycleDay * 7 + cycleLength * 3) % 20;
  return seed < 13;
}

function buildIdentityLayer(params: {
  crossCycleNarrative: CrossCycleNarrative | null;
  memoryDriver: string | null;
  memoryCount: number;
  phase: Phase;
  cycleDay: number;
  cycleLength: number;
  userId: string;
}): VyanaIdentity {
  const { crossCycleNarrative, memoryDriver, memoryCount, phase, cycleDay, cycleLength, userId } = params;
  const matchingCycles = crossCycleNarrative?.matchingCycles ?? 0;
  const hasPersonalHistory = matchingCycles >= 2;
  const historyCycles = matchingCycles;

  if (!hasPersonalHistory) return { userPatternNarrative: null, patternCore: null, hasPersonalHistory: false, historyCycles, useThisOutput: false };

  const useThisOutput = shouldUseIdentityThisOutput(cycleDay, cycleLength);
  if (!useThisOutput) return { userPatternNarrative: null, patternCore: null, hasPersonalHistory, historyCycles, useThisOutput: false };

  const narrative = crossCycleNarrative!;
  const coreParts: string[] = [];

  if (narrative.typicalSleep !== null && narrative.typicalStress) {
    const sleepRounded = Math.round(narrative.typicalSleep * 2) / 2;
    if (narrative.typicalStress === "elevated" && sleepRounded < 6.5) coreParts.push("this window tends to bring lower sleep and higher stress");
    else if (narrative.typicalStress === "elevated") coreParts.push("stress tends to run higher around this time in your cycle");
    else if (sleepRounded < 6.5) coreParts.push(`sleep tends to be a bit lower around day ${cycleDay}`);
  }

  if (narrative.trend === "worsening") coreParts.push("this window has been getting harder across your recent cycles");
  else if (narrative.trend === "improving") coreParts.push("this window has been getting easier — your recent cycles show improvement here");

  if (memoryDriver && memoryCount >= 4) {
    const di: Record<string, string> = {
      sleep_below_baseline: "sleep tends to dip in this phase",
      stress_above_baseline: "stress tends to run higher around this time",
      mood_trend_declining: "mood tends to be more sensitive in this window",
      sleep_stress_amplification: "the sleep-stress loop is something your body is particularly sensitive to",
    };
    const d = di[memoryDriver];
    if (d) coreParts.push(d);
  }

  if (coreParts.length === 0) return { userPatternNarrative: null, patternCore: null, hasPersonalHistory, historyCycles, useThisOutput };

  const patternCore = coreParts.slice(0, 2).join("; ");
  // Fix 4: user-specific opener rotation
  const openerIndex = (cycleDay + historyCycles + userHash(userId)) % IDENTITY_OPENERS.length;
  const opener = IDENTITY_OPENERS[openerIndex]!;
  const cleanCore = patternCore.replace(/^for you,?\s*/i, "").replace(/^your cycles (usually |tend to )?show(s)? that\s*/i, "");
  const userPatternNarrative = `${opener} ${cleanCore}`;

  return { userPatternNarrative, patternCore, hasPersonalHistory, historyCycles, useThisOutput };
}

function getSignalWeight(driver: string, count: number): { weight: PrioritySignal["weight"]; tone: PrioritySignal["tone"] } {
  if (driver === "mood_trend_declining" && count >= 3) return { weight: "high", tone: "empathetic" };
  if (driver === "high_strain" && count >= 3) return { weight: "high", tone: "empathetic" };
  if (driver === "bleeding_heavy") return { weight: "high", tone: "empathetic" };
  if (driver === "sleep_stress_amplification") return { weight: "high", tone: "neutral" };
  if (driver === "sleep_below_baseline" && count >= 4) return { weight: "high", tone: "neutral" };
  if (driver === "stress_above_baseline" && count >= 4) return { weight: "high", tone: "neutral" };
  if (driver === "sleep_below_baseline" && count >= 2) return { weight: "medium", tone: "neutral" };
  if (driver === "stress_above_baseline" && count >= 2) return { weight: "medium", tone: "neutral" };
  if (driver === "mood_trend_declining") return { weight: "medium", tone: "empathetic" };
  return { weight: "low", tone: "neutral" };
}

// ─── Main builder ─────────────────────────────────────────────────────────────

export function buildVyanaContext(params: {
  ctx: InsightContext;
  baseline: NumericBaseline;
  crossCycleNarrative: CrossCycleNarrative | null;
  hormoneState: HormoneState | null;
  hormoneLanguage: string | null;
  phase: Phase;
  cycleDay: number;
  phaseDay: number;
  cycleLength: number;
  cycleMode: CycleMode;
  daysUntilNextPhase: number;
  daysUntilNextPeriod: number;
  isPeriodDelayed: boolean;
  daysOverdue: number;
  isIrregular: boolean;
  memoryDriver: string | null;
  memoryCount: number;
  userName: string | null;
  userId: string;                          // Fix 4: required for user-specific hashing
  anticipationFrequencyState?: AnticipationFrequencyState;
  emotionalMemoryInput?: EmotionalMemoryInput | null; // NEW
  primaryInsightCause?: PrimaryInsightCause;
}): VyanaContext {
  const {
    ctx, baseline, crossCycleNarrative, hormoneState, hormoneLanguage,
    phase, cycleDay, phaseDay, cycleLength, cycleMode,
    daysUntilNextPhase, daysUntilNextPeriod,
    isPeriodDelayed, daysOverdue, isIrregular,
    memoryDriver, memoryCount, userName, userId,
    anticipationFrequencyState = { lastShownCycleDay: null, lastShownType: null },
    emotionalMemoryInput = null,
    primaryInsightCause = "cycle",
  } = params;

  const daysLeft = cycleLength - cycleDay;

  // ── Sleep ────────────────────────────────────────────────────────────────
  const sleepDelta = baseline.sleepDelta;
  const sleepMeaningful = sleepDelta !== null && Math.abs(sleepDelta) >= 0.8;
  const sleep: VyanaSleepContext = {
    human: baseline.recentSleepAvg !== null ? humanSleep(baseline.recentSleepAvg, cycleDay, userId) : null,
    comparison: sleepMeaningful && sleepDelta !== null ? sleepDelta < 0 ? "lower than your usual" : "higher than your usual" : null,
    deviationMeaningful: sleepMeaningful,
    deviationLabel: sleepMeaningful && sleepDelta !== null ? naturalizeDeviationLabel(sleepDelta) : null,
  };

  const stressDelta = baseline.stressDelta;
  const stressMeaningful = stressDelta !== null && Math.abs(stressDelta) >= 0.5;
  const stressPersistDays = memoryDriver === "stress_above_baseline" ? memoryCount : 0;
  const stress: VyanaStressContext = {
    human: baseline.recentStressAvg !== null ? naturalizeStressHuman(baseline.recentStressAvg, stressPersistDays) : null,
    comparison: stressMeaningful && stressDelta !== null ? stressDelta > 0 ? "higher than your usual" : "lower than your usual" : null,
    deviationMeaningful: stressMeaningful,
  };

  const moodDelta = baseline.moodDelta;
  const moodMeaningful = moodDelta !== null && Math.abs(moodDelta) >= 0.4;
  const mood: VyanaMoodContext = {
    human: baseline.recentMoodAvg !== null ? naturalizeMoodHuman(baseline.recentMoodAvg) : null,
    comparison: moodMeaningful && moodDelta !== null ? moodDelta < 0 ? "lower than your usual" : "better than your usual" : null,
    deviationMeaningful: moodMeaningful,
  };

  const trends = buildTrendStories(ctx, memoryCount, memoryDriver);
  const persistenceNarrative = memoryDriver && memoryCount >= 2 ? naturalizePersistence(memoryDriver, memoryCount) : null;
  const severity: VyanaMemoryContext["severity"] = memoryDriver && memoryCount >= 2 ? memoryCount <= 4 ? "building" : "persistent" : null;
  const memory: VyanaMemoryContext = { persistenceNarrative, severity };
  const hormones: VyanaHormoneContext = { narrative: hormoneLanguage, surface: !!(hormoneState?.surfaceHormones && hormoneLanguage) };

  const nextPeriodHuman = !isPeriodDelayed && daysUntilNextPeriod > 0
    ? daysUntilNextPeriod === 1 ? "your period may start tomorrow" : daysUntilNextPeriod <= 4 ? `your period may be around ${daysUntilNextPeriod} days away` : null : null;
  const delayedPeriodHuman = isPeriodDelayed ? daysOverdue === 1 ? "your period is a day late" : `your period is ${daysOverdue} days late` : null;

  const cycle: VyanaCycleContext = {
    cycleSummary: `Day ${cycleDay} of your ${cycleLength}-day cycle`,
    phaseLabel: phaseLabel(phase),
    phasePositionHuman: phasePositionHuman(phase, phaseDay, daysUntilNextPhase),
    nextPeriodHuman, delayedPeriodHuman, isIrregular,
    irregularCaveat: isIrregular ? "Your cycle tends to vary — treat phase predictions as estimates" : null,
  };

  const crossCycle: VyanaCrossCycleContext = {
    narrative: crossCycleNarrative?.narrativeStatement ?? null,
    trend: crossCycleNarrative?.trend ?? null,
    trendHuman: crossCycleNarrative?.trend === "improving" ? "this window has been getting easier across your recent cycles"
      : crossCycleNarrative?.trend === "worsening" ? "this window has been getting harder across your recent cycles" : null,
  };

  const identity = buildIdentityLayer({ crossCycleNarrative, memoryDriver, memoryCount, phase, cycleDay, cycleLength, userId });
  const confidenceMapping = buildConfidenceMapping(ctx.confidence);

  // Severity detection (Fix 5)
  const highSeverity = isHighSeverityState({ memoryDriver, memoryCount, ctx, isPeriodDelayed });

  const anticipation = buildAnticipation({ phase, cycleDay, cycleLength, daysUntilNextPhase, memoryDriver, memoryCount, ctx, crossCycleNarrative, isIrregular, frequencyState: anticipationFrequencyState, userId });

  // Fix 3 + Fix 4: surprise insight
  const surpriseInsight = buildSurpriseInsight({
    ctx,
    sleep,
    stress,
    mood,
    phase,
    cycleDay,
    cycleLength,
    memoryDriver,
    memoryCount,
    userId,
    primaryInsightCause,
  });

  // Fix 2: mutual exclusivity — surprise takes priority, delight suppressed
  const delightParams = {
    phase, cycleDay, cycleLength, memoryDriver, memoryCount,
    isPeriodDelayed, isStablePattern: false, isHighSeverity: highSeverity,
    trends, daysLeft, userId,
  };
  const delight = surpriseInsight.shouldSurface
    ? { moment: null, shouldSurface: false, type: null } as VyanaDelight
    : buildDelightMoment(delightParams);

  // NEW: emotional memory
  const emotionalMemory = buildEmotionalMemory({ driver: memoryDriver, input: emotionalMemoryInput, cycleDay });

  // ── Fix 1: Layered signal composition ─────────────────────────────────────
  const layered: LayeredSignals = { core: [], narrative: [], enhancement: [], emotional: [] };

  // CORE layer — high-weight factual signals
  if (isPeriodDelayed && delayedPeriodHuman) {
    layered.core.push({ text: delayedPeriodHuman, weight: "high", tone: "sensitive", layer: "core" });
  }
  if (memory.persistenceNarrative && memoryDriver) {
    const { weight, tone } = getSignalWeight(memoryDriver, memoryCount);
    if (weight === "high") layered.core.push({ text: memory.persistenceNarrative, weight, tone, layer: "core" });
    else layered.narrative.push({ text: memory.persistenceNarrative, weight, tone, layer: "narrative" });
  }
  if (trends.interactionStory) {
    layered.core.push({ text: trends.interactionStory, weight: "high", tone: "neutral", layer: "core" });
  }
  if (sleep.deviationMeaningful && sleep.human && sleep.deviationLabel) {
    const w = memoryDriver === "sleep_below_baseline" ? "medium" : "low";
    const target = w === "medium" ? layered.narrative : layered.narrative;
    target.push({ text: `Sleep ${sleep.deviationLabel} — ${sleep.human}`, weight: w, tone: "neutral", layer: "narrative" });
  }
  if (stress.deviationMeaningful && stress.human) {
    layered.narrative.push({ text: `Stress ${stress.human}`, weight: memoryDriver === "stress_above_baseline" ? "medium" : "low", tone: memoryCount >= 3 ? "empathetic" : "neutral", layer: "narrative" });
  }
  if (mood.deviationMeaningful && mood.human && mood.comparison) {
    layered.narrative.push({ text: `Mood ${mood.human} — ${mood.comparison}`, weight: "medium", tone: "empathetic", layer: "narrative" });
  }

  // NARRATIVE layer — identity + cross-cycle
  if (identity.useThisOutput && identity.userPatternNarrative) {
    layered.narrative.push({ text: identity.userPatternNarrative, weight: "medium", tone: "neutral", layer: "narrative" });
  }
  if (crossCycle.narrative) {
    layered.narrative.push({ text: crossCycle.narrative, weight: "medium", tone: "neutral", layer: "narrative" });
  }

  // ENHANCEMENT layer — max 1 (surprise > anticipation)
  if (surpriseInsight.shouldSurface && surpriseInsight.insight) {
    layered.enhancement.push({ text: surpriseInsight.insight, weight: "medium", tone: "neutral", layer: "enhancement" });
  } else if (anticipation.shouldSurface && anticipation.narrative) {
    layered.enhancement.push({
      text: anticipation.narrative,
      weight: anticipation.type === "warning" ? "medium" : "low",
      tone: anticipation.type === "encouragement" ? "encouraging" : "neutral",
      layer: "enhancement",
    });
  }

  // EMOTIONAL layer — max 1, always last
  // Emotional memory takes priority over delight when present
  if (emotionalMemory.hasMemory && emotionalMemory.recallNarrative) {
    layered.emotional.push({ text: emotionalMemory.recallNarrative, weight: "low", tone: "empathetic", layer: "emotional" });
  } else if (delight.shouldSurface && delight.moment) {
    layered.emotional.push({ text: delight.moment, weight: "low", tone: "delightful", layer: "emotional" });
  }

  // Fix 1: compose in layer order
  const prioritySignals = composeSignals(layered);

  const isStablePattern = layered.core.length === 0 && layered.narrative.filter(s => s.weight !== "low").length === 0;

  if (prioritySignals.length === 0) {
    prioritySignals.push({ text: "no strong deviations — patterns are stable right now", weight: "low", tone: "neutral", layer: "narrative" });
  }

  return {
    userName, cycle, sleep, stress, mood, trends, memory, hormones,
    crossCycle, prioritySignals, isStablePattern,
    anticipation, identity, delight, surpriseInsight,
    emotionalMemory, confidenceMapping,
    mode: ctx.mode, confidence: ctx.confidence,
    isHighSeverity: highSeverity,
    primaryInsightCause,
  };
}

// ─── Serializers ──────────────────────────────────────────────────────────────

export function serializeVyanaContext(vc: VyanaContext): string {
  const lines: string[] = [];

  if (vc.userName) lines.push(`User: ${vc.userName}`);
  lines.push(`Cycle: ${vc.cycle.cycleSummary} — ${vc.cycle.phasePositionHuman}`);
  if (vc.primaryInsightCause === "sleep_disruption") {
    lines.push(
      `PRIMARY CAUSE (mandatory): sleep / recovery — NOT hormones, NOT iron recovery, NOT "past cycles show". Explain how she feels as sleep-driven. Phase is context only.`,
    );
  } else if (vc.primaryInsightCause === "stress_led") {
    lines.push(
      `PRIMARY CAUSE: elevated stress — prioritize stress as driver; hormones only as light context in why if at all.`,
    );
  }
  if (vc.cycle.delayedPeriodHuman) lines.push(`⚠ Period: ${vc.cycle.delayedPeriodHuman}`);
  if (vc.cycle.nextPeriodHuman) lines.push(`Period: ${vc.cycle.nextPeriodHuman}`);
  if (vc.cycle.irregularCaveat) lines.push(`Note: ${vc.cycle.irregularCaveat}`);
  if (vc.sleep.human) lines.push(vc.sleep.deviationMeaningful && vc.sleep.comparison ? `Sleep: ${vc.sleep.human} — ${vc.sleep.comparison}` : `Sleep: ${vc.sleep.human}`);
  if (vc.stress.human) lines.push(vc.stress.deviationMeaningful && vc.stress.comparison ? `Stress: ${vc.stress.human} — ${vc.stress.comparison}` : `Stress: ${vc.stress.human}`);
  if (vc.mood.human) lines.push(vc.mood.deviationMeaningful && vc.mood.comparison ? `Mood: ${vc.mood.human} — ${vc.mood.comparison}` : `Mood: ${vc.mood.human}`);
  if (vc.trends.combinedNarrative) lines.push(`Signal patterns: ${vc.trends.combinedNarrative}`);
  if (vc.memory.persistenceNarrative) lines.push(`Persistence: ${vc.memory.persistenceNarrative}`);
  if (vc.crossCycle.narrative) { lines.push(`Past cycles: ${vc.crossCycle.narrative}`); if (vc.crossCycle.trendHuman) lines.push(`Trend: ${vc.crossCycle.trendHuman}`); }
  if (vc.identity.useThisOutput && vc.identity.userPatternNarrative) lines.push(`Your pattern: ${vc.identity.userPatternNarrative}`);
  if (
    vc.hormones.surface &&
    vc.hormones.narrative &&
    vc.primaryInsightCause === "cycle"
  ) {
    lines.push(`Hormone context (for "why this is happening" only): ${vc.hormones.narrative}`);
  }
  if (vc.anticipation.shouldSurface && vc.anticipation.narrative) lines.push(`Anticipation: ${vc.anticipation.narrative}`);
  // NEW: emotional memory in context
  if (vc.emotionalMemory.hasMemory && vc.emotionalMemory.recallNarrative) lines.push(`Emotional memory: ${vc.emotionalMemory.recallNarrative}`);
  if (vc.isStablePattern) lines.push(`Pattern: stable — no strong deviations right now`);

  return lines.join("\n");
}

export function serializePrioritySignals(signals: PrioritySignal[], confidenceMapping: VyanaConfidenceMapping): string {
  if (signals.length === 0) return "";

  const core = signals.filter(s => s.layer === "core");
  const narrative = signals.filter(s => s.layer === "narrative");
  const enhancement = signals.filter(s => s.layer === "enhancement");
  const emotional = signals.filter(s => s.layer === "emotional");

  const lines: string[] = [
    `PRIORITY SIGNALS (confidence: ${confidenceMapping.level} — use "${confidenceMapping.forwardClaims}" for forward claims):`,
    `Translate into natural language — do NOT copy verbatim`,
  ];

  if (core.length > 0) {
    lines.push("Address these first (most important):");
    core.forEach(s => {
      const hint = s.tone === "empathetic" ? " [warm, understanding]" : s.tone === "sensitive" ? " [gentle, reassuring]" : "";
      lines.push(`  → ${s.text}${hint}`);
    });
  }
  if (narrative.length > 0) {
    lines.push("Weave in naturally:");
    narrative.forEach(s => lines.push(`  → ${s.text}`));
  }
  if (enhancement.length > 0) {
    const e = enhancement[0]!;
    const isSurprise = e.tone === "neutral" && e.text.includes("combined") || e.text.includes("amplifies") || e.text.includes("hormonal");
    lines.push(isSurprise
      ? "Surprise insight (lead with the unexpected connection):"
      : `Anticipation (${e.tone === "encouraging" ? "weave as warm forward-looking note" : "matter-of-fact, not alarming"}):`
    );
    lines.push(`  → ${e.text}`);
  }
  if (emotional.length > 0) {
    const em = emotional[0]!;
    const isMemory = em.tone === "empathetic" && em.text.includes("you logged");
    lines.push(isMemory
      ? "Emotional memory (weave as genuine recall — 'last time...'):"
      : "Emotional touch (warm human moment — weave gently, once, don't force):"
    );
    lines.push(`  → ${em.text}`);
  }

  return lines.join("\n");
}