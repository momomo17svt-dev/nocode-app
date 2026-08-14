import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';

const RECORD_LIMIT = 30;

@Injectable()
export class SearchService {
  constructor(
    private prisma: PrismaService,
    private permission: PermissionService,
  ) {}

  /** 閲覧可能なアプリ横断でアプリ名・レコード内容を全文検索（コマンドパレット用）。 */
  async search(userId: string, role: string, q: string) {
    const query = (q || '').trim().toLowerCase();
    if (query.length < 1) return { apps: [], records: [] };

    const ids = await this.permission.visibleAppIds(userId, role);
    const apps = await this.prisma.app.findMany({
      where: ids === null ? {} : { id: { in: ids.length ? ids : ['__none__'] } },
      orderBy: { updatedAt: 'desc' },
    });

    const appHits = apps
      .filter((a) => a.name.toLowerCase().includes(query))
      .slice(0, 8)
      .map((a) => ({ id: a.id, name: a.name }));

    const records: { appId: string; appName: string; recordId: string; title: string }[] = [];
    for (const app of apps) {
      if (records.length >= RECORD_LIMIT) break;
      const fields = await this.prisma.field.findMany({ where: { appId: app.id } });
      const titleField =
        fields.find((f) => f.fieldType === 'text') ||
        fields.find((f) => !['file', 'reference', 'subtable', 'section'].includes(f.fieldType));
      // owner/org 公開範囲のアプリでは非特権ユーザーはアクセス可能な作成者のレコードのみ検索対象にする。
      const allowed = await this.permission.allowedCreatorIds(app.id, userId, role);
      const recs = await this.prisma.record.findMany({
        where: { appId: app.id, ...(allowed ? { createdBy: { in: allowed } } : {}) },
        orderBy: { updatedAt: 'desc' },
      });
      for (const r of recs) {
        if (records.length >= RECORD_LIMIT) break;
        const data = (r.dataJson as any) || {};
        if (Object.values(data).some((v) => matchVal(v, query))) {
          records.push({
            appId: app.id,
            appName: app.name,
            recordId: r.id,
            title: (titleField && String(data?.[titleField.fieldCode] ?? '')) || '(無題のレコード)',
          });
        }
      }
    }
    return { apps: appHits, records };
  }
}

function matchVal(v: any, q: string): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'object') {
    if (v.label) return String(v.label).toLowerCase().includes(q);
    try { return JSON.stringify(v).toLowerCase().includes(q); } catch { return false; }
  }
  return String(v).toLowerCase().includes(q);
}
