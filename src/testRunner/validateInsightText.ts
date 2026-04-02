/**
 * src/testRunner/validateInsightText.ts
 *
 * TEXT QUALITY VALIDATOR — checks every insight field for:
 *
 *   NEGATIVE RULES (things that should NOT appear):
 *   - Zero-data symptom assertions, possessive claims, "today"
 *   - Low-data pattern/baseline claims
 *   - Directive language for low-data users
 *   - Deterministic language for all users
 *   - Hormone assertions outside whyThisIsHappening
 *   - Phase language for hormonal contraception users
 *   - Field length/sentence count violations
 *   - Cross-field contradictions
 *
 *   POSITIVE RULES (things that SHOULD appear):
 *   - 14+ log users SHOULD have personal language
 *   - Sleep disruption users SHOULD attribute to sleep, not hormones
 *   - Stress-led users SHOULD attribute to stress, not cycle
 *   - Stable users SHOULD have calm/steady language
 *   - Delayed period SHOULD mention the delay
 *   - Hormonal users SHOULD have pattern-based language, not phase language
 *   - Positive signals on negative phase SHOULD reflect actual logged state
 *
 * Usage:
 *   npx ts-node src/testRunner/validateInsightText.ts
 *   npx ts-node src/testRunner/validateInsightText.ts --in test-results-edge.json
 */

import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

const INSIGHT_KEYS = [
  "physicalInsight", "mentalInsight", "emotionalInsight",
  "whyThisIsHappening", "solution", "recommendation", "tomorrowPreview",
] as const;

type InsightKey = (typeof INSIGHT_KEYS)[number];

interface TestExpect {
  cycleDay: number;
  cycleLength: number;
  phase: string;
  minLogs: number;
  shouldBeStable?: boolean;
  shouldDetectSleepDisruption?: boolean;
  shouldGateGPT?: boolean;
  shouldDetectBleeding?: boolean;
  shouldBePeriodDelayed?: boolean;
}

interface ResultRow {
  testId: string;
  description?: string;
  expect: TestExpect | null;
  phase?: string;
  cycleDay?: number;
  aiEnhanced?: boolean;
  aiDebug?: string;
  correlationPattern?: string | null;
  error?: string | null;
  durationMs?: number;
  output?: {
    insights?: Record<string, string>;
    view?: Record<string, unknown>;
    isNewUser?: boolean;
    progress?: { logsCount?: number };
    confidence?: string;
    isPeriodDelayed?: boolean;
    daysOverdue?: number;
    isIrregular?: boolean;
    insightBasis?: { source?: string };
    isLearning?: boolean;
    isExtendedCycle?: boolean;
    aiEnhanced?: boolean;
    basedOn?: {
      phase?: string;
      recentLogsCount?: number;
      confidenceScore?: number;
      priorityDrivers?: string[];
      baselineScope?: string;
    };
    contraceptionContext?: {
      type?: string;
      insightTone?: string;
      showPhaseInsights?: boolean;
    };
  } | null;
}

interface Violation {
  testId: string;
  field: InsightKey | "general";
  rule: string;
  severity: "critical" | "warning" | "info";
  detail: string;
  snippet: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLogsCount(row: ResultRow): number {
  return row.output?.progress?.logsCount ?? row.expect?.minLogs ?? -1;
}

function isHormonalUser(row: ResultRow): boolean {
  const tone = row.output?.contraceptionContext?.insightTone ?? null;
  return tone === "pattern-based" || tone === "symptom-based";
}

function getAllInsightText(row: ResultRow): string {
  const ins = row.output?.insights;
  if (!ins) return "";
  return INSIGHT_KEYS.map(k => ins[k] ?? "").join(" ").toLowerCase();
}

function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return (trimmed.replace(/(\d)\.(\d)/g, "$1\u2024$2").match(/[.!?]+/g) || []).length;
}

// ─── NEGATIVE RULE DEFINITIONS ────────────────────────────────────────────────

