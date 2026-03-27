// NEW FILE — src/controllers/homeController.ts
// This is a brand new controller. It adds GET /api/home.
// Nothing in the existing codebase was changed to create this.

import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import {
  calculateCycleInfo,
  getCycleMode,
  type Phase,
  type CycleMode,
} from "../services/cycleEngine";
import { getCyclePredictionContext } from "../services/insightData";
import { getContraceptionBehavior } from "../services/contraceptionengine";
import type { ContraceptionType } from "../services/contraceptionengine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HomeScreenContent {
  title: string;
  subtitle: string;
  cardHeadline: string;
  dayPhaseLabel: string;
  reassurance: string;
  ctaText: string;
  ctaLogPhase: Phase;
  phase: Phase;
  cycleDay: number;
  cycleLength: number;
  isPeriodDelayed: boolean;
  daysOverdue: number;
  cyclePredictionConfidence: string;
  isIrregular: boolean;
  quickLogFields: QuickLogField[];
  contraceptionNote: string | null;
}

export interface QuickLogField {
  key: string;
  label: string;
  type: "emoji_mood" | "slider" | "text_input" | "chips";
  options?: string[];
  placeholder?: string;
}

// ─── Contraception resolver ───────────────────────────────────────────────────

function resolveContraceptionType(method: string | null): ContraceptionType {
  const m = method?.toLowerCase() ?? "none";
  const map: Record<string, ContraceptionType> = {
    pill: "combined_pill", combined_pill: "combined_pill",
    mini_pill: "mini_pill", iud_hormonal: "iud_hormonal",
    iud_copper: "iud_copper", implant: "implant",
    injection: "injection", patch: "patch", ring: "ring",
    condom: "barrier", barrier: "barrier", natural: "natural", none: "none",
  };
  return map[m] ?? "none";
}

// ─── Phase label ──────────────────────────────────────────────────────────────

function phaseLabel(phase: Phase): string {
  const labels: Record<Phase, string> = {
    menstrual: "Period",
    follicular: "Follicular phase",
    ovulation: "Ovulation",
    luteal: "Luteal phase",
  };
  return labels[phase];
}

// ─── Phase position ratio (0.0 = start of phase, 1.0 = end) ──────────────────
// This is what makes the content work for ANY cycle length, not just 28 days.

function getPhaseRatio(phase: Phase, cycleDay: number, cycleLength: number): number {
  const lutealStart = Math.max(10, cycleLength - 13);
  const ovulationStart = Math.max(6, lutealStart - 3);
  let ratio = 0;
  switch (phase) {
    case "menstrual":
      ratio = (cycleDay - 1) / 4;
      break;
    case "follicular":
      ratio = (cycleDay - 6) / Math.max(1, ovulationStart - 6);
      break;
    case "ovulation":
      ratio = (cycleDay - ovulationStart) / Math.max(1, lutealStart - ovulationStart);
      break;
    case "luteal":
      ratio = (cycleDay - lutealStart) / Math.max(1, cycleLength - lutealStart);
      break;
  }
  return Math.max(0, Math.min(1, ratio));
}

// ─── Quick-log fields per phase ───────────────────────────────────────────────
// These power the bottom sheet that opens when the home screen CTA is tapped.

function getQuickLogFields(phase: Phase, isPeriodDelayed: boolean): QuickLogField[] {
  const mood: QuickLogField = { key: "mood", label: "Mood", type: "emoji_mood", options: ["😔", "😐", "🙂", "😄"] };
  const energy: QuickLogField = { key: "energy", label: "Energy", type: "chips", options: ["Low", "Medium", "High"] };
  const focus: QuickLogField = { key: "focus", label: "Today's focus", type: "text_input", placeholder: "What do you aim to achieve today?" };
  const confidence: QuickLogField = { key: "motivation", label: "Confidence", type: "chips", options: ["Low", "Medium", "High"] };
  const flow: QuickLogField = { key: "padsChanged", label: "Flow today", type: "chips", options: ["Light", "Moderate", "Heavy"] };
  const pain: QuickLogField = { key: "pain", label: "Cramps", type: "chips", options: ["None", "Mild", "Moderate", "Severe"] };
  const cravings: QuickLogField = { key: "cravings", label: "Cravings", type: "chips", options: ["None", "Mild", "Strong"] };
  const fatigue: QuickLogField = { key: "fatigue", label: "Fatigue", type: "chips", options: ["Low", "Moderate", "High"] };
  const social: QuickLogField = { key: "social", label: "Social energy", type: "chips", options: ["Withdrawn", "Neutral", "Engaged"] };

  if (isPeriodDelayed) return [mood, energy, fatigue, pain];

  switch (phase) {
    case "menstrual":   return [mood, flow, pain, energy];
    case "follicular":  return [mood, energy, focus, confidence];
    case "ovulation":   return [mood, energy, social, confidence];
    case "luteal":      return [mood, energy, cravings, fatigue];
  }
}

