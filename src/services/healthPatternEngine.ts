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

export interface HealthPatternResult {
  hasAlerts: boolean;
  alerts: HealthPatternAlert[];
  lastChecked: Date;
}

// ---------------------------------------------------------------------------
// Constants — hardcoded safety rules
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

/**
 * Groups logs into cycle buckets using CycleHistory records.
 * Only includes completed cycles (those with both startDate and endDate).
 */
function groupLogsByCycle(
  logs: DailyLog[],
  cycleHistory: CycleHistory[],
): CycleBucket[] {
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
    return {
      startDate: ch.startDate,
      endDate: ch.endDate!,
      cycleLength: ch.cycleLength!,
      logs: cycleLogs,
    };
  });
}

function getPhaseForLog(
  log: DailyLog,
  cycleStartDate: Date,
  cycleLength: number,
): Phase {
  return calculateCycleInfoForDate(
    cycleStartDate,
    new Date(log.date),
    cycleLength,
    "natural",
  ).phase;
}

function getCycleDayForLog(
  log: DailyLog,
  cycleStartDate: Date,
): number {
  const diffMs = new Date(log.date).getTime() - cycleStartDate.getTime();
  return Math.max(1, Math.floor(diffMs / 86400000) + 1);
}

// ---------------------------------------------------------------------------
// Detector: PCOS indicators
// ---------------------------------------------------------------------------

