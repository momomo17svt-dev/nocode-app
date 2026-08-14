-- AlterTable
ALTER TABLE "App" ADD COLUMN     "creatorEditOwn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "creatorDeleteOwn" BOOLEAN NOT NULL DEFAULT false;
