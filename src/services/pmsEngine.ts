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

/** Late luteal window: days 18–28 */
const LATE_LUTEAL_START = 18;
const LATE_LUTEAL_END = 28;

function isLateLuteal(cycleDay: number, phase: Phase): boolean {
  return phase === "luteal" && cycleDay >= LATE_LUTEAL_START && cycleDay <= LATE_LUTEAL_END;
}

/**
 * Groups driver history entries into discrete past cycles by detecting
 * phase boundaries. Each contiguous run of luteal entries is one cycle window.
 * Returns an array of entry arrays, one per detected cycle window.
 */
function groupIntoCycleWindows(
  lateLutealEntries: DriverHistory[],
): DriverHistory[][] {
  if (lateLutealEntries.length === 0) return [];

  // Sort by time so cycle-day drops can indicate a new cycle window.
  // Fallback to cycleDay ordering only if timestamps are unavailable.
  const sorted = [...lateLutealEntries].sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      return a.createdAt.getTime() - b.createdAt.getTime();
    }
    return a.cycleDay - b.cycleDay;
  });

  // Split into windows: a new window starts when cycleDay resets (goes lower)
  const windows: DriverHistory[][] = [];
  let current: DriverHistory[] = [sorted[0]!];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    // Detect a cycle boundary: cycle day resets lower after period.
    // Example: ...25 -> 22 should start a new window.
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

export function buildPmsSymptomForecast(
  phase: Phase,
  cycleDay: number,
  daysUntilNextPhase: number,
  previousCycleDrivers: DriverHistory[],
): PmsForecast | null {
  // Only surface forecast when user is in or approaching luteal phase
  const inLutealWindow = phase === "luteal";
  if (!inLutealWindow) return null;

  const lateLutealHistory = previousCycleDrivers.filter((d) =>
    isLateLuteal(d.cycleDay, d.phase),
  );

  const cycleWindows = groupIntoCycleWindows(lateLutealHistory);

  // Need at least 2 past cycles of late luteal data
  if (cycleWindows.length < 2) return null;

  const cyclesAnalyzed = cycleWindows.length;

  // Count how many cycles each symptom appeared in
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

  // Include symptoms that appeared in >= 2 of the last 3 cycles
  const recentWindows = cycleWindows.slice(-3);
  const threshold = Math.min(2, recentWindows.length);
  const likelySymptoms = Object.entries(symptomCycleCount)
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([symptom]) => symptom);

  if (likelySymptoms.length === 0) return null;

  // Estimate symptom window from past data
  const allDaysWithSymptoms = lateLutealHistory
    .filter((d) => DRIVER_TO_SYMPTOM[d.driver])
    .map((d) => d.cycleDay);

  const startDay = allDaysWithSymptoms.length > 0
    ? Math.min(...allDaysWithSymptoms)
    : 22;
  const peakDay = allDaysWithSymptoms.length > 0
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
