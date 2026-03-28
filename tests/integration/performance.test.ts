// tests/integration/performance.test.ts
// Performance threshold tests — ensures API latency stays within acceptable bounds.
// These require a running database but mock GPT to isolate pipeline performance.
//
// Run: npx jest --testPathPattern=integration/performance
//
// NOTE: Adjust thresholds based on your infrastructure. These are reasonable
// defaults for a Supabase PostgreSQL backend.

import { randomUUID } from "crypto";

// ─── Thresholds (ms) ──────────────────────────────────────────────────────────

const THRESHOLDS = {
  // Cached responses should be fast — just a DB read
  insightsCached: 200,
  homeCached: 150,
  calendarCached: 300,

  // Uncached responses rebuild the full pipeline (minus GPT)
  // Lenient defaults: local Prisma/Postgres often exceeds tight cloud targets.
  insightsUncached: 4000,
  homeUncached: 500,
  calendarUncached: 1000,

  // Log save + cache invalidation
  saveLog: 1200,

  // Auth
  login: 500,
  register: 800,

  // Quick log config
  quickLogConfig: 2000,
};

// ─── Mock setup ───────────────────────────────────────────────────────────────

// Mock GPT to return instantly — we're testing pipeline speed, not GPT latency
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
import { getInsights } from "../../src/controllers/insightController";
import { getHomeScreen } from "../../src/controllers/homeController";
import { getCalendar } from "../../src/controllers/calendarController";
import { saveLog, getQuickLogConfig } from "../../src/controllers/logController";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function periodStartForDay(cycleDay: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - (cycleDay - 1));
  return d;
}

function mockRes(): { json: jest.Mock; status: jest.Mock; _data: unknown } {
  const res = {
    _data: null as unknown,
    json: jest.fn((data: unknown) => { res._data = data; }),
    status: jest.fn(() => ({ json: jest.fn((data: unknown) => { res._data = data; }) })),
  };
  return res;
}

async function createTestUser(): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `perf-${randomUUID().slice(0, 8)}@test.vyana`,
      name: "Perf User",
      age: 28,
      height: 165,
      weight: 58,
      cycleLength: 28,
      lastPeriodStart: periodStartForDay(14),
      cycleRegularity: "regular",
      cycleMode: "natural",
    },
  });

  // Seed 10 logs for realistic pipeline run
  for (let i = 0; i < 10; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    await prisma.dailyLog.create({
      data: {
        userId: user.id,
        date,
        mood: i < 3 ? "good" : "neutral",
        energy: i < 3 ? "high" : "moderate",
        sleep: 7.0 - i * 0.2,
        stress: i < 2 ? "low" : "moderate",
      },
    });
  }

  return user.id;
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

async function measureMs(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return Math.round(performance.now() - start);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("API performance thresholds", () => {
  let userId: string;

  beforeAll(async () => {
    userId = await createTestUser();
  });

  afterAll(async () => {
    await cleanupUser(userId);
  });

  describe("insights endpoint", () => {
    it(`uncached: < ${THRESHOLDS.insightsUncached}ms`, async () => {
      // Clear cache first
      await prisma.insightCache.deleteMany({ where: { userId } });

      const ms = await measureMs(async () => {
        const res = mockRes();
        await getInsights({ userId } as never, res as never);
        expect(res.json).toHaveBeenCalled();
      });

      console.log(`  getInsights (uncached): ${ms}ms`);
      expect(ms).toBeLessThan(THRESHOLDS.insightsUncached);
    });

    it(`cached: < ${THRESHOLDS.insightsCached}ms`, async () => {
      // First call populates cache
      const res1 = mockRes();
      await getInsights({ userId } as never, res1 as never);

      // Second call should hit cache
      const ms = await measureMs(async () => {
        const res2 = mockRes();
        await getInsights({ userId } as never, res2 as never);
        expect(res2.json).toHaveBeenCalled();
      });

      console.log(`  getInsights (cached): ${ms}ms`);
      expect(ms).toBeLessThan(THRESHOLDS.insightsCached);
    });
  });

  describe("home endpoint", () => {
    it(`< ${THRESHOLDS.homeUncached}ms`, async () => {
      const ms = await measureMs(async () => {
        const res = mockRes();
        await getHomeScreen({ userId } as never, res as never);
        expect(res.json).toHaveBeenCalled();
      });

      console.log(`  getHomeScreen: ${ms}ms`);
      expect(ms).toBeLessThan(THRESHOLDS.homeUncached);
    });
  });

  describe("calendar endpoint", () => {
    it(`< ${THRESHOLDS.calendarUncached}ms`, async () => {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const ms = await measureMs(async () => {
        const res = mockRes();
        await getCalendar(
          { userId, query: { month } } as never,
          res as never,
        );
        expect(res.json).toHaveBeenCalled();
      });

      console.log(`  getCalendar: ${ms}ms`);
      expect(ms).toBeLessThan(THRESHOLDS.calendarUncached);
    });
  });

  describe("save log + cache invalidation", () => {
    it(`< ${THRESHOLDS.saveLog}ms`, async () => {
      const ms = await measureMs(async () => {
        const res = mockRes();
        await saveLog(
          {
            userId,
            body: {
              mood: "good",
              energy: "high",
              sleep: 7.5,
              stress: "low",
            },
          } as never,
          res as never,
        );
      });

      console.log(`  saveLog: ${ms}ms`);
      expect(ms).toBeLessThan(THRESHOLDS.saveLog);
    });
  });

  describe("quick log config", () => {
    it(`< ${THRESHOLDS.quickLogConfig}ms`, async () => {
      const ms = await measureMs(async () => {
        const res = mockRes();
        await getQuickLogConfig({ userId } as never, res as never);
        expect(res.json).toHaveBeenCalled();
      });

      console.log(`  getQuickLogConfig: ${ms}ms`);
      expect(ms).toBeLessThan(THRESHOLDS.quickLogConfig);
    });
  });
});