import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppPermissionsService {
  constructor(private prisma: PrismaService) {}

  async findAll(appId: string) {
    return this.prisma.appPermission.findMany({ where: { appId } });
  }

  async setPermissions(appId: string, permissions: any[]) {
    const createData = permissions.map(p => ({
      appId,
      targetType: p.targetType,
      targetId: p.targetId,
      canView: p.canView,
      canAdd: p.canAdd,
      canEdit: p.canEdit,
      canDelete: p.canDelete,
      canManage: p.canManage
    }));
    return this.prisma.$transaction(async (tx) => {
      await tx.appPermission.deleteMany({ where: { appId } });
      if (createData.length === 0) return { count: 0 };
      return tx.appPermission.createMany({ data: createData });
    });
  }
}
