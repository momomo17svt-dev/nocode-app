import { ForbiddenException } from '@nestjs/common';
import { AppsController } from './apps.controller';

describe('AppsController', () => {
  let service: any;
  let permission: any;
  let audit: any;
  let controller: AppsController;
  const user = { userId: 'u1', role: 'AppCreator' } as any;
  const req = { ip: '10.0.0.1' };

  beforeEach(() => {
    service = {
      findAllVisible: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'app1', name: 'A' }),
      create: jest.fn().mockResolvedValue({ id: 'app1', name: 'A' }),
      update: jest.fn().mockResolvedValue({ id: 'app1' }),
      setStatus: jest.fn().mockResolvedValue({ id: 'app1' }),
      remove: jest.fn().mockResolvedValue({ id: 'app1' }),
      duplicate: jest.fn().mockResolvedValue({ id: 'app2' }),
    };
    permission = { assert: jest.fn().mockResolvedValue({ canManage: true, canView: true }) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    controller = new AppsController(service, permission, audit);
  });

  describe('findAll', () => {
    it('可視アプリのみ返す（権限フィルタはサービスに委譲）', async () => {
      await controller.findAll(user);
      expect(service.findAllVisible).toHaveBeenCalledWith('u1', 'AppCreator');
    });
  });

  describe('findOne', () => {
    it('閲覧権限を検証し、有効権限を同梱して返す', async () => {
      const res = await controller.findOne('app1', user);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'AppCreator', 'app1', 'canView');
      expect(res).toMatchObject({ id: 'app1', myPermission: { canManage: true } });
    });
  });

  describe('create', () => {
    it('アプリを作成し監査記録する', async () => {
      await controller.create({ name: 'A' } as any, user, req);
      expect(service.create).toHaveBeenCalledWith({ name: 'A' }, 'u1');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'APP_CREATE' }));
    });
  });

  describe('update', () => {
    it('管理権限が無ければ更新しない', async () => {
      permission.assert.mockRejectedValue(new ForbiddenException());
      await expect(controller.update('app1', { name: 'B' } as any, user, req)).rejects.toThrow(ForbiddenException);
      expect(service.update).not.toHaveBeenCalled();
    });

    it('管理権限ありなら更新して監査記録する', async () => {
      await controller.update('app1', { name: 'B' } as any, user, req);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'AppCreator', 'app1', 'canManage');
      expect(service.update).toHaveBeenCalledWith('app1', { name: 'B' });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'APP_UPDATE' }));
    });
  });

  describe('remove', () => {
    it('管理権限を要求し削除して監査記録する', async () => {
      await controller.remove('app1', undefined as any, user, req);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'AppCreator', 'app1', 'canManage');
      expect(service.remove).toHaveBeenCalledWith('app1', false);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'APP_DELETE' }));
    });

    it('force=true なら強制削除を呼ぶ', async () => {
      await controller.remove('app1', 'true', user, req);
      expect(service.remove).toHaveBeenCalledWith('app1', true);
    });
  });
});
