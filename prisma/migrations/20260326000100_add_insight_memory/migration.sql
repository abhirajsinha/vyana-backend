-- CreateTable
CREATE TABLE "InsightMemory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "driver" TEXT NOT NULL,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "count" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "InsightMemory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InsightMemory_userId_driver_key" ON "InsightMemory"("userId", "driver");

-- CreateIndex
CREATE INDEX "InsightMemory_userId_lastSeen_idx" ON "InsightMemory"("userId", "lastSeen" DESC);

-- AddForeignKey
ALTER TABLE "InsightMemory" ADD CONSTRAINT "InsightMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

