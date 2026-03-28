/**
 * Validates test-results-500.json (or path via --in).
 * npx ts-node src/testRunner/validateResults.ts
 * npx ts-node src/testRunner/validateResults.ts --in ./my-results.json
 */

import * as fs from "fs";
import * as path from "path";
import { containsForbiddenLanguage } from "../utils/confidencelanguage";
import type { TestExpect } from "./generateTestCases";

const INSIGHT_KEYS = [
  "physicalInsight",
  "mentalInsight",
  "emotionalInsight",
  "whyThisIsHappening",
  "solution",
  "recommendation",
  "tomorrowPreview",
] as const;

type ResultRow = {
  testId: string;
  description?: string;
  expect: TestExpect | null;
  phase?: string;
  cycleDay?: number;
  aiEnhanced?: boolean;
  aiDebug?: string;
  correlationPattern?: string | null;
  error?: string | null;
  output?: Record<string, unknown> | null;
};

function parseArgs(): { inFile: string; outReport: string } {
  const argv = process.argv.slice(2);
  const inIdx = argv.indexOf("--in");
  const inFile =
    inIdx !== -1
      ? argv[inIdx + 1]!
      : path.join(process.cwd(), "test-results-500.json");
  const outIdx = argv.indexOf("--out-report");
  const outReport =
    outIdx !== -1
      ? argv[outIdx + 1]!
      : path.join(process.cwd(), "validation-report.json");
  return { inFile, outReport };
}

function allInsightsPresent(output: Record<string, unknown> | null | undefined): boolean {
  if (!output) return false;
  const ins = output.insights as Record<string, unknown> | undefined;
  if (!ins) return false;
  return INSIGHT_KEYS.every(
    (k) => typeof ins[k] === "string" && (ins[k] as string).trim().length > 0,
  );
}

function forbiddenHit(output: Record<string, unknown> | null | undefined): boolean {
  if (!output) return false;
  const ins = output.insights as Record<string, unknown> | undefined;
  if (!ins) return false;
  return INSIGHT_KEYS.some(
    (k) =>
      typeof ins[k] === "string" && containsForbiddenLanguage(ins[k] as string),
  );
}

function priorityDrivers(output: Record<string, unknown> | null | undefined): string[] {
  const based = output?.basedOn as { priorityDrivers?: string[] } | undefined;
  return based?.priorityDrivers ?? [];
}

