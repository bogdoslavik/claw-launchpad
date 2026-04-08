-- AlterTable
ALTER TABLE "ApiSession"
ADD COLUMN "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "ApiSession_expiresAt_idx" ON "ApiSession"("expiresAt");