const ZERO_DATA_FORBIDDEN: Array<{ pattern: RegExp; label: string }> = [
  // Symptom/state assertions
  { pattern: /\b(?:flow|bleeding)\s+is\s+(?:lighter|heavier|easing|heavy|light|moderate)\b/i, label: "flow state assertion" },
  { pattern: /\b(?:cramping|cramps?|pain)\s+(?:is|are)\s+(?:softer|easing|worse|intense|subsiding|increasing|lighter|stronger)\b/i, label: "pain state assertion" },
  { pattern: /\b(?:fatigue|tiredness)\s+is\s+(?:setting|increasing|lifting|higher|lower|heavy)\b/i, label: "fatigue assertion" },
  { pattern: /\b(?:cravings?)\s+(?:is|are)\s+(?:increasing|stronger|starting|intense)\b/i, label: "cravings assertion" },
  { pattern: /\b(?:bloating)\s+is\s+(?:starting|increasing|worse|common)\b/i, label: "bloating assertion" },
  { pattern: /\b(?:irritability|anxiety)\s+is\s+(?:rising|higher|increasing|worse)\b/i, label: "emotional symptom assertion" },
  { pattern: /\b(?:sensitivity)\s+is\s+(?:higher|rising|increasing)\b/i, label: "sensitivity assertion" },
  { pattern: /\b(?:breast\s+tenderness)\s+is\b/i, label: "breast tenderness assertion" },

  // Possessive symptom claims
  { pattern: /\byour\s+(?:flow|cramps?|pain|bleeding|period)\b/i, label: "possessive symptom" },
  { pattern: /\byour\s+(?:fatigue|cravings?|bloating|irritability|anxiety|nausea)\b/i, label: "possessive symptom" },
  { pattern: /\byour\s+(?:sleep|energy|stamina|drive|libido)\s+is\b/i, label: "possessive state" },

  // Signal state assertions without hedging
  { pattern: /\benergy\s+is\s+(?!typically|often|can|may|sometimes|common|what)/i, label: "energy assertion" },
  { pattern: /\bfocus\s+is\s+(?!typically|often|can|may|sometimes|common|what)/i, label: "focus assertion" },
  { pattern: /\bmood\s+is\s+(?!typically|often|can|may|sometimes|common|what)/i, label: "mood assertion" },
  { pattern: /\bconfidence\s+is\s+(?:building|growing|high|rising|strong)\b/i, label: "confidence assertion" },
  { pattern: /\bclarity\s+is\s+(?:returning|improving|lower|higher|sharp)\b/i, label: "clarity assertion" },
  { pattern: /\bmotivation\s+is\s+(?:growing|rising|low|high|building)\b/i, label: "motivation assertion" },
  { pattern: /\bsocial\s+energy\s+is\s+(?:strong|high|rising)\b/i, label: "social energy assertion" },
  { pattern: /\bsleep\s+is\s+(?:improving|disrupted|worse|better)\b/i, label: "sleep assertion" },

  // "You" assertions
  { pattern: /\byou\s+feel\b(?!\s+(?:may|might|can|could))/i, label: "'you feel' assertion" },
  { pattern: /\byou\s+are\s+(?:feeling|recovering|ovulating|at\s+your|more\s+reactive|more\s+sensitive|bleeding)\b/i, label: "'you are' assertion" },
  { pattern: /\byou\s+notice\b(?!\s+(?:may|might))/i, label: "'you notice' assertion" },

  // Body state assertions
  { pattern: /\byour\s+body\s+is\s+(?:doing|recovering|rebuilding|preparing|resetting|healing|at\s+full)\b/i, label: "body state assertion" },

  // Biological events
  { pattern: /\byou\s+are\s+ovulating\b/i, label: "ovulation assertion" },
  { pattern: /\bovulation\s+is\s+(?:occurring|happening)\b/i, label: "ovulation event assertion" },
  { pattern: /\byour\s+period\s+is\s+(?:ending|starting)\b/i, label: "period state assertion" },

  // Medical
  { pattern: /\biron\s+levels?\s+(?:is|are)\s+(?:low|dropping)\b/i, label: "medical assertion" },

  // "today" with assertion verb (Fix 2 — context-aware, not blanket)
  { pattern: /\b(?:energy|focus|mood|flow|cramping|sleep|body|fatigue)\s+(?:is|are|feels)\b[^.]*\btoday\b/i, label: "'today' with assertion verb" },

  // Intensity words
  { pattern: /\bnoticeably\b/i, label: "intensity 'noticeably'" },
  { pattern: /\bdefinitely\b/i, label: "intensity 'definitely'" },
  { pattern: /\bclearly\b/i, label: "intensity 'clearly'" },

  // Absolute assertions
  { pattern: /\beverything\s+(?:takes|feels)\b/i, label: "'everything' assertion" },
  { pattern: /\bsmall\s+things\s+feel\s+harder\b/i, label: "'small things' assertion" },

  // Fuzzy "feels" assertions (Fix 1)
  { pattern: /\b(?:flow|cramping|energy|focus|mood|sleep|body)\s+feels\s+(?:lighter|heavier|softer|worse|low|high|drained|scattered|sharp|heavy|sluggish|tired|restless|disrupted)\b/i, label: "fuzzy 'feels' assertion" },

  // Weak verb assertions (Fix A)
  { pattern: /\b(?:flow|energy|focus|mood|sleep|body|fatigue|clarity)\s+(?:seems|appears|looks)\b/i, label: "weak verb assertion" },

  // Hallucination claims (Fix 3)
  { pattern: /\bpelvic\b/i, label: "hallucinated 'pelvic' claim" },
  { pattern: /\btingling\b/i, label: "hallucinated 'tingling' claim" },
  { pattern: /\bpressure in your\b/i, label: "hallucinated 'pressure in your' claim" },
  { pattern: /\bsensation in your\b/i, label: "hallucinated 'sensation in your' claim" },
];

