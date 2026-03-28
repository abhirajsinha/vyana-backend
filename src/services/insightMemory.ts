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
    where: { userId_driver: { userId, driver } },
    select: { count: true, lastSeen: true },
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
    where: { userId_driver: { userId, driver } },
    select: { count: true, lastSeen: true },
  });

  if (!existing) {
    await prisma.insightMemory.create({
      data: { userId, driver, firstSeen: now, lastSeen: now, count: 1 },
    });
    return;
  }

  const daysSinceLastSeen = existing.lastSeen
    ? (now.getTime() - existing.lastSeen.getTime()) / (1000 * 60 * 60 * 24)
    : 0;
  const existingDayKey = existing.lastSeen ? utcDayKey(existing.lastSeen) : null;
  const isSameDay = existingDayKey === dayKey;

  let newCount: number;
  if (daysSinceLastSeen > 2) newCount = 1;
  else if (isSameDay) newCount = existing.count;
  else newCount = existing.count + 1;

  await prisma.insightMemory.update({
    where: { userId_driver: { userId, driver } },
    data: { lastSeen: now, count: newCount },
  });
}

// ─── NEW: Build a user-facing memory narrative ────────────────────────────────

/**
 * Converts an internal driver + count into a sentence the user sees.
 * This is the "we've noticed this X times" layer that makes the app feel
 * like it's genuinely paying attention to her over time.
 */
function buildMemoryNarrative(driver: string, count: number): string | null {
  if (count < 2) return null; // first occurrence — no narrative yet

  const driverLabels: Record<string, { what: string; when: string }> = {
    sleep_below_baseline:    { what: "your sleep dipping below your normal",        when: "over the past several days" },
    stress_above_baseline:   { what: "elevated stress",                             when: "across recent days" },
    sleep_stress_amplification: { what: "sleep and stress affecting each other",    when: "recently" },
    mood_stress_coupling:    { what: "stress pulling your mood down",               when: "over recent days" },
    mood_trend_declining:    { what: "your mood trending lower",                    when: "over the past few days" },
    sleep_trend_declining:   { what: "your sleep gradually declining",              when: "over recent days" },
    bleeding_heavy:          { what: "heavier flow than usual",                     when: "recently" },
    high_strain:             { what: "your body under higher strain",               when: "recently" },
    sleep_variability_high:  { what: "inconsistent sleep",                          when: "over recent nights" },
    sedentary_strain:        { what: "lower activity combining with stress",        when: "recently" },
  };

  const label = driverLabels[driver];
  if (!label) return null;

  if (count === 2) {
    return `We've noticed ${label.what} ${label.when} — this is the second day we've seen this.`;
  }
  if (count <= 4) {
    return `We've been seeing ${label.what} for ${count} days now — it's becoming a short-term pattern.`;
  }
  // 5+ days — this is now a persistent pattern worth naming clearly
  return `This is the ${count}th day we've noticed ${label.what} — your body is telling you something consistent here.`;
}

/**
 * Full memory context object — returned in the insight payload so the
 * frontend can show the narrative prominently.
 */
export interface MemoryContext {
  driver: string;
  count: number;
  narrative: string | null;
  severity: "new" | "building" | "persistent";
}

export function buildMemoryContext(driver: string, count: number): MemoryContext {
  return {
    driver,
    count,
    narrative: buildMemoryNarrative(driver, count),
    severity: count <= 1 ? "new" : count <= 4 ? "building" : "persistent",
  };
}