// ─── Core content builder — works for all cycle lengths + edge cases ──────────

function buildContent(params: {
  phase: Phase;
  cycleDay: number;
  cycleLength: number;
  isPeriodDelayed: boolean;
  daysOverdue: number;
  isIrregular: boolean;
  cyclePredictionConfidence: string;
  showPhaseInsights: boolean;
  contraceptionNote: string | null;
}): Omit<HomeScreenContent, "quickLogFields" | "ctaLogPhase"> {
  const { phase, cycleDay, cycleLength, isPeriodDelayed, daysOverdue,
    isIrregular, cyclePredictionConfidence, showPhaseInsights, contraceptionNote } = params;

  const dayPhaseLabel = `Day ${cycleDay} · ${phaseLabel(phase)}`;

  // ── DELAYED PERIOD ────────────────────────────────────────────────────────
  if (isPeriodDelayed) {
    return {
      title: daysOverdue === 1 ? "Your period is a day late" : `${daysOverdue} days late`,
      subtitle: isIrregular
        ? "Late periods are more common with irregular cycles — this doesn't always mean something is wrong."
        : "Cycles can shift by a few days — that's completely normal.",
      cardHeadline: "Your body may just need a little more time",
      dayPhaseLabel,
      reassurance: daysOverdue <= 5
        ? "Most late periods arrive within a week. Keep logging how you feel."
        : "If your period is more than 7 days late and you're concerned, it's worth checking in with a doctor.",
      ctaText: "Log how you're feeling →",
      phase, cycleDay, cycleLength,
      isPeriodDelayed: true, daysOverdue,
      cyclePredictionConfidence, isIrregular, contraceptionNote,
    };
  }

  // ── HORMONAL CONTRACEPTION ────────────────────────────────────────────────
  if (!showPhaseInsights) {
    return {
      title: "Your day, your patterns",
      subtitle: contraceptionNote ?? "Insights based on how you've been feeling",
      cardHeadline: "Log how you feel today",
      dayPhaseLabel: `Day ${cycleDay}`,
      reassurance: "The more you log, the more we learn about your patterns.",
      ctaText: "Check in with yourself →",
      phase, cycleDay, cycleLength,
      isPeriodDelayed: false, daysOverdue: 0,
      cyclePredictionConfidence, isIrregular, contraceptionNote,
    };
  }

  const r = getPhaseRatio(phase, cycleDay, cycleLength);
  const daysLeft = cycleLength - cycleDay + 1;

  // ── IRREGULAR — soften subtitle ───────────────────────────────────────────
  const irregularSubtitle = isIrregular || cyclePredictionConfidence === "irregular"
    ? "Your cycle tends to vary — this is an estimate"
    : null;

  // ── CONTENT PER PHASE ─────────────────────────────────────────────────────

  let title: string, subtitle: string, cardHeadline: string, reassurance: string, ctaText: string;

  switch (phase) {
    case "menstrual": {
      if (cycleDay <= 2) {
        title = "On your period"; subtitle = "Pregnancy unlikely today";
        cardHeadline = "You might feel low energy today"; reassurance = "This is completely normal.";
        ctaText = "Take it easy today →";
      } else if (r < 0.6) {
        title = "On your period"; subtitle = "Low chance of pregnancy";
        cardHeadline = "You may feel slightly better today"; reassurance = "The hardest days are behind you.";
        ctaText = "Ease back gently →";
      } else {
        title = "Period ending soon"; subtitle = "Low chance of pregnancy";
        cardHeadline = "You might feel more stable today"; reassurance = "Energy tends to return soon.";
        ctaText = "Reset your routine →";
      }
      break;
    }

    case "follicular": {
      if (r < 0.25) {
        title = "Fresh start ✦"; subtitle = "Low chance of pregnancy";
        cardHeadline = "You might feel more active today"; reassurance = "Energy builds steadily from here.";
        ctaText = "Start fresh today →";
      } else if (r < 0.6) {
        title = "Energy rising"; subtitle = "Low chance of pregnancy";
        cardHeadline = "You may feel motivated and focused today"; reassurance = "This is one of your stronger windows.";
        ctaText = "Take initiative →";
      } else {
        title = "Near ovulation"; subtitle = "Chance of pregnancy is increasing";
        cardHeadline = "You might feel confident today"; reassurance = "Peak energy is just ahead.";
        ctaText = "Go all in →";
      }
      break;
    }

    case "ovulation": {
      if (r < 0.4) {
        title = "Ovulation day"; subtitle = "High chance of pregnancy today";
        cardHeadline = "You might feel confident and energised"; reassurance = "This is your peak energy window.";
        ctaText = "Make the most of today →";
      } else {
        title = "Ovulation completed"; subtitle = "Fertility decreasing";
        cardHeadline = "You might feel balanced today"; reassurance = "Your body is transitioning smoothly.";
        ctaText = "Maintain momentum →";
      }
      break;
    }

    case "luteal": {
      if (r < 0.3) {
        title = "Transition phase"; subtitle = "Low chance of pregnancy";
        cardHeadline = "You may feel more calm today"; reassurance = "This is completely normal.";
        ctaText = "Check in with yourself →";
      } else if (r < 0.6) {
        title = "Slowing down"; subtitle = "Low chance of pregnancy";
        cardHeadline = "You might feel more reflective today"; reassurance = "Your body is shifting into a quieter mode.";
        ctaText = "Prioritise yourself →";
      } else if (daysLeft <= 4) {
        title = "Pre-period phase"; subtitle = "Pregnancy unlikely today";
        cardHeadline = "You might feel more sensitive today";
        reassurance = daysLeft <= 2 ? "Relief is very close." : "Relief is a few days away.";
        ctaText = "Be gentle with yourself →";
      } else {
        title = "Deep rest phase"; subtitle = "Low chance of pregnancy";
        cardHeadline = "You may feel drained today"; reassurance = "Rest is productive right now.";
        ctaText = "Pause & breathe →";
      }
      break;
    }
  }

  return {
    title,
    subtitle: irregularSubtitle ?? subtitle,
    cardHeadline, dayPhaseLabel,
    reassurance: isIrregular
      ? reassurance + " Keep logging and we'll refine this over time."
      : reassurance,
    ctaText, phase, cycleDay, cycleLength,
    isPeriodDelayed: false, daysOverdue: 0,
    cyclePredictionConfidence, isIrregular, contraceptionNote,
  };
}

