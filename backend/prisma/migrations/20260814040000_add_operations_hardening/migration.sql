-- 認証ポリシー、同時編集防止、ゴミ箱、外部APIトークンの基盤。
ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Record" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "LoginThrottle" (
  "key" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "firstFailedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "LoginThrottle_updatedAt_idx" ON "LoginThrottle"("updatedAt");

CREATE TABLE "DeletedRecord" (
  "id" TEXT NOT NULL,
  "originalId" TEXT NOT NULL,
  "appId" TEXT NOT NULL,
  "appName" TEXT NOT NULL,
  "snapshot" JSONB NOT NULL,
  "deletedBy" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeletedRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DeletedRecord_originalId_key" ON "DeletedRecord"("originalId");
CREATE INDEX "DeletedRecord_deletedAt_idx" ON "DeletedRecord"("deletedAt" DESC);
CREATE INDEX "DeletedRecord_expiresAt_idx" ON "DeletedRecord"("expiresAt");
CREATE INDEX "DeletedRecord_appId_idx" ON "DeletedRecord"("appId");

CREATE TABLE "ApiToken" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "tokenPrefix" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "readOnly" BOOLEAN NOT NULL DEFAULT true,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApiToken_tokenHash_key" ON "ApiToken"("tokenHash");
CREATE INDEX "ApiToken_ownerId_idx" ON "ApiToken"("ownerId");
CREATE INDEX "ApiToken_createdAt_idx" ON "ApiToken"("createdAt" DESC);
