// NEW FILE — src/controllers/calendarController.ts
// Replaces getCycleCalendar from cycleController.ts with a richer version.
// cycleController.ts itself is NOT modified — getCurrentCycle and periodStarted
// still live there untouched.

import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
  calculateCycleInfo,
  calculateCycleInfoForDate,
  getCycleMode,
  utcDayDiff,
  type Phase,
} from "../services/cycleEngine";
import { getCyclePredictionContext } from "../services/insightData";
import {
  getContraceptionBehavior,
  resolveContraceptionType,
} from "../services/contraceptionengine";

// ─── Phase colors (match your UI design) ─────────────────────────────────────

const PHASE_COLORS: Record<Phase, string> = {
  menstrual: "#E8514A",
  follicular: "#F5A623",
  ovulation: "#F5A623",
  luteal: "#9B59B6",
};

// ─── Phase position ratio ─────────────────────────────────────────────────────

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

// ─── Calendar day insight card builder ───────────────────────────────────────
// This is what shows in the bottom card when a user taps a calendar day.

function buildDayInsightCard(params: {
  isoDate: string;
  cycleDay: number;
  phase: Phase;
  cycleLength: number;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  isPeriodDelayed: boolean;
  daysOverdue: number;
  showPhaseInsights: boolean;
}) {
  const { isoDate, cycleDay, phase, cycleLength, isToday, isPast,
    isFuture, isPeriodDelayed, daysOverdue, showPhaseInsights } = params;

  const dateObj = new Date(isoDate);
  const dayLabel = dateObj.toLocaleDateString("en-GB", { day: "numeric", month: "long" });

  const phaseLabels: Record<Phase, string> = {
    menstrual: "Period", follicular: "Follicular phase",
    ovulation: "Ovulation", luteal: "Luteal phase",
  };
  const dayPhaseLabel = showPhaseInsights
    ? `Day ${cycleDay} · ${phaseLabels[phase]}`
    : `Day ${cycleDay}`;

  // Delayed period — override card
  if (isPeriodDelayed && isToday) {
    return {
      date: isoDate, dayLabel, dayPhaseLabel,
      cardHeadline: daysOverdue === 1
        ? "Your period is a day late"
        : `Your period is ${daysOverdue} days late`,
      reassurance: "Late periods can happen — stress, travel, and diet can all cause a shift.",
      ctaText: "Log how you're feeling 🌙",
      ctaPhase: phase, phase, isToday, isPeriodDelayed: true, daysOverdue,
    };
  }

  // Hormonal contraception
  if (!showPhaseInsights) {
    return {
      date: isoDate, dayLabel, dayPhaseLabel: `Day ${cycleDay}`,
      cardHeadline: isToday ? "Log how you feel today"
        : isPast ? "How were you feeling this day?"
        : "What to expect here",
      reassurance: "Your insights are based on your logged patterns.",
      ctaText: isToday ? "Check in with yourself 🌙" : "View log",
      ctaPhase: phase, phase, isToday, isPeriodDelayed: false, daysOverdue: 0,
    };
  }

  const r = getPhaseRatio(phase, cycleDay, cycleLength);
  const daysLeft = cycleLength - cycleDay + 1;

  // Past day — simpler card
  if (isPast && !isToday) {
    const historicalHeadline: Record<Phase, string> = {
      menstrual: cycleDay <= 2 ? "This was a heavier day" : "Flow was easing around here",
      follicular: r < 0.5 ? "Energy was building this day" : "This was near your peak window",
      ovulation: "This was near your peak energy",
      luteal: r > 0.7 ? "Pre-period sensitivity was building" : "This was your quieter phase",
    };
    return {
      date: isoDate, dayLabel, dayPhaseLabel,
      cardHeadline: historicalHeadline[phase],
      reassurance: "This was part of your cycle pattern.",
      ctaText: "View log →",
      ctaPhase: phase, phase, isToday: false, isPeriodDelayed: false, daysOverdue: 0,
    };
  }

  // Today / future — full content
  let cardHeadline: string, reassurance: string, ctaText: string;

  switch (phase) {
    case "menstrual":
      cardHeadline = cycleDay <= 2 ? "You might feel low energy today"
        : r < 0.6 ? "You may feel slightly better today"
        : "You might feel more stable today";
      reassurance = cycleDay <= 2 ? "This is completely normal." : "The hardest days are behind you.";
      ctaText = cycleDay <= 2 ? "Take it easy today 🌿" : "Check in with yourself 🌙";
      break;

    case "follicular":
      cardHeadline = r < 0.3 ? "You might feel more active today"
        : r < 0.65 ? "You may feel motivated and focused today"
        : "You might feel confident today";
      reassurance = "This is completely normal.";
      ctaText = r < 0.5 ? "Start fresh today →" : "Make the most of today 🔥";
      break;

    case "ovulation":
      cardHeadline = r < 0.5 ? "You might feel confident today" : "You might feel balanced today";
      reassurance = r < 0.5 ? "This is your peak energy window." : "Your body is transitioning smoothly.";
      ctaText = "Make the most of today 🔥";
      break;

    case "luteal":
      if (r < 0.3) {
        cardHeadline = "You may feel more calm today"; reassurance = "This is completely normal."; ctaText = "Check in with yourself →";
      } else if (r < 0.6) {
        cardHeadline = "You might feel more reflective today"; reassurance = "Your body is shifting into a quieter mode."; ctaText = "Prioritise yourself →";
      } else if (daysLeft <= 4) {
        cardHeadline = "You might feel more sensitive today";
        reassurance = daysLeft <= 2 ? "Relief is very close." : "Relief is a few days away.";
        ctaText = "Be gentle with yourself 🌙";
      } else {
        cardHeadline = "You may feel drained today"; reassurance = "Rest is productive right now."; ctaText = "Pause & breathe →";
      }
      break;
  }

  return {
    date: isoDate, dayLabel, dayPhaseLabel,
    cardHeadline, reassurance, ctaText,
    ctaPhase: phase, phase, isToday, isPeriodDelayed: false, daysOverdue: 0,
  };
}