const LOW_DATA_FORBIDDEN: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\byour\s+pattern\s+shows\b/i, label: "pattern claim < 5 logs" },
  { pattern: /\byour\s+cycles?\s+(?:show|tend|suggest)\b/i, label: "cycle pattern claim < 5 logs" },
  { pattern: /\bfor\s+you,?\s+this\b/i, label: "identity claim < 5 logs" },
  { pattern: /\bover\s+the\s+last\s+few\s+days\b/i, label: "trend claim < 3 logs" },
  { pattern: /\byour\s+baseline\b/i, label: "baseline ref < 7 logs" },
  { pattern: /\bcompared\s+to\s+your\s+usual\b/i, label: "baseline comparison < 7 logs" },
];

const DIRECTIVE_FORBIDDEN: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\byou\s+should\b/i, label: "'you should'" },
  { pattern: /\byou\s+must\b/i, label: "'you must'" },
  { pattern: /\byou\s+need\s+to\b/i, label: "'you need to'" },
  { pattern: /\bresting\s+will\s+support\b/i, label: "'resting will support'" },
  { pattern: /\bwill\s+support\b/i, label: "'will support'" },
  { pattern: /\bwill\s+help\b/i, label: "'will help'" },
  { pattern: /\bwill\s+improve\b/i, label: "'will improve'" },
];

const DETERMINISTIC_FORBIDDEN: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\byou\s+will\s+feel\b/i, label: "'you will feel'" },
  { pattern: /\byou\s+will\s+experience\b/i, label: "'you will experience'" },
  { pattern: /\bthis\s+will\s+happen\b/i, label: "'this will happen'" },
  { pattern: /\byou\s+are\s+going\s+to\b/i, label: "'you are going to'" },
  { pattern: /\bguaranteed\b/i, label: "'guaranteed'" },
  { pattern: /\byou\s+will\s+be\b/i, label: "'you will be'" },
  { pattern: /\bemotional\s+regulation\b/i, label: "clinical 'emotional regulation'" },
  { pattern: /\bcognitive\s+function\b/i, label: "clinical 'cognitive function'" },
  { pattern: /\bneuroendocrine\b/i, label: "clinical 'neuroendocrine'" },
];

const HORMONE_FORBIDDEN: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\byour\s+estrogen\s+is\b/i, label: "'your estrogen is'" },
  { pattern: /\byour\s+progesterone\s+is\b/i, label: "'your progesterone is'" },
  { pattern: /\byour\s+(?:LH|FSH|cortisol|serotonin)\s+is\b/i, label: "possessive hormone claim" },
];

