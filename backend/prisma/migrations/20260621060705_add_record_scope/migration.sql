-- AlterTable
ALTER TABLE "App" ADD COLUMN     "recordEditScope" TEXT NOT NULL DEFAULT 'all',
ADD COLUMN     "recordViewScope" TEXT NOT NULL DEFAULT 'all';
