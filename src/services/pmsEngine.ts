import type { Phase } from "./cycleEngine";

export interface PmsForecast {
  available: boolean;
  cyclesAnalyzed: number;
  expectedSymptomWindow: {
    startDay: number;
    peakDay: number;
  };
  likelySymptoms: string[];
  confidence: "low" | "medium" | "high";
  headline: string;
  action: string;
}

/**
 * NEW: Warmup state — shown when user is in luteal phase but we don't have
 * enough past cycles for a full forecast yet. Keeps users engaged and sets
 * expectation that the forecast is coming.
 */
export interface PmsForecastWarmup {
  available: false;
  warmup: true;
  cyclesSoFar: number;
  cyclesNeeded: number;
  progressPercent: number;
  message: string;           // "You're X cycle away from your first PMS forecast"
  tip: string;               // actionable tip for this luteal phase while we wait
  logPrompt: string;         // what to log this cycle so the forecast is accurate
}

export type PmsForecastResult = PmsForecast | PmsForecastWarmup | null;

export interface DriverHistory {
  driver: string;
  cycleDay: number;
  phase: Phase;
  createdAt?: Date;
}

const DRIVER_TO_SYMPTOM: Record<string, string> = {
  mood_stress_coupling: "mood_drop",
  stress_above_baseline: "high_stress",
  sleep_below_baseline: "sleep_disruption",
  sleep_variability_high: "sleep_disruption",
  high_strain: "fatigue",
  sedentary_strain: "low_energy",
  bleeding_heavy: "heavy_flow",
  phase_deviation: "energy_mismatch",
};

const LATE_LUTEAL_START = 18;
const LATE_LUTEAL_END = 28;

function isLateLuteal(cycleDay: number, phase: Phase): boolean {
  return phase === "luteal" && cycleDay >= LATE_LUTEAL_START && cycleDay <= LATE_LUTEAL_END;
}

function groupIntoCycleWindows(lateLutealEntries: DriverHistory[]): DriverHistory[][] {
  if (lateLutealEntries.length === 0) return [];

  const sorted = [...lateLutealEntries].sort((a, b) => {
    if (a.createdAt && b.createdAt) return a.createdAt.getTime() - b.createdAt.getTime();
    return a.cycleDay - b.cycleDay;
  });

  const windows: DriverHistory[][] = [];
  let current: DriverHistory[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    if (curr.cycleDay < prev.cycleDay) {
      windows.push(current);
      current = [curr];
    } else {
      current.push(curr);
    }
  }
  windows.push(current);
  return windows;
}

/**
 * Build a warmup state for users currently in luteal phase but without
 * enough past cycle data for a full forecast.
 */
function buildWarmupState(
  cycleDay: number,
  cyclesSoFar: number,
): PmsForecastWarmup {
  const cyclesNeeded = 2;
  const progressPercent = Math.round((cyclesSoFar / cyclesNeeded) * 100);

  const cyclesLeft = cyclesNeeded - cyclesSoFar;

  const message =
    cyclesSoFar === 0
      ? "Complete your first cycle and we'll start building your personal PMS forecast."
      : `You're ${cyclesLeft} cycle${cyclesLeft === 1 ? "" : "s"} away from your first personalized PMS forecast.`;

  const tip =
    cycleDay >= 22
      ? "For now: lighter schedule, earlier bedtime, and avoid high-stakes decisions in the next few days — these help most people in this window."
      : "For now: protect your sleep and keep stress low in the second half of your cycle — these are the two biggest levers for PMS symptoms.";

  const logPrompt =
    "Log your mood, sleep, and stress daily this cycle — the more you log, the more accurate your first forecast will be.";

  return {
    available: false,
    warmup: true,
    cyclesSoFar,
    cyclesNeeded,
    progressPercent: Math.min(99, progressPercent),
    message,
    tip,
    logPrompt,
  };
}

export function buildPmsSymptomForecast(
  phase: Phase,
  cycleDay: number,
  daysUntilNextPhase: number,
  previousCycleDrivers: DriverHistory[],
  cyclesSoFar: number = 0,
): PmsForecastResult {
  // Only surface in luteal phase
  if (phase !== "luteal") return null;

  const lateLutealHistory = previousCycleDrivers.filter((d) => isLateLuteal(d.cycleDay, d.phase));
  const cycleWindows = groupIntoCycleWindows(lateLutealHistory);

  // ── Warmup state: in luteal but not enough past cycles ─────────────────────
  if (cycleWindows.length < 2) {
    return buildWarmupState(cycleDay, cyclesSoFar);
  }

  // ── Full forecast ──────────────────────────────────────────────────────────
  const cyclesAnalyzed = cycleWindows.length;

  const symptomCycleCount: Record<string, number> = {};
  for (const window of cycleWindows) {
    const symptomsInWindow = new Set<string>();
    for (const entry of window) {
      const symptom = DRIVER_TO_SYMPTOM[entry.driver];
      if (symptom) symptomsInWindow.add(symptom);
    }
    for (const symptom of symptomsInWindow) {
      symptomCycleCount[symptom] = (symptomCycleCount[symptom] ?? 0) + 1;
    }
  }

  const recentWindows = cycleWindows.slice(-3);
  const threshold = Math.min(2, recentWindows.length);
  const likelySymptoms = Object.entries(symptomCycleCount)
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([symptom]) => symptom);

  if (likelySymptoms.length === 0) {
    // Enough cycles but no consistent symptoms — still show warmup with encouragement
    return buildWarmupState(cycleDay, cyclesSoFar);
  }

  const allDaysWithSymptoms = lateLutealHistory
    .filter((d) => DRIVER_TO_SYMPTOM[d.driver])
    .map((d) => d.cycleDay);

  const startDay = allDaysWithSymptoms.length > 0 ? Math.min(...allDaysWithSymptoms) : 22;
  const peakDay =
    allDaysWithSymptoms.length > 0
      ? Math.round(allDaysWithSymptoms.reduce((a, b) => a + b, 0) / allDaysWithSymptoms.length)
      : 25;

  const confidence: PmsForecast["confidence"] =
    cyclesAnalyzed >= 4 ? "high" : cyclesAnalyzed >= 3 ? "medium" : "low";

  const daysUntilWindow = cycleDay >= LATE_LUTEAL_START ? 0 : LATE_LUTEAL_START - cycleDay;
  const symptomLabels = likelySymptoms.slice(0, 3).join(", ").replace(/_/g, " ");

  const headline =
    daysUntilWindow === 0
      ? `Your last ${cyclesAnalyzed} cycles show ${symptomLabels} appearing around day ${startDay}–${peakDay}.`
      : `Your last ${cyclesAnalyzed} cycles show ${symptomLabels} starting around day ${startDay}.`;

  const action =
    daysUntilWindow === 0
      ? `Lighten your schedule for the next few days — you know this window.`
      : `Getting ahead of sleep now is the highest-leverage move before day ${startDay} arrives.`;

  return {
    available: true,
    cyclesAnalyzed,
    expectedSymptomWindow: { startDay, peakDay },
    likelySymptoms,
    confidence,
    headline,
    action,
  };
}