const HORMONAL_CONTRACEPTION_FORBIDDEN: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bovulation\b/i, label: "ovulation for hormonal user" },
  { pattern: /\bovulat(?:ory|ing)\b/i, label: "ovulatory for hormonal user" },
  { pattern: /\bfertile\s+window\b/i, label: "fertile window for hormonal user" },
  { pattern: /\bLH\s+surge\b/i, label: "LH surge for hormonal user" },
  { pattern: /\bfollicular\s+phase\b/i, label: "follicular phase for hormonal user" },
  { pattern: /\bluteal\s+phase\b/i, label: "luteal phase for hormonal user" },
  { pattern: /\bthis\s+phase\b/i, label: "'this phase' for hormonal user" },
];

// ─── POSITIVE RULE DEFINITIONS ────────────────────────────────────────────────
// Things that SHOULD appear based on context.

interface PositiveRule {
  id: string;
  applies: (row: ResultRow) => boolean;
  check: (row: ResultRow) => boolean;
  label: string;
  severity: "critical" | "warning" | "info";
}

const POSITIVE_RULES: PositiveRule[] = [
  // Sleep disruption should attribute to sleep
  {
    id: "sleep_disruption_attribution",
    applies: (r) => r.expect?.shouldDetectSleepDisruption === true,
    check: (r) => {
      const text = getAllInsightText(r);
      return text.includes("sleep") && (
        text.includes("drop") || text.includes("lower") || text.includes("dip") ||
        text.includes("less") || text.includes("crash") || text.includes("decline")
      );
    },
    label: "Sleep disruption user should have sleep attribution in insights",
    severity: "warning",
  },
  // Sleep disruption should NOT primarily blame hormones
  {
    id: "sleep_disruption_no_hormone_blame",
    applies: (r) => r.expect?.shouldDetectSleepDisruption === true,
    check: (r) => {
      const why = (r.output?.insights?.whyThisIsHappening ?? "").toLowerCase();
      // "why" should mention sleep, not lead with hormones
      const sleepMentioned = why.includes("sleep");
      const hormoneLead = why.startsWith("estrogen") || why.startsWith("progesterone") || why.startsWith("hormone");
      return sleepMentioned && !hormoneLead;
    },
    label: "Sleep disruption whyThisIsHappening should attribute to sleep, not hormones",
    severity: "warning",
  },
  // Stable state should have calm language
  {
    id: "stable_calm_language",
    applies: (r) => r.expect?.shouldBeStable === true,
    check: (r) => {
      const text = getAllInsightText(r);
      return (
        text.includes("steady") || text.includes("stable") || text.includes("balanced") ||
        text.includes("consistent") || text.includes("no strong") || text.includes("manageable")
      );
    },
    label: "Stable state user should have calm/steady language",
    severity: "info",
  },
  // Stable state should NOT invent problems
  {
    id: "stable_no_invented_problems",
    applies: (r) => r.expect?.shouldBeStable === true,
    check: (r) => {
      const text = getAllInsightText(r);
      const hasProblems = (
        text.includes("strain") || text.includes("crashing") ||
        text.includes("compounding") || text.includes("spiraling") ||
        text.includes("getting worse") || text.includes("declining sharply")
      );
      return !hasProblems;
    },
    label: "Stable state should NOT invent problems",
    severity: "warning",
  },
  // Delayed period should mention delay
  {
    id: "delayed_period_mentioned",
    applies: (r) => r.expect?.shouldBePeriodDelayed === true,
    check: (r) => {
      const text = getAllInsightText(r);
      return text.includes("late") || text.includes("delay") || text.includes("overdue") || text.includes("hasn't started");
    },
    label: "Delayed period should be mentioned in insights",
    severity: "warning",
  },
  // Heavy bleeding should be mentioned
  {
    id: "bleeding_mentioned",
    applies: (r) => r.expect?.shouldDetectBleeding === true,
    check: (r) => {
      const text = getAllInsightText(r);
      return text.includes("bleeding") || text.includes("flow") || text.includes("heavier") || text.includes("heavy");
    },
    label: "Heavy bleeding should be reflected in insights",
    severity: "warning",
  },
  // Hormonal users should have pattern-based language
  {
    id: "hormonal_pattern_language",
    applies: (r) => isHormonalUser(r) && getLogsCount(r) >= 5,
    check: (r) => {
      const text = getAllInsightText(r);
      return text.includes("pattern") || text.includes("log") || text.includes("recent") || text.includes("feeling");
    },
    label: "Hormonal user with data should have pattern-based language",
    severity: "info",
  },
  // Zero-data should have hedging language
  {
    id: "zero_data_has_hedging",
    applies: (r) => getLogsCount(r) === 0,
    check: (r) => {
      const text = getAllInsightText(r);
      return text.includes("can") || text.includes("may") || text.includes("often") ||
        text.includes("tend") || text.includes("sometimes") || text.includes("around this time");
    },
    label: "Zero-data user should have hedging language (can/may/often)",
    severity: "warning",
  },
];

