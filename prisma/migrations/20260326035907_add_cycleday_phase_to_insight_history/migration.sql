-- AlterTable
ALTER TABLE "InsightHistory" ADD COLUMN     "cycleDay" INTEGER,
ADD COLUMN     "phase" TEXT;

-- AlterTable
ALTER TABLE "InsightMemory" ALTER COLUMN "lastSeen" DROP DEFAULT;
