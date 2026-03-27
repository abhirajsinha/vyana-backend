// src/controllers/logController.ts
// CHANGE SUMMARY: Only ONE thing added — getQuickLogConfig function at the bottom.
// saveLog and getLogs are 100% identical to your current version.

import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { calculateCycleInfo, getCycleMode, type Phase } from "../services/cycleEngine";
import { getCyclePredictionContext } from "../services/insightData";

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

  const log = await prisma.dailyLog.create({
    data: {
      userId: req.userId!,
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
    },
  });

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

// ─── getQuickLogConfig — NEW ADDITION ────────────────────────────────────────
// Called when the home screen CTA is tapped — returns phase-dependent
// bottom sheet config. Nothing below this line existed before.

interface QuickLogFieldDef {
  key: string;
  label: string;
  type: "emoji_mood" | "chips" | "slider" | "text_input";
  options?: string[];
  placeholder?: string;
}

interface QuickLogConfig {
  phase: Phase;
  phaseLabel: string;
  title: string;
  subtitle: string;
  dayPhaseLabel: string;
  fields: QuickLogFieldDef[];
  submitLabel: string;
  hasLoggedToday: boolean;
  todayLogId: string | null;
}

function buildQuickLogConfig(phase: Phase, cycleDay: number): Omit<QuickLogConfig, "dayPhaseLabel" | "hasLoggedToday" | "todayLogId"> {
  const phaseLabels: Record<Phase, string> = {
    menstrual: "Period", follicular: "Follicular phase",
    ovulation: "Ovulation", luteal: "Luteal phase",
  };

  const mood: QuickLogFieldDef = { key: "mood", label: "Mood", type: "emoji_mood", options: ["😔", "😐", "🙂", "😄"] };
  const energy: QuickLogFieldDef = { key: "energy", label: "Energy", type: "chips", options: ["Low", "Medium", "High"] };

  switch (phase) {
    case "menstrual":
      return {
        phase, phaseLabel: phaseLabels[phase],
        title: "Log today 🩸",
        subtitle: "Quick check-in to track your day",
        fields: [
          mood,
          { key: "padsChanged", label: "Flow today", type: "chips", options: ["Light", "Moderate", "Heavy"] },
          { key: "pain", label: "Cramps", type: "chips", options: ["None", "Mild", "Moderate", "Severe"] },
          energy,
        ],
        submitLabel: "Save & track flow →",
      };

    case "follicular":
      return {
        phase, phaseLabel: phaseLabels[phase],
        title: "Log today 🚀",
        subtitle: "Quick check-in to track your day",
        fields: [
          mood, energy,
          { key: "focus", label: "Today's focus", type: "text_input", placeholder: "What do you aim to achieve today?" },
          { key: "motivation", label: "Confidence", type: "chips", options: ["Low", "Medium", "High"] },
        ],
        submitLabel: "Save & build momentum →",
      };

    case "ovulation":
      return {
        phase, phaseLabel: phaseLabels[phase],
        title: "Log today ✨",
        subtitle: "Quick check-in to track your day",
        fields: [
          mood, energy,
          { key: "social", label: "Social energy", type: "chips", options: ["Withdrawn", "Neutral", "Engaged"] },
          { key: "motivation", label: "Confidence", type: "chips", options: ["Low", "Medium", "High"] },
        ],
        submitLabel: "Save today's peak →",
      };

    case "luteal":
      return {
        phase, phaseLabel: phaseLabels[phase],
        title: "Log today 🌙",
        subtitle: "Quick check-in to track your day",
        fields: [
          mood, energy,
          { key: "cravings", label: "Cravings", type: "chips", options: ["None", "Mild", "Strong"] },
          { key: "fatigue", label: "Fatigue", type: "chips", options: ["Low", "Moderate", "High"] },
        ],
        submitLabel: "Save & build momentum →",
      };
  }
}

export async function getQuickLogConfig(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const cycleMode = getCycleMode(user);
  const cyclePrediction = await getCyclePredictionContext(req.userId!, user.cycleLength);
  const effectiveCycleLength = cyclePrediction.avgLength || user.cycleLength;
  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, effectiveCycleLength, cycleMode);

  // Check if already logged today
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);
  const todayLog = await prisma.dailyLog.findFirst({
    where: { userId: req.userId!, date: { gte: todayStart, lte: todayEnd } },
  });

  const phaseLabels: Record<Phase, string> = {
    menstrual: "Period", follicular: "Follicular phase",
    ovulation: "Ovulation", luteal: "Luteal phase",
  };

  const config = buildQuickLogConfig(cycleInfo.phase, cycleInfo.currentDay);

  res.json({
    ...config,
    dayPhaseLabel: `Day ${cycleInfo.currentDay} · ${phaseLabels[cycleInfo.phase]}`,
    hasLoggedToday: !!todayLog,
    todayLogId: todayLog?.id ?? null,
  });
}