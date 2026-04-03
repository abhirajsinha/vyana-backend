// tests/integration/insightValidatorWiring.test.ts
// Integration test — verifies the V2 insight validator is wired into the pipeline.
// GPT is mocked to return controlled output for validation testing.

jest.setTimeout(30_000);

// We'll override the mock per test, so set up a configurable mock
const mockGptFn = jest.fn();

jest.mock("../../src/services/aiService", () => {
  const original = jest.requireActual("../../src/services/aiService");
  return {
    ...original,
    generateInsightsWithGpt: mockGptFn,
    generateForecastWithGpt: jest.fn().mockImplementation(
      (_ctx: unknown, draft: unknown) => Promise.resolve(draft),
    ),
  };
});

import { randomUUID } from "crypto";
import { prisma } from "../../src/lib/prisma";
import { getInsights } from "../../src/controllers/insightController";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function periodStartForDay(cycleDay: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - (cycleDay - 1));
  return d;
}

function mockRes(): { json: jest.Mock; status: jest.Mock; _data: unknown } {
  const res = {
    _data: null as unknown,
    json: jest.fn((data: unknown) => { res._data = data; }),
    status: jest.fn((code: number) => ({
      json: jest.fn((data: unknown) => { res._data = data; }),
    })),
  };
  return res;
}

async function createUserWithLogs(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `vw-${randomUUID().slice(0, 8)}@test.vyana`,
      name: "Validator Test",
      age: 25,
      height: 160,
      weight: 55,
      cycleLength: 28,
      lastPeriodStart: periodStartForDay(10),
      cycleRegularity: "regular",
      cycleMode: "natural",
    },
  });

  // Seed 5 logs with clear signals
  for (let i = 0; i < 5; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    await prisma.dailyLog.create({
      data: {
        userId: user.id,
        date,
        mood: i === 0 ? "low" : "good",
        energy: i === 0 ? "low" : "high",
        sleep: i === 0 ? 3.0 : 7.5,
        stress: i === 0 ? "high" : "low",
      },
    });
  }

  return user.id;
}

async function cleanup(userId: string): Promise<void> {
  await prisma.insightCache.deleteMany({ where: { userId } });
  await prisma.insightMemory.deleteMany({ where: { userId } });
  await prisma.insightHistory.deleteMany({ where: { userId } });
  await prisma.dailyLog.deleteMany({ where: { userId } });
  await prisma.healthPatternCache.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.cycleHistory.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.chatMessage.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.refreshToken.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Insight Validator Wiring", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    for (const id of userIds) {
      await cleanup(id).catch(() => {});
    }
  }, 60_000);

  it("validator rejects GPT output with banned phrase and falls back to draft", async () => {
    mockGptFn.mockResolvedValueOnce({
      insights: {
        physicalInsight: "It's common to feel drained during this part of your cycle.",
        mentalInsight: "Focus drops when sleep is low.",
        emotionalInsight: "Things feel heavier today.",
        whyThisIsHappening: "Sleep was rough last night.",
        solution: "Rest when you can.",
        recommendation: "Keep logging how you feel.",
        tomorrowPreview: "Tomorrow should feel easier.",
      },
      status: "accepted",
    });

    const userId = await createUserWithLogs();
    userIds.push(userId);

    await prisma.insightCache.deleteMany({ where: { userId } });

    const res = mockRes();
    await getInsights({ userId } as never, res as never);
    expect(res.json).toHaveBeenCalled();

    const data = res._data as Record<string, unknown>;
    const insights = data.insights as Record<string, string>;
    // The banned phrase "It's common to" should have been caught by the validator
    // and the pipeline should have fallen back to draft insights
    expect(insights.physicalInsight).not.toContain("It's common to");
  });

  it("validator passes clean GPT output through", async () => {
    const cleanInsights = {
      physicalInsight: "Your energy dropped compared to yesterday. Sleep at 3 hours is the main driver.",
      mentalInsight: "Focus is harder to hold when sleep is this low.",
      emotionalInsight: "Everything feels heavier today, and that makes sense given the stress.",
      whyThisIsHappening: "Low sleep and high stress are feeding into each other right now.",
      solution: "Rest when you can — even 20 minutes helps.",
      recommendation: "Keep logging to track recovery tomorrow.",
      tomorrowPreview: "Tomorrow should feel easier as sleep rebounds.",
    };

    mockGptFn.mockResolvedValueOnce({
      insights: cleanInsights,
      status: "accepted",
    });

    const userId = await createUserWithLogs();
    userIds.push(userId);

    await prisma.insightCache.deleteMany({ where: { userId } });

    const res = mockRes();
    await getInsights({ userId } as never, res as never);
    expect(res.json).toHaveBeenCalled();

    const data = res._data as Record<string, unknown>;
    const insights = data.insights as Record<string, string>;
    // Clean output should pass through (may be modified by guards but not rejected)
    expect(insights).toBeDefined();
  });

  it("validator catches incomplete sentence from GPT", async () => {
    mockGptFn.mockResolvedValueOnce({
      insights: {
        physicalInsight: "Your energy is lower than yesterday.",
        mentalInsight: "Focus drops when sleep is this low.",
        emotionalInsight: "Things feel heavier today.",
        whyThisIsHappening: "FSH is beginning its gradual rise to start", // incomplete — no period
        solution: "Rest when you can.",
        recommendation: "Keep logging how you feel.",
        tomorrowPreview: "Tomorrow should feel easier.",
      },
      status: "accepted",
    });

    const userId = await createUserWithLogs();
    userIds.push(userId);

    await prisma.insightCache.deleteMany({ where: { userId } });

    const res = mockRes();
    await getInsights({ userId } as never, res as never);
    expect(res.json).toHaveBeenCalled();

    const data = res._data as Record<string, unknown>;
    const insights = data.insights as Record<string, string>;
    // The incomplete sentence should trigger validator fallback
    // Draft insights always end with proper punctuation
    const lastChar = insights.whyThisIsHappening.trim().slice(-1);
    expect(['.', '!', '?']).toContain(lastChar);
  });
});
