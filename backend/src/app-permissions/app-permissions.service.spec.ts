import { AppPermissionsService } from './app-permissions.service';

describe('AppPermissionsService', () => {
  let prisma: any;
  let service: AppPermissionsService;

  beforeEach(() => {
    prisma = {
      appPermission: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    prisma.$transaction = jest.fn(async (callback: any) => callback(prisma));
    service = new AppPermissionsService(prisma);
  });

  describe('findAll', () => {
    it('appId で絞り込む', async () => {
      await service.findAll('app1');
      expect(prisma.appPermission.findMany).toHaveBeenCalledWith({ where: { appId: 'app1' } });
    });
  });

  describe('setPermissions', () => {
    it('既存を全削除してから一括作成する（置き換え）', async () => {
      const perms = [
        { targetType: 'All', targetId: null, canView: true, canAdd: false, canEdit: false, canDelete: false, canManage: false },
        { targetType: 'Group', targetId: 'g1', canView: true, canAdd: true, canEdit: true, canDelete: false, canManage: false },
      ];
      await service.setPermissions('app1', perms);

      expect(prisma.appPermission.deleteMany).toHaveBeenCalledWith({ where: { appId: 'app1' } });
      expect(prisma.$transaction).toHaveBeenCalled();
      const createArg = prisma.appPermission.createMany.mock.calls[0][0];
      expect(createArg.data).toHaveLength(2);
      expect(createArg.data[0]).toMatchObject({ appId: 'app1', targetType: 'All' });
      expect(createArg.data[1]).toMatchObject({ appId: 'app1', targetType: 'Group', targetId: 'g1', canEdit: true });
    });

    it('削除は作成より先に呼ばれる', async () => {
      const order: string[] = [];
      prisma.appPermission.deleteMany.mockImplementation(async () => { order.push('delete'); return { count: 0 }; });
      prisma.appPermission.createMany.mockImplementation(async () => { order.push('create'); return { count: 0 }; });
      await service.setPermissions('app1', [
        { targetType: 'All', targetId: null, canView: true, canAdd: false, canEdit: false, canDelete: false, canManage: false },
      ]);
      expect(order).toEqual(['delete', 'create']);
    });
  });
});
