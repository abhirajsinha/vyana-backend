import { PrismaClient } from "@prisma/client";
import { signAccessToken } from "../src/utils/jwt";
import { hashPassword } from "../src/utils/password";
import fs from "fs";
import path from "path";
import "dotenv/config";

const prisma = new PrismaClient();

function lastPeriodStartFor(cycleDay: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (cycleDay - 1));
  return d;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

const CASES = [
  {
    id: 1, cycleDay: 27, cycleLength: 28,
    logs: [
      { n: 0, sleep: 5.0, stress: "very_high", mood: "very_low", energy: "low" },
      { n: 1, sleep: 5.2, stress: "high",      mood: "low",      energy: "low" },
      { n: 2, sleep: 5.5, stress: "high",      mood: "low",      energy: "low" },
      { n: 3, sleep: 6.0, stress: "moderate",  mood: "low",      energy: "moderate" },
      { n: 4, sleep: 6.2, stress: "moderate",  mood: "neutral",  energy: "moderate" },
      { n: 5, sleep: 6.5, stress: "low",       mood: "neutral",  energy: "moderate" },
      { n: 6, sleep: 7.0, stress: "low",       mood: "neutral",  energy: "high" },
    ],
    seedPastCycles: true,
  },
  {
    id: 2, cycleDay: 1, cycleLength: 28,
    logs: [
      { n: 0, sleep: 5.5, stress: "moderate", mood: "low",     energy: "low",      padsChanged: 8 },
      { n: 1, sleep: 5.8, stress: "moderate", mood: "low",     energy: "low" },
      { n: 2, sleep: 6.0, stress: "low",      mood: "neutral", energy: "moderate" },
      { n: 3, sleep: 6.2, stress: "low",      mood: "neutral", energy: "moderate" },
    ],
    seedPastCycles: false,
  },
  {
    id: 3, cycleDay: 14, cycleLength: 28,
    logs: [
      { n: 0, sleep: 7.5, stress: "low",      mood: "good",    energy: "high" },
      { n: 1, sleep: 7.0, stress: "low",      mood: "good",    energy: "high" },
      { n: 2, sleep: 7.2, stress: "low",      mood: "good",    energy: "high" },
      { n: 3, sleep: 7.0, stress: "moderate", mood: "good",    energy: "moderate" },
      { n: 4, sleep: 7.3, stress: "low",      mood: "neutral", energy: "moderate" },
    ],
    seedPastCycles: false,
  },
  {
    id: 4, cycleDay: 9, cycleLength: 28,
    logs: [
      { n: 0, sleep: 4.0, stress: "moderate", mood: "low",     energy: "low" },
      { n: 1, sleep: 4.5, stress: "moderate", mood: "low",     energy: "low" },
      { n: 2, sleep: 5.0, stress: "low",      mood: "neutral", energy: "low" },
      { n: 3, sleep: 6.0, stress: "low",      mood: "neutral", energy: "moderate" },
      { n: 4, sleep: 7.0, stress: "low",      mood: "good",    energy: "high" },
    ],
    seedPastCycles: false,
  },
  {
    id: 5, cycleDay: 11, cycleLength: 28,
    logs: [
      { n: 0, sleep: 7.0, stress: "moderate", mood: "neutral", energy: "moderate" },
      { n: 1, sleep: 7.0, stress: "moderate", mood: "neutral", energy: "moderate" },
      { n: 2, sleep: 7.2, stress: "moderate", mood: "neutral", energy: "moderate" },
      { n: 3, sleep: 7.0, stress: "moderate", mood: "neutral", energy: "moderate" },
      { n: 4, sleep: 6.8, stress: "moderate", mood: "neutral", energy: "moderate" },
    ],
    seedPastCycles: false,
  },
  {
    id: 6, cycleDay: 14, cycleLength: 28,
    logs: [
      { n: 0, sleep: 6.2, stress: "moderate", mood: "low",     energy: "low" },
      { n: 1, sleep: 6.5, stress: "low",      mood: "neutral", energy: "moderate" },
    ],
    seedPastCycles: false,
  },
  {
    id: 7, cycleDay: 26, cycleLength: 28,
    logs: [
      { n: 0, sleep: 5.0, stress: "high",     mood: "low",     energy: "low" },
      { n: 1, sleep: 5.2, stress: "high",     mood: "low",     energy: "low" },
      { n: 2, sleep: 5.5, stress: "high",     mood: "low",     energy: "low" },
      { n: 3, sleep: 5.8, stress: "moderate", mood: "neutral", energy: "moderate" },
      { n: 4, sleep: 6.0, stress: "moderate", mood: "neutral", energy: "moderate" },
      { n: 5, sleep: 6.5, stress: "low",      mood: "neutral", energy: "moderate" },
      { n: 6, sleep: 7.0, stress: "low",      mood: "neutral", energy: "high" },
    ],
    seedPastCycles: true,
  },
  {
    id: 8, cycleDay: 19, cycleLength: 28,
    logs: [
      { n: 0, sleep: 7.0, stress: "very_high", mood: "low",     energy: "moderate" },
      { n: 1, sleep: 7.0, stress: "high",      mood: "low",     energy: "moderate" },
      { n: 2, sleep: 7.2, stress: "high",      mood: "neutral", energy: "moderate" },
      { n: 3, sleep: 7.0, stress: "moderate",  mood: "neutral", energy: "moderate" },
      { n: 4, sleep: 7.0, stress: "low",       mood: "neutral", energy: "high" },
    ],
    seedPastCycles: false,
  },
  {
    id: 9, cycleDay: 27, cycleLength: 28,
    logs: [
      { n: 0, sleep: 4.0, stress: "very_high", mood: "very_low", energy: "low" },
      { n: 1, sleep: 4.5, stress: "very_high", mood: "very_low", energy: "low" },
      { n: 2, sleep: 5.0, stress: "high",      mood: "low",      energy: "low" },
      { n: 3, sleep: 5.5, stress: "moderate",  mood: "low",      energy: "low" },
      { n: 4, sleep: 6.0, stress: "moderate",  mood: "neutral",  energy: "moderate" },
    ],
    seedPastCycles: false,
  },
  {
    id: 10, cycleDay: 17, cycleLength: 28,
    logs: [
      { n: 0, sleep: 7.0, stress: "high",     mood: "low",     energy: "moderate" },
      { n: 1, sleep: 7.2, stress: "high",     mood: "low",     energy: "moderate" },
      { n: 2, sleep: 7.0, stress: "moderate", mood: "neutral", energy: "moderate" },
      { n: 3, sleep: 7.0, stress: "low",      mood: "neutral", energy: "high" },
      { n: 4, sleep: 7.0, stress: "low",      mood: "neutral", energy: "high" },
    ],
    seedPastCycles: false,
  },
];

