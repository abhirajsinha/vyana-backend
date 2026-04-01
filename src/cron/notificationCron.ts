/**
 * Notification cron job — runs on a schedule to send phase-aware push notifications.
 *
 * Usage:
 *   - Import and call `startNotificationCron()` from your server entry point, OR
 *   - Run standalone: `npx ts-node src/cron/notificationCron.ts`
 *   - Or trigger via the admin endpoint: POST /api/admin/send-notifications
 *
 * The cron sends notifications to users who:
 *   1. Have a valid FCM token
 *   2. Haven't been notified in the last 20 hours
 */

import { getScheduledNotifications } from "../services/notificationScheduler";
import { sendNotificationBatch } from "../services/notificationService";

const CRON_INTERVAL_MS = 60 * 60 * 1000; // Run every hour

let cronTimer: ReturnType<typeof setInterval> | null = null;

async function runNotificationBatch(): Promise<void> {
  try {
    const scheduled = await getScheduledNotifications();
    if (scheduled.length === 0) return;

    const results = await sendNotificationBatch(scheduled);
    const successCount = results.filter((r) => r.success).length;

    console.log(JSON.stringify({
      type: "notification_cron",
      total: results.length,
      success: successCount,
      failed: results.length - successCount,
      timestamp: new Date().toISOString(),
    }));
  } catch (err) {
    console.error(JSON.stringify({
      type: "notification_cron_error",
      error: err instanceof Error ? err.message : "unknown",
      timestamp: new Date().toISOString(),
    }));
  }
}

export function startNotificationCron(): void {
  if (cronTimer) return; // Already running

  console.log("[notification-cron] Starting — interval: 1 hour");
  // Run immediately on start, then every hour
  void runNotificationBatch();
  cronTimer = setInterval(() => void runNotificationBatch(), CRON_INTERVAL_MS);
}

export function stopNotificationCron(): void {
  if (cronTimer) {
    clearInterval(cronTimer);
    cronTimer = null;
    console.log("[notification-cron] Stopped");
  }
}

// If run directly as a script, execute once and exit
if (require.main === module) {
  void runNotificationBatch().then(() => {
    console.log("[notification-cron] Single run complete");
    process.exit(0);
  });
}
