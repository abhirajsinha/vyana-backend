// src/controllers/logController.ts
// CHANGE SUMMARY:
//   - getQuickLogConfig now checks contraception behavior
//   - When showPhaseInsights is false, returns pattern-based log fields
//     instead of phase-specific ones
//   - saveLog and getLogs are 100% identical to current version

import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { calculateCycleInfo, getCycleMode, type Phase } from "../services/cycleEngine";
import { getCyclePredictionContext } from "../services/insightData";
import {
  getContraceptionBehavior,
  resolveContraceptionType,
} from "../services/contraceptionengine";

// ─── saveLog — IDENTICAL TO YOUR CURRENT VERSION ─────────────────────────────

export async function saveLog(req: Request, res: Response): Promise<void> {
  const {
    mood,
    energy,
    sleep,
    stress,
    diet,
    exercise,
    activity,
    symptoms = [],
    focus,
    motivation,
    pain,
    social,
    cravings,
    fatigue,
    padsChanged,
  } = req.body;

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);

  const existingLog = await prisma.dailyLog.findFirst({
    where: { userId: req.userId!, date: { gte: todayStart, lte: todayEnd } },
  });

  const logData = {
    mood,
    energy,
    sleep,
    stress,
    diet,
    exercise,
    activity,
    symptoms,
    focus,
    motivation,
    pain,
    social,
    cravings,
    fatigue,
    padsChanged,
  };

  const log = existingLog
    ? await prisma.dailyLog.update({ where: { id: existingLog.id }, data: logData })
    : await prisma.dailyLog.create({ data: { userId: req.userId!, ...logData } });

  // Invalidate insight and health pattern caches so next fetch recomputes with fresh data
  await prisma.insightCache.deleteMany({
    where: { userId: req.userId! },
  });
  await prisma.healthPatternCache.deleteMany({
    where: { userId: req.userId! },
  });

  res.status(201).json({ success: true, log });
}

// ─── getLogs — IDENTICAL TO YOUR CURRENT VERSION ─────────────────────────────

export async function getLogs(req: Request, res: Response): Promise<void> {
  const { date } = req.query;
  const whereClause: {
    userId: string;
    date?: { gte: Date; lt: Date };
  } = { userId: req.userId! };

  if (typeof date === "string") {
    const start = new Date(`${date}T00:00:00.000Z`);
    const end = new Date(`${date}T23:59:59.999Z`);
    whereClause.date = { gte: start, lt: end };
  }

  const logs = await prisma.dailyLog.findMany({
    where: whereClause,
    orderBy: { date: "desc" },
    take: 30,
  });

  res.json(logs);
}

// ─── Quick log field definitions ─────────────────────────────────────────────

interface QuickLogFieldDef {
  key: string;
  label: string;
  type: "emoji_mood" | "chips" | "slider" | "text_input";
  options?: string[];
  placeholder?: string;
}

interface QuickLogConfig {
  phase: Phase | null;
  phaseLabel: string;
  title: string;
  subtitle: string;
  dayPhaseLabel: string;
  fields: QuickLogFieldDef[];
  submitLabel: string;
  hasLoggedToday: boolean;
  todayLogId: string | null;
  isPatternBased: boolean;
}

// ─── Shared field definitions ────────────────────────────────────────────────

const FIELD_MOOD: QuickLogFieldDef = { key: "mood", label: "Mood", type: "emoji_mood", options: ["😔", "😐", "🙂", "😄"] };
const FIELD_ENERGY: QuickLogFieldDef = { key: "energy", label: "Energy", type: "chips", options: ["Low", "Medium", "High"] };
const FIELD_STRESS: QuickLogFieldDef = { key: "stress", label: "Stress", type: "chips", options: ["Low", "Moderate", "High"] };
const FIELD_FOCUS: QuickLogFieldDef = { key: "focus", label: "Today's focus", type: "text_input", placeholder: "What do you aim to achieve today?" };
const FIELD_CONFIDENCE: QuickLogFieldDef = { key: "motivation", label: "Confidence", type: "chips", options: ["Low", "Medium", "High"] };
const FIELD_FLOW: QuickLogFieldDef = { key: "padsChanged", label: "Flow today", type: "chips", options: ["Light", "Moderate", "Heavy"] };
const FIELD_PAIN: QuickLogFieldDef = { key: "pain", label: "Cramps", type: "chips", options: ["None", "Mild", "Moderate", "Severe"] };
const FIELD_CRAVINGS: QuickLogFieldDef = { key: "cravings", label: "Cravings", type: "chips", options: ["None", "Mild", "Strong"] };
const FIELD_FATIGUE: QuickLogFieldDef = { key: "fatigue", label: "Fatigue", type: "chips", options: ["Low", "Moderate", "High"] };
const FIELD_SOCIAL: QuickLogFieldDef = { key: "social", label: "Social energy", type: "chips", options: ["Withdrawn", "Neutral", "Engaged"] };

