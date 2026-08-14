-- AlterTable: 上長(直属の上司)カラム（nullable=既存データに無影響）
ALTER TABLE "User" ADD COLUMN "managerId" TEXT;

-- CreateIndex
CREATE INDEX "User_managerId_idx" ON "User"("managerId");

-- AddForeignKey: 自己参照（上長削除時は部下を上長なしへ）
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
