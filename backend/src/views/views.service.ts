import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ViewsService {
  constructor(private prisma: PrismaService) {}

  /** 全体共有ビュー + 自分専用ビューを返す。 */
  findAll(appId: string, userId: string) {
    return this.prisma.view.findMany({
      where: {
        appId,
        OR: [{ isShared: true }, { createdBy: userId }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getMeta(id: string) {
    const view = await this.prisma.view.findUnique({
      where: { id },
      select: { appId: true, isShared: true, createdBy: true },
    });
    if (!view) throw new NotFoundException('ビューが見つかりません');
    return view;
  }

  create(appId: string, data: any, creatorId: string) {
    return this.prisma.view.create({
      data: {
        appId,
        name: data.name,
        isShared: data.isShared ?? true,
        createdBy: creatorId,
        conditions: data.conditions ?? undefined,
        columns: data.columns ?? undefined,
        sort: data.sort ?? undefined,
      },
    });
  }

  update(id: string, data: any) {
    return this.prisma.view.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.isShared !== undefined ? { isShared: data.isShared } : {}),
        ...(data.conditions !== undefined ? { conditions: data.conditions } : {}),
        ...(data.columns !== undefined ? { columns: data.columns } : {}),
        ...(data.sort !== undefined ? { sort: data.sort } : {}),
      },
    });
  }

  remove(id: string) {
    return this.prisma.view.delete({ where: { id } });
  }
}