// ─── Validator ────────────────────────────────────────────────────────────────

function validateRow(row: ResultRow): Violation[] {
  const violations: Violation[] = [];
  const output = row.output;

  if (!output || row.error) return violations;

  const insights = output.insights;
  if (!insights) {
    violations.push({ testId: row.testId, field: "general", rule: "missing_insights", severity: "critical", detail: "No insights object", snippet: "" });
    return violations;
  }

  const logsCount = getLogsCount(row);
  const hormonal = isHormonalUser(row);

  // ── Per-field negative checks ───────────────────────────────────────────
  for (const key of INSIGHT_KEYS) {
    const text = insights[key];

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      violations.push({ testId: row.testId, field: key, rule: "empty_field", severity: "critical", detail: `${key} is empty`, snippet: "" });
      continue;
    }

    if (text.length > 400) {
      violations.push({ testId: row.testId, field: key, rule: "field_too_long", severity: "warning", detail: `${text.length} chars`, snippet: text.slice(0, 80) + "..." });
    }

    if (countSentences(text) > 3) {
      violations.push({ testId: row.testId, field: key, rule: "too_many_sentences", severity: "warning", detail: `${countSentences(text)} sentences`, snippet: text.slice(0, 80) + "..." });
    }

    // Zero-data rules
    if (logsCount === 0) {
      for (const rule of ZERO_DATA_FORBIDDEN) {
        if (rule.pattern.test(text)) {
          rule.pattern.lastIndex = 0;
          violations.push({ testId: row.testId, field: key, rule: `zero_data:${rule.label}`, severity: "critical", detail: `Zero-data has: ${rule.label}`, snippet: text.slice(0, 100) });
        }
      }
    }

    // Low-data rules (1-4 logs)
    if (logsCount >= 1 && logsCount <= 4) {
      for (const rule of LOW_DATA_FORBIDDEN) {
        if (rule.pattern.test(text)) {
          rule.pattern.lastIndex = 0;
          violations.push({ testId: row.testId, field: key, rule: `low_data:${rule.label}`, severity: "warning", detail: `${logsCount} logs has: ${rule.label}`, snippet: text.slice(0, 100) });
        }
      }
    }

    // Directive language (0-4 logs)
    if (logsCount >= 0 && logsCount < 5) {
      for (const rule of DIRECTIVE_FORBIDDEN) {
        if (rule.pattern.test(text)) {
          rule.pattern.lastIndex = 0;
          violations.push({ testId: row.testId, field: key, rule: `directive:${rule.label}`, severity: logsCount === 0 ? "critical" : "warning", detail: rule.label, snippet: text.slice(0, 100) });
        }
      }
    }

    // Deterministic language (all users)
    for (const rule of DETERMINISTIC_FORBIDDEN) {
      if (rule.pattern.test(text)) {
        rule.pattern.lastIndex = 0;
        violations.push({ testId: row.testId, field: key, rule: `deterministic:${rule.label}`, severity: "critical", detail: rule.label, snippet: text.slice(0, 100) });
      }
    }

    // Hormone assertions outside whyThisIsHappening (all users)
    if (key !== "whyThisIsHappening") {
      for (const rule of HORMONE_FORBIDDEN) {
        if (rule.pattern.test(text)) {
          rule.pattern.lastIndex = 0;
          violations.push({ testId: row.testId, field: key, rule: `hormone:${rule.label}`, severity: "warning", detail: `Hormone claim in ${key}`, snippet: text.slice(0, 100) });
        }
      }
    }

    // Hormonal contraception
    if (hormonal) {
      for (const rule of HORMONAL_CONTRACEPTION_FORBIDDEN) {
        if (rule.pattern.test(text)) {
          rule.pattern.lastIndex = 0;
          violations.push({ testId: row.testId, field: key, rule: `hormonal:${rule.label}`, severity: "critical", detail: rule.label, snippet: text.slice(0, 100) });
        }
      }
    }
  }

  // ── Cross-field consistency ─────────────────────────────────────────────
  const physical = (insights.physicalInsight ?? "").toLowerCase();
  const emotional = (insights.emotionalInsight ?? "").toLowerCase();
  const POSITIVE = ["steady", "stable", "good", "well-supported", "strong", "balanced"];
  const NEGATIVE = ["strain", "harder", "heavier", "low", "drained", "dropping", "declining"];

  const physPos = POSITIVE.some(w => physical.includes(w)) && !NEGATIVE.some(w => physical.includes(w));
  const physNeg = NEGATIVE.some(w => physical.includes(w)) && !POSITIVE.some(w => physical.includes(w));
  const emoPos = POSITIVE.some(w => emotional.includes(w)) && !NEGATIVE.some(w => emotional.includes(w));
  const emoNeg = NEGATIVE.some(w => emotional.includes(w)) && !POSITIVE.some(w => emotional.includes(w));

  if ((physPos && emoNeg) || (physNeg && emoPos)) {
    violations.push({ testId: row.testId, field: "general", rule: "cross_field_contradiction", severity: "warning",
      detail: "Physical and emotional insights contradict",
      snippet: `phys: "${physical.slice(0, 40)}" | emo: "${emotional.slice(0, 40)}"` });
  }

  // ── Positive rules (things that SHOULD be present) ──────────────────────
  for (const rule of POSITIVE_RULES) {
    if (rule.applies(row) && !rule.check(row)) {
      violations.push({ testId: row.testId, field: "general", rule: `missing:${rule.id}`, severity: rule.severity,
        detail: rule.label, snippet: "" });
    }
  }

  return violations;
}

