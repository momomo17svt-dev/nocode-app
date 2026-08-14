import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService, LLM_PRIORITY } from '../llm/llm.service';
import { recordToText, FieldLite } from '../common/record-text.util';
import { LlmConfig } from '../llm/llm.types';
import { parseGovDoc } from './gov-doc/gov-structure.util';
import { chunkGov } from './gov-doc/gov-chunk.util';
import { GovStructure } from './gov-doc/gov-types';
import { chunkStructured, ExtraHeadingPattern } from './structured-chunk.util';
import { buildHintMessages, derivePatterns, parseHintResponse, sampleForHint } from './chunk-hint.util';

interface PendingItem {
  source: 'record' | 'document';
  appId?: string | null;
  recordId?: string | null;
  docId?: string | null;
  chunkIdx: number;
  content: string;
  structPath?: string | null;
  structLabel?: string | null;
  structAnchor?: string | null;
}

const EMBED_BATCH = 16;

/**
 * 埋め込み（ベクトル）インデックスの構築・更新・検索基盤。
 * pgvector は使わず number[] を JSON 保存し、検索時に Node 側でコサイン類似度を総当たりする。
 */
@Injectable()
export class EmbeddingService {
  constructor(
    private prisma: PrismaService,
    private llm: LlmService,
  ) {}

  // ===== テキスト分割 =====
  chunk(text: string, size: number, overlap: number): string[] {
    const clean = (text || '').replace(/\r\n/g, '\n').trim();
    if (!clean) return [];
    if (clean.length <= size) return [clean];
    const step = Math.max(size - overlap, 1);
    const out: string[] = [];
    for (let i = 0; i < clean.length; i += step) {
      out.push(clean.slice(i, i + size));
      if (i + size >= clean.length) break;
    }
    return out;
  }