// ─── Phase timeline (the M · F · O · L bar above the calendar grid) ──────────

function buildPhaseTimeline(cycleLength: number) {
  const lutealStart = Math.max(10, cycleLength - 13);
  const ovStart = Math.max(6, lutealStart - 3);

  return [
    { phase: "menstrual",  label: "M", color: PHASE_COLORS.menstrual,  startPercent: 0,                              endPercent: (5 / cycleLength) * 100 },
    { phase: "follicular", label: "F", color: PHASE_COLORS.follicular, startPercent: (5 / cycleLength) * 100,         endPercent: ((ovStart - 1) / cycleLength) * 100 },
    { phase: "ovulation",  label: "O", color: PHASE_COLORS.ovulation,  startPercent: ((ovStart - 1) / cycleLength) * 100,   endPercent: ((lutealStart - 1) / cycleLength) * 100 },
    { phase: "luteal",     label: "L", color: PHASE_COLORS.luteal,     startPercent: ((lutealStart - 1) / cycleLength) * 100, endPercent: 100 },
  ];
}

// ─── GET /api/calendar ────────────────────────────────────────────────────────

export async function getCalendar(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const { month } = req.query;
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "month must be in YYYY-MM format" });
    return;
  }

  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const startDate = new Date(Date.UTC(year, monthIndex, 1));
  const endDate = new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59));

  const logs = await prisma.dailyLog.findMany({
    where: { userId: req.userId!, date: { gte: startDate, lte: endDate } },
  });
  const logMap = new Map(logs.map((l) => [new Date(l.date).toISOString().split("T")[0]!, l]));

  const cycleMode = getCycleMode(user);
  const cyclePrediction = await getCyclePredictionContext(req.userId!, user.cycleLength);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;

  const contraceptionType = resolveContraceptionType(user.contraceptiveMethod);
  const contraceptionBehavior = getContraceptionBehavior(contraceptionType);

  // Learning state: irregular users with < 2 completed cycles shouldn't see phase labels
  const completedCycleCount = await prisma.cycleHistory.count({
    where: { userId: req.userId!, endDate: { not: null }, cycleLength: { not: null } },
  });
  const isLearning =
    (cycleMode === "irregular" || cyclePrediction.confidence === "irregular") &&
    completedCycleCount < 2;

  const showPhaseInsights = contraceptionBehavior.useNaturalCycleEngine && !isLearning;

  const now = new Date();
  const todayIso = now.toISOString().split("T")[0]!;

  // Delayed period detection
  const rawDiffDays = utcDayDiff(now, user.lastPeriodStart);
  const daysOverdue = Math.max(0, rawDiffDays - effectiveCycleLength);
  const isPeriodDelayedGlobal =
    daysOverdue > 0 &&
    cyclePrediction.confidence !== "irregular" &&
    cycleMode !== "hormonal";

  const lutealStart = Math.max(10, effectiveCycleLength - 13);
  const ovulationStartDay = Math.max(6, lutealStart - 3);

  // Build calendar array
  const calendar = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = new Date(Date.UTC(year, monthIndex, day));
    const isoDate = date.toISOString().split("T")[0]!;
    const isToday = isoDate === todayIso;
    const isFuture = date > now;
    const isPast = !isToday && !isFuture;

    const cycleInfo = calculateCycleInfoForDate(user.lastPeriodStart, date, effectiveCycleLength, cycleMode);
    const log = logMap.get(isoDate);

    return {
      date: isoDate,
      cycleDay: cycleInfo.currentDay,
      phase: showPhaseInsights ? cycleInfo.phase : null,
      phaseDay: cycleInfo.phaseDay,
      isToday, isFuture, isPast,
      hasLog: !!log,
      isPeriodDay: showPhaseInsights && cycleInfo.currentDay === 1 && (isFuture || isToday),
      isOvulationDay: showPhaseInsights && cycleInfo.currentDay >= ovulationStartDay && cycleInfo.currentDay <= ovulationStartDay + 1 && isFuture,
      isPredicted: isFuture,
      isPeriodDelayed: isPeriodDelayedGlobal && (isToday || isFuture) && cycleInfo.currentDay > effectiveCycleLength,
      logSummary: log
        ? { mood: log.mood ?? null, energy: log.energy ?? null, stress: log.stress ?? null }
        : null,
      phaseColor: showPhaseInsights ? PHASE_COLORS[cycleInfo.phase] : "#888888",
    };
  });

  // Today's bottom card (pre-built so frontend doesn't need a second request)
  const todayEntry = calendar.find((d) => d.isToday);
  const todayInsightCard = todayEntry
    ? buildDayInsightCard({
        isoDate: todayEntry.date,
        cycleDay: todayEntry.cycleDay,
        phase: (todayEntry.phase ?? "luteal") as Phase,
        cycleLength: effectiveCycleLength,
        isToday: true, isPast: false, isFuture: false,
        isPeriodDelayed: isPeriodDelayedGlobal,
        daysOverdue, showPhaseInsights,
      })
    : null;

  const currentCycleInfo = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);

  res.json({
    month,
    cycleLength: effectiveCycleLength,
    cycleMode,
    cyclePredictionConfidence: cyclePrediction.confidence,
    isIrregular: cycleMode !== "hormonal" && cyclePrediction.isIrregular,
    isPeriodDelayed: isPeriodDelayedGlobal,
    daysOverdue,
    showPhaseInsights,
    currentPhase: showPhaseInsights ? currentCycleInfo.phase : null,
    nextPeriodEstimate: showPhaseInsights && !isPeriodDelayedGlobal
      ? new Date(now.getTime() + currentCycleInfo.daysUntilNextPeriod * 86400000).toISOString().split("T")[0]
      : null,
    calendar,
    todayInsightCard,
    phaseTimeline: showPhaseInsights ? buildPhaseTimeline(effectiveCycleLength) : null,
  });
}

