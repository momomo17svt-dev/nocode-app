-- グループ→所属メンバーの引き当てを高速化するインデックス。
-- 権限の組織スコープ判定(orgScopedUserIds)とメンバー一覧の groupId 検索で利用する。
CREATE INDEX "GroupMember_groupId_idx" ON "GroupMember"("groupId");
