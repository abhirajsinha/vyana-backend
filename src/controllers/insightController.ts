import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { calculateCycleInfo } from "../services/cycleEngine";
import { buildInsightContext, generateRuleBasedInsights } from "../services/insightService";
import { rewriteInsightsWithGpt } from "../services/aiService";

export async function getInsights(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const recentLogs = await prisma.dailyLog.findMany({
    where: { userId: req.userId },
    orderBy: { date: "desc" },
    take: 5,
  });

  const cycleInfo = calculateCycleInfo(user.lastPeriodStart, user.cycleLength);
  const context = buildInsightContext(cycleInfo.phase, recentLogs);
  const draftInsights = generateRuleBasedInsights(context);

  let insights = draftInsights;
  let aiEnhanced = false;
  try {
    insights = await rewriteInsightsWithGpt(context, draftInsights, user.name);
    aiEnhanced = insights !== draftInsights;
  } catch {
    insights = draftInsights;
  }

  res.json({
    mode: context.mode,
    confidence: context.confidence,
    aiEnhanced,
    basedOn: {
      phase: cycleInfo.phase,
      recentLogsCount: recentLogs.length,
      trends: context.trends,
      reasoning: context.reasoning,
    },
    insights,
  });
}
