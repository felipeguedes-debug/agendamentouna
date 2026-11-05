-- D-85: a manual block goes to the professional's secondary calendar as "Bloqueado".
-- It carries the export mark, like the appointment (D-62), and stays until Google
-- forgets its event: removing it sets deletedAt, and the export deletes the row.

-- AlterTable
ALTER TABLE "TimeBlock" ADD COLUMN     "deletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "googleSyncAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "googleSyncError" TEXT,
ADD COLUMN     "googleSyncRequestedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "TimeBlock_googleSyncRequestedAt_idx" ON "TimeBlock"("googleSyncRequestedAt");
