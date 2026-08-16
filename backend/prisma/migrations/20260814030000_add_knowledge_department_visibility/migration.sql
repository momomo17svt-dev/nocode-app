-- ナレッジの公開範囲を、アプリ権限から全社／部署単位へ移行する。
-- 既存の全ユーザー文書は全社公開へ、アプリ限定文書は従来権限を維持する。
ALTER TABLE "KnowledgeDoc"
  ADD COLUMN "visibilityMode" TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN "includeDescendants" BOOLEAN NOT NULL DEFAULT true;

UPDATE "KnowledgeDoc"
SET "visibilityMode" = 'all'
WHERE "appId" IS NULL;

ALTER TABLE "KnowledgeDoc"
  ALTER COLUMN "visibilityMode" SET DEFAULT 'all';

CREATE TABLE "KnowledgeDocAudience" (
  "docId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  CONSTRAINT "KnowledgeDocAudience_pkey" PRIMARY KEY ("docId", "groupId")
);

CREATE INDEX "KnowledgeDoc_visibilityMode_idx" ON "KnowledgeDoc"("visibilityMode");
CREATE INDEX "KnowledgeDocAudience_groupId_idx" ON "KnowledgeDocAudience"("groupId");

ALTER TABLE "KnowledgeDocAudience"
  ADD CONSTRAINT "KnowledgeDocAudience_docId_fkey"
  FOREIGN KEY ("docId") REFERENCES "KnowledgeDoc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "KnowledgeDocAudience"
  ADD CONSTRAINT "KnowledgeDocAudience_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
