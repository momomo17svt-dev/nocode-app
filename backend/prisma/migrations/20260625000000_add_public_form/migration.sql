-- AlterTable
ALTER TABLE "App" ADD COLUMN     "publicFormEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "publicFormToken" TEXT,
ADD COLUMN     "publicFormConfig" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "App_publicFormToken_key" ON "App"("publicFormToken");
