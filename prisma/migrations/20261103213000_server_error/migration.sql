-- Block 9: the errors of the operation's panel (D-101, PRD 7). Where it happened and which
-- kind, never the message, which could carry a patient's data (D-28).

-- CreateTable
CREATE TABLE "ServerError" (
    "id" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "errorName" TEXT NOT NULL,
    "digest" TEXT,

    CONSTRAINT "ServerError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServerError_practiceId_occurredAt_idx" ON "ServerError"("practiceId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServerError_id_practiceId_key" ON "ServerError"("id", "practiceId");

-- AddForeignKey
ALTER TABLE "ServerError" ADD CONSTRAINT "ServerError_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "Practice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The practice of a row never changes (D-30).
CREATE TRIGGER "ServerError_practice_immutable"
  BEFORE UPDATE OF "practiceId" ON "ServerError"
  FOR EACH ROW EXECUTE FUNCTION forbid_practice_change();
