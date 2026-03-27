/**
 * Seeds a user with 3 completed cycles of data designed to trigger
 * all 4 health pattern detectors: PCOS, PMDD, Endometriosis, Iron Deficiency.
 *
 * Usage:  npx ts-node scripts/seed-health-pattern-user.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const EMAIL = "healthtest@vyana.app";
const PASSWORD = "password12";

// 3 irregular cycles (25, 35, 28 days) → variation of 10 days triggers PCOS
const CYCLES = [
  { start: "2025-11-15", end: "2025-12-10", length: 25 },
  { start: "2025-12-10", end: "2026-01-14", length: 35 },
  { start: "2026-01-14", end: "2026-02-11", length: 28 },
];
const CURRENT_PERIOD_START = "2026-02-11";

function d(iso: string): Date {
  return new Date(iso + "T00:00:00Z");
}

function addDays(base: string, n: number): Date {
  const dt = d(base);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt;
}

interface LogSeed {
  date: Date;
  mood?: string;
  energy?: string;
  sleep?: number;
  stress?: string;
  pain?: string;
  fatigue?: string;
  cravings?: string;
  padsChanged?: number;
  exercise?: string;
}

function buildLogsForCycle(startIso: string, cycleLen: number): LogSeed[] {
  const logs: LogSeed[] = [];

  // ── Days 1–5: Menstrual ── severe pain, heavy bleeding, fatigue, low mood
  for (let day = 0; day < 5; day++) {
    logs.push({
      date: addDays(startIso, day),
      mood: "low",
      energy: "low",
      sleep: 5 + Math.random(),
      stress: "high",
      pain: day < 3 ? "severe" : "moderate",  // 3 consecutive severe for endo
      fatigue: "high",
      cravings: "high",
      padsChanged: day < 4 ? 8 + Math.floor(Math.random() * 3) : 5, // 4 days ≥7 for iron
      exercise: "none",
    });
  }

  // ── Days 6–12: Follicular ── fatigue persists (iron deficiency), stress, low mood
  for (let day = 5; day < Math.min(12, cycleLen - 7); day++) {
    logs.push({
      date: addDays(startIso, day),
      mood: day % 2 === 0 ? "low" : "anxious",
      energy: "low",
      sleep: 5.5 + Math.random(),
      stress: "high",
      pain: "mild",
      fatigue: "high",
      cravings: day % 3 === 0 ? "high" : "moderate",
      exercise: "light",
    });
  }

  // ── Mid-cycle: stress + cravings across phases (PCOS signals)
  const midStart = Math.min(12, cycleLen - 7);
  const midEnd = cycleLen - 8;
  for (let day = midStart; day < midEnd; day += 2) {
    logs.push({
      date: addDays(startIso, day),
      mood: day % 3 === 0 ? "anxious" : "neutral",
      energy: "moderate",
      sleep: 6 + Math.random(),
      stress: "high",
      fatigue: day % 2 === 0 ? "high" : "moderate",
      cravings: "high",
      exercise: "moderate",
    });
  }

  // ── Last 7 days: Pre-period ── PMDD window: low mood, poor sleep, stress
  for (let day = cycleLen - 7; day < cycleLen; day++) {
    logs.push({
      date: addDays(startIso, day),
      mood: "low",
      energy: "low",
      sleep: 4.5 + Math.random(), // < 6 hours
      stress: "high",
      pain: "moderate",
      fatigue: "high",
      cravings: "high",
      exercise: "none",
    });
  }

  return logs;
}

// Early days of the *next* cycle → mood recovery (needed for PMDD detection)
function buildRecoveryLogs(nextCycleStart: string): LogSeed[] {
  return [1, 2, 3].map((dayOffset) => ({
    date: addDays(nextCycleStart, dayOffset),
    mood: "neutral",
    energy: "moderate",
    sleep: 7 + Math.random(),
    stress: "moderate",
    fatigue: "moderate",
  }));
}

async function main() {
  // Clean up previous run
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
    console.log("🗑️  Cleaned up previous test user");
  }

  const hash = await bcrypt.hash(PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      passwordHash: hash,
      name: "Priya",
      age: 27,
      height: 162,
      weight: 58,
      cycleLength: 28,
      lastPeriodStart: d(CURRENT_PERIOD_START),
      cycleRegularity: "irregular",
      cycleMode: "irregular",
    },
  });
  console.log(`✅ Created user: ${user.id} (${EMAIL})`);

  // Seed completed cycle history
  for (const c of CYCLES) {
    await prisma.cycleHistory.create({
      data: {
        userId: user.id,
        startDate: d(c.start),
        endDate: d(c.end),
        cycleLength: c.length,
      },
    });
  }
  // Current (open) cycle
  await prisma.cycleHistory.create({
    data: { userId: user.id, startDate: d(CURRENT_PERIOD_START) },
  });
  console.log(`✅ Seeded ${CYCLES.length} completed cycles + 1 open cycle`);

  // Seed daily logs across all 3 cycles
  let totalLogs = 0;
  for (let i = 0; i < CYCLES.length; i++) {
    const cycle = CYCLES[i];
    const logs = buildLogsForCycle(cycle.start, cycle.length);

    // Add recovery logs at the start of the *next* cycle (for PMDD mood-recovery check)
    const nextStart = CYCLES[i + 1]?.start ?? CURRENT_PERIOD_START;
    const recovery = buildRecoveryLogs(nextStart);

    const all = [...logs, ...recovery];
    for (const log of all) {
      await prisma.dailyLog.create({
        data: {
          userId: user.id,
          date: log.date,
          mood: log.mood ?? null,
          energy: log.energy ?? null,
          sleep: log.sleep ?? null,
          stress: log.stress ?? null,
          pain: log.pain ?? null,
          fatigue: log.fatigue ?? null,
          cravings: log.cravings ?? null,
          padsChanged: log.padsChanged ?? null,
          exercise: log.exercise ?? null,
        },
      });
    }
    totalLogs += all.length;
    console.log(`  📅 Cycle ${i + 1} (${cycle.start} → ${cycle.end}, ${cycle.length}d): ${all.length} logs`);
  }
  console.log(`✅ Total logs seeded: ${totalLogs}`);

  console.log("\n🔑 Login credentials:");
  console.log(`   Email:    ${EMAIL}`);
  console.log(`   Password: ${PASSWORD}`);
  console.log("\n📋 Test commands:");
  console.log(`   1. Login:   curl -s -X POST http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"${EMAIL}","password":"${PASSWORD}"}' | jq .`);
  console.log(`   2. Health:  curl -s http://localhost:3000/api/health/patterns -H 'Authorization: Bearer <TOKEN>' | jq .`);
  console.log("\n🎯 Expected patterns: PCOS, PMDD, Endometriosis, Iron Deficiency");

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
