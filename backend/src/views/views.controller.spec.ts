import { ForbiddenException } from '@nestjs/common';
import { ViewsController } from './views.controller';

describe('ViewsController', () => {
  let service: any;
  let permission: any;
  let controller: ViewsController;
  const user = { userId: 'u1', role: 'StandardUser' } as any;

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'v1' }),
      update: jest.fn().mockResolvedValue({ id: 'v1' }),
      remove: jest.fn().mockResolvedValue({ id: 'v1' }),
      getMeta: jest.fn(),
    };
    permission = { assert: jest.fn().mockResolvedValue({ canManage: true }) };
    controller = new ViewsController(service, permission);
  });

  describe('create', () => {
    it('共有ビューは管理権限を要求する', async () => {
      await controller.create({ appId: 'app1', name: '共有', isShared: true } as any, user);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'StandardUser', 'app1', 'canManage');
    });

    it('自分専用ビューは閲覧権限で作成できる', async () => {
      await controller.create({ appId: 'app1', name: '個人', isShared: false } as any, user);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'StandardUser', 'app1', 'canView');
    });
  });

  describe('update (authorizeMutate)', () => {
    it('共有ビューの変更は管理権限を要求する', async () => {
      service.getMeta.mockResolvedValue({ appId: 'app1', isShared: true, createdBy: 'someone' });
      await controller.update('v1', { name: 'x' } as any, user);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'StandardUser', 'app1', 'canManage');
      expect(service.update).toHaveBeenCalledWith('v1', { name: 'x' });
    });

    it('他人の専用ビューは Forbidden（更新しない）', async () => {
      service.getMeta.mockResolvedValue({ appId: 'app1', isShared: false, createdBy: 'other' });
      await expect(controller.update('v1', {} as any, user)).rejects.toThrow(ForbiddenException);
      expect(service.update).not.toHaveBeenCalled();
    });

    it('本人の専用ビューは削除できる', async () => {
      service.getMeta.mockResolvedValue({ appId: 'app1', isShared: false, createdBy: 'u1' });
      await controller.remove('v1', user);
      expect(service.remove).toHaveBeenCalledWith('v1');
    });

    it('SystemAdmin は他人の専用ビューも操作できる', async () => {
      service.getMeta.mockResolvedValue({ appId: 'app1', isShared: false, createdBy: 'other' });
      await controller.remove('v1', { userId: 'admin', role: 'SystemAdmin' } as any);
      expect(service.remove).toHaveBeenCalledWith('v1');
    });
  });
});
