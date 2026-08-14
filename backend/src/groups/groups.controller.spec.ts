import { GroupsController } from './groups.controller';

describe('GroupsController', () => {
  let service: any;
  let permission: any;
  let audit: any;
  let controller: GroupsController;
  const user = { userId: 'admin', role: 'SystemAdmin' } as any;
  const req = { ip: '10.0.0.1' };

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({ id: 'g1' }),
      create: jest.fn().mockResolvedValue({ id: 'g1', name: '営業部' }),
      update: jest.fn().mockResolvedValue({ id: 'g1' }),
      remove: jest.fn().mockResolvedValue({ id: 'g1' }),
      reorder: jest.fn().mockResolvedValue({ ok: true }),
      addMember: jest.fn().mockResolvedValue({ id: 'gm1' }),
      removeMember: jest.fn().mockResolvedValue({ success: true }),
      importRows: jest.fn().mockResolvedValue({ created: 1, updated: 0, errors: [] }),
    };
    permission = {
      myScopeGroupIds: jest.fn().mockResolvedValue([]),
      assertGroupInScope: jest.fn().mockResolvedValue(undefined),
      assertUserInScope: jest.fn().mockResolvedValue(undefined),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    controller = new GroupsController(service, permission, audit);
  });

  it('create はグループ作成を監査記録する', async () => {
    await controller.create({ name: '営業部' } as any, user, req);
    expect(service.create).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'GROUP_CREATE', targetId: 'g1' }));
  });

  it('addMember はメンバー追加を監査記録する', async () => {
    await controller.addMember('g1', { userId: 'u2' } as any, user, req);
    expect(service.addMember).toHaveBeenCalledWith('g1', 'u2');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'GROUP_MEMBER_ADD' }));
  });

  it('removeMember はメンバー削除を監査記録する', async () => {
    await controller.removeMember('g1', 'u2', user, req);
    expect(service.removeMember).toHaveBeenCalledWith('g1', 'u2');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'GROUP_MEMBER_REMOVE' }));
  });

  it('reorder は並べ替えを監査記録する', async () => {
    await controller.reorder('g1', { direction: 'up' } as any, user, req);
    expect(service.reorder).toHaveBeenCalledWith('g1', 'up');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'GROUP_UPDATE' }));
  });
});
