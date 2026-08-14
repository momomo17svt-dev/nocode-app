-- AlterTable: レコードを対象社員フィールド基準で絞るための項目コード（nullable=既存データに無影響）
ALTER TABLE "App" ADD COLUMN "recordScopeField" TEXT;
