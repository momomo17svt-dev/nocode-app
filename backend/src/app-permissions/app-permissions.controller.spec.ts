import { ForbiddenException } from '@nestjs/common';
import { AppPermissionsController } from './app-permissions.controller';

describe('AppPermissionsController', () => {
  let service: any;
  let permission: any;
  let audit: any;
  let controller: AppPermissionsController;
  const user = { userId: 'u1', role: 'StandardUser' } as any;
  const req = { ip: '10.0.0.1' };

  beforeEach(() => {
    service = { findAll: jest.fn().mockResolvedValue([]), setPermissions: jest.fn().mockResolvedValue({ count: 0 }) };
    permission = { assert: jest.fn().mockResolvedValue({ canManage: true }) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    controller = new AppPermissionsController(service, permission, audit);
  });

  describe('findAll', () => {
    it('管理権限を検証して取得する', async () => {
      await controller.findAll('app1', user);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'StandardUser', 'app1', 'canManage');
      expect(service.findAll).toHaveBeenCalledWith('app1');
    });

    it('管理権限が無ければサービスを呼ばない', async () => {
      permission.assert.mockRejectedValue(new ForbiddenException());
      await expect(controller.findAll('app1', user)).rejects.toThrow(ForbiddenException);
      expect(service.findAll).not.toHaveBeenCalled();
    });
  });

  describe('setPermissions', () => {
    it('権限を保存し監査記録する', async () => {
      const body = { appId: 'app1', permissions: [{ targetType: 'All' }] } as any;
      await controller.setPermissions(body, user, req);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'StandardUser', 'app1', 'canManage');
      expect(service.setPermissions).toHaveBeenCalledWith('app1', body.permissions);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'APP_PERMISSION_CHANGE' }));
    });
  });
});
