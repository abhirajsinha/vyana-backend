/**
 * Early follicular user (cycle day ~9), regular cycles, but recent sleep collapse
 * from lifestyle (not phase): ~7h baseline → 4–5h last 5 days, slight stress ↑, mood ↓.
 *
 * Usage:  npx ts-node --transpile-only scripts/seed-follicular-sleep-stress-user.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const EMAIL = "follicular.sleepstress@vyana.test";
const PASSWORD = "password12";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    await prisma.healthPatternCache.deleteMany({ where: { userId: existing.id } });
    await prisma.insightCache.deleteMany({ where: { userId: existing.id } });
    await prisma.insightMemory.deleteMany({ where: { userId: existing.id } });
    await prisma.insightHistory.deleteMany({ where: { userId: existing.id } });
    await prisma.dailyLog.deleteMany({ where: { userId: existing.id } });
    await prisma.cycleHistory.deleteMany({ where: { userId: existing.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: existing.id } });
    await prisma.user.delete({ where: { id: existing.id } });
    console.log("Removed previous user with same email.");
  }

  const now = new Date();
  // Cycle day = floor((now - lastPeriodStart) / 1d) + 1  →  day 9  ⇒  period started 8 days ago
  const lastPeriodStart = new Date(now);
  lastPeriodStart.setDate(lastPeriodStart.getDate() - 8);
  lastPeriodStart.setHours(12, 0, 0, 0);

  const hash = await bcrypt.hash(PASSWORD, 10);

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash: hash,
      name: "Maya",
      age: 29,
      height: 165,
      weight: 60,
      cycleLength: 28,
      lastPeriodStart,
      cycleRegularity: "regular",
      contraceptiveMethod: null,
      cycleMode: "natural",
    },
  });

  // Two completed 28-day cycles (regularity narrative + forecasts where applicable)
  const periodBStart = new Date(lastPeriodStart);
  periodBStart.setDate(periodBStart.getDate() - 28);
  const periodAStart = new Date(periodBStart);
  periodAStart.setDate(periodAStart.getDate() - 28);

  await prisma.cycleHistory.create({
    data: {
      userId: user.id,
      startDate: periodAStart,
      endDate: periodBStart,
      cycleLength: 28,
    },
  });
  await prisma.cycleHistory.create({
    data: {
      userId: user.id,
      startDate: periodBStart,
      endDate: lastPeriodStart,
      cycleLength: 28,
    },
  });
  await prisma.cycleHistory.create({
    data: { userId: user.id, startDate: lastPeriodStart },
  });

  // 21 days of logs: stable sleep/stress/mood, then last 5 days sleep crash + stress/mood shift
  for (let daysAgo = 20; daysAgo >= 0; daysAgo--) {
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(12, 0, 0, 0);

    const inSleepDropWindow = daysAgo <= 4; // last 5 days including today

    const sleep = inSleepDropWindow
      ? 4.2 + (daysAgo % 3) * 0.25 // 4.2–4.7h
      : 6.9 + (daysAgo % 4) * 0.08; // ~7h stable

    const stress = inSleepDropWindow ? "moderate" : "low";
    const mood = inSleepDropWindow ? (daysAgo <= 2 ? "low" : "neutral") : "good";
    const energy = inSleepDropWindow ? "low" : "moderate";

    await prisma.dailyLog.create({
      data: {
        userId: user.id,
        date,
        sleep,
        stress,
        mood,
        energy,
        symptoms: [],
      },
    });
  }

  console.log(`
Created test user (early follicular, ~cycle day 9 — poor sleep is recent / not phase-driven):

  Email:    ${EMAIL}
  Password: ${PASSWORD}
  User id:  ${user.id}

  lastPeriodStart: ${lastPeriodStart.toISOString()}
  (Today should read as follicular phase, cycle day 9.)

  Logs: 21 days — baseline ~7h sleep, calm stress, good mood; last 5 days ~4–5h sleep,
        moderate stress, mood lower (neutral/low), energy lower.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
