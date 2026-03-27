import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { SCENARIOS, type ScenarioCheck } from "./scenario-fixtures";

type Json = Record<string, unknown>;

function getByPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, part) => {
    if (acc && typeof acc === "object" && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, obj);
}

function runCheck(payload: unknown, check: ScenarioCheck): string | null {
  const value = getByPath(payload, check.path);
  if (check.equals !== undefined) {
    if (JSON.stringify(value) !== JSON.stringify(check.equals)) {
      return `Expected ${check.path} == ${JSON.stringify(check.equals)}, got ${JSON.stringify(value)}`;
    }
  }
  if (check.notNull) {
    if (value === null || value === undefined) {
      return `Expected ${check.path} to be non-null, got ${JSON.stringify(value)}`;
    }
    if (Array.isArray(value) && value.length === 0) {
      return `Expected ${check.path} to be non-empty array, got []`;
    }
  }
  if (check.includes !== undefined) {
    if (typeof value !== "string" || !value.includes(check.includes)) {
      return `Expected ${check.path} to include "${check.includes}", got ${JSON.stringify(value)}`;
    }
  }
  if (check.arrayContains !== undefined) {
    if (Array.isArray(value)) {
      const ok = value.some((item) => {
        if (typeof item === "string" && typeof check.arrayContains === "string") {
          return item.includes(check.arrayContains);
        }
        return JSON.stringify(item) === JSON.stringify(check.arrayContains);
      });
      if (!ok) {
        return `Expected ${check.path} to contain ${JSON.stringify(check.arrayContains)}, got ${JSON.stringify(value)}`;
      }
    } else {
      return `Expected ${check.path} to be an array, got ${JSON.stringify(value)}`;
    }
  }
  return null;
}

async function apiGet(path: string, token: string): Promise<Json> {
  const base = process.env.API_BASE_URL || "http://localhost:3000";
  const r = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = (await r.json()) as Json;
  if (!r.ok) throw new Error(`GET ${path} failed: ${r.status} ${JSON.stringify(json)}`);
  return json;
}

async function apiPost(path: string, token: string, body: Record<string, unknown>): Promise<Json> {
  const base = process.env.API_BASE_URL || "http://localhost:3000";
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await r.json()) as Json;
  if (!r.ok) throw new Error(`POST ${path} failed: ${r.status} ${JSON.stringify(json)}`);
  return json;
}

async function apiLogin(email: string, password: string): Promise<string> {
  const base = process.env.API_BASE_URL || "http://localhost:3000";
  const r = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await r.json()) as Json;
  if (!r.ok) throw new Error(`login failed: ${r.status} ${JSON.stringify(json)}`);
  const token = (json.tokens as Json | undefined)?.accessToken;
  if (typeof token !== "string") throw new Error(`No access token in login response: ${JSON.stringify(json)}`);
  return token;
}

async function runOne(index: number): Promise<void> {
  const scenario = SCENARIOS[index]!;
  const now = new Date();
  const email = `scenario-${scenario.id}-${Date.now()}@example.com`;
  const passwordHash = bcrypt.hashSync(scenario.user.password, 10);
  const lastPeriodStart = new Date(now.getTime() - scenario.user.lastPeriodStartHoursAgo * 3600 * 1000);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name: scenario.user.name,
      age: scenario.user.age,
      height: scenario.user.height,
      weight: scenario.user.weight,
      cycleLength: scenario.user.cycleLength,
      lastPeriodStart,
      contraceptiveMethod: scenario.user.contraceptiveMethod ?? null,
      cycleRegularity: scenario.user.cycleRegularity ?? null,
    },
  });

  try {
    for (const log of scenario.logs) {
      const date = new Date(now.getTime() - log.daysAgo * 86400000);
      date.setUTCHours(12, 0, 0, 0);
      await prisma.dailyLog.create({
        data: {
          userId: user.id,
          date,
          mood: log.mood ?? null,
          energy: log.energy ?? null,
          sleep: log.sleep ?? null,
          stress: log.stress ?? null,
          exercise: log.exercise ?? null,
          padsChanged: log.padsChanged ?? null,
          symptoms: log.symptoms ?? [],
          pain: log.pain ?? null,
        },
      });
    }

    for (const h of scenario.insightHistory ?? []) {
      const date = new Date(now.getTime() - h.daysAgo * 86400000);
      date.setUTCHours(12, 0, 0, 0);
      await prisma.insightHistory.create({
        data: {
          userId: user.id,
          primaryKey: h.primaryKey,
          driver: h.driver ?? null,
          cycleDay: h.cycleDay ?? null,
          phase: h.phase ?? null,
          createdAt: date,
        },
      });
    }

    for (const c of scenario.cycleHistory ?? []) {
      const startDate = new Date(now.getTime() - c.startDaysAgo * 86400000);
      startDate.setUTCHours(12, 0, 0, 0);
      await prisma.cycleHistory.create({
        data: {
          userId: user.id,
          startDate,
          cycleLength: c.cycleLength ?? null,
        },
      });
    }

    const token = await apiLogin(email, scenario.user.password);
    if (scenario.periodStartedDate) {
      await apiPost("/api/cycle/period-started", token, { date: scenario.periodStartedDate });
    }
    const insights = await apiGet("/api/insights", token);
    const forecast = await apiGet("/api/insights/forecast", token);
    const cycleCurrent = scenario.checks.cycleCurrent?.length
      ? await apiGet("/api/cycle/current", token)
      : null;

    const errors: string[] = [];
    for (const check of scenario.checks.insights) {
      const e = runCheck(insights, check);
      if (e) errors.push(`[insights] ${e}`);
    }
    for (const check of scenario.checks.forecast) {
      const e = runCheck(forecast, check);
      if (e) errors.push(`[forecast] ${e}`);
    }
    for (const check of scenario.checks.cycleCurrent ?? []) {
      const e = runCheck(cycleCurrent, check);
      if (e) errors.push(`[cycleCurrent] ${e}`);
    }

    if (errors.length > 0) {
      throw new Error(`Scenario ${scenario.id} failed:\n- ${errors.join("\n- ")}`);
    }

    console.log(`PASS ${scenario.id} :: ${scenario.description}`);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
}

async function main() {
  const base = process.env.API_BASE_URL || "http://localhost:3000";
  const health = await fetch(`${base}/health`);
  if (!health.ok) {
    throw new Error(`API health check failed at ${base}/health (${health.status})`);
  }

  for (let i = 0; i < SCENARIOS.length; i++) {
    await runOne(i);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

