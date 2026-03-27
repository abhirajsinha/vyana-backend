-- CreateTable
CREATE TABLE "HealthPatternCache" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthPatternCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HealthPatternCache_userId_key" ON "HealthPatternCache"("userId");

-- AddForeignKey
ALTER TABLE "HealthPatternCache" ADD CONSTRAINT "HealthPatternCache_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
