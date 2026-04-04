import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import "../types/express";
import { prisma } from "../lib/prisma";
import { testCases as manualTestCases } from "./testCases";
import {
  generateAllTestCases,
  type GeneratedTestCase,
  type TestExpect,
} from "./generateTestCases";
import { generateEdgeCases } from "./generateEdgeCases";

import { getInsights, getInsightsContext } from "../controllers/insightController";
import { toUTCDateOnly } from "../services/cycleEngine";

const CLEANUP = true;
const DEFAULT_OUT = "test-results-500.json";
const SAVE_EVERY = 50;

type RunnableCase = {
  id: string;
  description: string;
  user: Record<string, unknown>;
  logs: Array<Record<string, unknown>>;
  expect?: TestExpect;
};

function parseArgs(): {
  source: "manual" | "generated" | "edge";
  batch: number | null;
  offset: number;
  outFile: string;
} {
  const argv = process.argv.slice(2);
  const rawSource = argv[argv.indexOf("--source") + 1];
  const source: "manual" | "generated" | "edge" =
    rawSource === "generated" ? "generated" : rawSource === "edge" ? "edge" : "manual";
  const batchIdx = argv.indexOf("--batch");
  const batch =
    batchIdx !== -1 ? Math.max(1, parseInt(argv[batchIdx + 1] ?? "500", 10)) : null;
  const offsetIdx = argv.indexOf("--offset");
  const offset =
    offsetIdx !== -1 ? Math.max(0, parseInt(argv[offsetIdx + 1] ?? "0", 10)) : 0;
  const outIdx = argv.indexOf("--out");
  const outFile = outIdx !== -1 ? argv[outIdx + 1] ?? DEFAULT_OUT : DEFAULT_OUT;
  return { source, batch, offset, outFile };
}

function loadCases(source: "manual" | "generated" | "edge", batch: number | null, offset: number = 0): RunnableCase[] {
  if (source === "manual") {
    const list = manualTestCases as unknown as RunnableCase[];
    return batch ? list.slice(offset, offset + batch) : list.slice(offset);
  }
  if (source === "edge") {
    const gen = generateEdgeCases();
    const sliced = batch ? gen.slice(offset, offset + batch) : gen.slice(offset);
    return sliced.map((c) => ({
      id: c.id,
      description: c.description,
      user: { ...c.user, lastPeriodStart: c.user.lastPeriodStart },
      logs: c.logs.map((l) => ({ ...l, date: l.date })),
      expect: c.expect,
    }));
  }
  const gen = generateAllTestCases() as GeneratedTestCase[];
  const sliced = batch ? gen.slice(offset, offset + batch) : gen.slice(offset);
  return sliced.map((c) => ({
    id: c.id,
    description: c.description,
    user: { ...c.user, lastPeriodStart: c.user.lastPeriodStart },
    logs: c.logs.map((l) => ({ ...l, date: l.date })),
    expect: c.expect,
  }));
}

async function cleanupUser(userId: string) {
  await prisma.insightCache.deleteMany({ where: { userId } });
  await prisma.insightMemory.deleteMany({ where: { userId } });
  await prisma.insightHistory.deleteMany({ where: { userId } });
  await prisma.chatMessage.deleteMany({ where: { userId } });
  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.dailyLog.deleteMany({ where: { userId } });
  // Tables may not exist in all environments — safe to skip
  await prisma.cycleHistory.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.healthPatternCache.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } });
}

function writeResults(file: string, results: unknown[]) {
  fs.writeFileSync(file, JSON.stringify(results, null, 2));
}

/**
 * Re-anchor a test case's dates to the current UTC midnight so that long-
 * running batches that cross midnight don't produce a +1 cycle-day drift.
 * Preserves the relative day offsets between lastPeriodStart / log dates
 * and "today" as computed at generation time.
 */
function reanchorDates(test: RunnableCase, genMidnight: number): RunnableCase {
  const nowMidnight = toUTCDateOnly(new Date());
  const shiftMs = nowMidnight - genMidnight;
  if (shiftMs === 0) return test; // same day — no shift needed

  const shift = (d: unknown): Date => {
    const orig = d instanceof Date ? d : new Date(d as string | number);
    return new Date(orig.getTime() + shiftMs);
  };

  return {
    ...test,
    user: {
      ...test.user,
      lastPeriodStart: shift(test.user.lastPeriodStart),
    },
    logs: test.logs.map((l) => ({ ...l, date: shift(l.date) })),
  };
}