// ─── GET /api/home ────────────────────────────────────────────────────────────

export async function getHomeScreen(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const cycleMode = getCycleMode(user);
  const cyclePrediction = await getCyclePredictionContext(req.userId!, user.cycleLength);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;
  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);

  // Delayed period detection
  const rawDiffDays = Math.floor((Date.now() - new Date(user.lastPeriodStart).getTime()) / 86400000);
  const daysOverdue = Math.max(0, rawDiffDays - effectiveCycleLength + 1);
  const isPeriodDelayed =
    daysOverdue > 0 &&
    cyclePrediction.confidence !== "irregular" &&
    cycleMode !== "hormonal";

  const contraceptionType = resolveContraceptionType(user.contraceptiveMethod);
  const contraceptionBehavior = getContraceptionBehavior(contraceptionType);

  const content = buildContent({
    phase: cycleInfo.phase,
    cycleDay: cycleInfo.currentDay,
    cycleLength: effectiveCycleLength,
    isPeriodDelayed,
    daysOverdue,
    isIrregular: cyclePrediction.isIrregular,
    cyclePredictionConfidence: cyclePrediction.confidence,
    showPhaseInsights: contraceptionBehavior.useNaturalCycleEngine,
    contraceptionNote: contraceptionBehavior.contextMessage || null,
  });

  res.json({
    ...content,
    ctaLogPhase: cycleInfo.phase,
    quickLogFields: getQuickLogFields(cycleInfo.phase, isPeriodDelayed),
  });
}