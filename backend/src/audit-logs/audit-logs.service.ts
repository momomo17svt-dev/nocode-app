import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type AuditLog } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  userId?: string | null;
  actionType: string;
  targetResource: string;
  targetId?: string | null;
  details?: any;
  ipAddress?: string | null;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(private prisma: PrismaService) {}

  async findPage(page = 1, pageSize = 50, query?: string, actionTypes: string[] = []) {
    const size = Math.min(100, Math.max(1, Number.isFinite(pageSize) ? Math.floor(pageSize) : 50));
    const requestedPage = Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1);
    const search = query?.trim().slice(0, 200) || '';
    const actions = [...new Set(actionTypes.map((value) => value.trim()).filter((value) => /^[A-Z][A-Z0-9_]{0,99}$/.test(value)))].slice(0, 50);

    if (search || actions.length) {
      const needle = search.toLocaleLowerCase();
      const textFilter = search ? Prisma.sql`
        POSITION(${needle} IN LOWER(a."actionType")) > 0
        OR POSITION(${needle} IN LOWER(a."targetResource")) > 0
        OR POSITION(${needle} IN LOWER(COALESCE(a."targetId", ''))) > 0
        OR POSITION(${needle} IN LOWER(COALESCE(a."ipAddress", ''))) > 0
        OR POSITION(${needle} IN LOWER(COALESCE(a."userId", ''))) > 0
        OR POSITION(${needle} IN LOWER(COALESCE(a."details"::text, ''))) > 0
        OR POSITION(${needle} IN LOWER(COALESCE(a."createdAt"::text, ''))) > 0
        OR POSITION(${needle} IN LOWER(COALESCE(u."loginId", ''))) > 0
        OR POSITION(${needle} IN LOWER(COALESCE(u."name", ''))) > 0
      ` : Prisma.sql`FALSE`;
      const actionFilter = actions.length
        ? Prisma.sql`OR a."actionType" IN (${Prisma.join(actions)})`
        : Prisma.empty;
      const where = Prisma.sql`(${textFilter} ${actionFilter})`;
      const countRows = await this.prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS "count"
        FROM "AuditLog" AS a
        LEFT JOIN "User" AS u ON u."id" = a."userId"
        WHERE ${where}
      `);
      const total = Number(countRows[0]?.count ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / size));
      const currentPage = Math.min(requestedPage, totalPages);
      const offset = (currentPage - 1) * size;
      const items = await this.prisma.$queryRaw<AuditLog[]>(Prisma.sql`
        SELECT a.*
        FROM "AuditLog" AS a
        LEFT JOIN "User" AS u ON u."id" = a."userId"
        WHERE ${where}
        ORDER BY a."createdAt" DESC, a."id" DESC
        LIMIT ${size} OFFSET ${offset}
      `);
      return { items, total, page: currentPage, pageSize: size, totalPages };
    }

    const total = await this.prisma.auditLog.count();
    const totalPages = Math.max(1, Math.ceil(total / size));
    const currentPage = Math.min(requestedPage, totalPages);
    const items = await this.prisma.auditLog.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (currentPage - 1) * size,
      take: size,
    });
    return { items, total, page: currentPage, pageSize: size, totalPages };
  }

  /**
   * 監査ログを記録する。記録自体の失敗が業務処理を止めないよう例外は握りつぶす。
   */
  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          actionType: entry.actionType,
          targetResource: entry.targetResource,
          targetId: entry.targetId ?? null,
          details: entry.details ?? {},
          ipAddress: entry.ipAddress ?? null,
        },
      });
    } catch (e) {
      this.logger.error(`監査ログの記録に失敗: ${entry.actionType}`, e as Error);
    }
  }
}
