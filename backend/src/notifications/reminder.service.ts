import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from './notifications.service';

/**
 * 期限リマインドのサーバ常駐スケジューラ。
 * App.reminderConfig = { enabled, dueDateField, assigneeField, daysBefore } を持つアプリを定期スキャンし、
 * 期限が近い/超過している「未完了」レコードの担当者へリマインド通知を送る。
 * 同一レコードへの多重送信は Setting(`reminder:{recordId}`) の日付で1日1回に抑止。
 */
@Injectable()
export class ReminderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ReminderService');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  onModuleInit() {
    // 起動直後に1回 + 以後1時間ごと（LAN常駐想定。多重送信はdedupで抑止）
    setTimeout(() => this.runSafe(), 30_000);
    this.timer = setInterval(() => this.runSafe(), 60 * 60 * 1000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private runSafe() {
    this.scan().catch((e) => this.logger.warn(`reminder scan failed: ${e?.message ?? e}`));
  }

  /** 手動トリガ用（テスト・管理操作）。送信件数を返す。 */
  async scan(): Promise<{ sent: number }> {
    const apps = await this.prisma.app.findMany();
    let sent = 0;
    for (const app of apps) {
      const cfg: any = app.reminderConfig;
      if (!cfg?.enabled || !cfg.dueDateField || !cfg.assigneeField) continue;
      try {
        sent += await this.scanApp(app, cfg);
      } catch (e: any) {
        this.logger.warn(`app ${app.id} reminder failed: ${e?.message ?? e}`);
      }
    }
    return { sent };
  }

  private async scanApp(app: any, cfg: any): Promise<number> {
    const daysBefore = Number(cfg.daysBefore ?? 3);
    const cutoff = Date.now() + daysBefore * 24 * 60 * 60 * 1000;
    const todayStr = new Date().toISOString().slice(0, 10);

    const proc: any = app.processConfig;
    const hasProc = !!proc?.enabled && !!proc?.statusField;
    const isOpen = (r: any) =>
      hasProc ? (proc.actions || []).some((a: any) => a.from === r.dataJson?.[proc.statusField]) : true;

    const records = await this.prisma.record.findMany({ where: { appId: app.id } });
    let sent = 0;
    for (const r of records) {
      const data = r.dataJson as any;
      const due = data?.[cfg.dueDateField];
      const assignee = data?.[cfg.assigneeField];
      if (!due || !assignee) continue;
      if (!isOpen(r)) continue;
      const dueTime = new Date(due).getTime();
      if (isNaN(dueTime) || dueTime > cutoff) continue; // 期限が遠いものは対象外（超過・間近のみ）

      // 1日1回に抑止
      const key = `reminder:${r.id}`;
      const existing = await this.prisma.setting.findUnique({ where: { key } });
      if ((existing?.value as any)?.date === todayStr) continue;

      const overdue = dueTime < Date.now();
      await this.notifications.notify({
        userId: String(assignee),
        type: 'reminder',
        title: overdue
          ? `「${app.name}」期限を過ぎた未対応があります（期限 ${String(due).slice(0, 10)}）`
          : `「${app.name}」期限が近づいています（期限 ${String(due).slice(0, 10)}）`,
        appId: app.id,
        recordId: r.id,
      });
      await this.prisma.setting.upsert({
        where: { key },
        update: { value: { date: todayStr } },
        create: { key, value: { date: todayStr } },
      });
      sent++;
    }
    return sent;
  }
}
