import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { basename, extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { EmbeddingService } from './embedding.service';
import { UpsertDocDto } from './dto/ai.dto';
import { extractDocumentText, normalizeCjkSpaces } from './document-extract.util';
import { parseGovDoc, detectGovLikely } from './gov-doc/gov-structure.util';

/** ナレッジ文書（RAG用のアップロードテキスト）のCRUD。保存時に埋め込みを再構築する。 */
@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private emb: EmbeddingService,
    private permission: PermissionService,
  ) {}

  // ===== 一般ユーザー向け（可視性チェック付き） =====
  /** 自分が検索できる（＝可視な）ナレッジ文書の一覧。appId=null(全員) or 可視アプリの文書のみ。 */
  async listVisible(userId: string, role: string) {
    const visible = await this.permission.visibleAppIds(userId, role); // null=全件(SystemAdmin)
    const where =
      visible === null
        ? {}
        : { OR: [{ appId: null }, { appId: { in: visible.length ? visible : ['__none__'] } }] };
    const docs = await this.prisma.knowledgeDoc.findMany({ where, orderBy: { updatedAt: 'desc' } });
    const counts = await this.prisma.embedding.groupBy({ by: ['docId'], where: { source: 'document' }, _count: true });
    const countMap: Record<string, number> = {};
    for (const c of counts) if (c.docId) countMap[c.docId] = c._count;
    const appIds = Array.from(new Set(docs.map((d) => d.appId).filter(Boolean))) as string[];
    const apps = appIds.length ? await this.prisma.app.findMany({ where: { id: { in: appIds } }, select: { id: true, name: true } }) : [];
    const appName: Record<string, string> = {};
    for (const a of apps) appName[a.id] = a.name;
    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      appId: d.appId,
      appName: d.appId ? appName[d.appId] || null : null,
      docKind: d.docKind || 'plain',
      meta: d.meta,
      sourceFileName: d.sourceFileName,
      chunks: countMap[d.id] || 0,
      length: d.content.length,
      updatedAt: d.updatedAt,
    }));
  }

  /** 可視な文書を1件取得（ビューア用・structure/meta/content込み）。可視外は403。 */
  async getVisible(id: string, userId: string, role: string) {
    const doc = await this.prisma.knowledgeDoc.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('文書が見つかりません');
    if (doc.appId) {
      const visible = await this.permission.visibleAppIds(userId, role);
      if (visible !== null && !visible.includes(doc.appId)) {
        throw new ForbiddenException('この文書を参照する権限がありません');
      }
    }
    return doc;
  }

  async list() {
    const docs = await this.prisma.knowledgeDoc.findMany({ orderBy: { updatedAt: 'desc' } });
    // インデックス済みチャンク数を併記
    const counts = await this.prisma.embedding.groupBy({ by: ['docId'], where: { source: 'document' }, _count: true });
    const countMap: Record<string, number> = {};
    for (const c of counts) if (c.docId) countMap[c.docId] = c._count;
    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      appId: d.appId,
      length: d.content.length,
      chunks: countMap[d.id] || 0,
      sourceFileName: d.sourceFileName,
      sourceMime: d.sourceMime,
      docKind: d.docKind || 'plain',
      meta: d.meta,
      updatedAt: d.updatedAt,
    }));
  }

  /** 取込テキストと種別ヒントから行政文書モードの保存フィールドを決める。 */
  private buildGovFields(content: string, kindHint?: string | null) {
    let isGov: boolean;
    if (kindHint === 'gov') isGov = true;
    else if (kindHint === 'plain') isGov = false;
    else isGov = detectGovLikely(content); // 未指定は自動判定
    if (!isGov) return { docKind: 'plain', structure: null as any, meta: null as any };
    const structure = parseGovDoc(content);
    return { docKind: 'gov', structure: structure as any, meta: structure.meta as any };
  }

  async get(id: string) {
    const doc = await this.prisma.knowledgeDoc.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('文書が見つかりません');
    return doc;
  }

  async create(dto: UpsertDocDto, userId: string) {
    // 貼り付け本文も PDF 由来の字間空白を正規化してから保存する（アップロードは抽出時に処理済み）。
    const content = normalizeCjkSpaces(dto.content);
    const gov = this.buildGovFields(content, dto.docKind);
    const doc = await this.prisma.knowledgeDoc.create({
      data: {
        title: dto.title.trim() || '無題の文書',
        content,
        appId: dto.appId || null,
        docKind: gov.docKind,
        structure: gov.structure,
        meta: gov.meta,
        createdBy: userId,
      },
    });
    await this.safeIndex(doc.id);
    return doc;
  }

  /** アップロードされたファイルから本文を抽出してナレッジ文書を作成する。 */
  async createFromUpload(
    file: { buffer: Buffer; originalName: string; mimeType: string },
    appId: string | null,
    userId: string,
    kind?: string | null,
  ) {
    const { text, truncated } = await extractDocumentText(file.buffer, file.originalName, file.mimeType);
    const base = basename(file.originalName, extname(file.originalName)).trim();
    const gov = this.buildGovFields(text, kind);
    const doc = await this.prisma.knowledgeDoc.create({
      data: {
        title: base || file.originalName || '無題の文書',
        content: text,
        appId: appId || null,
        sourceFileName: file.originalName,
        sourceMime: file.mimeType || null,
        docKind: gov.docKind,
        structure: gov.structure,
        meta: gov.meta,
        createdBy: userId,
      },
    });
    await this.safeIndex(doc.id);
    return { ...doc, truncated, chars: text.length };
  }

  async update(id: string, dto: UpsertDocDto) {
    const exists = await this.prisma.knowledgeDoc.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('文書が見つかりません');
    const content = normalizeCjkSpaces(dto.content);
    // 種別未指定なら既存の docKind を維持（gov→自動再解析）。明示指定があればそれに従う。
    const gov = this.buildGovFields(content, dto.docKind ?? exists.docKind);
    const doc = await this.prisma.knowledgeDoc.update({
      where: { id },
      data: {
        title: dto.title.trim() || '無題の文書',
        content,
        appId: dto.appId || null,
        docKind: gov.docKind,
        structure: gov.structure,
        meta: gov.meta,
      },
    });
    // 再インデックスは本文または種別が変わったときだけ。
    // タイトル/公開範囲だけの編集で大量チャンクを再埋め込みしてリクエストが固まるのを防ぐ。
    const needReindex = exists.content !== content || (exists.docKind || 'plain') !== gov.docKind;
    if (needReindex) {
      // 大きな文書の再埋め込みは時間がかかるためレスポンスをブロックしない（保存は即時成功・索引は追従）。
      void this.safeIndex(doc.id);
    }
    return doc;
  }

  async remove(id: string) {
    const exists = await this.prisma.knowledgeDoc.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('文書が見つかりません');
    await this.emb.removeDocument(id);
    await this.prisma.knowledgeDoc.delete({ where: { id } });
    return { ok: true };
  }

  /** 保存前の構造プレビュー（解析のみ・永続化しない）。 */
  parse(content: string) {
    return parseGovDoc(content || '');
  }

  /** 埋め込み生成は LLM 未接続でも文書保存自体は成功させる。 */
  private async safeIndex(docId: string) {
    try {
      await this.emb.indexDocument(docId);
    } catch (e: any) {
      // 接続不可等。文書は保存済みなので後で再インデックス可能。
      console.error('[ai-doc-index]', e?.message || e);
    }
  }
}
