import fs from "fs";
import path from "path";
import "dotenv/config";

const BASE_URL = process.env.API_BASE_URL ?? "http://localhost:3000";
const OUT_DIR = path.join(process.cwd(), "test-output");

const CHECKS: Record<number, Array<{ desc: string; fn: (r: any) => boolean }>> = {
  1: [
    { desc: "aiEnhanced=true",                           fn: r => r.aiEnhanced === true },
    { desc: "sleep_stress_amplification in interactions", fn: r => r.basedOn?.interactionFlags?.includes("sleep_stress_amplification") },
    { desc: "physicalInsight does NOT lead with 'period'",fn: r => !/your period/i.test(r.insights?.physicalInsight ?? "") },
    { desc: "tomorrowPreview mentions period/relief",     fn: r => /period|relief|ease/i.test(r.insights?.tomorrowPreview ?? "") },
  ],
  2: [
    { desc: "aiEnhanced=true",                            fn: r => r.aiEnhanced === true },
    { desc: "bleeding_heavy in priority drivers",         fn: r => r.basedOn?.priorityDrivers?.includes("bleeding_heavy") },
    { desc: "physicalInsight mentions flow/bleed [BUG may fail]", fn: r => /flow|bleed|heavier/i.test(r.insights?.physicalInsight ?? "") },
  ],
  3: [
    { desc: "aiEnhanced=true",                            fn: r => r.aiEnhanced === true },
    { desc: "no negative priority drivers",               fn: r => (r.basedOn?.priorityDrivers?.length ?? 0) === 0 },
    { desc: "physicalInsight has positive energy language",fn: r => /energy|peak|strong|high/i.test(r.insights?.physicalInsight ?? "") },
    { desc: "physicalInsight has no strain/low language",  fn: r => !/strain|low energy|tired|dropping/i.test(r.insights?.physicalInsight ?? "") },
  ],
  4: [
    { desc: "aiEnhanced=true",                            fn: r => r.aiEnhanced === true },
    { desc: "correlationPattern=sleep_disruption_primary",fn: r => r.correlationPattern === "sleep_disruption_primary" },
    { desc: "physicalInsight mentions sleep drop",         fn: r => /sleep|drop|dropped/i.test(r.insights?.physicalInsight ?? "") },
    { desc: "whyThisIsHappening does NOT mention iron/post-period", fn: r => !/iron|post.period|post period/i.test(r.insights?.whyThisIsHappening ?? "") },
    { desc: "recommendation does NOT say 'take on harder things'",  fn: r => !/take on harder|energy is rising|momentum/i.test(r.insights?.recommendation ?? "") },
  ],
  5: [
    { desc: "aiEnhanced=true",                            fn: r => r.aiEnhanced === true },
    { desc: "no priority drivers",                        fn: r => (r.basedOn?.priorityDrivers?.length ?? 0) === 0 },
    { desc: "no negative framing in physicalInsight",     fn: r => !/strain|low|declining|poor/i.test(r.insights?.physicalInsight ?? "") },
  ],
  6: [
    { desc: "aiEnhanced=false",                           fn: r => r.aiEnhanced === false },
    { desc: "confidence=low",                             fn: r => r.confidence === "low" },
    { desc: "aiDebug=gated",                              fn: r => r.aiDebug === "gated" },
    { desc: "isNewUser=true",                             fn: r => r.isNewUser === true },
  ],
  7: [
    { desc: "aiEnhanced=true",                            fn: r => r.aiEnhanced === true },
    { desc: "crossCycleNarrative exists",                 fn: r => r.crossCycleNarrative !== null },
    { desc: "whyThisIsHappening does NOT say 'not about your cycle' [BUG may fail]", fn: r => !/this isn.t about your cycle/i.test(r.insights?.whyThisIsHappening ?? "") },
  ],
  8: [
    { desc: "aiEnhanced=true",                            fn: r => r.aiEnhanced === true },
    { desc: "stress_above_baseline is top driver",        fn: r => r.basedOn?.priorityDrivers?.[0] === "stress_above_baseline" },
    { desc: "physicalInsight does NOT mention sleep drop", fn: r => !/sleep.*drop|sleep.*low|sleep.*declin/i.test(r.insights?.physicalInsight ?? "") },
    { desc: "whyThisIsHappening mentions stress",         fn: r => /stress/i.test(r.insights?.whyThisIsHappening ?? "") },
  ],
  9: [
    { desc: "aiEnhanced=true",                            fn: r => r.aiEnhanced === true },
    { desc: "physicalInsight has sleep numbers",          fn: r => /\d\.?\d?h|hours/i.test(r.insights?.physicalInsight ?? "") },
    { desc: "emotionalInsight has no relief messaging",   fn: r => !/closer to the easier|relief is|hardest stretch is almost/i.test(r.insights?.emotionalInsight ?? "") },
  ],
  10: [
    { desc: "aiEnhanced=true",                            fn: r => r.aiEnhanced === true },
    { desc: "stress_above_baseline is top driver",        fn: r => r.basedOn?.priorityDrivers?.[0] === "stress_above_baseline" },
    { desc: "whyThisIsHappening mentions stress",         fn: r => /stress/i.test(r.insights?.whyThisIsHappening ?? "") },
    { desc: "physicalInsight does NOT mention sleep",     fn: r => !/sleep/i.test(r.insights?.physicalInsight ?? "") },
  ],
};