  // ===== 類似度 =====
  cosine(a: number[], b: number[]): number {
    // 次元が異なるベクトル（埋め込みモデル混在）は比較不能なので無効(0)として除外する。
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0, na = 0, nb = 0;
    const n = a.length;
    for (let i = 0; i < n; i++) {
      dot += a[i] * b[i];
      na += a[i] * a[i];
      nb += b[i] * b[i];
    }
    if (na === 0 || nb === 0) return 0;
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  // ===== レコードのインデックス =====
  /** 設定で有効かつ対象アプリのときのみインデックスする（保存フックから呼ぶ）。 */
  async maybeIndexRecord(appId: string, recordId: string): Promise<void> {
    const cfg = await this.llm.getConfig();
    if (!cfg.enabled) return; // 埋め込みモデルは indexRecord 内で自動解決する
    if (!cfg.indexedAppIds.includes(appId)) return;
    await this.indexRecord(recordId, cfg);
  }

  async indexRecord(recordId: string, cfg?: LlmConfig): Promise<void> {
    cfg = cfg || (await this.llm.getConfig());
    const rec = await this.prisma.record.findUnique({ where: { id: recordId } });
    if (!rec) return;
    const app = await this.prisma.app.findUnique({ where: { id: rec.appId } });
    const fields = await this.fieldsOf(rec.appId);
    const userMap = await this.userMap();
    await this.prisma.embedding.deleteMany({ where: { recordId } });
    const text = recordToText(fields, (rec.dataJson as any) || {}, userMap);
    if (!text.trim()) return;
    const header = `【${app?.name ?? ''}】`;
    const items: PendingItem[] = this.chunk(text, cfg.chunkSize, cfg.chunkOverlap).map((c, i) => ({
      source: 'record',
      appId: rec.appId,
      recordId,
      chunkIdx: i,
      content: `${header}\n${c}`,
    }));
    await this.persist(items, cfg);
  }

  /** アプリ全レコードを再インデックス。 */
  async indexApp(appId: string, cfg?: LlmConfig): Promise<{ records: number; chunks: number }> {
    cfg = cfg || (await this.llm.getConfig());
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException('アプリが見つかりません');
    const fields = await this.fieldsOf(appId);
    const records = await this.prisma.record.findMany({ where: { appId } });
    const userMap = await this.userMap();
    await this.prisma.embedding.deleteMany({ where: { source: 'record', appId } });

    const header = `【${app.name}】`;
    const items: PendingItem[] = [];
    for (const r of records) {
      const text = recordToText(fields, (r.dataJson as any) || {}, userMap);
      if (!text.trim()) continue;
      this.chunk(text, cfg.chunkSize, cfg.chunkOverlap).forEach((c, i) =>
        items.push({ source: 'record', appId, recordId: r.id, chunkIdx: i, content: `${header}\n${c}` }),
      );
    }
    await this.persist(items, cfg);
    return { records: records.length, chunks: items.length };
  }

  async removeRecord(recordId: string): Promise<void> {
    await this.prisma.embedding.deleteMany({ where: { recordId } });
  }

  async removeRecords(ids: string[]): Promise<void> {
    if (ids.length) await this.prisma.embedding.deleteMany({ where: { recordId: { in: ids } } });
  }

  // ===== 文書のインデックス =====
  async indexDocument(docId: string, cfg?: LlmConfig): Promise<{ chunks: number }> {
    cfg = cfg || (await this.llm.getConfig());
    const doc = await this.prisma.knowledgeDoc.findUnique({ where: { id: docId } });
    if (!doc) return { chunks: 0 };
    await this.prisma.embedding.deleteMany({ where: { docId } });

    let items: PendingItem[];
    if (doc.docKind === 'gov') {
      // 行政文書: 常に最新パーサで解析し直し、保存済み structure/meta も更新する。
      // （パーサ改善が「再インデックス」で既存文書へ反映され、ビューア表示とも一致する）
      const structure: GovStructure = parseGovDoc(doc.content || '');
      await this.prisma.knowledgeDoc
        .update({ where: { id: docId }, data: { structure: structure as any, meta: structure.meta as any } })
        .catch(() => {});
      const govChunks = chunkGov(structure, { title: structure.title || doc.title, chunkSize: cfg.chunkSize });
      items = govChunks.map((c, i) => ({
        source: 'document',
        appId: doc.appId ?? null,
        docId,
        chunkIdx: i,
        content: c.content,
        structPath: c.structPath,
        structLabel: c.structLabel,
        structAnchor: c.structAnchor,
      }));
      // 構造解析できず空なら、念のため通常チャンクへフォールバック。
      if (items.length === 0) items = await this.flatDocChunks(doc, cfg);
    } else {
      items = await this.flatDocChunks(doc, cfg);
    }
    await this.persist(items, cfg);
    return { chunks: items.length };
  }

  /**
   * 一般文書（plain）のチャンク。
   * 1) 既定の見出しパターンで規則性検出 → 2) 見出しが見つからない長文は LLM に冒頭を読ませて
   * 文書固有の区切りパターンを推定して再分割 → 3) それでも無理なら段落詰め／固定長フォールバック。
   */
  private async flatDocChunks(doc: { title: string; content: string | null; appId: string | null; id: string }, cfg: LlmConfig): Promise<PendingItem[]> {
    const content = doc.content || '';
    let structured = chunkStructured(content, { title: doc.title, chunkSize: cfg.chunkSize });
    if (!structured?.some((c) => c.structPath) && content.length > cfg.chunkSize) {
      const extras = await this.inferHeadingPatterns(content, cfg);
      if (extras.length) {
        const inferred = chunkStructured(content, { title: doc.title, chunkSize: cfg.chunkSize, extraPatterns: extras });
        if (inferred?.some((c) => c.structPath)) structured = inferred;
      }
    }
    if (structured) {
      return structured.map((c, i) => ({
        source: 'document',
        appId: doc.appId ?? null,
        docId: doc.id,
        chunkIdx: i,
        content: c.content,
        structPath: c.structPath ?? null,
        structLabel: c.structLabel ?? null,
      }));
    }
    // 規則性が見つからない文書（句読点も改行も無い塊）だけ従来の固定長＋オーバーラップ
    const header = `【${doc.title}】`;
    return this.chunk(content, cfg.chunkSize, cfg.chunkOverlap).map((c, i) => ({
      source: 'document',
      appId: doc.appId ?? null,
      docId: doc.id,
      chunkIdx: i,
      content: `${header}\n${c}`,
    }));
  }

  /**
   * LLM に文書冒頭を見せて見出し行の実例を抜き出させ、行頭パターンへ一般化する。
   * チャットモデル未ロード・タイムアウト・不正応答時は空配列（既定の分割にフォールバック）。
   */
  private async inferHeadingPatterns(content: string, cfg: LlmConfig): Promise<ExtraHeadingPattern[]> {
    if (!cfg.enabled) return [];
    try {
      const sample = sampleForHint(content);
      const raw = await this.llm.chat(buildHintMessages(sample), {
        priority: LLM_PRIORITY.index, // 背景処理：対話・検索を待たせない
        temperature: 0,
        maxTokens: 300,
      });
      return derivePatterns(parseHintResponse(raw), sample);
    } catch {
      return [];
    }
  }

  async removeDocument(docId: string): Promise<void> {
    await this.prisma.embedding.deleteMany({ where: { docId } });
  }

  // ===== 全体再構築 =====
  async reindexAll(): Promise<{ apps: number; records: number; recordChunks: number; documents: number; docChunks: number }> {
    const cfg = await this.llm.getConfig();
    await this.prisma.embedding.deleteMany({});
    let records = 0, recordChunks = 0;
    for (const appId of cfg.indexedAppIds) {
      try {
        const r = await this.indexApp(appId, cfg);
        records += r.records;
        recordChunks += r.chunks;
      } catch {
        /* 対象アプリが消えている等はスキップ */
      }
    }
    const docs = await this.prisma.knowledgeDoc.findMany({ select: { id: true } });
    let docChunks = 0;
    for (const d of docs) {
      try {
        docChunks += (await this.indexDocument(d.id, cfg)).chunks;
      } catch {
        /* skip */
      }
    }
    return { apps: cfg.indexedAppIds.length, records, recordChunks, documents: docs.length, docChunks };
  }

  // ===== 状態 =====
  async status() {
    const cfg = await this.llm.getConfig();
    const [total, recordChunks, docChunks, documents, models] = await Promise.all([
      this.prisma.embedding.count(),
      this.prisma.embedding.count({ where: { source: 'record' } }),
      this.prisma.embedding.count({ where: { source: 'document' } }),
      this.prisma.knowledgeDoc.count(),
      this.prisma.embedding.findMany({ distinct: ['model', 'dim'], select: { model: true, dim: true } }),
    ]);
    // 実際に使われる埋め込みモデル（空設定なら自動解決）を基準に不一致を検知
    let current = cfg.embedModel;
    if (!current) {
      try {
        current = await this.llm.resolveEmbedModel(cfg);
      } catch {
        current = '';
      }
    }
    const modelMismatch = models.length > 0 && current ? models.some((m) => m.model !== current) : false;
    return {
      enabled: cfg.enabled,
      embedModel: current,
      indexedAppIds: cfg.indexedAppIds,
      total,
      recordChunks,
      docChunks,
      documents,
      models,
      modelMismatch,
    };
  }

  // ===== 内部 =====
  private async persist(items: PendingItem[], cfg: LlmConfig): Promise<void> {
    if (items.length === 0) return;
    // 実際に使う埋め込みモデルを一度だけ解決（空設定なら LM Studio のロード済みを自動選択）
    const model = await this.llm.resolveEmbedModel(cfg);
    for (let i = 0; i < items.length; i += EMBED_BATCH) {
      const batch = items.slice(i, i + EMBED_BATCH);
      // 背景インデックスは低優先度：対話・検索を待たせない
      const vectors = await this.llm.embed(batch.map((b) => b.content), model, { priority: LLM_PRIORITY.index });
      const rows = batch.map((b, j) => {
        const vec = vectors[j] || [];
        return {
          source: b.source,
          appId: b.appId ?? null,
          recordId: b.recordId ?? null,
          docId: b.docId ?? null,
          chunkIdx: b.chunkIdx,
          content: b.content,
          vector: vec as any,
          model,
          dim: vec.length,
          structPath: b.structPath ?? null,
          structLabel: b.structLabel ?? null,
          structAnchor: b.structAnchor ?? null,
        };
      });
      await this.prisma.embedding.createMany({ data: rows });
    }
  }

  private async fieldsOf(appId: string): Promise<FieldLite[]> {
    const fields = await this.prisma.field.findMany({ where: { appId } });
    return fields.map((f) => ({ fieldCode: f.fieldCode, fieldType: f.fieldType, label: f.label, settings: f.settings as any }));
  }

  private async userMap(): Promise<Record<string, string>> {
    const users = await this.prisma.user.findMany({ select: { id: true, loginId: true } });
    const m: Record<string, string> = {};
    for (const u of users) m[u.id] = u.loginId;
    return m;
  }
}
