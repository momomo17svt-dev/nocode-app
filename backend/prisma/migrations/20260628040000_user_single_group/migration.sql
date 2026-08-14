-- 所属構造を「多対多(GroupMember)」から「1人1部署(User.groupId)」へ統一する。

-- 1) User に単一所属部署カラムを追加
ALTER TABLE "User" ADD COLUMN "groupId" TEXT;

-- 2) 既存の GroupMember から1人につき1部署を引き継ぐ（最も古い所属を採用）
UPDATE "User" u
SET "groupId" = gm."groupId"
FROM (
  SELECT DISTINCT ON ("userId") "userId", "groupId"
  FROM "GroupMember"
  ORDER BY "userId", "createdAt" ASC
) gm
WHERE gm."userId" = u.id;

-- 3) 外部キー（部署削除時は SetNull で未所属へ）
ALTER TABLE "User"
  ADD CONSTRAINT "User_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4) 所属での引き当て高速化
CREATE INDEX "User_groupId_idx" ON "User"("groupId");

-- 5) 多対多テーブルを廃止
DROP TABLE "GroupMember";
