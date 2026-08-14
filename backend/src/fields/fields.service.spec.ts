import { NotFoundException } from '@nestjs/common';
import { FieldsService } from './fields.service';

describe('FieldsService', () => {
  let prisma: any;
  let tx: any;
  let service: FieldsService;

  beforeEach(() => {
    tx = {
      field: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([{ id: 'f1' }]),
      },
    };
    prisma = {
      field: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn((a) => ({ id: 'f1', ...a.data })),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };
    service = new FieldsService(prisma);
  });

  describe('getAppId', () => {
    it('フィールドのappIdを返す', async () => {
      prisma.field.findUnique.mockResolvedValue({ appId: 'app1' });
      expect(await service.getAppId('f1')).toBe('app1');
    });

    it('存在しなければ NotFound', async () => {
      prisma.field.findUnique.mockResolvedValue(null);
      await expect(service.getAppId('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('required/settingsの既定値を補完する', async () => {
      await service.create('app1', { fieldCode: 'name', fieldType: 'text', label: '名前' });
      expect(prisma.field.create).toHaveBeenCalledWith({
        data: { appId: 'app1', fieldCode: 'name', fieldType: 'text', label: '名前', required: false, settings: {} },
      });
    });
  });

  describe('update', () => {
    it('指定したフィールドのみ部分更新する', async () => {
      await service.update('f1', { label: '更新後' });
      expect(prisma.field.update).toHaveBeenCalledWith({ where: { id: 'f1' }, data: { label: '更新後' } });
    });

    it('undefinedのキーはdataに含めない', async () => {
      await service.update('f1', { required: true });
      const arg = prisma.field.update.mock.calls[0][0];
      expect(arg.data).toEqual({ required: true });
    });
  });

  describe('saveAll', () => {
    it('既存を全削除してから再作成する（トランザクション内）', async () => {
      await service.saveAll('app1', [
        { fieldCode: 'a', fieldType: 'text', label: 'A' },
        { fieldCode: 'b', fieldType: 'number', label: 'B', required: true },
      ]);
      expect(tx.field.deleteMany).toHaveBeenCalledWith({ where: { appId: 'app1' } });
      expect(tx.field.create).toHaveBeenCalledTimes(2);
      expect(tx.field.findMany).toHaveBeenCalledWith({ where: { appId: 'app1' }, orderBy: { createdAt: 'asc' } });
    });
  });
});
