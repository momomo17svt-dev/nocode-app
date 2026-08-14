import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { basename, extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { EmbeddingService } from './embedding.service';
import { UpsertDocDto } from './dto/ai.dto';
import { extractDocumentText, normalizeCjkSpaces } from './document-extract.util';
import { parseGovDoc, detectGovLikely } from './gov-doc/gov-structure.util';

export type KnowledgeVisibilityMode = 'all' | 'groups' | 'legacy';

interface KnowledgeVisibilityInput {
  appId?: string | null;
  visibilityMode?: KnowledgeVisibilityMode;
  groupIds?: string[];
  includeDescendants?: boolean;
}

/** ナレッジ文書（RAG用のアップロードテキスト）のCRUD。保存時に埋め込みを再構築する。 */
@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private emb: EmbeddingService,
    private permission: PermissionService,
  ) {}

  // ===== 一般ユーザー向け（可視性チェック付き） =====
  /** ユーザーが閲覧可能なナレッジ文書ID。SystemAdmin は null（全件）を返す。 */
  async visibleIds(userId: string, role: string): Promise<string[] | null> {
    if (role === 'SystemAdmin') return null;

    const [visibleApps, user] = await Promise.all([
      this.permission.visibleAppIds(userId, role),
      this.prisma.user.findUnique({ where: { id: userId }, select: { groupId: true } }),
    ]);
    const clauses: any[] = [
      { visibilityMode: 'all' },
      {
        visibilityMode: 'legacy',
        OR: [
          { appId: null },
          { appId: { in: visibleApps === null ? [] : (visibleApps.length ? visibleApps : ['__none__']) } },
        ],
      },
    ];

    if (user?.groupId) {
      const ancestors = await this.ancestorGroupIds(user.groupId);
      clauses.push(
        { visibilityMode: 'groups', includeDescendants: false, audiences: { some: { groupId: user.groupId } } },
        { visibilityMode: 'groups', includeDescendants: true, audiences: { some: { groupId: { in: ancestors } } } },
      );
    }

    const docs = await this.prisma.knowledgeDoc.findMany({ where: { OR: clauses }, select: { id: true } });
    return docs.map((d) => d.id);
  }

  /** 自分が検索できる（＝可視な）ナレッジ文書の一覧。 */
  async listVisible(userId: string, role: string) {
    const visible = await this.visibleIds(userId, role);
    const where = visible === null ? {} : { id: { in: visible.length ? visible : ['__none__'] } };
    const docs = await this.prisma.knowledgeDoc.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { audiences: { include: { group: { select: { id: true, name: true } } } } },
    });
    return this.decorateList(docs);
  }

  private async decorateList(docs: any[]) {
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
      visibilityMode: (d.visibilityMode || (d.appId ? 'legacy' : 'all')) as KnowledgeVisibilityMode,
      includeDescendants: d.includeDescendants !== false,
      groups: (d.audiences || []).map((a: any) => ({ id: a.group.id, name: a.group.name })),
      docKind: d.docKind || 'plain',
      meta: d.meta,
      sourceFileName: d.sourceFileName,
      sourceMime: d.sourceMime,
      chunks: countMap[d.id] || 0,
      length: d.content.length,
      updatedAt: d.updatedAt,
    }));
  }

  /** 自部署から最上位部署までのID（自部署を含む）。配下公開の判定に使う。 */
  private async ancestorGroupIds(groupId: string): Promise<string[]> {
    const ids: string[] = [];
    const visited = new Set<string>();
    let current: string | null = groupId;
    while (current && !visited.has(current) && ids.length < 50) {
      visited.add(current);
      ids.push(current);
      const group: { parentId: string | null } | null = await this.prisma.group.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      current = group?.parentId || null;
    }
    return ids;
  }

  private async normalizeVisibility(
    input: KnowledgeVisibilityInput,
    fallback?: KnowledgeVisibilityInput,
  ): Promise<{ mode: KnowledgeVisibilityMode; groupIds: string[]; includeDescendants: boolean; appId: string | null }> {
    const mode = input.visibilityMode || fallback?.visibilityMode || (input.appId ? 'legacy' : 'all');
    if (!['all', 'groups', 'legacy'].includes(mode)) {
      throw new BadRequestException('公開範囲の指定が正しくありません');
    }
    const groupIds = Array.from(new Set(input.groupIds ?? fallback?.groupIds ?? [])).filter(Boolean);
    const includeDescendants = input.includeDescendants ?? fallback?.includeDescendants ?? true;
    const appId = mode === 'legacy' ? (input.appId ?? fallback?.appId ?? null) : null;

    if (mode === 'groups') {
      if (groupIds.length === 0) throw new BadRequestException('公開する部署を1つ以上選択してください');
      const count = await this.prisma.group.count({ where: { id: { in: groupIds } } });
      if (count !== groupIds.length) throw new BadRequestException('存在しない部署が公開範囲に含まれています');
    }
    return { mode, groupIds: mode === 'groups' ? groupIds : [], includeDescendants, appId };
  }

  /** 可視な文書を1件取得（ビューア用・structure/meta/content込み）。可視外は403。 */
  async getVisible(id: string, userId: string, role: string) {
    const doc = await this.prisma.knowledgeDoc.findUnique({
      where: { id },
      include: { audiences: { include: { group: { select: { id: true, name: true } } } } },
    });
    if (!doc) throw new NotFoundException('文書が見つかりません');
    const visible = await this.visibleIds(userId, role);
    if (visible !== null && !visible.includes(doc.id)) {
      throw new ForbiddenException('この文書を参照する権限がありません');
    }
    return { ...doc, groups: doc.audiences.map((a) => ({ id: a.group.id, name: a.group.name })) };
  }

  async list() {
    const docs = await this.prisma.knowledgeDoc.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { audiences: { include: { group: { select: { id: true, name: true } } } } },
    });
    return this.decorateList(docs);
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
    const doc = await this.prisma.knowledgeDoc.findUnique({
      where: { id },
      include: { audiences: { include: { group: { select: { id: true, name: true } } } } },
    });
    if (!doc) throw new NotFoundException('文書が見つかりません');
    return { ...doc, groups: doc.audiences.map((a) => ({ id: a.group.id, name: a.group.name })) };
  }

  async create(dto: UpsertDocDto, userId: string) {
    // 貼り付け本文も PDF 由来の字間空白を正規化してから保存する（アップロードは抽出時に処理済み）。
    const content = normalizeCjkSpaces(dto.content);
    const gov = this.buildGovFields(content, dto.docKind);
    const visibility = await this.normalizeVisibility(dto);
    const doc = await this.prisma.knowledgeDoc.create({
      data: {
        title: dto.title.trim() || '無題の文書',
        content,
        appId: visibility.appId,
        visibilityMode: visibility.mode,
        includeDescendants: visibility.includeDescendants,
        audiences: visibility.groupIds.length
          ? { create: visibility.groupIds.map((groupId) => ({ groupId })) }
          : undefined,
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
    visibilityInput: KnowledgeVisibilityInput,
    userId: string,
    kind?: string | null,
  ) {
    const { text, truncated } = await extractDocumentText(file.buffer, file.originalName, file.mimeType);
    const base = basename(file.originalName, extname(file.originalName)).trim();
    const gov = this.buildGovFields(text, kind);
    const visibility = await this.normalizeVisibility(visibilityInput);
    const doc = await this.prisma.knowledgeDoc.create({
      data: {
        title: base || file.originalName || '無題の文書',
        content: text,
        appId: visibility.appId,
        visibilityMode: visibility.mode,
        includeDescendants: visibility.includeDescendants,
        audiences: visibility.groupIds.length
          ? { create: visibility.groupIds.map((groupId) => ({ groupId })) }
          : undefined,
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
    const exists = await this.prisma.knowledgeDoc.findUnique({
      where: { id },
      include: { audiences: { select: { groupId: true } } },
    });
    if (!exists) throw new NotFoundException('文書が見つかりません');
    const content = normalizeCjkSpaces(dto.content);
    // 種別未指定なら既存の docKind を維持（gov→自動再解析）。明示指定があればそれに従う。
    const gov = this.buildGovFields(content, dto.docKind ?? exists.docKind);
    const visibility = await this.normalizeVisibility(dto, {
      visibilityMode: (exists.visibilityMode || (exists.appId ? 'legacy' : 'all')) as KnowledgeVisibilityMode,
      appId: exists.appId,
      includeDescendants: exists.includeDescendants,
      groupIds: exists.audiences.map((a) => a.groupId),
    });
    const doc = await this.prisma.knowledgeDoc.update({
      where: { id },
      data: {
        title: dto.title.trim() || '無題の文書',
        content,
        appId: visibility.appId,
        visibilityMode: visibility.mode,
        includeDescendants: visibility.includeDescendants,
        audiences: {
          deleteMany: {},
          create: visibility.groupIds.map((groupId) => ({ groupId })),
        },
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
