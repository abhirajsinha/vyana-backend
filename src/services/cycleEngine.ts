export type Phase = "menstrual" | "follicular" | "ovulation" | "luteal";

export interface CycleInfo {
  currentDay: number;
  phase: Phase;
  phaseDay: number;
  daysUntilNextPhase: number;
}

export function calculateCycleInfo(lastPeriodStart: Date, cycleLength: number = 28): CycleInfo {
  const today = new Date();
  const diffMs = today.getTime() - new Date(lastPeriodStart).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const normalized = ((diffDays % cycleLength) + cycleLength) % cycleLength;
  const currentDay = normalized + 1;

  if (currentDay <= 5) {
    return {
      currentDay,
      phase: "menstrual",
      phaseDay: currentDay,
      daysUntilNextPhase: 5 - currentDay + 1,
    };
  }

  if (currentDay <= 13) {
    return {
      currentDay,
      phase: "follicular",
      phaseDay: currentDay - 5,
      daysUntilNextPhase: 13 - currentDay + 1,
    };
  }

  if (currentDay <= 16) {
    return {
      currentDay,
      phase: "ovulation",
      phaseDay: currentDay - 13,
      daysUntilNextPhase: 16 - currentDay + 1,
    };
  }

  return {
    currentDay,
    phase: "luteal",
    phaseDay: currentDay - 16,
    daysUntilNextPhase: cycleLength - currentDay + 1,
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
    menstrual: ["pain", "energy", "mood"],
    follicular: ["energy", "motivation", "focus"],
    ovulation: ["mood", "energy", "social"],
    luteal: ["mood", "cravings", "fatigue"],
  };
  return fields[phase];
}
