import type { DailyLog, CycleHistory } from "@prisma/client";
import type { Phase } from "./cycleEngine";
import { calculateCycleInfoForDate } from "./cycleEngine";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HealthPatternAlert {
  patternKey: string;
  title: string;
  description: string;
  disclaimer: string;
  suggestedAction: string;
  confidence: "low" | "medium" | "high";
  cyclesAnalyzed: number;
  firstDetectedAt: Date;
}

/**
 * NEW: Progressive watching state — shown before enough cycles exist for a full alert.
 * Keeps users engaged and shows the app is actively learning them.
 */
export interface HealthPatternWatching {
  patternKey: string;
  title: string;
  watchingMessage: string;       // "We're watching for X in your next cycle"
  signalsSeen: string[];         // what signals triggered the watch
  cyclesNeeded: number;          // how many more cycles until full detection
  cyclesSoFar: number;
  progressPercent: number;       // 0–100, shown as a progress indicator
}

export interface HealthPatternResult {
  hasAlerts: boolean;
  alerts: HealthPatternAlert[];
  watching: HealthPatternWatching[];   // NEW: progressive watching states
  lastChecked: Date;
  message?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HEALTH_PATTERN_DISCLAIMER =
  "This is a pattern we noticed in your logs, not a medical diagnosis. " +
  "Only a doctor can diagnose health conditions.";

const HEALTH_PATTERN_ACTION =
  "Consider mentioning this to your gynaecologist or GP at your next visit.";

const MIN_CYCLES_FOR_ALERT: Record<string, number> = {
  pmdd: 2,
  pcos: 3,
  endometriosis: 3,
  iron_deficiency: 2,
  thyroid: 4,
  luteal_phase_defect: 3,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CycleBucket {
  startDate: Date;
  endDate: Date;
  cycleLength: number;
  logs: DailyLog[];
}

function hasEnoughData(pattern: string, cyclesAvailable: number): boolean {
  return cyclesAvailable >= (MIN_CYCLES_FOR_ALERT[pattern] ?? 99);
}

function groupLogsByCycle(logs: DailyLog[], cycleHistory: CycleHistory[]): CycleBucket[] {
  const completed = cycleHistory
    .filter((ch) => ch.endDate && ch.cycleLength)
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  return completed.map((ch) => {
    const start = ch.startDate.getTime();
    const end = ch.endDate!.getTime();
    const cycleLogs = logs.filter((log) => {
      const t = new Date(log.date).getTime();
      return t >= start && t < end;
    });
    return { startDate: ch.startDate, endDate: ch.endDate!, cycleLength: ch.cycleLength!, logs: cycleLogs };
  });
}

function getPhaseForLog(log: DailyLog, cycleStartDate: Date, cycleLength: number): Phase {
  return calculateCycleInfoForDate(cycleStartDate, new Date(log.date), cycleLength, "natural").phase;
}

function getCycleDayForLog(log: DailyLog, cycleStartDate: Date): number {
  const diffMs = new Date(log.date).getTime() - cycleStartDate.getTime();
  return Math.max(1, Math.floor(diffMs / 86400000) + 1);
}

// ---------------------------------------------------------------------------
// Early signal detectors — fire with just 1 cycle or even just logs
// These power the "watching" states
// ---------------------------------------------------------------------------

interface EarlySignal {
  detected: boolean;
  signalsSeen: string[];
  strength: number; // 0–1
}

function detectEarlyPCOSSignals(logs: DailyLog[], cycleHistory: CycleHistory[]): EarlySignal {
  const signalsSeen: string[] = [];
  let strength = 0;

  const lengths = cycleHistory.filter((ch) => ch.cycleLength).map((ch) => ch.cycleLength!);
  if (lengths.some((l) => l > 35)) { signalsSeen.push("cycle longer than 35 days"); strength += 0.3; }
  if (lengths.length >= 2 && Math.max(...lengths) - Math.min(...lengths) > 7) {
    signalsSeen.push("cycle length varies significantly"); strength += 0.25;
  }

  const recentLogs = logs.slice(0, 30);
  const fatigueHigh = recentLogs.filter((l) => l.fatigue === "high" || l.fatigue === "very_high").length;
  if (recentLogs.length > 0 && fatigueHigh / recentLogs.length >= 0.35) {
    signalsSeen.push("frequent fatigue across cycle"); strength += 0.25;
  }

  const stressHigh = recentLogs.filter((l) => l.stress === "high" || l.stress === "very_high").length;
  if (recentLogs.length > 0 && stressHigh / recentLogs.length >= 0.35) {
    signalsSeen.push("elevated stress across most days"); strength += 0.2;
  }

  const cravingsFreq = recentLogs.filter((l) => l.cravings && l.cravings !== "none" && l.cravings !== "low").length;
  if (recentLogs.length > 0 && cravingsFreq / recentLogs.length >= 0.4) {
    signalsSeen.push("frequent cravings"); strength += 0.15;
  }

  return { detected: signalsSeen.length >= 2, signalsSeen, strength: Math.min(1, strength) };
}

function detectEarlyPMDDSignals(logs: DailyLog[], cycleHistory: CycleHistory[]): EarlySignal {
  const signalsSeen: string[] = [];
  let strength = 0;

  if (cycleHistory.length === 0) return { detected: false, signalsSeen: [], strength: 0 };

  const latestCycle = cycleHistory.sort((a, b) => b.startDate.getTime() - a.startDate.getTime())[0]!;
  const cycleLength = latestCycle.cycleLength ?? 28;

  const prePeriodStart = new Date(latestCycle.startDate.getTime() + (cycleLength - 8) * 86400000);
  const prePeriodLogs = logs.filter((l) => {
    const t = new Date(l.date).getTime();
    return t >= prePeriodStart.getTime() && t < latestCycle.startDate.getTime() + cycleLength * 86400000;
  });

  const lowMoodDays = prePeriodLogs.filter(
    (l) => l.mood === "low" || l.mood === "anxious" || l.mood === "irritable" || l.mood === "very_low"
  ).length;

  if (lowMoodDays >= 3) { signalsSeen.push(`low mood for ${lowMoodDays} days before period`); strength += 0.4; }

  const poorSleepDays = prePeriodLogs.filter((l) => typeof l.sleep === "number" && l.sleep < 6).length;
  if (poorSleepDays >= 2) { signalsSeen.push("disrupted sleep before period"); strength += 0.3; }

  const highStressDays = prePeriodLogs.filter((l) => l.stress === "high" || l.stress === "very_high").length;
  if (highStressDays >= 3) { signalsSeen.push("high stress before period"); strength += 0.3; }

  return { detected: signalsSeen.length >= 2, signalsSeen, strength: Math.min(1, strength) };
}

function detectEarlyEndoSignals(logs: DailyLog[], cycleHistory: CycleHistory[]): EarlySignal {
  const signalsSeen: string[] = [];
  let strength = 0;

  const recentLogs = logs.slice(0, 60);

  let consecutivePain = 0;
  let maxPain = 0;
  for (const log of recentLogs) {
    if (log.pain === "severe" || log.pain === "very_severe") {
      consecutivePain++;
      maxPain = Math.max(maxPain, consecutivePain);
    } else {
      consecutivePain = 0;
    }
  }
  if (maxPain >= 2) { signalsSeen.push(`severe pain for ${maxPain}+ consecutive days`); strength += 0.45; }

  const heavyBleeding = recentLogs.filter((l) => typeof l.padsChanged === "number" && l.padsChanged >= 7).length;
  if (heavyBleeding >= 2) { signalsSeen.push(`heavy bleeding on ${heavyBleeding} days`); strength += 0.4; }

  return { detected: signalsSeen.length >= 1, signalsSeen, strength: Math.min(1, strength) };
}

function detectEarlyIronSignals(logs: DailyLog[], cycleHistory: CycleHistory[]): EarlySignal {
  const signalsSeen: string[] = [];
  let strength = 0;

  const recentLogs = logs.slice(0, 30);
  const heavyFlow = recentLogs.filter((l) => typeof l.padsChanged === "number" && l.padsChanged >= 7).length;
  if (heavyFlow >= 2) { signalsSeen.push(`heavy flow on ${heavyFlow} days`); strength += 0.4; }

  const fatigueDays = recentLogs.filter((l) => l.fatigue === "high" || l.fatigue === "very_high").length;
  if (recentLogs.length > 0 && fatigueDays / recentLogs.length >= 0.35) {
    signalsSeen.push("persistent fatigue"); strength += 0.35;
  }

  const lowEnergyDays = recentLogs.filter((l) => l.energy === "low" || l.energy === "very_low").length;
  if (recentLogs.length > 0 && lowEnergyDays / recentLogs.length >= 0.4) {
    signalsSeen.push("consistently low energy"); strength += 0.25;
  }

  return { detected: signalsSeen.length >= 2, signalsSeen, strength: Math.min(1, strength) };
}

// ---------------------------------------------------------------------------
// Build watching state from early signal
// ---------------------------------------------------------------------------

function buildWatchingState(
  patternKey: string,
  title: string,
  watchingMessage: string,
  signal: EarlySignal,
  cyclesSoFar: number,
): HealthPatternWatching | null {
  if (!signal.detected) return null;
  const cyclesNeeded = MIN_CYCLES_FOR_ALERT[patternKey] ?? 2;
  const progressPercent = Math.round((cyclesSoFar / cyclesNeeded) * 100);
  return {
    patternKey,
    title,
    watchingMessage,
    signalsSeen: signal.signalsSeen,
    cyclesNeeded,
    cyclesSoFar,
    progressPercent: Math.min(99, progressPercent), // never 100 — that's when the alert fires
  };
}

// ---------------------------------------------------------------------------
// Full alert detectors (unchanged logic, same thresholds)
// ---------------------------------------------------------------------------

function detectPCOSIndicators(logs: DailyLog[], cycleHistory: CycleHistory[]): HealthPatternAlert | null {
  const completedCycles = cycleHistory.filter((ch) => ch.endDate && ch.cycleLength);
  if (!hasEnoughData("pcos", completedCycles.length)) return null;

  const buckets = groupLogsByCycle(logs, cycleHistory);
  if (buckets.length < MIN_CYCLES_FOR_ALERT.pcos) return null;

  let signals = 0;
  const analyzed = buckets.length;

  const lengths = completedCycles.map((ch) => ch.cycleLength!);
  const hasLongCycles = lengths.some((l) => l > 35);
  const hasHighVariation = lengths.length >= 2 && Math.max(...lengths) - Math.min(...lengths) > 7;
  if (hasLongCycles || hasHighVariation) signals++;

  const phasesWithHighStress = new Set<Phase>();
  for (const bucket of buckets) {
    for (const log of bucket.logs) {
      if (log.stress === "high" || log.stress === "very_high") {
        phasesWithHighStress.add(getPhaseForLog(log, bucket.startDate, bucket.cycleLength));
      }
    }
  }
  if (phasesWithHighStress.size >= 3) signals++;

  let fatigueOutsideMenstrual = 0, totalOutsideMenstrual = 0;
  for (const bucket of buckets) {
    for (const log of bucket.logs) {
      const phase = getPhaseForLog(log, bucket.startDate, bucket.cycleLength);
      if (phase !== "menstrual") {
        totalOutsideMenstrual++;
        if (log.fatigue === "high" || log.fatigue === "very_high") fatigueOutsideMenstrual++;
      }
    }
  }
  if (totalOutsideMenstrual > 0 && fatigueOutsideMenstrual / totalOutsideMenstrual >= 0.4) signals++;

  let cravingsCount = 0, totalLogs = 0;
  for (const bucket of buckets) {
    for (const log of bucket.logs) {
      totalLogs++;
      if (log.cravings && log.cravings !== "none" && log.cravings !== "low") cravingsCount++;
    }
  }
  if (totalLogs > 0 && cravingsCount / totalLogs >= 0.4) signals++;

  const phasesWithLowMood = new Set<Phase>();
  for (const bucket of buckets) {
    for (const log of bucket.logs) {
      if (log.mood === "low" || log.mood === "anxious" || log.mood === "irritable") {
        phasesWithLowMood.add(getPhaseForLog(log, bucket.startDate, bucket.cycleLength));
      }
    }
  }
  if (phasesWithLowMood.size >= 3) signals++;

  if (signals < 3) return null;

  const confidence: HealthPatternAlert["confidence"] =
    signals >= 5 ? "high" : signals >= 4 ? "medium" : "low";

  return {
    patternKey: "pcos_indicator",
    title: "Possible hormonal imbalance pattern",
    description:
      "We've noticed your cycles tend to be longer or irregular, and you've " +
      "been logging fatigue and stress across most of your cycle — not just " +
      "around your period. These patterns sometimes show up with hormonal " +
      "imbalances like PCOS. A gynaecologist can check with a simple blood test.",
    disclaimer: HEALTH_PATTERN_DISCLAIMER,
    suggestedAction: HEALTH_PATTERN_ACTION,
    confidence,
    cyclesAnalyzed: analyzed,
    firstDetectedAt: new Date(),
  };
}

function detectPMDD(logs: DailyLog[], cycleHistory: CycleHistory[]): HealthPatternAlert | null {
  const completedCycles = cycleHistory.filter((ch) => ch.endDate && ch.cycleLength);
  if (!hasEnoughData("pmdd", completedCycles.length)) return null;

  const buckets = groupLogsByCycle(logs, cycleHistory);
  if (buckets.length < MIN_CYCLES_FOR_ALERT.pmdd) return null;

  const LOW_MOODS = new Set(["low", "anxious", "irritable", "very_low"]);
  const NEUTRAL_POSITIVE = new Set(["neutral", "good", "happy", "positive", "high", "calm"]);

  let cyclesWithPmddPattern = 0;

  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i]!;
    const nextBucket = buckets[i + 1];

    const logsWithDay = bucket.logs
      .map((log) => ({ ...log, cycleDay: getCycleDayForLog(log, bucket.startDate) }))
      .sort((a, b) => a.cycleDay - b.cycleDay);

    const prePeriodWindow = logsWithDay.filter((l) => l.cycleDay >= bucket.cycleLength - 7);
    const prePeriodLowMoodDays = prePeriodWindow.filter((l) => LOW_MOODS.has(l.mood ?? "")).length;
    if (prePeriodLowMoodDays < 5) continue;

    const sleepDisrupted = prePeriodWindow.some((l) => l.sleep !== null && l.sleep !== undefined && l.sleep < 6);

    let moodRecovered = false;
    if (nextBucket) {
      const earlyNextLogs = nextBucket.logs
        .filter((l) => getCycleDayForLog(l, nextBucket.startDate) <= 3)
        .map((l) => l.mood);
      moodRecovered = earlyNextLogs.some((m) => m !== null && NEUTRAL_POSITIVE.has(m));
    }

    if (prePeriodLowMoodDays >= 5 && (sleepDisrupted || moodRecovered)) cyclesWithPmddPattern++;
  }

