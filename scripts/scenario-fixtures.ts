export type ScenarioCheck = {
  path: string;
  equals?: unknown;
  notNull?: boolean;
  includes?: string;
  arrayContains?: unknown;
};

export type ScenarioFixture = {
  id: string;
  description: string;
  user: {
    name: string;
    age: number;
    height: number;
    weight: number;
    cycleLength: number;
    lastPeriodStartHoursAgo: number;
    password: string;
    contraceptiveMethod?: string;
    cycleRegularity?: string;
  };
  logs: Array<{
    daysAgo: number;
    mood?: string;
    energy?: string;
    sleep?: number;
    stress?: string;
    exercise?: string;
    symptoms?: string[];
    pain?: string;
    padsChanged?: number;
  }>;
  insightHistory?: Array<{
    daysAgo: number;
    primaryKey: string;
    driver?: string;
    cycleDay?: number;
    phase?: string;
  }>;
  checks: {
    insights: ScenarioCheck[];
    forecast: ScenarioCheck[];
    cycleCurrent?: ScenarioCheck[];
  };
  periodStartedDate?: string;
  cycleHistory?: Array<{
    startDaysAgo: number;
    cycleLength?: number;
  }>;
};

export const SCENARIOS: ScenarioFixture[] = [
  {
    id: "short-cycle-21-boundaries",
    description: "21-day cycle should compute non-28 phase boundaries",
    user: {
      name: "Scenario 21 Day",
      age: 27,
      height: 164,
      weight: 58,
      cycleLength: 21,
      lastPeriodStartHoursAgo: 9 * 24 + 2,
      password: "password12",
    },
    logs: [],
    checks: {
      insights: [
        { path: "cycleDay", equals: 10 },
        { path: "home.phase", equals: "luteal" },
      ],
      forecast: [{ path: "today.phase", equals: "luteal" }],
    },
  },
  {
    id: "long-cycle-35-boundaries",
    description: "35-day cycle should stay follicular around day 20",
    user: {
      name: "Scenario 35 Day",
      age: 27,
      height: 164,
      weight: 58,
      cycleLength: 35,
      lastPeriodStartHoursAgo: 20 * 24 + 2,
      password: "password12",
    },
    logs: [],
    checks: {
      insights: [
        { path: "cycleDay", equals: 21 },
        { path: "home.phase", equals: "ovulation" },
      ],
      forecast: [{ path: "today.phase", equals: "ovulation" }],
    },
  },
  {
    id: "hormonal-user-no-ovulation",
    description: "Pill users should not enter ovulation phase",
    user: {
      name: "Scenario Hormonal",
      age: 28,
      height: 165,
      weight: 60,
      cycleLength: 28,
      lastPeriodStartHoursAgo: 14 * 24 + 2,
      password: "password12",
      contraceptiveMethod: "pill",
    },
    logs: [],
    checks: {
      insights: [
        { path: "home.phase", equals: "follicular" },
        { path: "cycleContext.cycleMode", equals: "hormonal" },
      ],
      forecast: [{ path: "today.phase", equals: "follicular" }],
    },
  },
  {
    id: "irregular-confidence",
    description: "CycleHistory variability should mark cyclePredictionConfidence irregular",
    user: {
      name: "Scenario Irregular",
      age: 30,
      height: 168,
      weight: 63,
      cycleLength: 28,
      lastPeriodStartHoursAgo: 12 * 24,
      password: "password12",
      cycleRegularity: "irregular",
    },
    cycleHistory: [
      { startDaysAgo: 90, cycleLength: 24 },
      { startDaysAgo: 64, cycleLength: 36 },
      { startDaysAgo: 36, cycleLength: 26 },
    ],
    logs: [],
    checks: {
      insights: [
        { path: "cycleContext.cyclePredictionConfidence", equals: "variable" },
        { path: "cycleContext.nextPeriodRange", notNull: true },
      ],
      forecast: [{ path: "today.phase", notNull: true }],
    },
  },
  {
    id: "period-started-endpoint",
    description: "POST /cycle/period-started should update current cycle day",
    user: {
      name: "Scenario Period Started",
      age: 29,
      height: 166,
      weight: 61,
      cycleLength: 28,
      lastPeriodStartHoursAgo: 15 * 24,
      password: "password12",
    },
    periodStartedDate: "2026-03-20",
    logs: [],
    checks: {
      insights: [{ path: "cycleDay", notNull: true }],
      forecast: [{ path: "today.currentDay", notNull: true }],
      cycleCurrent: [{ path: "currentDay", notNull: true }],
    },
  },
  {
    id: "new-user-fallback",
    description: "0 logs should stay fallback and no PMS forecast",
    user: {
      name: "Scenario New User",
      age: 26,
      height: 164,
      weight: 57,
      cycleLength: 28,
      lastPeriodStartHoursAgo: 36,
      password: "password12",
    },
    logs: [],
    checks: {
      insights: [
        { path: "mode", equals: "fallback" },
        { path: "confidence", equals: "low" },
        { path: "aiEnhanced", equals: false },
        { path: "progress.logsCount", equals: 0 },
      ],
      forecast: [
        { path: "pmsSymptomForecast", equals: null },
      ],
    },
  },
  {
    id: "three-log-personalized",
    description: "3 logs should enter personalized mode with AI eligibility",
    user: {
      name: "Scenario Three Logs",
      age: 28,
      height: 165,
      weight: 60,
      cycleLength: 28,
      lastPeriodStartHoursAgo: 36,
      password: "password12",
    },
    logs: [
      { daysAgo: 2, mood: "low", stress: "high", sleep: 5.5, exercise: "none", padsChanged: 8, energy: "low" },
      { daysAgo: 1, mood: "low", stress: "high", sleep: 6.0, exercise: "none", padsChanged: 5, energy: "low" },
      { daysAgo: 0, mood: "low", stress: "medium", sleep: 6.5, exercise: "none", padsChanged: 3, energy: "low" },
    ],
    checks: {
      insights: [
        { path: "mode", equals: "personalized" },
        { path: "progress.logsCount", equals: 3 },
        { path: "confidence", equals: "medium" },
        { path: "view.explanation", notNull: true },
        { path: "view.supportingInsights", notNull: true },
      ],
      forecast: [
        { path: "today.phase", includes: "menstrual" },
      ],
    },
  },
  {
    id: "one-log-strong-signal",
    description: "1 severe log should still be personalized with low confidence",
    user: {
      name: "Scenario One Log Strong",
      age: 28,
      height: 165,
      weight: 60,
      cycleLength: 28,
      lastPeriodStartHoursAgo: 36,
      password: "password12",
    },
    logs: [
      { daysAgo: 0, mood: "low", stress: "high", sleep: 5.5, exercise: "none", padsChanged: 8, energy: "low" },
    ],
    checks: {
      insights: [
        { path: "mode", equals: "personalized" },
        { path: "confidence", equals: "low" },
        { path: "progress.logsCount", equals: 1 },
        { path: "basedOn.priorityDrivers", arrayContains: "bleeding_heavy" },
        { path: "view.explanation", notNull: true },
      ],
      forecast: [
        { path: "today.phase", equals: "menstrual" },
      ],
    },
  },
  {
    id: "follicular-phase-deviation",
    description: "Follicular with low mood should trigger phase deviation driver",
    user: {
      name: "Scenario Follicular Deviation",
      age: 27,
      height: 163,
      weight: 58,
      cycleLength: 28,
      lastPeriodStartHoursAgo: 7 * 24 + 2,
      password: "password12",
    },
    logs: [
      { daysAgo: 2, mood: "low", stress: "medium", sleep: 6.8, exercise: "light walk", padsChanged: 0, energy: "medium" },
      { daysAgo: 1, mood: "low", stress: "medium", sleep: 6.7, exercise: "light walk", padsChanged: 0, energy: "medium" },
      { daysAgo: 0, mood: "low", stress: "medium", sleep: 6.6, exercise: "none", padsChanged: 0, energy: "medium" },
    ],
    checks: {
      insights: [
        { path: "home.phase", equals: "follicular" },
        { path: "mode", equals: "personalized" },
        { path: "basedOn.priorityDrivers", arrayContains: "phase_deviation" },
      ],
      forecast: [
        { path: "today.phase", equals: "follicular" },
      ],
    },
  },
  {
    id: "ovulation-strain-deviation",
    description: "Ovulation with high strain should include phase deviation",
    user: {
      name: "Scenario Ovulation Deviation",
      age: 30,
      height: 168,
      weight: 64,
      cycleLength: 28,
      lastPeriodStartHoursAgo: 13 * 24 + 2,
      password: "password12",
    },
    logs: [
      { daysAgo: 2, mood: "medium", stress: "high", sleep: 5.5, exercise: "none", padsChanged: 0, energy: "low" },
      { daysAgo: 1, mood: "low", stress: "high", sleep: 5.8, exercise: "none", padsChanged: 0, energy: "low" },
      { daysAgo: 0, mood: "low", stress: "high", sleep: 5.6, exercise: "none", padsChanged: 0, energy: "low" },
    ],
    checks: {
      insights: [
        { path: "home.phase", equals: "ovulation" },
        { path: "basedOn.priorityDrivers", arrayContains: "phase_deviation" },
      ],
      forecast: [
        { path: "today.phase", equals: "ovulation" },
        { path: "pmsSymptomForecast", equals: null },
      ],
    },
  },
  {
    id: "luteal-insufficient-history-no-pms",
    description: "Luteal without prior cycle windows should keep PMS null",
    user: {
      name: "Scenario Luteal No PMS",
      age: 31,
      height: 167,
      weight: 62,
      cycleLength: 28,
      lastPeriodStartHoursAgo: 24 * 24 + 2,
      password: "password12",
    },
    logs: [
      { daysAgo: 0, mood: "low", stress: "high", sleep: 5.8, exercise: "none", padsChanged: 1, energy: "low" },
      { daysAgo: 1, mood: "low", stress: "high", sleep: 5.9, exercise: "none", padsChanged: 1, energy: "low" },
      { daysAgo: 2, mood: "low", stress: "high", sleep: 6.0, exercise: "none", padsChanged: 1, energy: "low" },
      { daysAgo: 3, mood: "low", stress: "high", sleep: 5.7, exercise: "none", padsChanged: 1, energy: "low" },
      { daysAgo: 4, mood: "low", stress: "high", sleep: 5.9, exercise: "none", padsChanged: 1, energy: "low" },
    ],
    checks: {
      insights: [
        { path: "home.phase", equals: "luteal" },
      ],
      forecast: [
        { path: "today.phase", equals: "luteal" },
        { path: "pmsSymptomForecast", equals: null },
      ],
    },
  },
  {
    id: "forecast-ai-eligibility",
    description: "Forecast should include forecastAiEnhanced key for eligible users",
    user: {
      name: "Scenario Forecast AI",
      age: 29,
      height: 164,
      weight: 59,
      cycleLength: 28,
      lastPeriodStartHoursAgo: 22 * 24 + 2,
      password: "password12",
    },
    logs: [
      { daysAgo: 0, mood: "low", stress: "high", sleep: 5.8, exercise: "none", padsChanged: 1, energy: "low" },
      { daysAgo: 1, mood: "low", stress: "high", sleep: 5.8, exercise: "none", padsChanged: 1, energy: "low" },
      { daysAgo: 2, mood: "low", stress: "high", sleep: 5.9, exercise: "none", padsChanged: 1, energy: "low" },
      { daysAgo: 3, mood: "low", stress: "high", sleep: 5.7, exercise: "none", padsChanged: 1, energy: "low" },
      { daysAgo: 4, mood: "low", stress: "high", sleep: 5.8, exercise: "none", padsChanged: 1, energy: "low" },
    ],
    checks: {
      insights: [
        { path: "confidence", equals: "high" },
      ],
      forecast: [
        { path: "forecastAiEnhanced", notNull: true },
        { path: "forecast.tomorrow.outlook", notNull: true },
      ],
    },
  },
  {
    id: "late-luteal-pms-expected",
    description: "Late luteal with two prior windows should return PMS forecast",
    user: {
      name: "Scenario PMS",
      age: 29,
      height: 166,
      weight: 61,
      cycleLength: 28,
      lastPeriodStartHoursAgo: 26 * 24,
      password: "password12",
    },
    logs: [
      { daysAgo: 0, mood: "low", stress: "high", sleep: 5.6, exercise: "none", padsChanged: 2, energy: "low" },
      { daysAgo: 1, mood: "low", stress: "high", sleep: 5.7, exercise: "none", padsChanged: 2, energy: "low" },
      { daysAgo: 2, mood: "low", stress: "high", sleep: 5.5, exercise: "none", padsChanged: 2, energy: "low" },
      { daysAgo: 3, mood: "low", stress: "high", sleep: 5.8, exercise: "none", padsChanged: 2, energy: "low" },
      { daysAgo: 4, mood: "low", stress: "high", sleep: 5.6, exercise: "none", padsChanged: 2, energy: "low" },
    ],
    insightHistory: [
      { daysAgo: 62, primaryKey: "physicalInsight", driver: "sleep_below_baseline", cycleDay: 22, phase: "luteal" },
      { daysAgo: 61, primaryKey: "physicalInsight", driver: "stress_above_baseline", cycleDay: 23, phase: "luteal" },
      { daysAgo: 60, primaryKey: "emotionalInsight", driver: "mood_stress_coupling", cycleDay: 24, phase: "luteal" },
      { daysAgo: 59, primaryKey: "physicalInsight", driver: "high_strain", cycleDay: 25, phase: "luteal" },
      { daysAgo: 34, primaryKey: "physicalInsight", driver: "sleep_below_baseline", cycleDay: 22, phase: "luteal" },
      { daysAgo: 33, primaryKey: "physicalInsight", driver: "stress_above_baseline", cycleDay: 23, phase: "luteal" },
      { daysAgo: 32, primaryKey: "emotionalInsight", driver: "mood_stress_coupling", cycleDay: 24, phase: "luteal" },
      { daysAgo: 31, primaryKey: "physicalInsight", driver: "high_strain", cycleDay: 25, phase: "luteal" },
    ],
    checks: {
      insights: [
        { path: "home.phase", equals: "luteal" },
        { path: "mode", equals: "personalized" },
      ],
      forecast: [
        { path: "today.phase", equals: "luteal" },
        { path: "pmsSymptomForecast", notNull: true },
      ],
    },
  },
];

