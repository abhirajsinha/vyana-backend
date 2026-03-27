import type { Phase } from "../services/cycleEngine";
import { calculatePhaseFromCycleLength } from "../services/cycleEngine";

export interface HomeScreenDay {
  day: number;
  phase: Phase;
  top: string;
  fertility: string;
  feeling: string;
  cta: string;
}

// Phase position ratio: 0.0 = start of phase, 1.0 = end of phase.
// This is what makes content adapt to any cycle length.
function getPhaseRatio(phase: Phase, cycleDay: number, cycleLength: number): number {
  const lutealStart = Math.max(10, cycleLength - 13);
  const ovStart = Math.max(6, lutealStart - 3);
  let r = 0;
  switch (phase) {
    case "menstrual":  r = (cycleDay - 1) / 4; break;
    case "follicular": r = (cycleDay - 6) / Math.max(1, ovStart - 6); break;
    case "ovulation":  r = (cycleDay - ovStart) / Math.max(1, lutealStart - ovStart); break;
    case "luteal":     r = (cycleDay - lutealStart) / Math.max(1, cycleLength - lutealStart); break;
  }
  return Math.max(0, Math.min(1, r));
}

export function generateHomeDayContent(
  cycleDay: number,
  cycleLength: number,
  phase: Phase,
): HomeScreenDay {
  const r = getPhaseRatio(phase, cycleDay, cycleLength);
  const daysLeft = cycleLength - cycleDay + 1;

  switch (phase) {
    case "menstrual": {
      if (cycleDay <= 2) return { day: cycleDay, phase, top: "On your period",    fertility: "Pregnancy unlikely today",        feeling: "You might feel low energy today",      cta: "Take it easy today" };
      if (r < 0.6)    return { day: cycleDay, phase, top: "On your period",    fertility: "Low chance of pregnancy",           feeling: "You may feel slightly better today",   cta: "Ease back gently" };
      return               { day: cycleDay, phase, top: "Period ending soon", fertility: "Low chance of pregnancy",           feeling: "You might feel more stable today",     cta: "Start fresh slowly" };
    }

    case "follicular": {
      if (r < 0.25) return { day: cycleDay, phase, top: "Fresh start ✦",        fertility: "Low chance of pregnancy",           feeling: "You might feel more active today",     cta: "Start fresh today" };
      if (r < 0.5)  return { day: cycleDay, phase, top: "Energy rising",         fertility: "Low chance of pregnancy",           feeling: "You might feel motivated today",       cta: "Take initiative" };
      if (r < 0.75) return { day: cycleDay, phase, top: "Momentum building",     fertility: "Chance of pregnancy is increasing", feeling: "You may feel confident today",         cta: "Explore ideas" };
      return               { day: cycleDay, phase, top: "Near ovulation",         fertility: "High chance of pregnancy today",    feeling: "You might feel your best today",       cta: "Go all in" };
    }

    case "ovulation": {
      if (r < 0.4) return { day: cycleDay, phase, top: "Ovulation day",       fertility: "High chance of pregnancy today",    feeling: "You might feel confident today",       cta: "Make the most of today" };
      return              { day: cycleDay, phase, top: "Ovulation completed", fertility: "Fertility decreasing",              feeling: "You might feel balanced today",        cta: "Maintain momentum" };
    }

    case "luteal": {
      if (r < 0.3)            return { day: cycleDay, phase, top: "Transition phase", fertility: "Low chance of pregnancy",    feeling: "You may feel steady today",           cta: "Stay focused" };
      if (r < 0.55)           return { day: cycleDay, phase, top: "Slowing down",     fertility: "Low chance of pregnancy",    feeling: "You might feel more calm today",      cta: "Check in with yourself" };
      if (daysLeft <= 2)      return { day: cycleDay, phase, top: "Cycle reset",      fertility: "Pregnancy unlikely today",   feeling: "You might feel ready to rest",        cta: "Wind down" };
      if (daysLeft <= 5)      return { day: cycleDay, phase, top: "Pre-period",       fertility: "Pregnancy unlikely today",   feeling: "You may feel more sensitive today",   cta: "Be gentle with yourself" };
      if (r < 0.75)           return { day: cycleDay, phase, top: "Reflective phase", fertility: "Low chance of pregnancy",    feeling: "You might feel introspective",        cta: "Prioritise yourself" };
      return                         { day: cycleDay, phase, top: "Deep rest phase",  fertility: "Low chance of pregnancy",    feeling: "You may feel drained today",          cta: "Pause & breathe" };
    }
  }
}

// Legacy export — same shape as the old hardcoded `homeScreen.cycle` array.
// Generates dynamically for whatever cycle length is passed.
// Any code that did `homeScreen.cycle[day - 1]` can now do
// `generateHomeScreenCycle(cycleLength)[day - 1]` instead.
export function generateHomeScreenCycle(cycleLength: number = 28): HomeScreenDay[] {
  return Array.from({ length: cycleLength }, (_, i) => {
    const cycleDay = i + 1;
    const phase = calculatePhaseFromCycleLength(cycleDay, cycleLength) as Phase;
    return generateHomeDayContent(cycleDay, cycleLength, phase);
  });
}

// Drop-in for any code that still imports the old `homeScreen` default export.
const homeScreen = {
  get cycle() {
    return generateHomeScreenCycle(28);
  },
};

export default homeScreen;