  if (cyclesWithPmddPattern < 2) return null;

  return {
    patternKey: "pmdd_indicator",
    title: "Mood pattern before your period",
    description:
      `In your last ${cyclesWithPmddPattern} cycles, your mood dropped significantly ` +
      "in the week before your period and returned once it started. This pattern — " +
      "specifically the timing — is what distinguishes PMDD from regular PMS. " +
      "It's worth mentioning to a doctor because there are effective treatments.",
    disclaimer: HEALTH_PATTERN_DISCLAIMER,
    suggestedAction: HEALTH_PATTERN_ACTION,
    confidence: cyclesWithPmddPattern >= 3 ? "high" : "medium",
    cyclesAnalyzed: buckets.length,
    firstDetectedAt: new Date(),
  };
}

function detectEndometriosisIndicators(logs: DailyLog[], cycleHistory: CycleHistory[]): HealthPatternAlert | null {
  const completedCycles = cycleHistory.filter((ch) => ch.endDate && ch.cycleLength);
  if (!hasEnoughData("endometriosis", completedCycles.length)) return null;

  const buckets = groupLogsByCycle(logs, cycleHistory);
  if (buckets.length < MIN_CYCLES_FOR_ALERT.endometriosis) return null;

  let cyclesWithBothSignals = 0;

  for (const bucket of buckets) {
    const logsWithDay = bucket.logs
      .map((log) => ({ ...log, cycleDay: getCycleDayForLog(log, bucket.startDate) }))
      .sort((a, b) => a.cycleDay - b.cycleDay);

    let consecutiveSeverePain = 0, maxConsecutivePain = 0;
    for (const log of logsWithDay) {
      if (!log.pain) continue;
      if (log.pain === "severe" || log.pain === "very_severe") {
        consecutiveSeverePain++;
        maxConsecutivePain = Math.max(maxConsecutivePain, consecutiveSeverePain);
      } else {
        consecutiveSeverePain = 0;
      }
    }

    const heavyBleedingDays = logsWithDay.filter(
      (l) => l.padsChanged !== null && l.padsChanged !== undefined && l.padsChanged >= 7
    ).length;

    if (maxConsecutivePain >= 3 && heavyBleedingDays >= 2) cyclesWithBothSignals++;
  }

  if (cyclesWithBothSignals < 3) return null;

  return {
    patternKey: "endometriosis_indicator",
    title: "Pain and heavy bleeding pattern",
    description:
      "You've been logging severe pain and heavy bleeding consistently across " +
      "multiple cycles. While some discomfort is normal, this level of pain " +
      "and flow is worth discussing with a gynaecologist — conditions like " +
      "endometriosis are often dismissed but are very treatable.",
    disclaimer: HEALTH_PATTERN_DISCLAIMER,
    suggestedAction: HEALTH_PATTERN_ACTION,
    confidence: cyclesWithBothSignals >= 4 ? "high" : "medium",
    cyclesAnalyzed: buckets.length,
    firstDetectedAt: new Date(),
  };
}

