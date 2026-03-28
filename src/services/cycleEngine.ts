import type { User } from "@prisma/client";
import { isSuppressingNaturalCycle } from "./contraceptionengine";

export type Phase = "menstrual" | "follicular" | "ovulation" | "luteal";
export type CycleMode = "natural" | "hormonal" | "irregular";
export type CyclePredictionConfidence = "reliable" | "variable" | "irregular" | "unknown";

export interface CycleInfo {
  currentDay: number;
  phase: Phase;
  phaseDay: number;
  daysUntilNextPhase: number;
  daysUntilNextPeriod: number;
  cycleLength: number;
  cycleMode: CycleMode;
  isCyclePredictionReliable: boolean;
  nextPeriodDate: Date;
  nextPeriodConfidenceRange?: {
    earliest: Date;
    latest: Date;
  };
}

export function calculateCycleInfo(
  lastPeriodStart: Date,
  cycleLength: number = 28,
  cycleMode: CycleMode = "natural",
): CycleInfo {
  return calculateCycleInfoForDate(lastPeriodStart, new Date(), cycleLength, cycleMode);
}

export function toUTCDateOnly(d: Date | number): number {
  const dt = new Date(d);
  return Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
}

export function utcDayDiff(a: Date | number, b: Date | number): number {
  return Math.round((toUTCDateOnly(a) - toUTCDateOnly(b)) / 86400000);
}

export function calculateCycleInfoForDate(
  lastPeriodStart: Date,
  targetDate: Date,
  cycleLength: number = 28,
  cycleMode: CycleMode = "natural",
): CycleInfo {
  const diffMs = toUTCDateOnly(targetDate) - toUTCDateOnly(lastPeriodStart);
  const diffDays = Math.round(diffMs / 86400000);
  const normalized = ((diffDays % cycleLength) + cycleLength) % cycleLength;
  const currentDay = normalized + 1;
  const phase = calculatePhaseFromCycleLength(currentDay, cycleLength, cycleMode);
  const daysUntilNextPhase = getDaysUntilNextPhase(currentDay, phase, cycleLength, cycleMode);
  const daysUntilNextPeriod = cycleLength - currentDay + 1;
  const nextPeriodDate = new Date(targetDate);
  nextPeriodDate.setDate(nextPeriodDate.getDate() + daysUntilNextPeriod);
  const phaseStart = getPhaseStartDay(phase, cycleLength, cycleMode);

  return {
    currentDay,
    phase,
    phaseDay: Math.max(1, currentDay - phaseStart + 1),
    daysUntilNextPhase,
    daysUntilNextPeriod,
    cycleLength,
    cycleMode,
    isCyclePredictionReliable: cycleMode === "natural",
    nextPeriodDate,
  };
}

export function calculatePhaseFromCycleLength(
  cycleDay: number,
  cycleLength: number,
  cycleMode: CycleMode = "natural",
): Phase {
  if (cycleMode === "hormonal") {
    return cycleDay <= 5 ? "menstrual" : "follicular";
  }
  if (cycleDay <= 5) return "menstrual";

  const lutealStart = Math.max(10, cycleLength - 13);
  const ovulationStart = Math.max(6, lutealStart - 3);
  const ovulationEnd = Math.max(ovulationStart, lutealStart - 1);

  if (cycleDay >= lutealStart) return "luteal";
  if (cycleDay >= ovulationStart && cycleDay <= ovulationEnd) return "ovulation";
  return "follicular";
}

export function getDaysUntilNextPhase(
  currentDay: number,
  currentPhase: Phase,
  cycleLength: number,
  cycleMode: CycleMode = "natural",
): number {
  if (cycleMode === "hormonal") {
    return currentPhase === "menstrual"
      ? Math.max(0, 6 - currentDay)
      : Math.max(0, cycleLength - currentDay + 1);
  }

  const lutealStart = Math.max(10, cycleLength - 13);
  const ovulationStart = Math.max(6, lutealStart - 3);

  switch (currentPhase) {
    case "menstrual":
      return Math.max(0, 6 - currentDay);
    case "follicular":
      return Math.max(0, ovulationStart - currentDay);
    case "ovulation":
      return Math.max(0, lutealStart - currentDay);
    case "luteal":
      return Math.max(0, cycleLength - currentDay + 1);
  }
}

function getPhaseStartDay(
  phase: Phase,
  cycleLength: number,
  cycleMode: CycleMode = "natural",
): number {
  if (cycleMode === "hormonal") {
    return phase === "menstrual" ? 1 : 6;
  }
  const lutealStart = Math.max(10, cycleLength - 13);
  const ovulationStart = Math.max(6, lutealStart - 3);

  if (phase === "menstrual") return 1;
  if (phase === "follicular") return 6;
  if (phase === "ovulation") return ovulationStart;
  return lutealStart;
}

export function getCycleMode(user: Pick<User, "contraceptiveMethod" | "cycleRegularity">): CycleMode {
  if (user.contraceptiveMethod && isSuppressingNaturalCycle(user.contraceptiveMethod)) {
    return "hormonal";
  }
  if (user.cycleRegularity === "irregular") {
    return "irregular";
  }
  return "natural";
}

export function detectCycleIrregularity(cycleLengths: number[]): {
  isIrregular: boolean;
  variability: number;
  avgLength: number;
  confidence: CyclePredictionConfidence;
  stdDev: number;
} {
  if (cycleLengths.length < 2) {
    return {
      isIrregular: false,
      variability: 0,
      avgLength: cycleLengths[0] || 28,
      confidence: "unknown",
      stdDev: 0,
    };
  }
  const avg = cycleLengths.reduce((a, b) => a + b, 0) / cycleLengths.length;
  const maxDiff = Math.max(...cycleLengths) - Math.min(...cycleLengths);
  const variance =
    cycleLengths.reduce((acc, l) => acc + Math.pow(l - avg, 2), 0) /
    cycleLengths.length;
  const stdDev = Math.sqrt(variance);
  const isIrregular = maxDiff > 7 || stdDev > 3.5;
  const confidence: CyclePredictionConfidence =
    maxDiff > 14 ? "irregular" : maxDiff > 7 ? "variable" : "reliable";
  return {
    isIrregular,
    variability: maxDiff,
    avgLength: Math.round(avg),
    confidence,
    stdDev,
  };
}

export function getPhaseInsight(phase: Phase): string {
  const insights: Record<Phase, string> = {
    menstrual: "Your body is in rest mode. Focus on gentle movement and iron-rich foods.",
    follicular: "Energy is rising. Great time to start new projects and be social.",
    ovulation: "You're at peak energy and communication. A great day to connect with others.",
    luteal: "Slow down and be kind to yourself. Cravings and fatigue are normal.",
  };
  return insights[phase];
}

export function getPhaseLogFields(phase: Phase): string[] {
  const fields: Record<Phase, string[]> = {
    menstrual: ["padsChanged", "pain", "energy", "mood"],
    follicular: ["energy", "motivation", "focus"],
    ovulation: ["mood", "energy", "social"],
    luteal: ["mood", "cravings", "fatigue"],
  };
  return fields[phase];
}
