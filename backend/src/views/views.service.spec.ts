import { NotFoundException } from '@nestjs/common';
import { ViewsService } from './views.service';

describe('ViewsService', () => {
  let prisma: any;
  let service: ViewsService;

  beforeEach(() => {
    prisma = {
      view: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn((a) => ({ id: 'v1', ...a.data })),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new ViewsService(prisma);
  });

  describe('findAll', () => {
    it('共有ビューと自分専用ビューをOR条件で取得する', async () => {
      prisma.view.findMany.mockResolvedValue([]);
      await service.findAll('app1', 'u1');
      expect(prisma.view.findMany).toHaveBeenCalledWith({
        where: { appId: 'app1', OR: [{ isShared: true }, { createdBy: 'u1' }] },
        orderBy: { createdAt: 'asc' },
      });
    });
  });

  describe('getMeta', () => {
    it('存在しなければ NotFound', async () => {
      prisma.view.findUnique.mockResolvedValue(null);
      await expect(service.getMeta('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('isShared未指定なら共有ビュー(true)として作成', async () => {
      await service.create('app1', { name: 'マイビュー' }, 'u1');
      expect(prisma.view.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ appId: 'app1', name: 'マイビュー', isShared: true, createdBy: 'u1' }),
        }),
      );
    });

    it('isShared:false を尊重する', async () => {
      await service.create('app1', { name: '個人', isShared: false }, 'u1');
      const arg = prisma.view.create.mock.calls[0][0];
      expect(arg.data.isShared).toBe(false);
    });
  });

  describe('update', () => {
    it('指定キーのみ部分更新する', async () => {
      await service.update('v1', { columns: ['a', 'b'] });
      expect(prisma.view.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { columns: ['a', 'b'] } });
    });
  });
});
