// tests/integration/crossEndpointIntegration.test.ts
// Integration test: verifies cycleDay/phase agreement across getInsights, getHomeScreen, getCalendar.

jest.setTimeout(30_000);

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

import { randomUUID } from "crypto";
import { prisma } from "../../src/lib/prisma";
import { getInsights } from "../../src/controllers/insightController";
import { getHomeScreen } from "../../src/controllers/homeController";
import { getCalendar } from "../../src/controllers/calendarController";
import { periodStartForDay, daysAgo } from "../helpers/factories";

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function createTestUser(overrides: Record<string, unknown> = {}): Promise<string> {
  const user = await prisma.user.create({
    data: {
      email: `test-${randomUUID().slice(0, 8)}@test.vyana`,
      name: "Test User",
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

async function seedLogs(userId: string, count: number): Promise<void> {
  const logs = Array.from({ length: count }, (_, i) => ({
    userId,
    date: daysAgo(i),
    mood: "neutral",
    energy: "moderate",
    sleep: 7.0,
    stress: "moderate",
    symptoms: [] as string[],
  }));
  await prisma.dailyLog.createMany({ data: logs });
}

async function cleanupUser(userId: string): Promise<void> {
  await prisma.insightCache.deleteMany({ where: { userId } });
  await prisma.insightMemory.deleteMany({ where: { userId } });
  await prisma.insightHistory.deleteMany({ where: { userId } });
  await prisma.chatMessage.deleteMany({ where: { userId } });
  await prisma.refreshToken.deleteMany({ where: { userId } });
  await prisma.dailyLog.deleteMany({ where: { userId } });
  await prisma.cycleHistory.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.healthPatternCache.deleteMany({ where: { userId } }).catch(() => {});
  await prisma.user.delete({ where: { id: userId } });
}

function mockReq(userId: string, query: Record<string, string> = {}): {
  userId: string;
  query: Record<string, string>;
} {
  return { userId, query } as unknown as { userId: string; query: Record<string, string> };
}

function mockRes(): { json: jest.Mock; status: jest.Mock; _data: unknown } {
  const res = {
    _data: null as unknown,
    json: jest.fn((data: unknown) => { res._data = data; }),
    status: jest.fn((_code: number) => ({
      json: jest.fn((data: unknown) => { res._data = { error: data, status: _code }; }),
    })),
  };
  return res;
}

function currentMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0]!;
}

// ─── Test configs ────────────────────────────────────────────────────────────

interface UserConfig {
  label: string;
  contraceptiveMethod: string | null;
  cycleRegularity: string;
  cycleDay: number;
  cycleLength: number;
  expectedPhase: string;
  expectDelayed: boolean;
}

const configs: UserConfig[] = [
  {
    label: "Natural regular day 14 (ovulation)",
    contraceptiveMethod: null,
    cycleRegularity: "regular",
    cycleDay: 14,
    cycleLength: 28,
    expectedPhase: "ovulation",
    expectDelayed: false,
  },
  {
    label: "Natural regular day 35 (overdue/delayed)",
    contraceptiveMethod: null,
    cycleRegularity: "regular",
    cycleDay: 35,
    cycleLength: 28,
    expectedPhase: "luteal",
    expectDelayed: true,
  },
  {
    label: "Hormonal pill day 14 (NOT ovulation)",
    contraceptiveMethod: "pill",
    cycleRegularity: "regular",
    cycleDay: 14,
    cycleLength: 28,
    expectedPhase: "follicular",
    expectDelayed: false,
  },
  {
    label: "Natural irregular day 22 (luteal)",
    contraceptiveMethod: null,
    cycleRegularity: "irregular",
    cycleDay: 22,
    cycleLength: 28,
    expectedPhase: "luteal",
    expectDelayed: false,
  },
  {
    label: "Natural day 1 (menstrual)",
    contraceptiveMethod: null,
    cycleRegularity: "regular",
    cycleDay: 1,
    cycleLength: 28,
    expectedPhase: "menstrual",
    expectDelayed: false,
  },
];

// ─── Test suite ──────────────────────────────────────────────────────────────

describe("Cross-endpoint integration: cycleDay/phase agreement", () => {
  const userIds: string[] = [];

  afterAll(async () => {
    for (const id of userIds) {
      await cleanupUser(id).catch(() => {});
    }
    await prisma.$disconnect();
  }, 60_000);

  for (const config of configs) {
    describe(config.label, () => {
      let userId: string;
      let insightRes: ReturnType<typeof mockRes>;
      let homeRes: ReturnType<typeof mockRes>;
      let calendarRes: ReturnType<typeof mockRes>;

      beforeAll(async () => {
        userId = await createTestUser({
          contraceptiveMethod: config.contraceptiveMethod,
          cycleRegularity: config.cycleRegularity,
          cycleLength: config.cycleLength,
          lastPeriodStart: periodStartForDay(config.cycleDay),
          cycleMode: config.contraceptiveMethod === "pill" ? "hormonal"
            : config.cycleRegularity === "irregular" ? "irregular"
            : "natural",
        });
        userIds.push(userId);

        // Seed enough logs for insights to fire
        await seedLogs(userId, 10);

        // Call all 3 endpoints
        insightRes = mockRes();
        await getInsights(
          mockReq(userId) as any,
          insightRes as any,
        );

        homeRes = mockRes();
        await getHomeScreen(
          mockReq(userId) as any,
          homeRes as any,
        );

        calendarRes = mockRes();
        await getCalendar(
          mockReq(userId, { month: currentMonth() }) as any,
          calendarRes as any,
        );
      }, 30000);

      it("all endpoints return data (no errors)", () => {
        const insightData = insightRes._data as Record<string, unknown>;
        const homeData = homeRes._data as Record<string, unknown>;
        const calendarData = calendarRes._data as Record<string, unknown>;

        expect(insightData).toBeDefined();
        expect(homeData).toBeDefined();
        expect(calendarData).toBeDefined();

        // No error status
        expect(insightData).toHaveProperty("cycleDay");
        expect(homeData).toHaveProperty("cycleDay");
        expect(calendarData).toHaveProperty("calendar");
      });

      it("cycleDay agrees across all endpoints", () => {
        const insightData = insightRes._data as Record<string, unknown>;
        const homeData = homeRes._data as Record<string, unknown>;
        const calendarData = calendarRes._data as Record<string, unknown>;

        const insightCycleDay = insightData.cycleDay as number;
        const homeCycleDay = homeData.cycleDay as number;

        // Calendar: find today's entry
        const calendar = calendarData.calendar as Array<Record<string, unknown>>;
        const todayEntry = calendar.find((d) => d.isToday === true);
        const calendarCycleDay = todayEntry?.cycleDay as number | undefined;

        expect(insightCycleDay).toBe(config.cycleDay);
        expect(homeCycleDay).toBe(config.cycleDay);
        if (calendarCycleDay !== undefined) {
          expect(calendarCycleDay).toBe(config.cycleDay);
        }
      });

      it("phase agrees across home and calendar endpoints", () => {
        const homeData = homeRes._data as Record<string, unknown>;
        const calendarData = calendarRes._data as Record<string, unknown>;

        const homePhase = homeData.phase as string | null;

        // Calendar: find today's entry
        const calendar = calendarData.calendar as Array<Record<string, unknown>>;
        const todayEntry = calendar.find((d) => d.isToday === true);
        const calendarPhase = todayEntry?.phase as string | null;

        // For hormonal users, calendar may show null phase
        if (config.contraceptiveMethod === "pill") {
          // Hormonal: phase in calendar should be null (showPhaseInsights = false)
          expect(calendarPhase).toBeNull();
          // Home still has a phase field (from cycleInfo)
          expect(homePhase).toBe(config.expectedPhase);
        } else if (config.cycleRegularity === "irregular") {
          // Irregular with < 2 completed cycles -> isLearning=true -> showPhaseInsights=false in calendar
          // Calendar phase will be null, home phase still set
          expect(homePhase).toBe(config.expectedPhase);
        } else {
          // Natural regular: both should agree
          expect(homePhase).toBe(config.expectedPhase);
          if (calendarPhase !== null) {
            expect(calendarPhase).toBe(config.expectedPhase);
          }
        }
      });

      if (config.expectDelayed) {
        it("all endpoints agree on isPeriodDelayed", () => {
          const insightData = insightRes._data as Record<string, unknown>;
          const homeData = homeRes._data as Record<string, unknown>;
          const calendarData = calendarRes._data as Record<string, unknown>;

          expect(insightData.isPeriodDelayed).toBe(true);
          expect(homeData.isPeriodDelayed).toBe(true);
          expect(calendarData.isPeriodDelayed).toBe(true);
        });
      }

      if (!config.expectDelayed) {
        it("isPeriodDelayed is false", () => {
          const insightData = insightRes._data as Record<string, unknown>;
          const homeData = homeRes._data as Record<string, unknown>;

          expect(insightData.isPeriodDelayed).toBe(false);
          expect(homeData.isPeriodDelayed).toBe(false);
        });
      }
    });
  }
});
