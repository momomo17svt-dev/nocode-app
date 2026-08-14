import { AuditLogsService } from './audit-logs.service';

describe('AuditLogsService', () => {
  let prisma: any;
  let service: AuditLogsService;

  beforeEach(() => {
    prisma = {
      auditLog: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    service = new AuditLogsService(prisma);
  });

  describe('findPage', () => {
    it('新しい順に既定50件の1ページ目を取得する', async () => {
      await expect(service.findPage()).resolves.toEqual({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 });
      expect(prisma.auditLog.count).toHaveBeenCalled();
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 50,
      });
    });

    it('最終ページへ補正しページサイズを100件に制限する', async () => {
      prisma.auditLog.count.mockResolvedValue(205);
      await expect(service.findPage(9, 500)).resolves.toEqual({
        items: [], total: 205, page: 3, pageSize: 100, totalPages: 3,
      });
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 200, take: 100 }));
    });
  });

  describe('log', () => {
    it('未指定フィールドを既定値で補完して記録する', async () => {
      await service.log({ actionType: 'create_app', targetResource: 'App' });
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: null,
          actionType: 'create_app',
          targetResource: 'App',
          targetId: null,
          details: {},
          ipAddress: null,
        },
      });
    });

    it('記録失敗は握りつぶし、業務処理を止めない（throwしない）', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('DB down'));
      // Logger.error の出力を抑制
      jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
      await expect(service.log({ actionType: 'x', targetResource: 'y' })).resolves.toBeUndefined();
    });
  });
});
