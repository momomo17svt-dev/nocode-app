import { ForbiddenException } from '@nestjs/common';
import { FieldsController } from './fields.controller';

describe('FieldsController', () => {
  let service: any;
  let permission: any;
  let audit: any;
  let controller: FieldsController;
  const user = { userId: 'u1', role: 'StandardUser' } as any;
  const req = { ip: '10.0.0.1' };

  beforeEach(() => {
    service = { findAll: jest.fn().mockResolvedValue([]), saveAll: jest.fn().mockResolvedValue([]) };
    permission = { assert: jest.fn().mockResolvedValue({ canManage: true }) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    controller = new FieldsController(service, permission, audit);
  });

  describe('findAll', () => {
    it('閲覧権限でフォーム定義を取得する', async () => {
      await controller.findAll('app1', user);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'StandardUser', 'app1', 'canView');
      expect(service.findAll).toHaveBeenCalledWith('app1');
    });
  });

  describe('saveAll', () => {
    it('管理権限を要求し、一括保存して監査記録する', async () => {
      const dto = { appId: 'app1', fields: [{ fieldCode: 'a', fieldType: 'text', label: 'A' }] } as any;
      await controller.saveAll(dto, user, req);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'StandardUser', 'app1', 'canManage');
      expect(service.saveAll).toHaveBeenCalledWith('app1', dto.fields);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'FORM_DEFINITION_CHANGE' }));
    });

    it('管理権限が無ければ保存しない', async () => {
      permission.assert.mockRejectedValue(new ForbiddenException());
      await expect(controller.saveAll({ appId: 'app1', fields: [] } as any, user, req)).rejects.toThrow(ForbiddenException);
      expect(service.saveAll).not.toHaveBeenCalled();
    });
  });
});
