-- CreateTable
CREATE TABLE "Embedding" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "appId" TEXT,
    "recordId" TEXT,
    "docId" TEXT,
    "chunkIdx" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT NOT NULL,
    "vector" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "dim" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Embedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeDoc" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "appId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Embedding_source_idx" ON "Embedding"("source");

-- CreateIndex
CREATE INDEX "Embedding_appId_idx" ON "Embedding"("appId");

-- CreateIndex
CREATE INDEX "Embedding_recordId_idx" ON "Embedding"("recordId");

-- CreateIndex
CREATE INDEX "Embedding_docId_idx" ON "Embedding"("docId");

-- CreateIndex
CREATE INDEX "KnowledgeDoc_appId_idx" ON "KnowledgeDoc"("appId");