// ─── Pattern-based log config (for hormonal contraception) ───────────────────
// No phase assumptions — just track how she's feeling.

function buildPatternBasedLogConfig(): Omit<QuickLogConfig, "dayPhaseLabel" | "hasLoggedToday" | "todayLogId"> {
  return {
    phase: null,
    phaseLabel: "Your day",
    title: "Log today 📝",
    subtitle: "Quick check-in to track your patterns",
    fields: [FIELD_MOOD, FIELD_ENERGY, FIELD_STRESS, FIELD_FATIGUE],
    submitLabel: "Save today's check-in →",
    isPatternBased: true,
  };
}

// ─── Phase-based log config (for natural cycle) ─────────────────────────────

function buildPhaseBasedLogConfig(
  phase: Phase,
  _cycleDay: number,
): Omit<QuickLogConfig, "dayPhaseLabel" | "hasLoggedToday" | "todayLogId"> {
  const phaseLabels: Record<Phase, string> = {
    menstrual: "Period",
    follicular: "Follicular phase",
    ovulation: "Ovulation",
    luteal: "Luteal phase",
  };

  switch (phase) {
    case "menstrual":
      return {
        phase,
        phaseLabel: phaseLabels[phase],
        title: "Log today 🩸",
        subtitle: "Quick check-in to track your day",
        fields: [FIELD_MOOD, FIELD_FLOW, FIELD_PAIN, FIELD_ENERGY],
        submitLabel: "Save & track flow →",
        isPatternBased: false,
      };

    case "follicular":
      return {
        phase,
        phaseLabel: phaseLabels[phase],
        title: "Log today 🚀",
        subtitle: "Quick check-in to track your day",
        fields: [FIELD_MOOD, FIELD_ENERGY, FIELD_FOCUS, FIELD_CONFIDENCE],
        submitLabel: "Save & build momentum →",
        isPatternBased: false,
      };

    case "ovulation":
      return {
        phase,
        phaseLabel: phaseLabels[phase],
        title: "Log today ✨",
        subtitle: "Quick check-in to track your day",
        fields: [FIELD_MOOD, FIELD_ENERGY, FIELD_SOCIAL, FIELD_CONFIDENCE],
        submitLabel: "Save today's peak →",
        isPatternBased: false,
      };

    case "luteal":
      return {
        phase,
        phaseLabel: phaseLabels[phase],
        title: "Log today 🌙",
        subtitle: "Quick check-in to track your day",
        fields: [FIELD_MOOD, FIELD_ENERGY, FIELD_CRAVINGS, FIELD_FATIGUE],
        submitLabel: "Save & take care →",
        isPatternBased: false,
      };
  }
}

// ─── getQuickLogConfig — UPDATED ─────────────────────────────────────────────

export async function getQuickLogConfig(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const cycleMode = getCycleMode(user);
  const cyclePrediction = await getCyclePredictionContext(req.userId!, user.cycleLength);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;
  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);

  // Check contraception behavior
  const contraceptionType = resolveContraceptionType(user.contraceptiveMethod);
  const contraceptionBehavior = getContraceptionBehavior(contraceptionType);
  const showPhaseInsights = contraceptionBehavior.useNaturalCycleEngine;

  // Check if already logged today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);
  const todayLog = await prisma.dailyLog.findFirst({
    where: { userId: req.userId!, date: { gte: todayStart, lte: todayEnd } },
  });

  // Build config based on whether phase insights apply
  const config = showPhaseInsights
    ? buildPhaseBasedLogConfig(cycleInfo.phase, cycleInfo.currentDay)
    : buildPatternBasedLogConfig();

  const phaseLabels: Record<Phase, string> = {
    menstrual: "Period",
    follicular: "Follicular phase",
    ovulation: "Ovulation",
    luteal: "Luteal phase",
  };

  const dayPhaseLabel = showPhaseInsights
    ? `Day ${cycleInfo.currentDay} · ${phaseLabels[cycleInfo.phase]}`
    : `Day ${cycleInfo.currentDay}`;

  res.json({
    ...config,
    dayPhaseLabel,
    hasLoggedToday: !!todayLog,
    todayLogId: todayLog?.id ?? null,
  });
}