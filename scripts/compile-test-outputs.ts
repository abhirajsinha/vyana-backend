import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "test-output");

const EXPECTED: Record<number, { label: string; primaryDriver: string; primaryCause: string; aiEnabled: boolean; notes: string }> = {
  1:  { label: "PMS Build-Up",           primaryDriver: "sleep_below_baseline",   primaryCause: "cycle",            aiEnabled: true,  notes: "BUG: opener should use sleep_stress_amplification" },
  2:  { label: "Heavy Period Day 1",      primaryDriver: "bleeding_heavy",          primaryCause: "cycle",            aiEnabled: true,  notes: "BUG: bleeding_heavy loses score race to sleep_below_baseline" },
  3:  { label: "Ovulation High",          primaryDriver: "(none)",                  primaryCause: "cycle",            aiEnabled: true,  notes: "Watch for neutral/stable language in peak window" },
  4:  { label: "Sleep Collapse",          primaryDriver: "sleep_below_baseline",   primaryCause: "sleep_disruption", aiEnabled: true,  notes: "Best case — sleep disruption correctly overrides follicular narrative" },
  5:  { label: "Stable Normal",           primaryDriver: "(none)",                  primaryCause: "cycle",            aiEnabled: true,  notes: "Should be warm and mildly forward-looking" },
  6:  { label: "New User",                primaryDriver: "(none)",                  primaryCause: "cycle",            aiEnabled: false, notes: "Correctly gated — not a bug" },
  7:  { label: "Cross-Cycle Pattern",     primaryDriver: "sleep_below_baseline",   primaryCause: "cycle",            aiEnabled: true,  notes: "BUG: sleep_disruption misattributes cyclic pattern" },
  8:  { label: "Conflict: Stress-Led",    primaryDriver: "stress_above_baseline",  primaryCause: "stress_led",       aiEnabled: true,  notes: "Sleep is fine — stress is the sole driver" },
  9:  { label: "High Severity",           primaryDriver: "sleep_below_baseline",   primaryCause: "sleep_disruption", aiEnabled: true,  notes: "High severity — no relief messaging" },
  10: { label: "Emotional Spike",         primaryDriver: "stress_above_baseline",  primaryCause: "stress_led",       aiEnabled: true,  notes: "Sleep fine — stress→mood, not hormones" },
};

async function main() {
  const allCases = [];
  for (let i = 1; i <= 10; i++) {
    const filePath = path.join(OUT_DIR, `case-${i}-output.json`);
    if (!fs.existsSync(filePath)) {
      allCases.push({ caseId: i, status: "NOT_RUN", expected: EXPECTED[i] });
      continue;
    }
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    allCases.push({
      caseId: i,
      status: "COMPLETED",
      expected: EXPECTED[i],
      actual: {
        aiEnhanced: raw.aiEnhanced,
        aiDebug: raw.aiDebug ?? null,
        confidence: raw.confidence,
        mode: raw.mode,
        correlationPattern: raw.correlationPattern ?? null,
        primaryDriver: raw.basedOn?.priorityDrivers?.[0] ?? null,
        allDrivers: raw.basedOn?.priorityDrivers ?? [],
        interactionFlags: raw.basedOn?.interactionFlags ?? [],
        baselineDeviation: raw.basedOn?.baselineDeviation ?? [],
        crossCycleNarrative: raw.crossCycleNarrative ?? null,
        pmsWarning: raw.pmsWarning ?? null,
        numericSummary: raw.numericSummary ?? null,
        insights: raw.insights ?? {},
        memoryContext: raw.memoryContext ?? null,
        hormoneContext: raw.hormoneContext ?? null,
        basedOn: raw.basedOn ?? null,
      },
    });
  }

  const outPath = path.join(OUT_DIR, "ALL_CASES_COMPILED.json");
  fs.writeFileSync(outPath, JSON.stringify(allCases, null, 2));
  console.log(`\n✅ ALL_CASES_COMPILED.json written — share this file for full review.\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