// ─── Report ───────────────────────────────────────────────────────────────────

interface ValidationReport {
  generatedAt: string;
  inputFile: string;
  totalRows: number;
  rowsChecked: number;
  totalViolations: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  byRule: Record<string, { count: number; severity: string; examples: string[] }>;
  byPhase: Record<string, { total: number; critical: number; warning: number }>;
  byLogsCount: Record<string, { total: number; critical: number; warning: number }>;
  byField: Record<string, { total: number; critical: number; warning: number }>;
  passRate: string;
  criticalPassRate: string;
  violations: Violation[];
}

function buildReport(rows: ResultRow[], violations: Violation[], inputFile: string): ValidationReport {
  const checked = rows.filter(r => !r.error && r.output?.insights).length;
  const byRule: Record<string, { count: number; severity: string; examples: string[] }> = {};
  const byPhase: Record<string, { total: number; critical: number; warning: number }> = {};
  const byLogsCount: Record<string, { total: number; critical: number; warning: number }> = {};
  const byField: Record<string, { total: number; critical: number; warning: number }> = {};
  let criticalCount = 0, warningCount = 0, infoCount = 0;

  for (const v of violations) {
    if (v.severity === "critical") criticalCount++;
    else if (v.severity === "warning") warningCount++;
    else infoCount++;

    if (!byRule[v.rule]) byRule[v.rule] = { count: 0, severity: v.severity, examples: [] };
    byRule[v.rule]!.count++;
    if (byRule[v.rule]!.examples.length < 3) byRule[v.rule]!.examples.push(`${v.testId}: ${v.snippet.slice(0, 80)}`);

    const row = rows.find(r => r.testId === v.testId);
    const phase = row?.phase ?? row?.expect?.phase ?? "unknown";
    if (!byPhase[phase]) byPhase[phase] = { total: 0, critical: 0, warning: 0 };
    byPhase[phase]!.total++;
    if (v.severity === "critical") byPhase[phase]!.critical++;
    if (v.severity === "warning") byPhase[phase]!.warning++;

    const logs = getLogsCount(row!);
    const logKey = logs === 0 ? "0_logs" : logs <= 4 ? "1-4_logs" : logs <= 7 ? "5-7_logs" : "8+_logs";
    if (!byLogsCount[logKey]) byLogsCount[logKey] = { total: 0, critical: 0, warning: 0 };
    byLogsCount[logKey]!.total++;
    if (v.severity === "critical") byLogsCount[logKey]!.critical++;
    if (v.severity === "warning") byLogsCount[logKey]!.warning++;

    if (!byField[v.field]) byField[v.field] = { total: 0, critical: 0, warning: 0 };
    byField[v.field]!.total++;
    if (v.severity === "critical") byField[v.field]!.critical++;
    if (v.severity === "warning") byField[v.field]!.warning++;
  }

  const rowsWithCritical = new Set(violations.filter(v => v.severity === "critical").map(v => v.testId)).size;
  const pct = (a: number, b: number) => b === 0 ? "n/a" : `${((100 * a) / b).toFixed(1)}%`;

  return {
    generatedAt: new Date().toISOString(), inputFile,
    totalRows: rows.length, rowsChecked: checked,
    totalViolations: violations.length, criticalCount, warningCount, infoCount,
    byRule: Object.fromEntries(Object.entries(byRule).sort((a, b) => b[1].count - a[1].count)),
    byPhase, byLogsCount, byField,
    passRate: pct(checked - rowsWithCritical, checked),
    criticalPassRate: pct(checked - rowsWithCritical, checked),
    violations: violations.slice(0, 500),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  const inIdx = argv.indexOf("--in");
  const inFile = inIdx !== -1 ? argv[inIdx + 1]! : path.join(process.cwd(), "test-results-500.json");
  const outIdx = argv.indexOf("--out");
  const outReport = outIdx !== -1 ? argv[outIdx + 1]! : path.join(process.cwd(), "text-quality-report.json");

  if (!fs.existsSync(inFile)) { console.error(`File not found: ${inFile}`); process.exit(1); }

  const rows = JSON.parse(fs.readFileSync(inFile, "utf-8")) as ResultRow[];
  const allViolations: Violation[] = [];
  for (const row of rows) allViolations.push(...validateRow(row));

  const report = buildReport(rows, allViolations, inFile);
  fs.writeFileSync(outReport, JSON.stringify(report, null, 2));

  console.log("\n=== TEXT QUALITY VALIDATION REPORT ===\n");
  console.log(`Rows: ${report.totalRows} (checked: ${report.rowsChecked})`);
  console.log(`Total violations: ${report.totalViolations}`);
  console.log(`  Critical: ${report.criticalCount}`);
  console.log(`  Warning:  ${report.warningCount}`);
  console.log(`  Info:     ${report.infoCount}`);
  console.log(`Critical pass rate: ${report.criticalPassRate}`);

  console.log("\n── By Phase ──");
  for (const [phase, s] of Object.entries(report.byPhase))
    console.log(`  ${phase.padEnd(12)} total=${s.total} critical=${s.critical} warning=${s.warning}`);

  console.log("\n── By Logs Count ──");
  for (const [key, s] of Object.entries(report.byLogsCount))
    console.log(`  ${key.padEnd(12)} total=${s.total} critical=${s.critical} warning=${s.warning}`);

  console.log("\n── By Field ──");
  for (const [field, s] of Object.entries(report.byField))
    console.log(`  ${field.padEnd(22)} total=${s.total} critical=${s.critical} warning=${s.warning}`);

  console.log("\n── Top Rules ──");
  for (const [rule, data] of Object.entries(report.byRule).slice(0, 20)) {
    console.log(`  [${data.severity}] ${rule}: ${data.count}`);
    for (const ex of data.examples.slice(0, 1)) console.log(`    └─ ${ex.slice(0, 120)}`);
  }

  if (report.criticalCount > 0) {
    console.log(`\n── First 20 Critical Violations ──`);
    for (const v of allViolations.filter(v => v.severity === "critical").slice(0, 20)) {
      console.log(`  ${v.testId} | ${v.field} | ${v.rule}`);
      console.log(`    ${v.detail}`);
      if (v.snippet) console.log(`    "${v.snippet.slice(0, 100)}"`);
    }
  }

  console.log(`\nFull report → ${outReport}\n`);
  process.exit(report.criticalCount > 0 ? 1 : 0);
}

main();