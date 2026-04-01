import admin from "firebase-admin";
import type { ScheduledNotification } from "./notificationScheduler";
import { prisma } from "../lib/prisma";

// Initialize Firebase Admin SDK once
if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccount)),
    });
  } else {
    // In development, Firebase may not be configured — log and skip
    console.warn("[notification] FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled");
  }
}

export interface NotificationResult {
  userId: string;
  success: boolean;
  error?: string;
}

/**
 * Send a push notification to a single user via FCM.
 * Updates lastNotificationSentAt on success.
 */
export async function sendNotification(
  notification: ScheduledNotification,
): Promise<NotificationResult> {
  if (!admin.apps.length) {
    return { userId: notification.userId, success: false, error: "firebase_not_configured" };
  }

  try {
    await admin.messaging().send({
      token: notification.fcmToken,
      notification: {
        title: notification.template.title,
        body: notification.template.body,
      },
      android: { priority: "high" },
      apns: { payload: { aps: { sound: "default" } } },
    });

    await prisma.user.update({
      where: { id: notification.userId },
      data: { lastNotificationSentAt: new Date() },
    });

    return { userId: notification.userId, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown_error";

    // If the token is invalid/expired, clear it so we don't keep retrying
    if (
      message.includes("messaging/invalid-registration-token") ||
      message.includes("messaging/registration-token-not-registered")
    ) {
      await prisma.user.update({
        where: { id: notification.userId },
        data: { fcmToken: null },
      });
    }

    console.log(JSON.stringify({
      type: "notification_error",
      userId: notification.userId,
      error: message,
      timestamp: new Date().toISOString(),
    }));

    return { userId: notification.userId, success: false, error: message };
  }
}

/**
 * Send notifications to a batch of users. Returns results for each.
 */
export async function sendNotificationBatch(
  notifications: ScheduledNotification[],
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];
  for (const n of notifications) {
    const result = await sendNotification(n);
    results.push(result);
  }
  return results;
}