async function run() {
  const { source, batch, offset, outFile } = parseArgs();
  const cases = loadCases(source, batch, offset);
  const total = cases.length;
  const results: unknown[] = [];
  const resolvedOut = path.isAbsolute(outFile)
    ? outFile
    : path.join(process.cwd(), outFile);
  // Capture the UTC midnight at generation time so we can detect clock rollover
  const genMidnight = toUTCDateOnly(new Date());

  console.log(
    `\n▶ Test runner: source=${source}, cases=${total}, out=${resolvedOut}\n`,
  );

  for (let i = 0; i < cases.length; i++) {
    const test = reanchorDates(cases[i]!, genMidnight);
    const label = `[${i + 1}/${total}]`;
    const t0 = Date.now();
    let jsonResponse: unknown = null;
    let contextResponse: unknown = null;
    let error: string | undefined;

    try {
      const user = await prisma.user.create({
        data: {
          ...(test.user as object),
          email: `${test.id}-${Date.now()}-${randomUUID().slice(0, 8)}@test.vyana`,
        } as Parameters<typeof prisma.user.create>[0]["data"],
      });

      for (const log of test.logs) {
        await prisma.dailyLog.create({
          data: {
            id: randomUUID(),
            userId: user.id,
            ...(log as object),
          } as Parameters<typeof prisma.dailyLog.create>[0]["data"],
        });
      }

      const mockReq: { userId: string } = { userId: user.id };
      const mockRes = {
        json: (data: unknown) => {
          jsonResponse = data;
        },
        status: (_code: number) => ({
          json: (data: unknown) => {
            jsonResponse = { error: data, status: _code };
          },
        }),
      };

      await getInsights(mockReq as never, mockRes as never);

      const ctxRes = {
        json: (data: unknown) => {
          contextResponse = data;
        },
        status: (_code: number) => ({
          json: (data: unknown) => {
            contextResponse = { error: data, status: _code };
          },
        }),
      };
      await getInsightsContext(mockReq as never, ctxRes as never);

      if (CLEANUP) {
        await cleanupUser(user.id);
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      console.error(`${label} ❌ ${test.id}: ${error}`);
    }

    const output = jsonResponse as Record<string, unknown> | null;
    const ctxOut = contextResponse as Record<string, unknown> | null;
    const basedOn = ctxOut?.basedOn as
      | { phase?: string; priorityDrivers?: string[] }
      | undefined;
    const drivers = basedOn?.priorityDrivers ?? [];
    const mergedOutput =
      output && ctxOut && !("status" in (ctxOut ?? {}))
        ? {
            ...output,
            correlationPattern: ctxOut.correlationPattern ?? null,
            basedOn: ctxOut.basedOn ?? null,
            home: {
              phase: basedOn?.phase,
              primaryDriver: drivers[0] ?? null,
              isPeriodDelayed: output.isPeriodDelayed,
            },
          }
        : output;

    const durationMs = Date.now() - t0;
    const row = {
      testId: test.id,
      description: test.description,
      expect: test.expect ?? null,
      phase: basedOn?.phase ?? (output as { home?: { phase?: string } })?.home?.phase,
      cycleDay: (output as { cycleDay?: number })?.cycleDay,
      primaryDriver: drivers[0] ?? (output as { home?: { primaryDriver?: string | null } })?.home
        ?.primaryDriver,
      aiEnhanced: (output as { aiEnhanced?: boolean })?.aiEnhanced,
      aiDebug: (ctxOut?.aiDebug as string | undefined) ?? (output as { aiDebug?: string })?.aiDebug,
      correlationPattern:
        (ctxOut?.correlationPattern as string | null | undefined) ??
        (output as { correlationPattern?: string | null })?.correlationPattern,
      durationMs,
      error: error ?? null,
      output: mergedOutput ?? output ?? null,
    };

    results.push(row);

    const dbg = row.aiDebug ?? "n/a";
    const st = error ? "ERROR" : row.aiEnhanced ? "GPT" : String(dbg);
    console.log(`${label} ${test.id} ...${st} (${(durationMs / 1000).toFixed(1)}s)`);

    if ((i + 1) % SAVE_EVERY === 0 || i === cases.length - 1) {
      writeResults(resolvedOut, results);
      console.log(`   (checkpoint saved ${results.length} rows → ${resolvedOut})`);
    }
  }

  console.log(`\n🎯 Done. ${results.length} results → ${resolvedOut}`);
}

run().catch((err) => {
  console.error("❌ Error running tests:", err);
  process.exit(1);
});
