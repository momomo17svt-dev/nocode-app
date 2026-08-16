import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';

const PERM = (over: any = {}) => ({ canView: true, canAdd: true, canEdit: true, canDelete: true, canManage: true, ...over });

describe('AttachmentsController', () => {
  let service: any;
  let permission: any;
  let audit: any;
  let controller: AttachmentsController;
  const user = { userId: 'u1', role: 'StandardUser' } as any;
  const req = { ip: '10.0.0.1' };

  beforeEach(() => {
    service = {
      getRecordMeta: jest.fn().mockResolvedValue({ appId: 'app1', createdBy: 'u1' }),
      findByRecord: jest.fn().mockResolvedValue([]),
      getForAccess: jest.fn(),
      createFromUpload: jest.fn().mockResolvedValue({ id: 'a1', originalName: 'doc.pdf', mimeType: 'application/pdf', size: 10, fieldCode: 'f' }),
      remove: jest.fn().mockResolvedValue({ success: true }),
      resolvePath: jest.fn().mockReturnValue('/abs/path/uuid.pdf'),
    };
    permission = {
      assert: jest.fn().mockResolvedValue(PERM()),
      allowedCreatorIds: jest.fn().mockResolvedValue(null),
      getEffectivePermission: jest.fn().mockResolvedValue(PERM()),
      getOwnMutationFlags: jest.fn().mockResolvedValue({ editOwn: false, deleteOwn: false }),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    controller = new AttachmentsController(service, permission, audit);
  });

  describe('findByRecord', () => {
    it('閲覧権限と範囲を検証して一覧を返す', async () => {
      await controller.findByRecord('r1', user);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'StandardUser', 'app1', 'canView');
      expect(service.findByRecord).toHaveBeenCalledWith('r1');
    });

    it('範囲外レコードの添付は Forbidden', async () => {
      service.getRecordMeta.mockResolvedValue({ appId: 'app1', createdBy: 'other' });
      permission.assert.mockResolvedValue(PERM({ canManage: false }));
      permission.allowedCreatorIds.mockResolvedValue(['u1']);
      await expect(controller.findByRecord('r1', user)).rejects.toThrow(ForbiddenException);
      expect(service.findByRecord).not.toHaveBeenCalled();
    });
  });

  describe('upload', () => {
    it('ファイル未指定は BadRequest', async () => {
      await expect(controller.upload(undefined as any, 'r1', 'f', user, req)).rejects.toThrow(BadRequestException);
    });

    it('recordId未指定は BadRequest', async () => {
      const file = { originalname: 'x', filename: 'u', mimetype: 'text/plain', size: 1 } as any;
      await expect(controller.upload(file, '', 'f', user, req)).rejects.toThrow(BadRequestException);
    });

    it('編集権限が無く本人でもなければ Forbidden', async () => {
      const file = { originalname: 'x', filename: 'u', mimetype: 'text/plain', size: 1 } as any;
      service.getRecordMeta.mockResolvedValue({ appId: 'app1', createdBy: 'other' });
      permission.getEffectivePermission.mockResolvedValue(PERM({ canEdit: false, canAdd: false }));
      await expect(controller.upload(file, 'r1', 'f', user, req)).rejects.toThrow(ForbiddenException);
      expect(service.createFromUpload).not.toHaveBeenCalled();
    });

    it('正常時は保存して監査記録する', async () => {
      const file = { originalname: 'doc.pdf', mimetype: 'application/pdf', size: 100, buffer: Buffer.from('%PDF-1.7\n') } as any;
      const res = await controller.upload(file, 'r1', 'f', user, req);
      expect(service.createFromUpload).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'ATTACHMENT_UPLOAD' }));
      expect(res).toMatchObject({ id: 'a1' });
    });

    it('追加権限のみ + 本人レコードでも editOwn 設定OFFなら Forbidden', async () => {
      const file = { originalname: 'x', filename: 'u', mimetype: 'text/plain', size: 1 } as any;
      permission.getEffectivePermission.mockResolvedValue(PERM({ canEdit: false, canManage: false }));
      permission.getOwnMutationFlags.mockResolvedValue({ editOwn: false, deleteOwn: false });
      await expect(controller.upload(file, 'r1', 'f', user, req)).rejects.toThrow(ForbiddenException);
      expect(service.createFromUpload).not.toHaveBeenCalled();
    });

    it('追加権限のみ + 本人レコード + editOwn 設定ONなら保存できる', async () => {
      const file = { originalname: 'doc.pdf', mimetype: 'application/pdf', size: 100, buffer: Buffer.from('%PDF-1.7\n') } as any;
      permission.getEffectivePermission.mockResolvedValue(PERM({ canEdit: false, canManage: false }));
      permission.getOwnMutationFlags.mockResolvedValue({ editOwn: true, deleteOwn: false });
      const res = await controller.upload(file, 'r1', 'f', user, req);
      expect(service.createFromUpload).toHaveBeenCalled();
      expect(res).toMatchObject({ id: 'a1' });
    });
  });

  describe('download', () => {
    it('閲覧権限を検証してファイルを送出する', async () => {
      service.getForAccess.mockResolvedValue({ record: { appId: 'app1' }, recordId: 'r1', savedName: 'uuid.pdf', originalName: 'doc.pdf' });
      const res = { download: jest.fn() } as any;
      await controller.download('a1', user, res);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'StandardUser', 'app1', 'canView');
      expect(res.download).toHaveBeenCalledWith('/abs/path/uuid.pdf', 'doc.pdf');
    });

    it('レコード紐付けが無ければ Forbidden', async () => {
      service.getForAccess.mockResolvedValue({ record: null, recordId: null, savedName: 'x' });
      const res = { download: jest.fn() } as any;
      await expect(controller.download('a1', user, res)).rejects.toThrow(ForbiddenException);
      expect(res.download).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('編集権限が無ければ削除しない', async () => {
      service.getForAccess.mockResolvedValue({ record: { appId: 'app1' }, recordId: 'r1' });
      service.getRecordMeta.mockResolvedValue({ appId: 'app1', createdBy: 'other' });
      permission.getEffectivePermission.mockResolvedValue(PERM({ canEdit: false, canAdd: false }));
      await expect(controller.remove('a1', user, req)).rejects.toThrow(ForbiddenException);
      expect(service.remove).not.toHaveBeenCalled();
    });

    it('権限ありなら削除して監査記録する', async () => {
      service.getForAccess.mockResolvedValue({ record: { appId: 'app1' }, recordId: 'r1' });
      await controller.remove('a1', user, req);
      expect(service.remove).toHaveBeenCalledWith('a1');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'ATTACHMENT_DELETE' }));
    });
  });
});
