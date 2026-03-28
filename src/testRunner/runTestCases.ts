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

import { getInsights, getInsightsContext } from "../controllers/insightController";

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
  source: "manual" | "generated";
  batch: number | null;
  outFile: string;
} {
  const argv = process.argv.slice(2);
  const source: "manual" | "generated" =
    argv[argv.indexOf("--source") + 1] === "generated" ? "generated" : "manual";
  const batchIdx = argv.indexOf("--batch");
  const batch =
    batchIdx !== -1 ? Math.max(1, parseInt(argv[batchIdx + 1] ?? "500", 10)) : null;
  const outIdx = argv.indexOf("--out");
  const outFile = outIdx !== -1 ? argv[outIdx + 1] ?? DEFAULT_OUT : DEFAULT_OUT;
  return { source, batch, outFile };
}

function loadCases(source: "manual" | "generated", batch: number | null): RunnableCase[] {
  if (source === "manual") {
    const list = manualTestCases as unknown as RunnableCase[];
    return batch ? list.slice(0, batch) : list;
  }
  const gen = generateAllTestCases() as GeneratedTestCase[];
  const sliced = batch ? gen.slice(0, batch) : gen;
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

async function run() {
  const { source, batch, outFile } = parseArgs();
  const cases = loadCases(source, batch);
  const total = cases.length;
  const results: unknown[] = [];
  const resolvedOut = path.isAbsolute(outFile)
    ? outFile
    : path.join(process.cwd(), outFile);

  console.log(
    `\n▶ Test runner: source=${source}, cases=${total}, out=${resolvedOut}\n`,
  );

  for (let i = 0; i < cases.length; i++) {
    const test = cases[i]!;
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
