import { prisma } from "../lib/prisma";

function utcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;
}

export async function getInsightMemoryCount(params: {
  userId: string;
  driver: string;
}): Promise<{ count: number; lastSeen: Date | null }> {
  const { userId, driver } = params;

  const existing = await prisma.insightMemory.findUnique({
    where: {
      userId_driver: {
        userId,
        driver,
      },
    },
    select: {
      count: true,
      lastSeen: true,
    },
  });

  if (!existing) return { count: 0, lastSeen: null };

  const daysSinceLastSeen = existing.lastSeen
    ? (Date.now() - existing.lastSeen.getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  return {
    count: daysSinceLastSeen > 2 ? 0 : existing.count,
    lastSeen: existing.lastSeen,
  };
}

export async function recordInsightMemoryOccurrence(params: {
  userId: string;
  driver: string;
  now?: Date;
}): Promise<void> {
  const { userId, driver, now = new Date() } = params;
  const dayKey = utcDayKey(now);

  const existing = await prisma.insightMemory.findUnique({
    where: {
      userId_driver: {
        userId,
        driver,
      },
    },
    select: {
      count: true,
      lastSeen: true,
    },
  });

  if (!existing) {
    await prisma.insightMemory.create({
      data: {
        userId,
        driver,
        firstSeen: now,
        lastSeen: now,
        count: 1,
      },
    });
    return;
  }

  const daysSinceLastSeen = existing.lastSeen
    ? (now.getTime() - existing.lastSeen.getTime()) / (1000 * 60 * 60 * 24)
    : 0;

  const existingDayKey = existing.lastSeen ? utcDayKey(existing.lastSeen) : null;
  const isSameDay = existingDayKey === dayKey;

  let newCount: number;
  if (daysSinceLastSeen > 2) {
    newCount = 1;
  } else if (isSameDay) {
    newCount = existing.count;
  } else {
    newCount = existing.count + 1;
  }

  await prisma.insightMemory.update({
    where: {
      userId_driver: {
        userId,
        driver,
      },
    },
    data: {
      lastSeen: now,
      count: newCount,
    },
  });
}

