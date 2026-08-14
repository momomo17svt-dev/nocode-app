import { AuditLogsService } from './audit-logs.service';

describe('AuditLogsService', () => {
  let prisma: any;
  let service: AuditLogsService;

  beforeEach(() => {
    prisma = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
      },
    };
    service = new AuditLogsService(prisma);
  });

  describe('findAll', () => {
    it('新しい順に既定500件まで取得する', async () => {
      await service.findAll();
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' }, take: 500 });
    });

    it('limitを指定できる', async () => {
      await service.findAll(10);
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' }, take: 10 });
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
