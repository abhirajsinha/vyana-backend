// tests/integration/forecastEndpoint.test.ts
// Integration tests for the forecast endpoint (getInsightsForecast).
// Requires a running database. GPT is mocked.

jest.setTimeout(30_000);

import { randomUUID } from "crypto";

// ─── Mock GPT ────────────────────────────────────────────────────────────────

jest.mock("../../src/services/aiService", () => {
  const original = jest.requireActual("../../src/services/aiService");
  return {
    ...original,
    generateInsightsWithGpt: jest.fn().mockResolvedValue({
      insights: {
        physicalInsight: "Mocked physical insight.",
        mentalInsight: "Mocked mental insight.",
        emotionalInsight: "Mocked emotional insight.",
        whyThisIsHappening: "Mocked reason.",
        solution: "Mocked solution.",
        recommendation: "Mocked recommendation.",
        tomorrowPreview: "Mocked preview.",
      },
      status: "accepted",
    }),
    generateForecastWithGpt: jest.fn().mockImplementation(
      (_ctx: unknown, draft: unknown) => Promise.resolve(draft),
    ),
  };
});

import { prisma } from "../../src/lib/prisma";
import { getInsightsForecast } from "../../src/controllers/insightController";
import { containsForbiddenLanguage } from "../../src/utils/confidencelanguage";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function periodStartForDay(cycleDay: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - (cycleDay - 1));
  return d;
}

function mockRes(): { json: jest.Mock; status: jest.Mock; _data: unknown } {
  const res = {
    _data: null as unknown,
    json: jest.fn((data: unknown) => {
      res._data = data;
    }),
    status: jest.fn((_code: number) => ({
      json: jest.fn((data: unknown) => {
        res._data = { error: data, status: _code };
      }),
    })),
  };
  return res;
}

interface UserOverrides {
  contraceptiveMethod?: string | null;
  cycleMode?: string;
  cycleRegularity?: string;
}

async function createTestUser(overrides: UserOverrides = {}): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `forecast-${randomUUID().slice(0, 8)}@test.vyana`,
      name: "Forecast Test User",
      age: 28,
      height: 165,
      weight: 58,
      cycleLength: 28,
      lastPeriodStart: periodStartForDay(14),
      cycleRegularity: "regular",
      cycleMode: "natural",
      ...overrides,
    },
  });
  return user.id;
}

async function seedLogs(
  userId: string,
  count: number,
  options: { sameDay?: boolean } = {},
): Promise<void> {
  for (let i = 0; i < count; i++) {
    const date = new Date();
    if (!options.sameDay) {
      date.setDate(date.getDate() - i);
    }
    await prisma.dailyLog.create({
      data: {
        userId,
        date,
        mood: i < 3 ? "good" : "neutral",
        energy: i < 3 ? "high" : "moderate",
        sleep: 7.0 - i * 0.15,
        stress: i < 2 ? "low" : "moderate",
      },
    });
  }
}

async function cleanupUser(userId: string): Promise<void> {
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

describe("Forecast endpoint (getInsightsForecast)", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    for (const uid of userIds) {
      await cleanupUser(uid).catch(() => {});
    }
  }, 60_000);

  // 1. < 7 logs → warmup
  it("returns warmup when user has < 7 logs", async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    await seedLogs(userId, 3);

    const res = mockRes();
    await getInsightsForecast({ userId } as never, res as never);

    const data = res._data as Record<string, unknown>;
    expect(data.available).toBe(false);
    expect(data.reason).toBe("insufficient_logs");
    expect(typeof data.warmupMessage).toBe("string");
    expect((data.warmupMessage as string).length).toBeGreaterThan(0);
    // 3/7 * 100 = ~43
    expect(data.progressPercent).toBe(Math.round((3 / 7) * 100));
  });

  // 2. 7 logs same day → insufficient spread
  it("returns insufficient_spread when 7 logs are all on the same day", async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    await seedLogs(userId, 7, { sameDay: true });

    const res = mockRes();
    await getInsightsForecast({ userId } as never, res as never);

    const data = res._data as Record<string, unknown>;
    expect(data.available).toBe(false);
    expect(data.reason).toBe("insufficient_spread");
  });

  // 3. Eligible (10 logs, 10 days) → full forecast
  it("returns full forecast for eligible user with 10 logs across 10 days", async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    await seedLogs(userId, 10);

    const res = mockRes();
    await getInsightsForecast({ userId } as never, res as never);

    const data = res._data as Record<string, unknown>;
    expect(data.available).toBe(true);

    const forecast = data.forecast as {
      tomorrow: { outlook: string; date: string };
      confidence: { level: string; score: number };
    };
    expect(forecast.tomorrow.outlook).toBeTruthy();
    expect(typeof forecast.tomorrow.outlook).toBe("string");
    expect(forecast.tomorrow.outlook.length).toBeGreaterThan(0);

    expect(["low", "medium", "high"]).toContain(forecast.confidence.level);

    // No forbidden deterministic language
    expect(containsForbiddenLanguage(forecast.tomorrow.outlook)).toBe(false);
  });

  // 4. Hormonal user → restricted forecast mode
  it("returns restricted forecast for hormonal (pill) user", async () => {
    const userId = await createTestUser({
      contraceptiveMethod: "pill",
      cycleMode: "hormonal",
    });
    userIds.push(userId);
    await seedLogs(userId, 10);

    const res = mockRes();
    await getInsightsForecast({ userId } as never, res as never);

    const data = res._data as Record<string, unknown>;
    expect(data.available).toBe(true);

    const forecast = data.forecast as {
      nextPhase: unknown;
      confidence: { level: string };
    };
    expect(forecast.nextPhase).toBeNull();

    const contraceptionContext = data.contraceptionContext as {
      forecastMode: string;
    };
    expect(contraceptionContext.forecastMode).toBe("pattern");
  });

  // 5. Cached forecast → same date on second call
  it("returns cached forecast on second call with same date", async () => {
    const userId = await createTestUser();
    userIds.push(userId);
    await seedLogs(userId, 10);

    const res1 = mockRes();
    await getInsightsForecast({ userId } as never, res1 as never);
    const data1 = res1._data as Record<string, unknown>;

    const res2 = mockRes();
    await getInsightsForecast({ userId } as never, res2 as never);
    const data2 = res2._data as Record<string, unknown>;

    const forecast1 = data1.forecast as { tomorrow: { date: string } };
    const forecast2 = data2.forecast as { tomorrow: { date: string } };
    expect(forecast2.tomorrow.date).toBe(forecast1.tomorrow.date);
  });

  // 6. Zero logs → warmup, no crash
  it("returns warmup without crashing when user has 0 logs", async () => {
    const userId = await createTestUser();
    userIds.push(userId);

    const res = mockRes();
    await getInsightsForecast({ userId } as never, res as never);

    const data = res._data as Record<string, unknown>;
    expect(data.available).toBe(false);
    // Should not have an error status
    expect(data).not.toHaveProperty("status");
    expect(res.json).toHaveBeenCalled();
  });
});
