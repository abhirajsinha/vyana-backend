// src/services/contraceptionTransition.ts
// Handles all side effects when a user changes contraceptive method mid-cycle.
// Called from userController.updateProfile when contraceptiveMethod changes.

import { prisma } from "../lib/prisma";
import { getCycleMode, type CycleMode } from "./cycleEngine";
import {
  resolveContraceptionType,
  getContraceptionBehavior,
  type ContraceptionType,
} from "./contraceptionengine";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ContraceptionTransitionResult {
  previousMethod: string | null;
  newMethod: string | null;
  previousCycleMode: CycleMode;
  newCycleMode: CycleMode;
  transitionType: TransitionType;
  contextMessage: string;
  cachesCleared: boolean;
  cycleHistoryMarked: boolean;
  baselineReset: boolean;
  periodStartReset: boolean;
}

export type TransitionType =
  | "natural_to_hormonal"   // Started hormonal contraception
  | "hormonal_to_natural"   // Stopped hormonal contraception
  | "hormonal_to_hormonal"  // Switched between hormonal methods
  | "natural_to_natural"    // Switched between non-hormonal methods (barrier ↔ none etc.)
  | "same_method";          // No actual change

// ─── Transition detection ─────────────────────────────────────────────────────

function classifyTransition(
  oldMethod: string | null,
  newMethod: string | null,
): TransitionType {
  if ((oldMethod ?? "none") === (newMethod ?? "none")) return "same_method";

  const oldType = resolveContraceptionType(oldMethod);
  const newType = resolveContraceptionType(newMethod);
  const oldBehavior = getContraceptionBehavior(oldType);
  const newBehavior = getContraceptionBehavior(newType);

  const oldIsHormonal = !oldBehavior.useNaturalCycleEngine;
  const newIsHormonal = !newBehavior.useNaturalCycleEngine;

  if (!oldIsHormonal && newIsHormonal) return "natural_to_hormonal";
  if (oldIsHormonal && !newIsHormonal) return "hormonal_to_natural";
  if (oldIsHormonal && newIsHormonal) return "hormonal_to_hormonal";
  return "natural_to_natural";
}

// ─── Context messages ─────────────────────────────────────────────────────────

function getTransitionMessage(
  transitionType: TransitionType,
  newMethod: string | null,
): string {
  switch (transitionType) {
    case "natural_to_hormonal":
      return (
        "You've started hormonal contraception. Your insights will now be based on " +
        "your logged patterns rather than cycle-phase predictions, since hormonal " +
        "contraception changes how your body's natural hormone cycle works. " +
        "It may take a few weeks for your body to adjust — keep logging and " +
        "we'll adapt to your new patterns."
      );

    case "hormonal_to_natural":
      return (
        "You've stopped hormonal contraception. Your natural cycle may take a few " +
        "months to regulate — cycle lengths can vary during this time, and that's " +
        "completely normal. We've reset your baseline so insights reflect your " +
        "current patterns, not data from when you were on contraception. " +
        "Log consistently and your predictions will sharpen over time."
      );

    case "hormonal_to_hormonal":
      return (
        "You've switched contraceptive methods. Your body may respond differently " +
        "to the new method — keep logging how you feel and we'll adjust your " +
        "patterns accordingly. Previous patterns from your old method have been " +
        "reset so they don't skew your insights."
      );

    case "natural_to_natural":
      return (
        "Your contraception setting has been updated. Since both methods are " +
        "non-hormonal, your cycle-phase insights will continue as before."
      );

    case "same_method":
      return "No change to your contraception setting.";
  }
}

// ─── Cache invalidation ───────────────────────────────────────────────────────

async function clearAllCaches(userId: string): Promise<void> {
  await Promise.all([
    prisma.insightCache.deleteMany({ where: { userId } }),
    prisma.healthPatternCache.deleteMany({ where: { userId } }).catch(() => {}),
  ]);
}

// ─── Mark current cycle as transitional ───────────────────────────────────────
// We close the current open cycle (if any) and mark it so cross-cycle analysis
// knows to exclude or discount this data.

