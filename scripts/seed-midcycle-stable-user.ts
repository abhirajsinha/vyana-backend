/**
 * Mid-cycle user (~cycle day 11): regular 28-day cycle, very stable logs —
 * ~7h sleep, moderate stress, neutral mood, no trends or symptoms.
 *
 * Usage:  npx ts-node --transpile-only scripts/seed-midcycle-stable-user.ts
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";

const EMAIL = "midcycle.stable@vyana.test";
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
  // Cycle day 11 ⇒ period started 10 calendar days before "today" at noon
  const lastPeriodStart = new Date(now);
  lastPeriodStart.setDate(lastPeriodStart.getDate() - 10);
  lastPeriodStart.setHours(12, 0, 0, 0);

  const hash = await bcrypt.hash(PASSWORD, 10);

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash: hash,
      name: "Rina",
      age: 28,
      height: 163,
      weight: 58,
      cycleLength: 28,
      lastPeriodStart,
      cycleRegularity: "regular",
      contraceptiveMethod: null,
      cycleMode: "natural",
    },
  });

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

  // 21 days: flat line — no intentional trends (tiny sleep jitter only)
  for (let daysAgo = 20; daysAgo >= 0; daysAgo--) {
    const date = new Date(now);
    date.setDate(date.getDate() - daysAgo);
    date.setHours(12, 0, 0, 0);

    const sleep = 6.95 + (daysAgo % 6) * 0.05; // 6.95–7.2h

    await prisma.dailyLog.create({
      data: {
        userId: user.id,
        date,
        sleep,
        stress: "moderate",
        mood: "neutral",
        energy: "moderate",
        symptoms: [],
      },
    });
  }

  console.log(`
Created test user (mid-cycle ~day 10–12, stable steady logs):

  Email:    ${EMAIL}
  Password: ${PASSWORD}
  User id:  ${user.id}

  lastPeriodStart: ${lastPeriodStart.toISOString()}
  (Expect ~cycle day 11, late follicular — day before ovulation window in a 28-day model.)

  Logs: 21 days — sleep ~7h, stress moderate, mood neutral, energy moderate,
        no symptoms, minimal day-to-day variance (no deliberate trends).
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