function detectIronDeficiencyRisk(logs: DailyLog[], cycleHistory: CycleHistory[]): HealthPatternAlert | null {
  const completedCycles = cycleHistory.filter((ch) => ch.endDate && ch.cycleLength);
  if (!hasEnoughData("iron_deficiency", completedCycles.length)) return null;

  const buckets = groupLogsByCycle(logs, cycleHistory);
  if (buckets.length < MIN_CYCLES_FOR_ALERT.iron_deficiency) return null;

  let cyclesWithPattern = 0;

  for (const bucket of buckets) {
    const logsWithMeta = bucket.logs.map((log) => ({
      ...log,
      cycleDay: getCycleDayForLog(log, bucket.startDate),
      phase: getPhaseForLog(log, bucket.startDate, bucket.cycleLength),
    }));

    const heavyFlowDays = logsWithMeta.filter(
      (l) => l.padsChanged !== null && l.padsChanged !== undefined && l.padsChanged >= 7
    ).length;

    const menstrualAndFollicularLogs = logsWithMeta.filter(
      (l) => l.phase === "menstrual" || l.phase === "follicular"
    );
    const fatigueInWindow = menstrualAndFollicularLogs.filter(
      (l) => l.fatigue === "high" || l.fatigue === "very_high"
    ).length;
    const hasPersistentFatigue =
      menstrualAndFollicularLogs.length > 0 &&
      fatigueInWindow / menstrualAndFollicularLogs.length >= 0.4;

    const follicularLogs = logsWithMeta.filter((l) => l.phase === "follicular");
    const lowEnergyFollicular = follicularLogs.filter(
      (l) => l.energy === "low" || l.energy === "very_low"
    ).length;

    if (heavyFlowDays >= 3 && (hasPersistentFatigue || lowEnergyFollicular >= 5)) cyclesWithPattern++;
  }

  if (cyclesWithPattern < 2) return null;

  return {
    patternKey: "iron_deficiency_risk",
    title: "Heavy flow and persistent fatigue pattern",
    description:
      "Your logs show heavy flow and persistent fatigue that continues well " +
      "after your period ends. This pattern can sometimes signal iron " +
      "deficiency. A simple blood test can check your iron levels.",
    disclaimer: HEALTH_PATTERN_DISCLAIMER,
    suggestedAction: HEALTH_PATTERN_ACTION,
    confidence: cyclesWithPattern >= 3 ? "high" : "medium",
    cyclesAnalyzed: buckets.length,
    firstDetectedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runHealthPatternDetection(
  userId: string,
  allLogs: DailyLog[],
  cycleHistory: CycleHistory[],
  _currentCycleDay: number,
): Promise<HealthPatternResult> {
  const alerts: HealthPatternAlert[] = [];
  const watching: HealthPatternWatching[] = [];

  const completedCycles = cycleHistory.filter((ch) => ch.endDate && ch.cycleLength);
  const cyclesSoFar = completedCycles.length;

  // ── Full alert detectors ──────────────────────────────────────────────────
  const pcosAlert = detectPCOSIndicators(allLogs, cycleHistory);
  if (pcosAlert) alerts.push(pcosAlert);

  const pmddAlert = detectPMDD(allLogs, cycleHistory);
  if (pmddAlert) alerts.push(pmddAlert);

  const endoAlert = detectEndometriosisIndicators(allLogs, cycleHistory);
  if (endoAlert) alerts.push(endoAlert);

  const ironAlert = detectIronDeficiencyRisk(allLogs, cycleHistory);
  if (ironAlert) alerts.push(ironAlert);

  // ── Progressive watching states (only for patterns that haven't fired yet) ─
  const firedKeys = new Set(alerts.map((a) => a.patternKey));

  if (!firedKeys.has("pcos_indicator")) {
    const earlyPcos = detectEarlyPCOSSignals(allLogs, cycleHistory);
    const w = buildWatchingState(
      "pcos",
      "Hormonal balance",
      cyclesSoFar === 0
        ? "Log your first full cycle and we'll start checking for hormonal patterns."
        : `We're watching a few signals across your cycles. ${MIN_CYCLES_FOR_ALERT.pcos - cyclesSoFar} more cycle(s) will give us enough data to tell you more.`,
      earlyPcos,
      cyclesSoFar,
    );
    if (w) watching.push(w);
  }

  if (!firedKeys.has("pmdd_indicator")) {
    const earlyPmdd = detectEarlyPMDDSignals(allLogs, cycleHistory);
    const w = buildWatchingState(
      "pmdd",
      "Pre-period mood",
      cyclesSoFar === 0
        ? "We'll start tracking your pre-period mood pattern from your first completed cycle."
        : `We noticed some mood signals before your last period. We're watching this across your next cycle to see if it's a pattern.`,
      earlyPmdd,
      cyclesSoFar,
    );
    if (w) watching.push(w);
  }

  if (!firedKeys.has("endometriosis_indicator")) {
    const earlyEndo = detectEarlyEndoSignals(allLogs, cycleHistory);
    const w = buildWatchingState(
      "endometriosis",
      "Pain and flow",
      cyclesSoFar < MIN_CYCLES_FOR_ALERT.endometriosis
        ? `We've seen some pain and flow signals in your logs. We need ${MIN_CYCLES_FOR_ALERT.endometriosis - cyclesSoFar} more completed cycle(s) to confirm if this is a pattern.`
        : "We're monitoring your pain and flow signals closely.",
      earlyEndo,
      cyclesSoFar,
    );
    if (w) watching.push(w);
  }

  if (!firedKeys.has("iron_deficiency_risk")) {
    const earlyIron = detectEarlyIronSignals(allLogs, cycleHistory);
    const w = buildWatchingState(
      "iron_deficiency",
      "Energy and flow",
      cyclesSoFar < MIN_CYCLES_FOR_ALERT.iron_deficiency
        ? `We noticed some heavy flow and fatigue signals. ${MIN_CYCLES_FOR_ALERT.iron_deficiency - cyclesSoFar} more completed cycle(s) will help us confirm if this is worth flagging.`
        : "We're watching your flow and energy patterns across cycles.",
      earlyIron,
      cyclesSoFar,
    );
    if (w) watching.push(w);
  }

  return {
    hasAlerts: alerts.length > 0,
    alerts,
    watching,
    lastChecked: new Date(),
    message:
      alerts.length === 0 && watching.length === 0
        ? "Keep logging — we'll surface patterns as we learn more about your cycle."
        : undefined,
  };
}