async function markCycleAsTransitional(userId: string): Promise<boolean> {
  const openCycle = await prisma.cycleHistory.findFirst({
    where: { userId, endDate: null },
    orderBy: { startDate: "desc" },
  });

  if (!openCycle) return false;

  // We don't close the cycle (that happens when she logs a new period),
  // but we mark it by setting cycleLength to null — this tells the
  // prediction engine to skip this cycle in its calculations.
  // The cycle stays open; it just won't count toward averages.
  await prisma.cycleHistory.update({
    where: { id: openCycle.id },
    data: {
      // Store the transition marker — cycleLength null means "incomplete/transitional"
      // The existing code in getCyclePredictionContext already filters:
      //   cycleLength: { not: null }
      // so transitional cycles are automatically excluded from predictions.
      cycleLength: null,
    },
  });

  return true;
}

// ─── Reset baseline data ──────────────────────────────────────────────────────
// When switching between hormonal/natural, old insight memory and history
// are from a different hormonal context. We clear them so the engine
// doesn't compare apples to oranges.

async function resetBaselineData(userId: string): Promise<void> {
  await Promise.all([
    // Clear insight memory (driver streak counts)
    // Old streaks like "stress elevated 5 days" were under different hormonal context
    prisma.insightMemory.deleteMany({ where: { userId } }),

    // Clear insight history (used for cross-cycle narrative + driver recurrence)
    // Old history was generated under different cycle mode assumptions
    prisma.insightHistory.deleteMany({ where: { userId } }),
  ]);
}

// ─── Main transition handler ──────────────────────────────────────────────────

export async function handleContraceptionTransition(params: {
  userId: string;
  previousMethod: string | null;
  newMethod: string | null;
  cycleRegularity: string | null;
}): Promise<ContraceptionTransitionResult> {
  const { userId, previousMethod, newMethod, cycleRegularity } = params;

  const transitionType = classifyTransition(previousMethod, newMethod);

  // Compute cycle modes
  const previousCycleMode = getCycleMode({
    contraceptiveMethod: previousMethod ?? null,
    cycleRegularity: cycleRegularity ?? null,
  });
  const newCycleMode = getCycleMode({
    contraceptiveMethod: newMethod ?? null,
    cycleRegularity: cycleRegularity ?? null,
  });

  const contextMessage = getTransitionMessage(transitionType, newMethod);

  // No-op for same method or non-hormonal switches
  if (transitionType === "same_method") {
    return {
      previousMethod,
      newMethod,
      previousCycleMode,
      newCycleMode,
      transitionType,
      contextMessage,
      cachesCleared: false,
      cycleHistoryMarked: false,
      baselineReset: false,
      periodStartReset: false,
    };
  }

  // Always clear caches on any change
  await clearAllCaches(userId);

  // For hormonal transitions, do the full reset
  const needsFullReset =
    transitionType === "natural_to_hormonal" ||
    transitionType === "hormonal_to_natural" ||
    transitionType === "hormonal_to_hormonal";

  let cycleHistoryMarked = false;
  let baselineReset = false;

  if (needsFullReset) {
    cycleHistoryMarked = await markCycleAsTransitional(userId);
    await resetBaselineData(userId);
    baselineReset = true;

    if (transitionType === "natural_to_hormonal") {
      await prisma.user.update({
        where: { id: userId },
        data: { lastPeriodStart: new Date(), contraceptionChangedAt: new Date() },
      });
    } else if (transitionType === "hormonal_to_natural") {
      // After stopping hormonal contraception, cycles are almost always irregular
      // for 3-6 months. Force irregularity expectation.
      await prisma.user.update({
        where: { id: userId },
        data: {
          contraceptionChangedAt: new Date(),
          cycleRegularity: "not_sure",
        },
      });
    } else {
      // hormonal_to_hormonal
      await prisma.user.update({
        where: { id: userId },
        data: { contraceptionChangedAt: new Date() },
      });
    }
  }

  if (transitionType === "natural_to_natural") {
    await prisma.user.update({
      where: { id: userId },
      data: { contraceptionChangedAt: new Date() },
    });
  }

  return {
    previousMethod,
    newMethod,
    previousCycleMode,
    newCycleMode,
    transitionType,
    contextMessage,
    cachesCleared: true,
    cycleHistoryMarked,
    baselineReset,
    periodStartReset: transitionType === "natural_to_hormonal" && needsFullReset,
  };
}