function main() {
  const { inFile, outReport } = parseArgs();
  if (!fs.existsSync(inFile)) {
    console.error(`File not found: ${inFile}`);
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(inFile, "utf-8")) as ResultRow[];

  let phaseOk = 0;
  let phaseTotal = 0;
  let noCrashOk = 0;
  let insightsOk = 0;
  let gptGateOk = 0;
  let gptGateTotal = 0;
  let stableOk = 0;
  let stableTotal = 0;
  let sleepOk = 0;
  let sleepTotal = 0;
  let bleedOk = 0;
  let bleedTotal = 0;
  let forbiddenOk = 0;
  let cycleDayOk = 0;
  let cycleDayTotal = 0;
  let delayedOk = 0;
  let delayedTotal = 0;

  const failures: string[] = [];

  for (const r of rows) {
    const ex = r.expect;
    const out = r.output;
    const err = r.error;

    if (!err && out) noCrashOk++;

    if (!ex) continue;

    if (!err && out) {
      cycleDayTotal++;
      if (r.cycleDay === ex.cycleDay) cycleDayOk++;
      else
        failures.push(
          `${r.testId} — cycleDay: expected ${ex.cycleDay}, got ${r.cycleDay}`,
        );

      phaseTotal++;
      if (r.phase === ex.phase) phaseOk++;
      else
        failures.push(`${r.testId} — phase: expected ${ex.phase}, got ${r.phase}`);

      if (allInsightsPresent(out)) insightsOk++;
      else failures.push(`${r.testId} — missing/empty insight fields`);

      if (!forbiddenHit(out)) forbiddenOk++;
      else failures.push(`${r.testId} — forbidden deterministic language in insights`);
    }

    if (ex.shouldGateGPT && !err) {
      gptGateTotal++;
      if (r.aiEnhanced === false) gptGateOk++;
      else
        failures.push(
          `${r.testId} — GPT gating: expected aiEnhanced=false, got ${r.aiEnhanced}`,
        );
    }

    if (ex.shouldBeStable && !err) {
      stableTotal++;
      if (r.correlationPattern === "stable_state") stableOk++;
      else
        failures.push(
          `${r.testId} — stable: expected correlationPattern stable_state, got ${r.correlationPattern}`,
        );
    }

    if (ex.shouldDetectSleepDisruption && !err) {
      sleepTotal++;
      if (r.correlationPattern === "sleep_disruption_primary") sleepOk++;
      else
        failures.push(
          `${r.testId} — sleep disruption: expected sleep_disruption_primary, got ${r.correlationPattern}`,
        );
    }

    if (ex.shouldDetectBleeding && !err) {
      bleedTotal++;
      const drivers = priorityDrivers(out);
      if (drivers.includes("bleeding_heavy")) bleedOk++;
      else
        failures.push(
          `${r.testId} — bleeding: bleeding_heavy not in drivers [${drivers.slice(0, 5).join(", ")}]`,
        );
    }

    if (ex.shouldBePeriodDelayed && !err) {
      delayedTotal++;
      const home = out?.home as { isPeriodDelayed?: boolean } | undefined;
      const top = typeof out?.isPeriodDelayed === "boolean" ? out.isPeriodDelayed : undefined;
      if (top === true || home?.isPeriodDelayed === true) delayedOk++;
      else
        failures.push(
          `${r.testId} — period delayed: expected isPeriodDelayed true (slim response or merged home)`,
        );
    }
  }

  const n = rows.length;
  const withExpect = rows.filter((r) => r.expect).length;

  const pct = (a: number, b: number) =>
    b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`;

  const report = {
    generatedAt: new Date().toISOString(),
    inputFile: inFile,
    totalRows: n,
    rowsWithExpect: withExpect,
    summary: {
      noCrash: { pass: noCrashOk, total: n, rate: pct(noCrashOk, n) },
      phaseCorrect: { pass: phaseOk, total: phaseTotal, rate: pct(phaseOk, phaseTotal) },
      cycleDayCorrect: {
        pass: cycleDayOk,
        total: cycleDayTotal,
        rate: pct(cycleDayOk, cycleDayTotal),
      },
      insightsPresent: {
        pass: insightsOk,
        total: phaseTotal,
        rate: pct(insightsOk, phaseTotal),
      },
      noForbiddenLanguage: {
        pass: forbiddenOk,
        total: phaseTotal,
        rate: pct(forbiddenOk, phaseTotal),
      },
      gptGating: {
        pass: gptGateOk,
        total: gptGateTotal,
        rate: pct(gptGateOk, gptGateTotal),
      },
      stableState: {
        pass: stableOk,
        total: stableTotal,
        rate: pct(stableOk, stableTotal),
      },
      sleepDisruption: {
        pass: sleepOk,
        total: sleepTotal,
        rate: pct(sleepOk, sleepTotal),
      },
      bleedingHeavy: {
        pass: bleedOk,
        total: bleedTotal,
        rate: pct(bleedOk, bleedTotal),
      },
      periodDelayed: {
        pass: delayedOk,
        total: delayedTotal,
        rate: pct(delayedOk, delayedTotal),
      },
    },
    failureCount: failures.length,
    failures: failures.slice(0, 200),
  };

  fs.writeFileSync(outReport, JSON.stringify(report, null, 2));

  console.log("\n=== VALIDATION REPORT ===\n");
  console.log(`Rows: ${n} (with expect: ${withExpect})`);
  console.log(`No crashes:              ${noCrashOk}/${n} (${pct(noCrashOk, n)})`);
  console.log(
    `Phase correctness:       ${phaseOk}/${phaseTotal} (${pct(phaseOk, phaseTotal)})`,
  );
  console.log(
    `Cycle day correct:       ${cycleDayOk}/${cycleDayTotal} (${pct(cycleDayOk, cycleDayTotal)})`,
  );
  console.log(
    `Insights present:        ${insightsOk}/${phaseTotal} (${pct(insightsOk, phaseTotal)})`,
  );
  console.log(
    `No forbidden language:   ${forbiddenOk}/${phaseTotal} (${pct(forbiddenOk, phaseTotal)})`,
  );
  console.log(
    `GPT gating correct:      ${gptGateOk}/${gptGateTotal} (${pct(gptGateOk, gptGateTotal)})`,
  );
  console.log(
    `Stable detection:        ${stableOk}/${stableTotal} (${pct(stableOk, stableTotal)})`,
  );
  console.log(
    `Sleep disruption:        ${sleepOk}/${sleepTotal} (${pct(sleepOk, sleepTotal)})`,
  );
  console.log(
    `Bleeding detection:      ${bleedOk}/${bleedTotal} (${pct(bleedOk, bleedTotal)})`,
  );
  console.log(
    `Period delayed flag:     ${delayedOk}/${delayedTotal} (${pct(delayedOk, delayedTotal)})`,
  );
  console.log(`\nFailures (showing up to 200): ${failures.length}`);
  failures.slice(0, 30).forEach((f) => console.log(`  ${f}`));
  if (failures.length > 30) console.log(`  ... and ${failures.length - 30} more`);
  console.log(`\nFull report → ${outReport}\n`);
}

main();
