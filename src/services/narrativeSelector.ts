export type PrimaryNarrative =
  | 'severe_symptom'
  | 'conflict'
  | 'signal_change'
  | 'pattern_shift'
  | 'escalation'
  | 'phase';

export interface NarrativeSelectorInput {
  cycleDay: number;
  phase: string;
  latestLog: {
    mood?: number;
    energy?: number;
    sleep?: number;
    stress?: number;
    cramps?: number;
    bleeding?: string;
    headache?: boolean;
    breastTenderness?: boolean;
  } | null;
  previousDayLog: {
    mood?: number;
    energy?: number;
    cramps?: number;
    sleep?: number;
  } | null;
  personalBaseline: {
    avgCrampsSameDay?: number;
    avgEnergySameDay?: number;
    avgMoodSameDay?: number;
  } | null;
  logsCount: number;
  bleedingDays?: number;
  cycleLength?: number;
}

export interface NarrativeSelectorOutput {
  primaryNarrative: PrimaryNarrative;
  conflictDetected: boolean;
  conflictDescription: string | null;
  trend: {
    cramps?: 'improving' | 'worsening' | 'stable';
    energy?: 'improving' | 'worsening' | 'stable';
    mood?: 'improving' | 'worsening' | 'stable';
    sleep?: 'improving' | 'worsening' | 'stable';
  };
}

function computeTrend(
  today: number | undefined,
  yesterday: number | undefined,
  higherIsBetter: boolean
): 'improving' | 'worsening' | 'stable' | undefined {
  if (today === undefined || yesterday === undefined) return undefined;
  const diff = today - yesterday;
  if (Math.abs(diff) <= 1) return 'stable';
  if (higherIsBetter) {
    return diff > 0 ? 'improving' : 'worsening';
  }
  return diff > 0 ? 'worsening' : 'improving';
}

function detectConflict(
  log: NonNullable<NarrativeSelectorInput['latestLog']>,
  phase: string,
  cycleDay: number,
  cycleLength: number
): string | null {
  if (log.energy !== undefined && log.energy <= 2 && phase === 'follicular' && cycleDay >= 6) {
    return 'Low energy during follicular \u2014 expected to rise';
  }
  if (log.mood !== undefined && log.mood >= 4 && phase === 'luteal' && cycleDay >= (cycleLength - 4)) {
    return 'High mood during late luteal \u2014 mood usually dips';
  }
  if (log.energy !== undefined && log.energy >= 4 && phase === 'menstrual' && cycleDay <= 3) {
    return 'High energy during menstruation \u2014 fatigue expected';
  }
  if (log.sleep !== undefined && log.sleep <= 2 && phase === 'luteal' && cycleDay <= (cycleLength - 8)) {
    return 'Poor sleep in early luteal \u2014 progesterone should aid sleep';
  }
  if (log.cramps !== undefined && log.cramps >= 5 && phase === 'follicular' && cycleDay >= 8) {
    return 'Cramps during mid-follicular \u2014 not prostaglandin-driven';
  }
  if (log.stress !== undefined && log.stress >= 4 && phase === 'follicular') {
    return 'High stress during follicular \u2014 may suppress expected energy rise';
  }
  if (log.mood !== undefined && log.mood <= 2 && phase === 'ovulation') {
    return 'Low mood at ovulation \u2014 estrogen peak usually lifts mood';
  }
  if (log.energy !== undefined && log.energy >= 4 && phase === 'luteal' && cycleDay >= (cycleLength - 4)) {
    return 'High energy during late luteal \u2014 energy usually drops with hormone withdrawal';
  }
  return null;
}

export function selectNarrative(input: NarrativeSelectorInput): NarrativeSelectorOutput {
  const { latestLog, previousDayLog, personalBaseline, phase, cycleDay, logsCount, bleedingDays } = input;

  const trend: NarrativeSelectorOutput['trend'] = {};

  if (latestLog && previousDayLog) {
    const crampsTrend = computeTrend(latestLog.cramps, previousDayLog.cramps, false);
    if (crampsTrend) trend.cramps = crampsTrend;

    const energyTrend = computeTrend(latestLog.energy, previousDayLog.energy, true);
    if (energyTrend) trend.energy = energyTrend;

    const moodTrend = computeTrend(latestLog.mood, previousDayLog.mood, true);
    if (moodTrend) trend.mood = moodTrend;

    const sleepTrend = computeTrend(latestLog.sleep, previousDayLog.sleep, true);
    if (sleepTrend) trend.sleep = sleepTrend;
  }

  const defaultOutput: NarrativeSelectorOutput = {
    primaryNarrative: 'phase',
    conflictDetected: false,
    conflictDescription: null,
    trend,
  };

  if (!latestLog) return defaultOutput;

  // 1. SEVERE SYMPTOM
  if (latestLog.cramps !== undefined && latestLog.cramps >= 7) {
    return { primaryNarrative: 'severe_symptom', conflictDetected: false, conflictDescription: null, trend };
  }

  // 2. ESCALATION
  if (bleedingDays !== undefined && bleedingDays > 7) {
    return { primaryNarrative: 'escalation', conflictDetected: false, conflictDescription: null, trend };
  }

  // 3. CONFLICT
  const safeCycleLength = input.cycleLength ?? 28;
  const conflictDescription = detectConflict(latestLog, phase, cycleDay, safeCycleLength);
  if (conflictDescription) {
    return { primaryNarrative: 'conflict', conflictDetected: true, conflictDescription, trend };
  }

  // 4. SIGNAL CHANGE
  if (previousDayLog) {
    if (
      latestLog.cramps !== undefined &&
      previousDayLog.cramps !== undefined &&
      Math.abs(latestLog.cramps - previousDayLog.cramps) >= 3
    ) {
      return { ...defaultOutput, primaryNarrative: 'signal_change' };
    }
    if (
      latestLog.energy !== undefined &&
      previousDayLog.energy !== undefined &&
      Math.abs(latestLog.energy - previousDayLog.energy) >= 2
    ) {
      return { ...defaultOutput, primaryNarrative: 'signal_change' };
    }
    if (
      latestLog.mood !== undefined &&
      previousDayLog.mood !== undefined &&
      Math.abs(latestLog.mood - previousDayLog.mood) >= 2
    ) {
      return { ...defaultOutput, primaryNarrative: 'signal_change' };
    }
  }

  // 5. PATTERN SHIFT
  if (personalBaseline && logsCount >= 14) {
    if (
      latestLog.cramps !== undefined &&
      personalBaseline.avgCrampsSameDay !== undefined &&
      Math.abs(latestLog.cramps - personalBaseline.avgCrampsSameDay) > 3
    ) {
      return { ...defaultOutput, primaryNarrative: 'pattern_shift' };
    }
    if (
      latestLog.energy !== undefined &&
      personalBaseline.avgEnergySameDay !== undefined &&
      Math.abs(latestLog.energy - personalBaseline.avgEnergySameDay) > 1.5
    ) {
      return { ...defaultOutput, primaryNarrative: 'pattern_shift' };
    }
  }

  // 6. DEFAULT
  return defaultOutput;
}
