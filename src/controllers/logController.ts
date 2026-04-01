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

// ─── Input validation constants ─────────────────────────────────────────────

const VALID_MOOD = new Set(["great", "good", "okay", "low", "bad", "terrible", "happy", "sad", "anxious", "calm", "irritable", "neutral", "positive", "negative", "stressed"]);
const VALID_ENERGY = new Set(["low", "medium", "high", "very_low", "very_high"]);
const VALID_STRESS = new Set(["low", "moderate", "high", "calm", "mild", "elevated", "severe"]);

function validateLogFields(body: Record<string, unknown>): string | null {
  if (body.sleep !== undefined) {
    const s = Number(body.sleep);
    if (!Number.isFinite(s) || s < 0 || s > 24) return "sleep must be between 0 and 24";
  }
  if (body.padsChanged !== undefined) {
    const p = Number(body.padsChanged);
    if (!Number.isFinite(p) || p < 0 || p > 50) return "padsChanged must be between 0 and 50";
  }
  if (body.mood !== undefined && typeof body.mood === "string") {
    if (!VALID_MOOD.has(body.mood.trim().toLowerCase())) return `Invalid mood value: ${body.mood}`;
  }
  if (body.energy !== undefined && typeof body.energy === "string") {
    if (!VALID_ENERGY.has(body.energy.trim().toLowerCase())) return `Invalid energy value: ${body.energy}`;
  }
  if (body.stress !== undefined && typeof body.stress === "string") {
    if (!VALID_STRESS.has(body.stress.trim().toLowerCase())) return `Invalid stress value: ${body.stress}`;
  }
  return null;
}

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

  const validationError = validateLogFields(req.body);
  if (validationError) {
    res.status(400).json({ error: validationError });
    return;
  }

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

// ─── editLog — PUT /api/logs/:id ────────────────────────────────────────────

export async function editLog(req: Request, res: Response): Promise<void> {
  const id = req.params.id as string;
  if (!id) {
    res.status(400).json({ error: "Log ID is required" });
    return;
  }

  const existing = await prisma.dailyLog.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Log not found" });
    return;
  }
  if (existing.userId !== req.userId) {
    res.status(403).json({ error: "Not authorized to edit this log" });
    return;
  }

  const {
    mood, energy, sleep, stress, diet, exercise, activity,
    symptoms, focus, motivation, pain, social, cravings, fatigue, padsChanged,
  } = req.body;

  const editValidationError = validateLogFields(req.body);
  if (editValidationError) {
    res.status(400).json({ error: editValidationError });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (mood !== undefined) updateData.mood = mood;
  if (energy !== undefined) updateData.energy = energy;
  if (sleep !== undefined) updateData.sleep = sleep;
  if (stress !== undefined) updateData.stress = stress;
  if (diet !== undefined) updateData.diet = diet;
  if (exercise !== undefined) updateData.exercise = exercise;
  if (activity !== undefined) updateData.activity = activity;
  if (symptoms !== undefined) updateData.symptoms = symptoms;
  if (focus !== undefined) updateData.focus = focus;
  if (motivation !== undefined) updateData.motivation = motivation;
  if (pain !== undefined) updateData.pain = pain;
  if (social !== undefined) updateData.social = social;
  if (cravings !== undefined) updateData.cravings = cravings;
  if (fatigue !== undefined) updateData.fatigue = fatigue;
  if (padsChanged !== undefined) updateData.padsChanged = padsChanged;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const updated = await prisma.dailyLog.update({
    where: { id },
    data: updateData,
  });

  // Invalidate caches so next fetch recomputes
  await prisma.insightCache.deleteMany({ where: { userId: req.userId! } });
  await prisma.healthPatternCache.deleteMany({ where: { userId: req.userId! } }).catch(() => {});

  res.json({ success: true, log: updated });
}

// ─── quickCheckIn — POST /api/logs/quick-check-in ───────────────────────────

export async function quickCheckIn(req: Request, res: Response): Promise<void> {
  const { mood, energy, sleep, stress, pain, fatigue } = req.body;

  // Validate at least one field is provided
  if (
    mood === undefined && energy === undefined && sleep === undefined &&
    stress === undefined && pain === undefined && fatigue === undefined
  ) {
    res.status(400).json({ error: "At least one field is required" });
    return;
  }

  // Validate ranges
  const quickValidationError = validateLogFields(req.body);
  if (quickValidationError) {
    res.status(400).json({ error: quickValidationError });
    return;
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);

  const existingLog = await prisma.dailyLog.findFirst({
    where: { userId: req.userId!, date: { gte: todayStart, lte: todayEnd } },
  });

  const logData: Record<string, unknown> = {};
  const fieldsLogged: string[] = [];
  if (mood !== undefined) { logData.mood = mood; fieldsLogged.push("mood"); }
  if (energy !== undefined) { logData.energy = energy; fieldsLogged.push("energy"); }
  if (sleep !== undefined) { logData.sleep = Number(sleep); fieldsLogged.push("sleep"); }
  if (stress !== undefined) { logData.stress = stress; fieldsLogged.push("stress"); }
  if (pain !== undefined) { logData.pain = pain; fieldsLogged.push("pain"); }
  if (fatigue !== undefined) { logData.fatigue = fatigue; fieldsLogged.push("fatigue"); }

  const log = existingLog
    ? await prisma.dailyLog.update({ where: { id: existingLog.id }, data: logData })
    : await prisma.dailyLog.create({ data: { userId: req.userId!, ...logData } });

  // Invalidate caches
  await prisma.insightCache.deleteMany({ where: { userId: req.userId! } });
  await prisma.healthPatternCache.deleteMany({ where: { userId: req.userId! } }).catch(() => {});

  res.status(201).json({ success: true, fieldsLogged, log });
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