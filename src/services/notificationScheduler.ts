import { prisma } from "../lib/prisma";
import { calculateCycleInfo, getCycleMode } from "./cycleEngine";
import { getNotificationForUser, type NotificationTemplate } from "./notificationTemplates";

export interface ScheduledNotification {
  userId: string;
  fcmToken: string;
  template: NotificationTemplate;
}

/**
 * Query users who are due for a notification:
 * - Have a valid fcmToken
 * - Haven't been notified in the last 20 hours
 *
 * Returns each user with their phase-appropriate notification template.
 */
export async function getScheduledNotifications(): Promise<ScheduledNotification[]> {
  const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000);

  const users = await prisma.user.findMany({
    where: {
      fcmToken: { not: null },
      OR: [
        { lastNotificationSentAt: null },
        { lastNotificationSentAt: { lt: cutoff } },
      ],
    },
    select: {
      id: true,
      fcmToken: true,
      lastPeriodStart: true,
      cycleLength: true,
      contraceptiveMethod: true,
      cycleRegularity: true,
    },
  });

  const results: ScheduledNotification[] = [];

  for (const user of users) {
    if (!user.fcmToken) continue;

    const cycleMode = getCycleMode({
      contraceptiveMethod: user.contraceptiveMethod,
      cycleRegularity: user.cycleRegularity,
    });
    const cycleInfo = calculateCycleInfo(
      user.lastPeriodStart,
      user.cycleLength,
      cycleMode,
    );

    const phase = cycleMode === "hormonal" ? null : cycleInfo.phase;
    const isPeriodDelayed = cycleInfo.currentDay > user.cycleLength;

    const template = getNotificationForUser(phase, cycleInfo.currentDay, isPeriodDelayed);

    results.push({
      userId: user.id,
      fcmToken: user.fcmToken,
      template,
    });
  }

  return results;
}
