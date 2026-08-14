import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';

export interface AppSummary {
  id: string;
  name: string;
  status: string;
  total: number;
  open: number;
  hasProcess: boolean;
}

export interface MyTask {
  appId: string;
  appName: string;
  recordId: string;
  title: string;
  status: string | null;
  assigneeLabel: string;
  updatedAt: Date;
}

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private permission: PermissionService,
  ) {}

  /** ポータルトップ用のサマリ（閲覧可能アプリの件数 + 自分の未完了タスク横断）。 */
  async summary(userId: string, role: string) {
    const ids = await this.permission.visibleAppIds(userId, role);
    const apps = await this.prisma.app.findMany({
      where: ids === null ? {} : { id: { in: ids.length ? ids : ['__none__'] } },
      orderBy: { updatedAt: 'desc' },
    });

    const appSummaries: AppSummary[] = [];
    const myTasks: MyTask[] = [];

    for (const app of apps) {
      const fields = await this.prisma.field.findMany({ where: { appId: app.id } });
      // owner/org 公開範囲のアプリでは非特権ユーザーはアクセス可能な作成者のレコードのみ対象にする。
      const allowed = await this.permission.allowedCreatorIds(app.id, userId, role);
      const records = await this.prisma.record.findMany({
        where: { appId: app.id, ...(allowed ? { createdBy: { in: allowed } } : {}) },
        orderBy: { updatedAt: 'desc' },
      });

      const proc: any = app.processConfig || null;
      const hasProcess = !!proc?.enabled && !!proc?.statusField;
      const actions: { from: string; to: string }[] = hasProcess ? proc.actions || [] : [];
      const isOpen = (statusVal: any) =>
        hasProcess ? actions.some((a) => a.from === statusVal) : false;

      const openCount = hasProcess
        ? records.filter((r) => isOpen((r.dataJson as any)?.[proc.statusField])).length
        : records.length;

      appSummaries.push({
        id: app.id,
        name: app.name,
        status: app.status,
        total: records.length,
        open: openCount,
        hasProcess,
      });

      // 自分のタスク: プロセスありアプリで、user_select=自分 かつ 未完了(非終端)のレコード
      if (hasProcess) {
        const userFields = fields.filter((f) => f.fieldType === 'user_select');
        if (userFields.length > 0) {
          const titleField =
            fields.find((f) => f.fieldType === 'text') ||
            fields.find((f) => !['file', 'user_select', 'group_select'].includes(f.fieldType));
          for (const r of records) {
            const data = r.dataJson as any;
            const assignedField = userFields.find((f) => String(data?.[f.fieldCode] ?? '') === userId);
            if (!assignedField) continue;
            const statusVal = data?.[proc.statusField];
            if (!isOpen(statusVal)) continue;
            myTasks.push({
              appId: app.id,
              appName: app.name,
              recordId: r.id,
              title: (titleField && String(data?.[titleField.fieldCode] ?? '')) || '(無題のレコード)',
              status: statusVal ?? null,
              assigneeLabel: assignedField.label,
              updatedAt: r.updatedAt,
            });
          }
        }
      }
    }

    myTasks.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return { apps: appSummaries, myTasks: myTasks.slice(0, 100) };
  }
}
