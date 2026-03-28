// src/services/insightMonitor.ts
// Production shadow monitoring — captures insight generation quality signals
// without affecting the user response.
//
// Usage: call recordInsightGeneration() at the end of getInsights().
// Data is written to an InsightMonitorLog table (append-only, lightweight).
//
// This catches what tests won't:
// - GPT quality degradation over time
// - Emerging edge cases from real users
// - Guard rejection rate spikes
// - Strength regression trends

import { prisma } from "../lib/prisma";
import type { DailyInsights } from "./insightService";

export interface InsightMonitorEntry {
  userId: string;
  cycleDay: number;
  phase: string;
  cycleMode: string;

  // What happened
  aiEnhanced: boolean;
  aiDebug: string;
  draftUsed: boolean;

  // Quality signals
  draftLength: number;
  outputLength: number;
  lengthRatio: number; // output / draft — spikes indicate GPT verbosity
  guardFailure: string | null; // which guard rejected the output

  // Driver context
  primaryDriver: string | null;
  primaryCause: string;
  driverCount: number;

  // Confidence
  confidence: string;
  confidenceScore: number;
  mode: string;

  // Timing
  pipelineMs: number;
  timestamp: Date;
}

export function buildMonitorEntry(params: {
  userId: string;
  cycleDay: number;
  phase: string;
  cycleMode: string;
  aiEnhanced: boolean;
  aiDebug: string;
  draft: DailyInsights;
  output: DailyInsights;
  primaryDriver: string | null;
  primaryCause: string;
  driverCount: number;
  confidence: string;
  confidenceScore: number;
  mode: string;
  pipelineMs: number;
}): InsightMonitorEntry {
  const draftLength = JSON.stringify(params.draft).length;
  const outputLength = JSON.stringify(params.output).length;

  // Detect which guard fired (if any) from aiDebug
  const guardFailures = [
    "empty_response_fallback",
    "json_shape_fallback",
    "parse_error_fallback",
    "length_guard_fallback",
    "sentence_guard_fallback",
    "strength_guard_fallback",
    "forbidden_language",
  ];
  const guardFailure = guardFailures.includes(params.aiDebug)
    ? params.aiDebug
    : null;

  return {
    userId: params.userId,
    cycleDay: params.cycleDay,
    phase: params.phase,
    cycleMode: params.cycleMode,
    aiEnhanced: params.aiEnhanced,
    aiDebug: params.aiDebug,
    draftUsed: !params.aiEnhanced,
    draftLength,
    outputLength,
    lengthRatio: draftLength > 0 ? Math.round((outputLength / draftLength) * 100) / 100 : 0,
    guardFailure,
    primaryDriver: params.primaryDriver,
    primaryCause: params.primaryCause,
    driverCount: params.driverCount,
    confidence: params.confidence,
    confidenceScore: params.confidenceScore,
    mode: params.mode,
    pipelineMs: params.pipelineMs,
    timestamp: new Date(),
  };
}

/**
 * Write monitor entry to database. Fire-and-forget — never fails the user request.
 *
 * NOTE: This requires an InsightMonitorLog table in your Prisma schema:
 *
 *   model InsightMonitorLog {
 *     id              String   @id @default(uuid())
 *     userId          String
 *     cycleDay        Int
 *     phase           String
 *     cycleMode       String
 *     aiEnhanced      Boolean
 *     aiDebug         String
 *     draftUsed       Boolean
 *     draftLength     Int
 *     outputLength    Int
 *     lengthRatio     Float
 *     guardFailure    String?
 *     primaryDriver   String?
 *     primaryCause    String
 *     driverCount     Int
 *     confidence      String
 *     confidenceScore Float
 *     mode            String
 *     pipelineMs      Int
 *     timestamp       DateTime @default(now())
 *
 *     @@index([userId])
 *     @@index([timestamp])
 *     @@index([aiDebug])
 *     @@index([guardFailure])
 *   }
 */
export async function recordInsightGeneration(
  entry: InsightMonitorEntry,
): Promise<void> {
  try {
    // Uncomment when InsightMonitorLog table exists in schema:
    // await prisma.insightMonitorLog.create({ data: entry });

    // For now, structured console log (captured by your logging service)
    if (entry.guardFailure || !entry.aiEnhanced) {
      console.log(
        `[insight-monitor] ${entry.aiDebug} | ` +
        `day=${entry.cycleDay} phase=${entry.phase} ` +
        `driver=${entry.primaryDriver ?? "none"} ` +
        `cause=${entry.primaryCause} ` +
        `conf=${entry.confidenceScore} ` +
        `ratio=${entry.lengthRatio} ` +
        `ms=${entry.pipelineMs}`,
      );
    }
  } catch {
    // Never fail the user request
  }
}

// ─── Aggregation queries (for dashboard / weekly review) ──────────────────────
// These would run against the InsightMonitorLog table.

export interface MonitorDashboard {
  period: string;
  totalInsights: number;
  aiEnhancedRate: number;        // % where GPT improved the draft
  draftFallbackRate: number;     // % where GPT was skipped or rejected
  guardRejectionRate: number;    // % rejected by post-GPT guards
  avgPipelineMs: number;
  topGuardFailures: Array<{ guard: string; count: number }>;
  topDrivers: Array<{ driver: string; count: number }>;
  avgLengthRatio: number;
}

/**
 * Example query — run this daily/weekly to monitor quality.
 *
 * Usage:
 *   const dashboard = await getMonitorDashboard("2025-03-28");
 *   if (dashboard.guardRejectionRate > 0.15) alert("Guard rejection spike!");
 *   if (dashboard.avgPipelineMs > 2000) alert("Pipeline slow!");
 */
export async function getMonitorDashboard(
  _dateStr: string,
): Promise<MonitorDashboard | null> {
  // Placeholder — implement when InsightMonitorLog table exists
  // const dayStart = new Date(dateStr);
  // const dayEnd = new Date(dateStr);
  // dayEnd.setDate(dayEnd.getDate() + 1);
  //
  // const logs = await prisma.insightMonitorLog.findMany({
  //   where: { timestamp: { gte: dayStart, lt: dayEnd } },
  // });
  //
  // ... aggregate ...

  return null;
}

// ─── Alert thresholds ─────────────────────────────────────────────────────────
// Use these in a cron job or monitoring service.

export const ALERT_THRESHOLDS = {
  // If more than 20% of insights fall back to draft, GPT quality may be degrading
  maxDraftFallbackRate: 0.20,

  // If more than 10% hit guard rejections, the prompt or guards need tuning
  maxGuardRejectionRate: 0.10,

  // If average pipeline time exceeds 2s (excluding GPT), something is wrong
  maxAvgPipelineMs: 2000,

  // If GPT output is consistently 3x longer than draft, prompt is too permissive
  maxAvgLengthRatio: 2.5,

  // If forbidden language slips through guards, immediate investigation needed
  maxForbiddenLanguageRate: 0.0, // zero tolerance
};