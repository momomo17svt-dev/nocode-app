import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { RecordsController } from './records.controller';

const PERM_ALL = { canView: true, canAdd: true, canEdit: true, canDelete: true, canManage: true };

describe('RecordsController', () => {
  let records: any;
  let permission: any;
  let audit: any;
  let controller: RecordsController;
  const user = { userId: 'u1', loginId: 'alice', role: 'StandardUser' } as any;
  const req = { ip: '10.0.0.1' };

  beforeEach(() => {
    records = {
      findAll: jest.fn().mockResolvedValue([]),
      findPage: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 }),
      findOne: jest.fn().mockResolvedValue({ id: 'r1' }),
      getRecordMeta: jest.fn(),
      getRecordFieldValue: jest.fn().mockResolvedValue(''),
      create: jest.fn().mockResolvedValue({ id: 'r-new' }),
      update: jest.fn().mockResolvedValue({ id: 'r1' }),
      remove: jest.fn().mockResolvedValue({ id: 'r1' }),
      bulkRemove: jest.fn().mockResolvedValue({ deleted: 0 }),
    };
    permission = {
      assert: jest.fn().mockResolvedValue(PERM_ALL),
      getEffectivePermission: jest.fn().mockResolvedValue(PERM_ALL),
      allowedCreatorIds: jest.fn().mockResolvedValue(null),
      recordFieldScope: jest.fn().mockResolvedValue(null),
      getOwnMutationFlags: jest.fn().mockResolvedValue({ editOwn: false, deleteOwn: false }),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    controller = new RecordsController(records, permission, audit);
  });

  describe('findAll', () => {
    it('閲覧権限を検証し filter[xxx] を抽出して検索に渡す', async () => {
      const query = { appId: 'app1', search: 'kw', 'filter[status]': 'open', other: 'x' };
      await controller.findAll('app1', 'kw', query as any, user);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'StandardUser', 'app1', 'canView');
      expect(records.findAll).toHaveBeenCalledWith('app1', { search: 'kw', filters: { status: 'open' } }, null, null);
    });

    it('owner/org範囲では allowedCreatorIds をサービスに渡す', async () => {
      permission.allowedCreatorIds.mockResolvedValue(['u1']);
      await controller.findAll('app1', '', { appId: 'app1' } as any, user);
      expect(records.findAll).toHaveBeenCalledWith('app1', expect.anything(), ['u1'], null);
    });

    it('page指定時は検証済みの検索・条件・ソートをページ取得へ渡す', async () => {
      const conditions = JSON.stringify([{ field: 'amount', op: 'gt', value: '100' }]);
      await controller.findAll(
        'app1',
        'urgent',
        { appId: 'app1', page: '2', pageSize: '25', conditions, sortField: 'amount', sortOrder: 'asc' },
        user,
      );
      expect(records.findPage).toHaveBeenCalledWith(
        'app1',
        {
          page: 2,
          pageSize: 25,
          search: 'urgent',
          conditions: [{ field: 'amount', op: 'gt', value: '100' }],
          sort: { field: 'amount', order: 'asc' },
        },
        null,
        null,
      );
    });

    it('不正なページ条件を拒否する', async () => {
      await expect(
        controller.findAll('app1', '', { appId: 'app1', page: '0' }, user),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('レコード範囲外（他者作成）は Forbidden で本体を取得しない', async () => {
      records.getRecordMeta.mockResolvedValue({ appId: 'app1', createdBy: 'someone-else' });
      permission.assert.mockResolvedValue({ ...PERM_ALL, canManage: false });
      permission.allowedCreatorIds.mockResolvedValue(['u1']); // 本人のみ閲覧可
      await expect(controller.findOne('r1', user)).rejects.toThrow(ForbiddenException);
      expect(records.findOne).not.toHaveBeenCalled();
    });

    it('範囲内なら本体を返す', async () => {
      records.getRecordMeta.mockResolvedValue({ appId: 'app1', createdBy: 'u1' });
      const res = await controller.findOne('r1', user);
      expect(res).toEqual({ id: 'r1' });
    });
  });

  describe('create', () => {
    it('追加権限が無ければサービスを呼ばない', async () => {
      permission.assert.mockRejectedValue(new ForbiddenException());
      await expect(controller.create({ appId: 'app1', data: {} } as any, user, req)).rejects.toThrow(ForbiddenException);
      expect(records.create).not.toHaveBeenCalled();
    });

    it('成功時は作成して監査記録する', async () => {
      await controller.create({ appId: 'app1', data: { x: 1 } } as any, user, req);
      expect(permission.assert).toHaveBeenCalledWith('u1', 'StandardUser', 'app1', 'canAdd');
      expect(records.create).toHaveBeenCalledWith('app1', { x: 1 }, 'u1');
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'RECORD_CREATE' }));
    });
  });

  describe('update', () => {
    it('編集権限を検証し canManage を渡して更新する', async () => {
      records.getRecordMeta.mockResolvedValue({ appId: 'app1', createdBy: 'u1' });
      await controller.update('r1', { data: { y: 2 } } as any, user, req);
      expect(permission.getEffectivePermission).toHaveBeenCalledWith('u1', 'StandardUser', 'app1');
      expect(records.update).toHaveBeenCalledWith('r1', { y: 2 }, 'u1', { canManage: true });
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'RECORD_UPDATE' }));
    });

    it('追加権限のみでも editOwn 設定ONなら自分のレコードを更新できる', async () => {
      records.getRecordMeta.mockResolvedValue({ appId: 'app1', createdBy: 'u1' });
      permission.getEffectivePermission.mockResolvedValue({ ...PERM_ALL, canEdit: false, canManage: false });
      permission.getOwnMutationFlags.mockResolvedValue({ editOwn: true, deleteOwn: false });
      await controller.update('r1', { data: { y: 2 } } as any, user, req);
      expect(records.update).toHaveBeenCalledWith('r1', { y: 2 }, 'u1', { canManage: false });
    });

    it('追加権限のみで editOwn 設定OFFなら自分のレコードでも更新できない', async () => {
      records.getRecordMeta.mockResolvedValue({ appId: 'app1', createdBy: 'u1' });
      permission.getEffectivePermission.mockResolvedValue({ ...PERM_ALL, canEdit: false, canManage: false });
      permission.getOwnMutationFlags.mockResolvedValue({ editOwn: false, deleteOwn: false });
      await expect(controller.update('r1', { data: { y: 2 } } as any, user, req)).rejects.toThrow(ForbiddenException);
      expect(records.update).not.toHaveBeenCalled();
    });

    it('追加権限 + editOwn 設定ONでも他人のレコードは更新できない', async () => {
      records.getRecordMeta.mockResolvedValue({ appId: 'app1', createdBy: 'someone-else' });
      permission.getEffectivePermission.mockResolvedValue({ ...PERM_ALL, canEdit: false, canManage: false });
      permission.getOwnMutationFlags.mockResolvedValue({ editOwn: true, deleteOwn: false });
      await expect(controller.update('r1', { data: { y: 2 } } as any, user, req)).rejects.toThrow(ForbiddenException);
      expect(records.update).not.toHaveBeenCalled();
    });
  });

  describe('bulkDelete', () => {
    it('編集範囲の作成者制限を bulkRemove に渡す', async () => {
      permission.getEffectivePermission.mockResolvedValue({ ...PERM_ALL, canManage: false });
      permission.allowedCreatorIds.mockResolvedValue(['u1']);
      await controller.bulkDelete({ appId: 'app1', ids: ['a', 'b'] } as any, user, req);
      expect(records.bulkRemove).toHaveBeenCalledWith('app1', ['a', 'b'], ['u1'], null);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'RECORD_BULK_DELETE' }));
    });

    it('削除権限なし + deleteOwn 設定ONなら本人作成分のみ削除に限定する', async () => {
      permission.getEffectivePermission.mockResolvedValue({ ...PERM_ALL, canDelete: false, canManage: false });
      permission.getOwnMutationFlags.mockResolvedValue({ editOwn: false, deleteOwn: true });
      await controller.bulkDelete({ appId: 'app1', ids: ['a', 'b'] } as any, user, req);
      expect(records.bulkRemove).toHaveBeenCalledWith('app1', ['a', 'b'], ['u1'], null);
    });

    it('削除権限なし + deleteOwn 設定OFFなら Forbidden', async () => {
      permission.getEffectivePermission.mockResolvedValue({ ...PERM_ALL, canDelete: false, canManage: false });
      permission.getOwnMutationFlags.mockResolvedValue({ editOwn: false, deleteOwn: false });
      await expect(controller.bulkDelete({ appId: 'app1', ids: ['a'] } as any, user, req)).rejects.toThrow(ForbiddenException);
      expect(records.bulkRemove).not.toHaveBeenCalled();
    });
  });
});