async function main() {
  const args = process.argv.slice(2);
  const caseIdx = args.indexOf("--case");
  const singleId = caseIdx !== -1 ? parseInt(args[caseIdx + 1] ?? "0", 10) : null;

  const tokensPath = path.join(OUT_DIR, "tokens.json");
  if (!fs.existsSync(tokensPath)) {
    console.error("❌ tokens.json not found. Run seed-test-cases.ts first.");
    process.exit(1);
  }

  const tokens = JSON.parse(fs.readFileSync(tokensPath, "utf-8")) as Record<number, string>;
  const caseIds = singleId ? [singleId] : Object.keys(tokens).map(Number).sort((a, b) => a - b);
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n🔍 Fetching insights for ${caseIds.length} case(s)...\n`);
  const summaries: unknown[] = [];

  for (const id of caseIds) {
    const token = tokens[id];
    if (!token) { console.log(`⚠️  No token for case ${id}`); continue; }

    try {
      const res = await fetch(`${BASE_URL}/api/insights`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as Record<string, unknown>;

      fs.writeFileSync(path.join(OUT_DIR, `case-${id}-output.json`), JSON.stringify(data, null, 2));

      const checks = CHECKS[id] ?? [];
      let pass = 0; let fail = 0;
      const checkLines: string[] = [];
      for (const c of checks) {
        const ok = (() => { try { return c.fn(data); } catch { return false; } })();
        if (ok) { pass++; checkLines.push(`  ✅ ${c.desc}`); }
        else { fail++; checkLines.push(`  ❌ ${c.desc}`); }
      }

      const ins = (data as any).insights ?? {};
      const status = fail === 0 ? "✅ PASS" : `⚠️  ${pass}/${pass+fail}`;
      console.log(`${status} — CASE ${id}`);
      console.log(`  aiEnhanced: ${(data as any).aiEnhanced} | aiDebug: ${(data as any).aiDebug ?? "n/a"} | drivers: ${((data as any).basedOn?.priorityDrivers ?? []).slice(0,3).join(", ")||"none"}`);
      console.log(`  PHYSICAL:  ${ins.physicalInsight ?? ""}`);
      console.log(`  MENTAL:    ${ins.mentalInsight ?? ""}`);
      console.log(`  EMOTIONAL: ${ins.emotionalInsight ?? ""}`);
      console.log(`  WHY:       ${ins.whyThisIsHappening ?? ""}`);
      console.log(`  SOLUTION:  ${ins.solution ?? ""}`);
      console.log(`  TOMORROW:  ${ins.tomorrowPreview ?? ""}`);
      checkLines.forEach(l => console.log(l));
      console.log();

      summaries.push({ caseId: id, pass, fail, status: fail===0?"PASS":"PARTIAL",
        aiEnhanced: (data as any).aiEnhanced, aiDebug: (data as any).aiDebug,
        primaryDriver: (data as any).basedOn?.priorityDrivers?.[0] ?? null,
        insights: ins });
    } catch (e) {
      console.log(`❌ CASE ${id}: ${e}`);
      summaries.push({ caseId: id, status: "ERROR", error: String(e) });
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summaries, null, 2));
  console.log(`\n📄 Summary → test-output/summary.json`);
  console.log(`Next: npx ts-node scripts/compile-test-outputs.ts\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
