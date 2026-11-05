-- Block 9: Better Auth's sign-in limit in the database (D-96). A counter in memory lives
-- and dies with each serverless instance. Better Auth removes the rows of windows long
-- gone, so an address stays here for about a minute.

-- CreateTable
CREATE TABLE "RateLimit" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RateLimit_key_key" ON "RateLimit"("key");
