/**
 * Seeds a throwaway user: menstrual cycle day 2, 25 historical logs, then runs the
 * same insight pipeline as GET /api/insights (draft → GPT rewrite → sanitize → view).
 *
 * Requires DATABASE_URL and OPENAI_API_KEY (see .env).
 *
 * Usage: npm run demo:insights
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
import { getUserInsightData } from "../src/services/insightData";
import { buildInsightView } from "../src/services/insightView";

const moods = ["low", "medium", "high"] as const;
const energies = ["low", "medium", "high"] as const;
const stresses = ["low", "medium", "high"] as const;

async function main() {
  const now = new Date();
  const lastPeriodStart = new Date(now.getTime() - 36 * 60 * 60 * 1000);

  const user = await prisma.user.create({
    data: {
      email: `demo-menstrual-${Date.now()}@local.test`,
      name: "Alex",
      age: 29,
      height: 165,
      weight: 62,
      cycleLength: 28,
      lastPeriodStart,
    },
  });

  const dayMs = 86400000;
  for (let i = 0; i < 25; i++) {
    const d = new Date(now.getTime() - i * dayMs);
    d.setUTCHours(12, 0, 0, 0);
    const seed = (i * 7) % 11;
    await prisma.dailyLog.create({
      data: {
        userId: user.id,
        date: d,
        mood: moods[seed % 3],
        energy: energies[(seed + 1) % 3],
        stress: stresses[(seed + 2) % 3],
        sleep: 6 + (seed % 25) / 10,
        pain: seed % 4 === 0 ? "mild" : seed % 4 === 1 ? "moderate" : "low",
        padsChanged: 3 + (seed % 5),
        symptoms: seed % 3 === 0 ? ["cramps", "bloating"] : ["fatigue"],
      },
    });
  }

  const data = await getUserInsightData(user.id);
  if (!data) throw new Error("getUserInsightData failed");

  const { user: u, recentLogs, baselineLogs } = data;
  const cycleInfo = calculateCycleInfo(u.lastPeriodStart, u.cycleLength);
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
    recentLogs,
    baselineForComparison,
    baselineScope,
  );
  const draftInsights = generateRuleBasedInsights(context);
  const rawGpt = await generateInsightsWithGpt(context, draftInsights, u.name);
  const insights = sanitizeInsights(rawGpt, draftInsights);
  const view = buildInsightView(context, insights);

  const aiEnhanced = JSON.stringify(insights) !== JSON.stringify(draftInsights);

  console.log(
    JSON.stringify(
      {
        scenario: {
          phase: cycleInfo.phase,
          cycleDay: cycleInfo.currentDay,
          baselineLogsTotal: baselineLogs.length,
          recentLogsCount: recentLogs.length,
          mode: context.mode,
          confidence: context.confidence,
        },
        aiEnhanced,
        draftInsights,
        aiInsights: insights,
        view,
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
