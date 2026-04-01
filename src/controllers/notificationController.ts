import { Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { getScheduledNotifications } from "../services/notificationScheduler";
import { sendNotificationBatch } from "../services/notificationService";

/**
 * PUT /api/user/fcm-token — update the user's FCM push token.
 */
export async function updateFcmToken(req: Request, res: Response): Promise<void> {
  const { fcmToken } = req.body;
  if (!fcmToken || typeof fcmToken !== "string") {
    res.status(400).json({ error: "fcmToken is required" });
    return;
  }

  await prisma.user.update({
    where: { id: req.userId! },
    data: { fcmToken },
  });

  res.json({ success: true });
}

/**
 * POST /api/admin/send-notifications — trigger notification batch.
 * Protected by API key (checked in route middleware).
 */
export async function sendNotifications(req: Request, res: Response): Promise<void> {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || apiKey !== process.env.ADMIN_API_KEY) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const scheduled = await getScheduledNotifications();
  if (scheduled.length === 0) {
    res.json({ sent: 0, message: "No users due for notification" });
    return;
  }

  const results = await sendNotificationBatch(scheduled);
  const successCount = results.filter((r) => r.success).length;

  console.log(JSON.stringify({
    type: "notification_batch",
    total: results.length,
    success: successCount,
    failed: results.length - successCount,
    timestamp: new Date().toISOString(),
  }));

  res.json({
    sent: successCount,
    failed: results.length - successCount,
    total: results.length,
  });
}
