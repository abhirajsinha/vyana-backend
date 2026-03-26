-- CreateTable
CREATE TABLE "InsightHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "primaryKey" TEXT NOT NULL,
    "driver" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InsightHistory_userId_createdAt_idx" ON "InsightHistory"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "InsightHistory" ADD CONSTRAINT "InsightHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
