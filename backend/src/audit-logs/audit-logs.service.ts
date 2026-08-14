import { Injectable, Logger } from '@nestjs/common';
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

  async findPage(page = 1, pageSize = 50) {
    const size = Math.min(100, Math.max(1, Number.isFinite(pageSize) ? Math.floor(pageSize) : 50));
    const requestedPage = Math.max(1, Number.isFinite(page) ? Math.floor(page) : 1);
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
