-- AlterTable
ALTER TABLE "User"
ADD COLUMN "contraceptiveMethod" TEXT,
ADD COLUMN "cycleRegularity" TEXT,
ADD COLUMN "cycleMode" TEXT NOT NULL DEFAULT 'natural';

-- CreateTable
CREATE TABLE "CycleHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "cycleLength" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CycleHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CycleHistory_userId_startDate_idx" ON "CycleHistory"("userId", "startDate" DESC);

-- AddForeignKey
ALTER TABLE "CycleHistory" ADD CONSTRAINT "CycleHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
