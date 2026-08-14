import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface NotifyInput {
  userId: string;
  type: 'assignment' | 'mention' | 'reminder' | 'status_change' | string;
  title: string;
  body?: string;
  appId?: string;
  recordId?: string;
  actorId?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  /** 受信者の通知一覧（新しい順）と未読件数。 */
  async listForUser(userId: string, limit = 50) {
    const items = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const unread = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { items, unread };
  }

  unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markRead(userId: string, id: string) {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { isRead: true } });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
    return { ok: true };
  }

  /** 単一通知を作成。自分の操作で自分宛て・受信者未指定はスキップ。失敗してもコア処理を止めない。 */
  async notify(n: NotifyInput): Promise<void> {
    if (!n.userId) return;
    if (n.actorId && n.actorId === n.userId) return;
    try {
      await this.prisma.notification.create({
        data: {
          userId: n.userId,
          type: n.type,
          title: n.title,
          body: n.body ?? null,
          appId: n.appId ?? null,
          recordId: n.recordId ?? null,
          actorId: n.actorId ?? null,
        },
      });
    } catch {
      /* 通知作成失敗は本処理に影響させない */
    }
  }

  /** 複数受信者へ同一内容を通知。 */
  async notifyMany(userIds: string[], n: Omit<NotifyInput, 'userId'>): Promise<number> {
    const uniq = Array.from(new Set(userIds)).filter(Boolean);
    let sent = 0;
    for (const uid of uniq) {
      if (n.actorId && n.actorId === uid) continue;
      await this.notify({ userId: uid, ...n });
      sent++;
    }
    return sent;
  }
}
