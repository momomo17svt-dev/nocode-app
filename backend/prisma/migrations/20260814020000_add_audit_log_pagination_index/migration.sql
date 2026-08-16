-- Stable newest-first pagination for the audit log administration screen.
CREATE INDEX "AuditLog_createdAt_id_idx" ON "AuditLog"("createdAt" DESC, "id" DESC);
