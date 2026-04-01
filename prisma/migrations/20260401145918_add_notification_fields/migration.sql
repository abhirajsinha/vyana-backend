-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastNotificationSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "InsightHistory_userId_driver_cycleDay_idx" ON "InsightHistory"("userId", "driver", "cycleDay");
