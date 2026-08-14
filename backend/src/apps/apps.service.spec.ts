import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppsService } from './apps.service';

describe('AppsService', () => {
  let prisma: any;
  let permission: any;
  let records: any;
  let service: AppsService;

  beforeEach(() => {
    prisma = {
      app: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn((a) => ({ id: 'app-new', ...a.data })),
        update: jest.fn((a) => ({ id: a.where.id, ...a.data })),
        delete: jest.fn(),
      },
      userTemplate: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), delete: jest.fn() },
    };
    permission = { visibleAppIds: jest.fn() };
    records = { create: jest.fn() };
    service = new AppsService(prisma, permission, records);
  });

  describe('findAllVisible', () => {
    it('SystemAdmin(null)は全件取得（where空）', async () => {
      permission.visibleAppIds.mockResolvedValue(null);
      await service.findAllVisible('u1', 'SystemAdmin');
      expect(prisma.app.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
    });

    it('可視IDリストがあればそのIN条件で取得', async () => {
      permission.visibleAppIds.mockResolvedValue(['a1', 'a2']);
      await service.findAllVisible('u1', 'StandardUser');
      expect(prisma.app.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['a1', 'a2'] } } }),
      );
    });

    it('可視IDが空配列なら何も返さない番兵条件を使う', async () => {
      permission.visibleAppIds.mockResolvedValue([]);
      await service.findAllVisible('u1', 'StandardUser');
      expect(prisma.app.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['__none__'] } } }),
      );
    });
  });

  describe('findOne', () => {
    it('存在しなければ NotFound', async () => {
      prisma.app.findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteUserTemplate', () => {
    it('存在しなければ NotFound', async () => {
      prisma.userTemplate.findUnique.mockResolvedValue(null);
      await expect(service.deleteUserTemplate('t1', 'u1', 'StandardUser')).rejects.toThrow(NotFoundException);
    });

    it('他人のテンプレートは削除不可（Forbidden）', async () => {
      prisma.userTemplate.findUnique.mockResolvedValue({ id: 't1', createdBy: 'owner' });
      await expect(service.deleteUserTemplate('t1', 'intruder', 'StandardUser')).rejects.toThrow(ForbiddenException);
    });

    it('作成者本人は削除できる', async () => {
      prisma.userTemplate.findUnique.mockResolvedValue({ id: 't1', createdBy: 'u1' });
      expect(await service.deleteUserTemplate('t1', 'u1', 'StandardUser')).toEqual({ ok: true });
      expect(prisma.userTemplate.delete).toHaveBeenCalledWith({ where: { id: 't1' } });
    });

    it('SystemAdminは他人のテンプレートも削除できる', async () => {
      prisma.userTemplate.findUnique.mockResolvedValue({ id: 't1', createdBy: 'owner' });
      expect(await service.deleteUserTemplate('t1', 'admin', 'SystemAdmin')).toEqual({ ok: true });
    });
  });

  describe('setPublicForm', () => {
    it('存在しなければ NotFound', async () => {
      prisma.app.findUnique.mockResolvedValue(null);
      await expect(service.setPublicForm('missing', true)).rejects.toThrow(NotFoundException);
    });

    it('有効化時にトークン未発行なら新規発行する', async () => {
      prisma.app.findUnique.mockResolvedValue({ publicFormToken: null });
      await service.setPublicForm('app1', true);
      const arg = prisma.app.update.mock.calls[0][0];
      expect(arg.data.publicFormEnabled).toBe(true);
      expect(arg.data.publicFormToken).toEqual(expect.any(String));
      expect(arg.data.publicFormToken.length).toBeGreaterThan(0);
    });

    it('既存トークンは維持する', async () => {
      prisma.app.findUnique.mockResolvedValue({ publicFormToken: 'existing-token' });
      await service.setPublicForm('app1', true);
      expect(prisma.app.update.mock.calls[0][0].data.publicFormToken).toBe('existing-token');
    });

    it('regenerate指定でトークンを再発行する', async () => {
      prisma.app.findUnique.mockResolvedValue({ publicFormToken: 'old-token' });
      await service.setPublicForm('app1', true, true);
      expect(prisma.app.update.mock.calls[0][0].data.publicFormToken).not.toBe('old-token');
    });
  });

  describe('update', () => {
    it('指定キーのみ部分更新する', async () => {
      await service.update('app1', { name: '新名称' });
      expect(prisma.app.update).toHaveBeenCalledWith({ where: { id: 'app1' }, data: { name: '新名称' } });
    });
  });

  describe('duplicate', () => {
    it('複製元が無ければ NotFound', async () => {
      prisma.app.findUnique.mockResolvedValue(null);
      await expect(service.duplicate('missing', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('フィールドと権限をコピーし「(コピー)」名で作成する（レコードは含めない）', async () => {
      prisma.app.findUnique.mockResolvedValue({
        name: '元アプリ',
        description: 'desc',
        fields: [{ fieldCode: 'a', fieldType: 'text', label: 'A', required: true, settings: {} }],
        permissions: [{ targetType: 'All', targetId: null, canView: true, canAdd: false, canEdit: false, canDelete: false, canManage: false }],
      });
      await service.duplicate('app1', 'u1');
      const arg = prisma.app.create.mock.calls[0][0];
      expect(arg.data.name).toBe('元アプリ (コピー)');
      expect(arg.data.createdBy).toBe('u1');
      expect(arg.data.fields.create).toHaveLength(1);
      expect(arg.data.permissions.create).toHaveLength(1);
    });
  });
});
