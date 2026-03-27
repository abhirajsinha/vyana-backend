/**
 * Seeds a user: menstrual cycle day 2, 7 days of identical logs (same fields each day).
 * Runs the same insight + GPT path as GET /api/insights (minus view/memory/history side effects).
 *
 * "Second cycle" here = narrative: logs span into the prior cycle window; cycleNumber is from
 * getCycleNumber(lastPeriodStart) (epoch-based), not "user's 2nd period" literally.
 *
 * Usage: npx ts-node --transpile-only scripts/test-gpt-menstrual-day2-second-cycle.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import {
  calculateCycleInfo,
  calculateCycleInfoForDate,
} from "../src/services/cycleEngine";
import {
  buildInsightContext,
  generateRuleBasedInsights,
} from "../src/services/insightService";
import { generateInsightsWithGpt, sanitizeInsights } from "../src/services/aiService";
import { getUserInsightData, getPreviousCycleDriverHistory } from "../src/services/insightData";
import { getCycleNumber } from "../src/services/cycleInsightLibrary";
import { runCorrelationEngine } from "../src/services/correlationEngine";
import { buildTomorrowPreview } from "../src/services/tomorrowEngine";

const SAME_LOG = {
  mood: "low",
  energy: "low",
  stress: "high",
  sleep: 5.5,
  exercise: "none",
  padsChanged: 6,
  symptoms: ["cramps"] as string[],
  pain: "moderate",
};

async function main() {
  const now = new Date();
  const lastPeriodStart = new Date(now.getTime() - 36 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      email: `gpt-menstrual-d2-${Date.now()}@local.test`,
      name: "Cycle Test",
      age: 28,
      height: 165,
      weight: 60,
      cycleLength: 28,
      lastPeriodStart,
    },
  });

  const dayMs = 86400000;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() - i * dayMs);
    d.setUTCHours(12, 0, 0, 0);
    await prisma.dailyLog.create({
      data: {
        userId: user.id,
        date: d,
        ...SAME_LOG,
      },
    });
  }

  const data = await getUserInsightData(user.id);
  if (!data) throw new Error("getUserInsightData failed");

  const { user: u, recentLogs, baselineLogs } = data;
  const cycleInfo = calculateCycleInfo(u.lastPeriodStart, u.cycleLength);
  const cycleNumber = getCycleNumber(u.lastPeriodStart, u.cycleLength);
  const variantIndex = (cycleNumber % 3) as 0 | 1 | 2;

  const phaseBaselineLogs = baselineLogs.filter((log) => {
    const logPhase = calculateCycleInfoForDate(
      u.lastPeriodStart,
      new Date(log.date),
      u.cycleLength,
    ).phase;
    return logPhase === cycleInfo.phase;
  });
  const hasPhaseBaseline = phaseBaselineLogs.length >= 7;
  const baselineForComparison = hasPhaseBaseline ? phaseBaselineLogs : baselineLogs;
  const baselineScope = hasPhaseBaseline
    ? "phase"
    : baselineForComparison.length >= 7
      ? "global"
      : "none";

  const context = buildInsightContext(
    cycleInfo.phase,
    cycleInfo.currentDay,
    recentLogs,
    baselineForComparison,
    baselineScope,
    cycleNumber,
  );

  const ruleBased = generateRuleBasedInsights(context);
  const tomorrowPreview = buildTomorrowPreview(
    context,
    cycleInfo.daysUntilNextPhase,
    variantIndex,
  );
  let draftInsights = { ...ruleBased, tomorrowPreview };

  const previousCycleDrivers =
    context.mode === "personalized"
      ? await getPreviousCycleDriverHistory(user.id)
      : [];
  const correlation = runCorrelationEngine(context, recentLogs, previousCycleDrivers);

  if (
    correlation.patternKey &&
    correlation.confidence >= 0.7 &&
    context.mode === "personalized"
  ) {
    const patternResult = correlation.patterns[correlation.patternKey]!;
    draftInsights = {
      ...draftInsights,
      physicalInsight: patternResult.headline,
      solution: patternResult.action,
    };
  }

  const logsCount = recentLogs.length;
  const canUseAI =
    logsCount >= 3 &&
    context.mode === "personalized" &&
    context.confidence !== "low";

  let insights = draftInsights;
  let aiEnhanced = false;
  if (canUseAI) {
    try {
      const raw = await generateInsightsWithGpt(context, draftInsights, u.name);
      insights = sanitizeInsights(raw, draftInsights);
      aiEnhanced = JSON.stringify(insights) !== JSON.stringify(draftInsights);
    } catch (e) {
      console.error("GPT call failed:", e);
      insights = draftInsights;
    }
  }

  console.log(
    JSON.stringify(
      {
        scenario: {
          phase: cycleInfo.phase,
          cycleDay: cycleInfo.currentDay,
          cycleNumber,
          variantIndex,
          logsCount,
          mode: context.mode,
          confidence: context.confidence,
          canUseAI,
          aiEnhanced,
          sameLogFields: SAME_LOG,
        },
        correlationPattern: correlation.patternKey,
        draftInsights,
        gptInsights: insights,
      },
      null,
      2,
    ),
  );

  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
