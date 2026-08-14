-- 行政文書の構造特化RAG: ナレッジ文書に構造解析（行政文書モード）を、埋め込みに構造メタを追加。
-- すべて nullable のため、稼働中の旧サーバ・既存データに影響しない（後方互換）。

-- AlterTable: KnowledgeDoc に行政文書モードの列を追加
ALTER TABLE "KnowledgeDoc" ADD COLUMN     "docKind" TEXT;
ALTER TABLE "KnowledgeDoc" ADD COLUMN     "structure" JSONB;
ALTER TABLE "KnowledgeDoc" ADD COLUMN     "meta" JSONB;

-- AlterTable: Embedding に構造メタ（条引用・閲覧ジャンプ用）を追加
ALTER TABLE "Embedding" ADD COLUMN     "structPath" TEXT;
ALTER TABLE "Embedding" ADD COLUMN     "structLabel" TEXT;
ALTER TABLE "Embedding" ADD COLUMN     "structAnchor" TEXT;