// ─── GET /api/calendar/day-insight ───────────────────────────────────────────
// Called when user taps any calendar day.

export async function getCalendarDayInsight(req: Request, res: Response): Promise<void> {
  const { date } = req.query;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const cycleMode = getCycleMode(user);
  const cyclePrediction = await getCyclePredictionContext(req.userId!, user.cycleLength);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;

  const targetDate = new Date(date);
  const now = new Date();
  const todayIso = now.toISOString().split("T")[0]!;
  const isToday = date === todayIso;
  const isFuture = targetDate > now && !isToday;
  const isPast = targetDate < now && !isToday;

  const cycleInfo = calculateCycleInfoForDate(user.lastPeriodStart, targetDate, effectiveCycleLength, cycleMode);

  const contraceptionType = resolveContraceptionType(user.contraceptiveMethod);
  const contraceptionBehavior = getContraceptionBehavior(contraceptionType);

  const rawDiffDays = utcDayDiff(now, user.lastPeriodStart);
  const daysOverdue = Math.max(0, rawDiffDays - effectiveCycleLength);
  const isPeriodDelayed =
    isToday && daysOverdue > 0 &&
    cyclePrediction.confidence !== "irregular" &&
    cycleMode !== "hormonal";

  res.json(buildDayInsightCard({
    isoDate: date,
    cycleDay: cycleInfo.currentDay,
    phase: cycleInfo.phase,
    cycleLength: effectiveCycleLength,
    isToday, isPast, isFuture,
    isPeriodDelayed, daysOverdue,
    showPhaseInsights: contraceptionBehavior.useNaturalCycleEngine,
  }));
}