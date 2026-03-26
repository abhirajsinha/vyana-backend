-- CreateTable
CREATE TABLE "InsightCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InsightCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InsightCache_userId_date_key" ON "InsightCache"("userId", "date");

-- CreateIndex
CREATE INDEX "InsightCache_userId_date_idx" ON "InsightCache"("userId", "date" DESC);

-- AddForeignKey
ALTER TABLE "InsightCache" ADD CONSTRAINT "InsightCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
