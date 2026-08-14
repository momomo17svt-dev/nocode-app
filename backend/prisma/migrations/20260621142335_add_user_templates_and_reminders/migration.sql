-- AlterTable
ALTER TABLE "App" ADD COLUMN     "reminderConfig" JSONB;

-- CreateTable
CREATE TABLE "UserTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'マイテンプレート',
    "icon" TEXT NOT NULL DEFAULT 'LayoutGrid',
    "summary" TEXT,
    "definition" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserTemplate_pkey" PRIMARY KEY ("id")
);
