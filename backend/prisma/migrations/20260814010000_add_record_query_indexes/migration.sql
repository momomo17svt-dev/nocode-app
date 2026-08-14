-- Indexes for paginated record lists, permission scopes, and JSONB filters.
CREATE INDEX "Record_appId_createdAt_idx" ON "Record"("appId", "createdAt" DESC);
CREATE INDEX "Record_appId_updatedAt_idx" ON "Record"("appId", "updatedAt" DESC);
CREATE INDEX "Record_appId_createdBy_idx" ON "Record"("appId", "createdBy");
CREATE INDEX "Record_dataJson_idx" ON "Record" USING GIN ("dataJson");
