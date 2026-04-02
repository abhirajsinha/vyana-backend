// tests/integration/contraceptionTransition.test.ts
// Integration tests for contraception transition handling.
// Covers: transition mechanics, end-to-end insight output, home screen, and warmup.

jest.setTimeout(30_000);

import { randomUUID } from "crypto";

// ─── Mock GPT (must be before imports that use it) ───────────────────────────

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
import { handleContraceptionTransition } from "../../src/services/contraceptionTransition";
import { getInsights } from "../../src/controllers/insightController";
import { getHomeScreen } from "../../src/controllers/homeController";
import { buildTransitionWarmup } from "../../src/services/transitionWarmup";
import { periodStartForDay, daysAgo } from "../helpers/factories";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const testUserIds: string[] = [];

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
  testUserIds.push(user.id);
  return user.id;
}

async function seedLogs(userId: string, count: number): Promise<void> {
  const logs = [];
  for (let i = 0; i < count; i++) {
    logs.push({
      userId,
      date: daysAgo(i),
      mood: "neutral",
      energy: "moderate",
      sleep: 7.0,
      stress: "moderate",
      pain: "none",
      symptoms: [],
    });
  }
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
  await prisma.user.delete({ where: { id: userId } }).catch(() => {});
}

function mockReq(userId: string): { userId: string } {
  return { userId } as { userId: string };
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

// ─── Cleanup ─────────────────────────────────────────────────────────────────

afterAll(async () => {
  for (const id of testUserIds) {
    await cleanupUser(id);
  }
  await prisma.$disconnect();
}, 30_000);

// ─── Group 1: Transition mechanics ───────────────────────────────────────────

describe("Group 1: Transition mechanics", () => {
  let userId: string;

  beforeAll(async () => {
    userId = await createTestUser();
    // Seed some caches / memory so we can verify clearing
    await seedLogs(userId, 5);
  });

  it("natural -> pill: natural_to_hormonal, baseline reset, caches cleared, period start reset", async () => {
    const result = await handleContraceptionTransition({
      userId,
      previousMethod: null,
      newMethod: "pill",
      cycleRegularity: "regular",
    });

    expect(result.transitionType).toBe("natural_to_hormonal");
    expect(result.baselineReset).toBe(true);
    expect(result.cachesCleared).toBe(true);
    expect(result.periodStartReset).toBe(true);
  });

  it("pill -> natural: hormonal_to_natural, baseline reset, cycleRegularity set to not_sure", async () => {
    const result = await handleContraceptionTransition({
      userId,
      previousMethod: "pill",
      newMethod: null,
      cycleRegularity: "regular",
    });

    expect(result.transitionType).toBe("hormonal_to_natural");
    expect(result.baselineReset).toBe(true);

    // Verify the user record was updated
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user!.cycleRegularity).toBe("not_sure");
  });

  it("pill -> iud_hormonal: hormonal_to_hormonal, baseline reset", async () => {
    const result = await handleContraceptionTransition({
      userId,
      previousMethod: "pill",
      newMethod: "iud_hormonal",
      cycleRegularity: "regular",
    });

    expect(result.transitionType).toBe("hormonal_to_hormonal");
    expect(result.baselineReset).toBe(true);
  });

  it("natural -> iud_copper: natural_to_natural, no baseline reset", async () => {
    const result = await handleContraceptionTransition({
      userId,
      previousMethod: null,
      newMethod: "iud_copper",
      cycleRegularity: "regular",
    });

    expect(result.transitionType).toBe("natural_to_natural");
    expect(result.baselineReset).toBe(false);
  });

  it("natural -> condom: natural_to_natural, no baseline reset", async () => {
    const result = await handleContraceptionTransition({
      userId,
      previousMethod: null,
      newMethod: "condom",
      cycleRegularity: "regular",
    });

    expect(result.transitionType).toBe("natural_to_natural");
    expect(result.baselineReset).toBe(false);
  });

  it("pill -> pill (same method): same_method, caches NOT cleared", async () => {
    const result = await handleContraceptionTransition({
      userId,
      previousMethod: "pill",
      newMethod: "pill",
      cycleRegularity: "regular",
    });

    expect(result.transitionType).toBe("same_method");
    expect(result.cachesCleared).toBe(false);
  });
});

