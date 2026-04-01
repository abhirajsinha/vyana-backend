// src/controllers/userController.ts
// CHANGE SUMMARY: Added updateProfile endpoint.
// getMe is 100% identical to current version.

import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { toPublicUser } from "../utils/userPublic";
import { getCycleMode } from "../services/cycleEngine";
import { isCycleLengthDays } from "../types/cycleUser";
import { handleContraceptionTransition } from "../services/contraceptionTransition";

// ─── GET /api/user/me — IDENTICAL TO CURRENT ─────────────────────────────────

export async function getMe(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(toPublicUser(user));
}

// ─── PUT /api/user/profile — NEW ─────────────────────────────────────────────
// Updates user profile fields. Handles contraception transitions with full
// cache invalidation, cycle history marking, and baseline reset.
//
// Updatable fields:
//   - name, age, height, weight
//   - cycleLength, cycleRegularity
//   - contraceptiveMethod (triggers transition handling)
//   - lastPeriodStart
//
// Request body: only include fields you want to change.
// Response: updated user + transition info (if contraception changed).

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId! } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const {
    name,
    age,
    height,
    weight,
    cycleLength,
    cycleRegularity,
    contraceptiveMethod,
    lastPeriodStart,
  } = req.body;

  // ── Validate fields if provided ────────────────────────────────────────────

  if (cycleLength !== undefined && !isCycleLengthDays(cycleLength)) {
    res.status(400).json({ error: "Cycle length must be between 21 and 45 days" });
    return;
  }

  if (lastPeriodStart !== undefined) {
    const parsed = new Date(lastPeriodStart);
    if (Number.isNaN(parsed.getTime())) {
      res.status(400).json({ error: "Invalid lastPeriodStart date" });
      return;
    }
    if (parsed > new Date()) {
      res.status(400).json({ error: "lastPeriodStart cannot be in the future" });
      return;
    }
  }

  const validRegularities = ["regular", "irregular", "not_sure"];
  if (
    cycleRegularity !== undefined &&
    typeof cycleRegularity === "string" &&
    !validRegularities.includes(cycleRegularity)
  ) {
    res.status(400).json({
      error: `cycleRegularity must be one of: ${validRegularities.join(", ")}`,
    });
    return;
  }

  // ── Detect contraception change ────────────────────────────────────────────

  const contraceptionChanged =
    contraceptiveMethod !== undefined &&
    (contraceptiveMethod ?? null) !== (user.contraceptiveMethod ?? null);

  let transitionResult = null;

  if (contraceptionChanged) {
    transitionResult = await handleContraceptionTransition({
      userId: req.userId!,
      previousMethod: user.contraceptiveMethod,
      newMethod:
        typeof contraceptiveMethod === "string" ? contraceptiveMethod : null,
      cycleRegularity:
        typeof cycleRegularity === "string"
          ? cycleRegularity
          : user.cycleRegularity,
    });
  }

  // ── Build update data ──────────────────────────────────────────────────────

  const updateData: Record<string, unknown> = {};

  if (name !== undefined && typeof name === "string" && name.trim()) {
    updateData.name = name.trim();
  }
  if (age !== undefined) {
    updateData.age = Number(age);
  }
  if (height !== undefined) {
    updateData.height = Number(height);
  }
  if (weight !== undefined) {
    updateData.weight = Number(weight);
  }
  if (cycleLength !== undefined) {
    updateData.cycleLength = Number(cycleLength);
  }
  if (cycleRegularity !== undefined) {
    updateData.cycleRegularity =
      typeof cycleRegularity === "string" ? cycleRegularity : null;
  }
  if (contraceptiveMethod !== undefined) {
    updateData.contraceptiveMethod =
      typeof contraceptiveMethod === "string" ? contraceptiveMethod : null;
  }
  if (lastPeriodStart !== undefined) {
    updateData.lastPeriodStart = new Date(lastPeriodStart);
  }

  // Recompute cycleMode if relevant fields changed
  if (
    contraceptiveMethod !== undefined ||
    cycleRegularity !== undefined
  ) {
    const effectiveContraceptive =
      contraceptiveMethod !== undefined
        ? typeof contraceptiveMethod === "string"
          ? contraceptiveMethod
          : null
        : user.contraceptiveMethod;
    const effectiveRegularity =
      cycleRegularity !== undefined
        ? typeof cycleRegularity === "string"
          ? cycleRegularity
          : null
        : user.cycleRegularity;

    updateData.cycleMode = getCycleMode({
      contraceptiveMethod: effectiveContraceptive,
      cycleRegularity: effectiveRegularity,
    });
  }

  if (Object.keys(updateData).length === 0 && !contraceptionChanged) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  // ── Perform update ─────────────────────────────────────────────────────────

  const updated = await prisma.user.update({
    where: { id: req.userId! },
    data: updateData as Parameters<typeof prisma.user.update>[0]["data"],
  });

  // ── Invalidate caches if non-contraception fields changed ──────────────────
  // (contraception transition already cleared caches)

  const cycleSensitiveFieldChanged =
    cycleLength !== undefined ||
    lastPeriodStart !== undefined ||
    cycleRegularity !== undefined;

  if (cycleSensitiveFieldChanged && !contraceptionChanged) {
    await Promise.all([
      prisma.insightCache.deleteMany({ where: { userId: req.userId! } }),
      prisma.healthPatternCache
        .deleteMany({ where: { userId: req.userId! } })
        .catch(() => {}),
    ]);
  }

  // ── Response ───────────────────────────────────────────────────────────────

  const response: Record<string, unknown> = {
    user: toPublicUser(updated),
  };

  if (transitionResult) {
    response.contraceptionTransition = {
      transitionType: transitionResult.transitionType,
      previousMethod: transitionResult.previousMethod,
      newMethod: transitionResult.newMethod,
      previousCycleMode: transitionResult.previousCycleMode,
      newCycleMode: transitionResult.newCycleMode,
      contextMessage: transitionResult.contextMessage,
      baselineReset: transitionResult.baselineReset,
      periodStartReset: transitionResult.periodStartReset,
    };
  }

  res.json(response);
}