async function seedPastCycles(userId: string, lastPeriodStart: Date, cycleDay: number, cycleLength: number) {
  const cycleStart1 = new Date(lastPeriodStart);
  cycleStart1.setDate(cycleStart1.getDate() - cycleLength);
  const cycleStart2 = new Date(cycleStart1);
  cycleStart2.setDate(cycleStart2.getDate() - cycleLength);

  await prisma.cycleHistory.createMany({
    data: [
      { userId, startDate: cycleStart2, endDate: cycleStart1, cycleLength },
      { userId, startDate: cycleStart1, endDate: lastPeriodStart, cycleLength },
    ],
  });

  // Seed logs around the same cycle day window in past cycles
  for (const startDate of [cycleStart1, cycleStart2]) {
    for (let dayOffset = -2; dayOffset <= 2; dayOffset++) {
      const logDate = new Date(startDate);
      logDate.setDate(logDate.getDate() + cycleDay + dayOffset);
      logDate.setUTCHours(12, 0, 0, 0);
      if (logDate < new Date()) {
        await prisma.dailyLog.create({
          data: {
            userId,
            date: logDate,
            sleep: 5.5,
            stress: "high",
            mood: "low",
            energy: "low",
          },
        });
      }
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const caseIdx = args.indexOf("--case");
  const singleId = caseIdx !== -1 ? parseInt(args[caseIdx + 1] ?? "0", 10) : null;
  const cases = singleId ? CASES.filter(c => c.id === singleId) : CASES;

  if (cases.length === 0) {
    console.error(`No case found with id ${singleId}`);
    process.exit(1);
  }

  console.log(`\n🌱 Seeding ${cases.length} test case(s)...\n`);
  const tokens: Record<number, string> = {};

  for (const tc of cases) {
    const email = `test-case-${tc.id}@vyana-test.internal`;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      await prisma.insightHistory.deleteMany({ where: { userId: existing.id } });
      await prisma.insightMemory.deleteMany({ where: { userId: existing.id } });
      await prisma.insightCache.deleteMany({ where: { userId: existing.id } });
      await prisma.dailyLog.deleteMany({ where: { userId: existing.id } });
      await prisma.cycleHistory.deleteMany({ where: { userId: existing.id } });
      await prisma.chatMessage.deleteMany({ where: { userId: existing.id } });
      await prisma.refreshToken.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const lastPeriodStart = lastPeriodStartFor(tc.cycleDay);
    const passwordHash = await hashPassword("test-password-123");

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: `Test Case ${tc.id}`,
        age: 28,
        height: 165,
        weight: 60,
        cycleLength: tc.cycleLength,
        lastPeriodStart,
        contraceptiveMethod: null,
        cycleRegularity: null,
        cycleMode: "natural",
      },
    });

    if (tc.seedPastCycles) {
      await seedPastCycles(user.id, lastPeriodStart, tc.cycleDay, tc.cycleLength);
    }

    await prisma.cycleHistory.create({
      data: { userId: user.id, startDate: lastPeriodStart },
    });

    for (const log of tc.logs) {
      await prisma.dailyLog.create({
        data: {
          userId: user.id,
          date: daysAgo(log.n),
          sleep: log.sleep,
          stress: log.stress,
          mood: log.mood,
          energy: log.energy ?? "moderate",
          padsChanged: (log as any).padsChanged ?? null,
        },
      });
    }

    const token = signAccessToken(user.id);
    tokens[tc.id] = token;
    console.log(`✅ Case ${tc.id} seeded — userId: ${user.id}`);
    console.log(`   Token: ${token}\n`);
  }

  const outDir = path.join(process.cwd(), "test-output");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "tokens.json"), JSON.stringify(tokens, null, 2));
  console.log(`✅ Tokens → test-output/tokens.json`);
  console.log(`\nNext: npx ts-node scripts/fetch-test-insights.ts\n`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
