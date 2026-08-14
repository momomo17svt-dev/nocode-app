import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';

describe('UsersController', () => {
  let service: any;
  let permission: any;
  let audit: any;
  let controller: UsersController;
  const actor = { userId: 'admin', loginId: 'admin', role: 'SystemAdmin' } as any;
  const req = { ip: '10.0.0.1' };

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      findPaged: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 }),
      create: jest.fn().mockResolvedValue({ id: 'u-new', loginId: 'bob', role: 'StandardUser' }),
      update: jest.fn().mockResolvedValue({ id: 'u2' }),
      remove: jest.fn().mockResolvedValue({ id: 'u2' }),
      importRows: jest.fn().mockResolvedValue({ created: 1, errors: [] }),
    };
    permission = {
      myScopeGroupIds: jest.fn().mockResolvedValue([]),
      assertGroupInScope: jest.fn().mockResolvedValue(undefined),
      assertUserInScope: jest.fn().mockResolvedValue(undefined),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    controller = new UsersController(service, permission, audit);
  });

  describe('create', () => {
    it('ユーザーを作成し監査記録する', async () => {
      await controller.create({ loginId: 'bob', password: 'password123' } as any, actor, req);
      expect(service.create).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'USER_CREATE' }));
    });
  });

  describe('remove', () => {
    it('自分自身は削除できない（Forbidden, サービス未呼び出し）', async () => {
      await expect(controller.remove('admin', actor, req)).rejects.toThrow(ForbiddenException);
      expect(service.remove).not.toHaveBeenCalled();
    });

    it('他ユーザーは削除して監査記録する', async () => {
      await controller.remove('u2', actor, req);
      expect(service.remove).toHaveBeenCalledWith('u2');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'USER_DELETE', targetId: 'u2' }));
    });
  });

  describe('update', () => {
    it('更新し、パスワード変更有無を監査詳細に含める', async () => {
      await controller.update('u2', { role: 'Viewer', password: 'newpassword123' } as any, actor, req);
      expect(service.update).toHaveBeenCalledWith('u2', { role: 'Viewer', password: 'newpassword123' });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ actionType: 'USER_UPDATE', details: expect.objectContaining({ passwordChanged: true }) }),
      );
    });
  });
});