function detectPCOSIndicators(
  logs: DailyLog[],
  cycleHistory: CycleHistory[],
): HealthPatternAlert | null {
  const completedCycles = cycleHistory.filter((ch) => ch.endDate && ch.cycleLength);
  if (!hasEnoughData("pcos", completedCycles.length)) return null;

  const buckets = groupLogsByCycle(logs, cycleHistory);
  if (buckets.length < MIN_CYCLES_FOR_ALERT.pcos) return null;

  let signals = 0;
  const analyzed = buckets.length;

  // Signal 1: Cycle length > 35 days OR varies by > 7 days
  const lengths = completedCycles.map((ch) => ch.cycleLength!);
  const hasLongCycles = lengths.some((l) => l > 35);
  const hasHighVariation =
    lengths.length >= 2 &&
    Math.max(...lengths) - Math.min(...lengths) > 7;
  if (hasLongCycles || hasHighVariation) signals++;

  // Signal 2: High stress consistently across all phases (not just luteal)
  const phasesWithHighStress = new Set<Phase>();
  for (const bucket of buckets) {
    for (const log of bucket.logs) {
      if (log.stress === "high" || log.stress === "very_high") {
        const phase = getPhaseForLog(log, bucket.startDate, bucket.cycleLength);
        phasesWithHighStress.add(phase);
      }
    }
  }
  if (phasesWithHighStress.size >= 3) signals++;

  // Signal 3: Fatigue logged frequently outside menstrual phase
  let fatigueOutsideMenstrual = 0;
  let totalOutsideMenstrual = 0;
  for (const bucket of buckets) {
    for (const log of bucket.logs) {
      const phase = getPhaseForLog(log, bucket.startDate, bucket.cycleLength);
      if (phase !== "menstrual") {
        totalOutsideMenstrual++;
        if (log.fatigue === "high" || log.fatigue === "very_high") {
          fatigueOutsideMenstrual++;
        }
      }
    }
  }
  if (totalOutsideMenstrual > 0 && fatigueOutsideMenstrual / totalOutsideMenstrual >= 0.4) {
    signals++;
  }

  // Signal 4: Cravings logged frequently
  let cravingsCount = 0;
  let totalLogs = 0;
  for (const bucket of buckets) {
    for (const log of bucket.logs) {
      totalLogs++;
      if (log.cravings && log.cravings !== "none" && log.cravings !== "low") {
        cravingsCount++;
      }
    }
  }
  if (totalLogs > 0 && cravingsCount / totalLogs >= 0.4) signals++;

  // Signal 5: Mood low or anxious across multiple phases
  const phasesWithLowMood = new Set<Phase>();
  for (const bucket of buckets) {
    for (const log of bucket.logs) {
      if (log.mood === "low" || log.mood === "anxious" || log.mood === "irritable") {
        const phase = getPhaseForLog(log, bucket.startDate, bucket.cycleLength);
        phasesWithLowMood.add(phase);
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

// ---------------------------------------------------------------------------
// Detector: PMDD
// ---------------------------------------------------------------------------

function detectPMDD(
  logs: DailyLog[],
  cycleHistory: CycleHistory[],
): HealthPatternAlert | null {
  const completedCycles = cycleHistory.filter((ch) => ch.endDate && ch.cycleLength);
  if (!hasEnoughData("pmdd", completedCycles.length)) return null;

  const buckets = groupLogsByCycle(logs, cycleHistory);
  if (buckets.length < MIN_CYCLES_FOR_ALERT.pmdd) return null;

  const LOW_MOODS = new Set(["low", "anxious", "irritable", "very_low"]);
  const NEUTRAL_POSITIVE = new Set(["neutral", "good", "happy", "positive", "high", "calm"]);

  let cyclesWithPmddPattern = 0;

  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    const nextBucket = buckets[i + 1];

    // Need consecutive cycle data to check mood recovery after period starts
    const logsWithDay = bucket.logs
      .map((log) => ({
        ...log,
        cycleDay: getCycleDayForLog(log, bucket.startDate),
      }))
      .sort((a, b) => a.cycleDay - b.cycleDay);

    // Count consecutive days of low mood in the 7+ days before period
    const prePeriodWindow = logsWithDay.filter(
      (l) => l.cycleDay >= bucket.cycleLength - 7,
    );
    const prePeriodLowMoodDays = prePeriodWindow.filter((l) =>
      LOW_MOODS.has(l.mood ?? ""),
    ).length;

    if (prePeriodLowMoodDays < 5) continue;

    // Check sleep disruption in the same window
    const sleepDisrupted = prePeriodWindow.some(
      (l) => l.sleep !== null && l.sleep !== undefined && l.sleep < 6,
    );

    // Check mood recovery within 2 days of next period start
    let moodRecovered = false;
    if (nextBucket) {
      const earlyNextLogs = nextBucket.logs
        .filter((l) => getCycleDayForLog(l, nextBucket.startDate) <= 3)
        .map((l) => l.mood);
      moodRecovered = earlyNextLogs.some((m) => m !== null && NEUTRAL_POSITIVE.has(m));
    }

    if (prePeriodLowMoodDays >= 5 && (sleepDisrupted || moodRecovered)) {
      cyclesWithPmddPattern++;
    }
  }

  if (cyclesWithPmddPattern < 2) return null;

  const confidence: HealthPatternAlert["confidence"] =
    cyclesWithPmddPattern >= 3 ? "high" : "medium";

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
    confidence,
    cyclesAnalyzed: buckets.length,
    firstDetectedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Detector: Endometriosis / Fibroids indicators
// ---------------------------------------------------------------------------

function detectEndometriosisIndicators(
  logs: DailyLog[],
  cycleHistory: CycleHistory[],
): HealthPatternAlert | null {
  const completedCycles = cycleHistory.filter((ch) => ch.endDate && ch.cycleLength);
  if (!hasEnoughData("endometriosis", completedCycles.length)) return null;

  const buckets = groupLogsByCycle(logs, cycleHistory);
  if (buckets.length < MIN_CYCLES_FOR_ALERT.endometriosis) return null;

  let cyclesWithBothSignals = 0;

  for (const bucket of buckets) {
    const logsWithDay = bucket.logs
      .map((log) => ({
        ...log,
        cycleDay: getCycleDayForLog(log, bucket.startDate),
      }))
      .sort((a, b) => a.cycleDay - b.cycleDay);

    // Signal 1: Severe pain on 3+ consecutive days (skip logs without pain data)
    let consecutiveSeverePain = 0;
    let maxConsecutivePain = 0;
    for (const log of logsWithDay) {
      if (!log.pain) continue;
      if (log.pain === "severe" || log.pain === "very_severe") {
        consecutiveSeverePain++;
        maxConsecutivePain = Math.max(maxConsecutivePain, consecutiveSeverePain);
      } else {
        consecutiveSeverePain = 0;
      }
    }
    const hasSeverePain = maxConsecutivePain >= 3;

    // Signal 2: Heavy bleeding (padsChanged >= 7) on multiple days
    const heavyBleedingDays = logsWithDay.filter(
      (l) => l.padsChanged !== null && l.padsChanged !== undefined && l.padsChanged >= 7,
    ).length;
    const hasHeavyBleeding = heavyBleedingDays >= 2;

    if (hasSeverePain && hasHeavyBleeding) {
      cyclesWithBothSignals++;
    }
  }

  if (cyclesWithBothSignals < 3) return null;

  const confidence: HealthPatternAlert["confidence"] =
    cyclesWithBothSignals >= 4 ? "high" : "medium";

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
    confidence,
    cyclesAnalyzed: buckets.length,
    firstDetectedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Detector: Iron deficiency / Anemia risk
// ---------------------------------------------------------------------------

function detectIronDeficiencyRisk(
  logs: DailyLog[],
  cycleHistory: CycleHistory[],
): HealthPatternAlert | null {
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

    // Signal 1: padsChanged >= 7 on 3+ days
    const heavyFlowDays = logsWithMeta.filter(
      (l) => l.padsChanged !== null && l.padsChanged !== undefined && l.padsChanged >= 7,
    ).length;
    const hasHeavyFlow = heavyFlowDays >= 3;

    // Signal 2: Fatigue high during and after menstrual phase
    const menstrualAndFollicularLogs = logsWithMeta.filter(
      (l) => l.phase === "menstrual" || l.phase === "follicular",
    );
    const fatigueInWindow = menstrualAndFollicularLogs.filter(
      (l) => l.fatigue === "high" || l.fatigue === "very_high",
    ).length;
    const hasPersistentFatigue =
      menstrualAndFollicularLogs.length > 0 &&
      fatigueInWindow / menstrualAndFollicularLogs.length >= 0.4;

    // Signal 3: Low energy for 7+ days post-period (follicular days where energy should recover)
    const follicularLogs = logsWithMeta.filter((l) => l.phase === "follicular");
    const lowEnergyFollicular = follicularLogs.filter(
      (l) => l.energy === "low" || l.energy === "very_low",
    ).length;
    const hasSlowRecovery = lowEnergyFollicular >= 5;

    if (hasHeavyFlow && (hasPersistentFatigue || hasSlowRecovery)) {
      cyclesWithPattern++;
    }
  }

  if (cyclesWithPattern < 2) return null;

  const confidence: HealthPatternAlert["confidence"] =
    cyclesWithPattern >= 3 ? "high" : "medium";

  return {
    patternKey: "iron_deficiency_risk",
    title: "Heavy flow and persistent fatigue pattern",
    description:
      "Your logs show heavy flow and persistent fatigue that continues well " +
      "after your period ends. This pattern can sometimes signal iron " +
      "deficiency. A simple blood test can check your iron levels.",
    disclaimer: HEALTH_PATTERN_DISCLAIMER,
    suggestedAction: HEALTH_PATTERN_ACTION,
    confidence,
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

  const pcosAlert = detectPCOSIndicators(allLogs, cycleHistory);
  if (pcosAlert) alerts.push(pcosAlert);

  const pmddAlert = detectPMDD(allLogs, cycleHistory);
  if (pmddAlert) alerts.push(pmddAlert);

  const endoAlert = detectEndometriosisIndicators(allLogs, cycleHistory);
  if (endoAlert) alerts.push(endoAlert);

  const ironAlert = detectIronDeficiencyRisk(allLogs, cycleHistory);
  if (ironAlert) alerts.push(ironAlert);

  return {
    hasAlerts: alerts.length > 0,
    alerts,
    lastChecked: new Date(),
  };
}
