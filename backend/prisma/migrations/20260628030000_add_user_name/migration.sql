-- AlterTable: ユーザーの氏名（表示名）。nullable=既存データに無影響。null/空はログインIDで代替表示。
ALTER TABLE "User" ADD COLUMN "name" TEXT;
