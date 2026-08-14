-- 上長(managerId)機能の破棄: 自己参照カラム・FK・インデックスを削除
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_managerId_fkey";
DROP INDEX IF EXISTS "User_managerId_idx";
ALTER TABLE "User" DROP COLUMN IF EXISTS "managerId";
