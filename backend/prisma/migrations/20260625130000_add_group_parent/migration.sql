-- AlterTable: 組織ツリー用の親部署カラム（nullable=既存データに無影響）
ALTER TABLE "Group" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "Group_parentId_idx" ON "Group"("parentId");

-- AddForeignKey: 自己参照（親削除時は子を最上位へ）
ALTER TABLE "Group" ADD CONSTRAINT "Group_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