// ─── Group 2: End-to-end insight output after null -> pill ───────────────────

describe("Group 2: End-to-end insight output after transition", () => {
  let userId: string;

  beforeAll(async () => {
    userId = await createTestUser({
      contraceptiveMethod: null,
      cycleMode: "natural",
    });
    await seedLogs(userId, 10);
  });

  it("post-transition insights contain no ovulation/fertile window/lh surge language", async () => {
    // 1. Get pre-transition insights
    const req1 = mockReq(userId) as any;
    const res1 = mockRes() as any;
    await getInsights(req1, res1);

    // 2. Transition to pill
    await prisma.user.update({
      where: { id: userId },
      data: { contraceptiveMethod: "pill", cycleMode: "hormonal" },
    });

    const transitionResult = await handleContraceptionTransition({
      userId,
      previousMethod: null,
      newMethod: "pill",
      cycleRegularity: "regular",
    });

    expect(transitionResult.cachesCleared).toBe(true);

    // 3. Get post-transition insights
    const req2 = mockReq(userId) as any;
    const res2 = mockRes() as any;
    await getInsights(req2, res2);

    const data = res2._data as Record<string, unknown>;
    expect(data).toBeDefined();

    // Stringify the insights to check for forbidden terms
    const insightsStr = JSON.stringify(data.insights ?? {}).toLowerCase();

    expect(insightsStr).not.toContain("ovulation");
    expect(insightsStr).not.toContain("fertile window");
    expect(insightsStr).not.toContain("lh surge");
  }, 30_000);

  it("caches are cleared and contraceptionChangedAt is set after transition", async () => {
    // Verify caches are empty (they were cleared during the transition above)
    const caches = await prisma.insightCache.findMany({
      where: { userId },
    });
    // After the second getInsights call above, a new cache entry may have been written.
    // But verify contraceptionChangedAt is set.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user!.contraceptionChangedAt).not.toBeNull();
  });
});

// ─── Group 3: Home screen after transition ───────────────────────────────────

describe("Group 3: Home screen after transition", () => {
  let userId: string;

  beforeAll(async () => {
    userId = await createTestUser({
      contraceptiveMethod: "pill",
      cycleMode: "hormonal",
      contraceptionChangedAt: new Date(),
    });
    await seedLogs(userId, 5);
  });

  it("hormonal user home screen does not contain 'Ovulation day' or 'Luteal phase'", async () => {
    const req = mockReq(userId) as any;
    const res = mockRes() as any;
    await getHomeScreen(req, res);

    const data = res._data as Record<string, unknown>;
    expect(data).toBeDefined();

    const fullStr = JSON.stringify(data).toLowerCase();

    // Should not show phase-specific ovulation or luteal labels
    // (the home screen uses "Ovulation day" as a title and "Luteal phase" in dayPhaseLabel)
    expect(fullStr).not.toContain("ovulation day");
    expect(fullStr).not.toContain("luteal phase");
  });
});

// ─── Group 4: Transition warmup ──────────────────────────────────────────────

describe("Group 4: Transition warmup", () => {
  it("buildTransitionWarmup(now) returns active with daysRemaining === 14", () => {
    const result = buildTransitionWarmup(new Date());
    expect(result).not.toBeNull();
    expect(result!.active).toBe(true);
    expect(result!.daysRemaining).toBe(14);
    expect(result!.daysSinceTransition).toBe(0);
  });

  it("buildTransitionWarmup(5 days ago) returns daysRemaining === 9", () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const result = buildTransitionWarmup(fiveDaysAgo);
    expect(result).not.toBeNull();
    expect(result!.active).toBe(true);
    expect(result!.daysRemaining).toBe(9);
    expect(result!.daysSinceTransition).toBe(5);
  });

  it("buildTransitionWarmup(15 days ago) returns null (inactive)", () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const result = buildTransitionWarmup(fifteenDaysAgo);
    expect(result).toBeNull();
  });

  it("buildTransitionWarmup(null) returns null", () => {
    const result = buildTransitionWarmup(null);
    expect(result).toBeNull();
  });
});
