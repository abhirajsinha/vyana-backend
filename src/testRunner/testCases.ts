function localMidnight(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function daysAgo(n: number): Date {
  const d = localMidnight();
  d.setDate(d.getDate() - n);
  return d;
}

function periodStart(cycleDay: number): Date {
  const d = localMidnight();
  d.setDate(d.getDate() - (cycleDay - 1));
  return d;
}

export const testCases = [

  // T1 — Late luteal, sleep declining from 7→5, stress rising, mood dropping
  {
    id: "T1_luteal_low_energy",
    description: "Late luteal, low sleep, high stress, mood dropping",
    user: {
      name: "Luteal User",
      age: 27, height: 165, weight: 58,
      cycleLength: 28,
      lastPeriodStart: periodStart(27),
      cycleRegularity: "regular",
      cycleMode: "natural",
    },
    logs: [
      { date: daysAgo(0), mood: "very_low", energy: "low", sleep: 5.0, stress: "very_high" },
      { date: daysAgo(1), mood: "low", energy: "low", sleep: 5.2, stress: "high" },
      { date: daysAgo(2), mood: "low", energy: "low", sleep: 5.5, stress: "high" },
      { date: daysAgo(3), mood: "low", energy: "moderate", sleep: 6.0, stress: "moderate" },
      { date: daysAgo(4), mood: "neutral", energy: "moderate", sleep: 6.2, stress: "moderate" },
      { date: daysAgo(5), mood: "neutral", energy: "moderate", sleep: 6.5, stress: "low" },
      { date: daysAgo(6), mood: "neutral", energy: "high", sleep: 7.0, stress: "low" },
    ],
  },

  // T2 — Period day 1, heavy bleeding (8 pads), low energy
  {
    id: "T2_menstrual_heavy",
    description: "Day 1 heavy bleeding, low energy",
    user: {
      name: "Menstrual User",
      age: 29, height: 165, weight: 60,
      cycleLength: 28,
      lastPeriodStart: periodStart(1),
      cycleRegularity: "regular",
      cycleMode: "natural",
    },
    logs: [
      { date: daysAgo(0), mood: "low", energy: "low", sleep: 5.5, stress: "moderate", padsChanged: 8 },
      { date: daysAgo(1), mood: "low", energy: "low", sleep: 5.8, stress: "moderate" },
      { date: daysAgo(2), mood: "neutral", energy: "moderate", sleep: 6.0, stress: "low" },
      { date: daysAgo(3), mood: "neutral", energy: "moderate", sleep: 6.2, stress: "low" },
    ],
  },

  // T3 — Early luteal / post-ovulation: day 15, high mood, low stress, good sleep, 5+ logs
  {
    id: "T3_ovulation_peak",
    description: "Early luteal / post-ovulation — high energy, high mood, stable state",
    user: {
      name: "Ovulation User",
      age: 28, height: 168, weight: 62,
      cycleLength: 28,
      lastPeriodStart: periodStart(14),
      cycleRegularity: "regular",
      cycleMode: "natural",
    },
    logs: [
      { date: daysAgo(0), mood: "good", energy: "high", sleep: 7.5, stress: "low" },
      { date: daysAgo(1), mood: "good", energy: "high", sleep: 7.0, stress: "low" },
      { date: daysAgo(2), mood: "good", energy: "high", sleep: 7.2, stress: "low" },
      { date: daysAgo(3), mood: "good", energy: "moderate", sleep: 7.0, stress: "moderate" },
      { date: daysAgo(4), mood: "neutral", energy: "moderate", sleep: 7.3, stress: "low" },
    ],
  },

  // T4 — Sleep disruption: follicular day 9, sleep crashed from 7→4, with baseline data
  {
    id: "T4_sleep_disruption",
    description: "Sleep dropped sharply, not cycle-related",
    user: {
      name: "Sleep Issue User",
      age: 29, height: 165, weight: 60,
      cycleLength: 28,
      lastPeriodStart: periodStart(9),
      cycleRegularity: "regular",
      cycleMode: "natural",
    },
    logs: [
      // Recent 7 days: clear sleep decline
      { date: daysAgo(0), mood: "low", energy: "low", sleep: 4.0, stress: "moderate" },
      { date: daysAgo(1), mood: "low", energy: "low", sleep: 4.5, stress: "moderate" },
      { date: daysAgo(2), mood: "neutral", energy: "low", sleep: 5.0, stress: "low" },
      { date: daysAgo(3), mood: "neutral", energy: "moderate", sleep: 5.5, stress: "low" },
      { date: daysAgo(4), mood: "neutral", energy: "moderate", sleep: 6.0, stress: "low" },
      { date: daysAgo(5), mood: "good", energy: "moderate", sleep: 6.5, stress: "low" },
      { date: daysAgo(6), mood: "good", energy: "high", sleep: 7.0, stress: "low" },
      // Baseline days (7+): normal sleep
      { date: daysAgo(7), mood: "good", energy: "moderate", sleep: 7.0, stress: "low" },
      { date: daysAgo(8), mood: "good", energy: "moderate", sleep: 7.0, stress: "low" },
      { date: daysAgo(9), mood: "good", energy: "moderate", sleep: 7.2, stress: "low" },
      { date: daysAgo(10), mood: "good", energy: "moderate", sleep: 6.9, stress: "low" },
      { date: daysAgo(11), mood: "good", energy: "moderate", sleep: 7.1, stress: "low" },
      { date: daysAgo(12), mood: "good", energy: "moderate", sleep: 7.0, stress: "low" },
      { date: daysAgo(13), mood: "good", energy: "moderate", sleep: 7.0, stress: "low" },
    ],
  },

  // T5 — Stable state: follicular day 11, 7 flat logs
  {
    id: "T5_stable_state",
    description: "No changes, stable everything",
    user: {
      name: "Stable User",
      age: 29, height: 165, weight: 60,
      cycleLength: 28,
      lastPeriodStart: periodStart(11),
      cycleRegularity: "regular",
      cycleMode: "natural",
    },
    logs: [
      { date: daysAgo(0), mood: "neutral", energy: "moderate", sleep: 7.0, stress: "moderate" },
      { date: daysAgo(1), mood: "neutral", energy: "moderate", sleep: 7.0, stress: "moderate" },
      { date: daysAgo(2), mood: "neutral", energy: "moderate", sleep: 7.1, stress: "moderate" },
      { date: daysAgo(3), mood: "neutral", energy: "moderate", sleep: 7.0, stress: "moderate" },
      { date: daysAgo(4), mood: "neutral", energy: "moderate", sleep: 6.9, stress: "moderate" },
      { date: daysAgo(5), mood: "neutral", energy: "moderate", sleep: 7.0, stress: "moderate" },
      { date: daysAgo(6), mood: "neutral", energy: "moderate", sleep: 7.1, stress: "moderate" },
    ],
  },

  // T6 — Early menstrual recovery: day 5, energy slowly rising from period
  {
    id: "T6_follicular_recovery",
    description: "Post-period, energy slowly rising",
    user: {
      name: "Recovery User",
      age: 26, height: 162, weight: 55,
      cycleLength: 28,
      lastPeriodStart: periodStart(5),
      cycleRegularity: "regular",
      cycleMode: "natural",
    },
    logs: [
      { date: daysAgo(0), mood: "neutral", energy: "moderate", sleep: 7.0, stress: "low" },
      { date: daysAgo(1), mood: "low", energy: "low", sleep: 6.5, stress: "moderate" },
      { date: daysAgo(2), mood: "low", energy: "low", sleep: 6.0, stress: "moderate" },
      { date: daysAgo(3), mood: "low", energy: "low", sleep: 5.5, stress: "high", padsChanged: 6 },
      { date: daysAgo(4), mood: "low", energy: "low", sleep: 5.5, stress: "high", padsChanged: 7 },
    ],
  },

  // T7 — Late luteal mood drop: day 27, sleep fine, mood declining (hormonal)
  {
    id: "T7_luteal_mood_drop",
    description: "Sleep good but mood dropping (hormonal)",
    user: {
      name: "Mood Drop User",
      age: 28, height: 165, weight: 60,
      cycleLength: 28,
      lastPeriodStart: periodStart(27),
      cycleRegularity: "regular",
      cycleMode: "natural",
    },
    logs: [
      { date: daysAgo(0), mood: "low", energy: "low", sleep: 7.0, stress: "moderate" },
      { date: daysAgo(1), mood: "low", energy: "low", sleep: 7.0, stress: "moderate" },
      { date: daysAgo(2), mood: "neutral", energy: "moderate", sleep: 7.0, stress: "low" },
      { date: daysAgo(3), mood: "neutral", energy: "moderate", sleep: 7.0, stress: "low" },
      { date: daysAgo(4), mood: "good", energy: "moderate", sleep: 7.0, stress: "low" },
    ],
  },

  // T8 — Ovulation + high stress: day 13, high energy but stress spiking
  {
    id: "T8_ovulation_stress",
    description: "High energy but stress spiking",
    user: {
      name: "Stress Peak User",
      age: 30, height: 170, weight: 65,
      cycleLength: 28,
      lastPeriodStart: periodStart(13),
      cycleRegularity: "regular",
      cycleMode: "natural",
    },
    logs: [
      { date: daysAgo(0), mood: "neutral", energy: "high", sleep: 7.0, stress: "very_high" },
      { date: daysAgo(1), mood: "neutral", energy: "high", sleep: 7.0, stress: "high" },
      { date: daysAgo(2), mood: "good", energy: "high", sleep: 7.2, stress: "moderate" },
      { date: daysAgo(3), mood: "good", energy: "moderate", sleep: 7.0, stress: "low" },
      { date: daysAgo(4), mood: "good", energy: "moderate", sleep: 7.0, stress: "low" },
    ],
  },

  // T9 — Menstrual day 1 but feeling good: positive mood on period
  {
    id: "T9_menstrual_positive",
    description: "On period but feeling okay",
    user: {
      name: "Positive Period User",
      age: 27, height: 160, weight: 54,
      cycleLength: 28,
      lastPeriodStart: periodStart(1),
      cycleRegularity: "regular",
      cycleMode: "natural",
    },
    logs: [
      { date: daysAgo(0), mood: "good", energy: "moderate", sleep: 7.0, stress: "low" },
      { date: daysAgo(1), mood: "good", energy: "moderate", sleep: 7.0, stress: "low" },
      { date: daysAgo(2), mood: "good", energy: "moderate", sleep: 7.2, stress: "low" },
      { date: daysAgo(3), mood: "neutral", energy: "moderate", sleep: 7.0, stress: "moderate" },
    ],
  },

  // T10 — Mixed signals: luteal day 19, erratic sleep, stress oscillating
  {
    id: "T10_mixed_signals",
    description: "Sleep low, stress high, mood fluctuating",
    user: {
      name: "Chaos User",
      age: 29, height: 165, weight: 60,
      cycleLength: 28,
      lastPeriodStart: periodStart(19),
      cycleRegularity: "regular",
      cycleMode: "natural",
    },
    logs: [
      { date: daysAgo(0), mood: "low", energy: "low", sleep: 4.5, stress: "high" },
      { date: daysAgo(1), mood: "good", energy: "high", sleep: 7.0, stress: "low" },
      { date: daysAgo(2), mood: "low", energy: "low", sleep: 4.8, stress: "high" },
      { date: daysAgo(3), mood: "good", energy: "moderate", sleep: 7.2, stress: "low" },
      { date: daysAgo(4), mood: "low", energy: "low", sleep: 5.0, stress: "high" },
    ],
  },

];
