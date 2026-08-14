import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PermissionService } from './permission.service';

/** permission.service が参照する Prisma メソッドだけを持つ最小モック。 */
function createPrismaMock() {
  return {
    app: { findUnique: jest.fn(), findMany: jest.fn() },
    appPermission: { findMany: jest.fn() },
    user: { findUnique: jest.fn(), findMany: jest.fn() },
    group: { findMany: jest.fn() },
  };
}

type PrismaMock = ReturnType<typeof createPrismaMock>;

const perm = (over: Partial<Record<string, any>> = {}) => ({
  targetType: 'All',
  targetId: null,
  canView: false,
  canAdd: false,
  canEdit: false,
  canDelete: false,
  canManage: false,
  ...over,
});

describe('PermissionService', () => {
  let prisma: PrismaMock;
  let service: PermissionService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PermissionService(prisma as any);
  });

  describe('getEffectivePermission', () => {
    it('SystemAdmin は常に全許可（DBを引かない）', async () => {
      const result = await service.getEffectivePermission('u1', 'SystemAdmin', 'app1');
      expect(result).toEqual({ canView: true, canAdd: true, canEdit: true, canDelete: true, canManage: true });
      expect(prisma.app.findUnique).not.toHaveBeenCalled();
    });

    it('アプリが存在しなければ NotFound', async () => {
      prisma.app.findUnique.mockResolvedValue(null);
      await expect(service.getEffectivePermission('u1', 'StandardUser', 'missing')).rejects.toThrow(NotFoundException);
    });

    it('アプリ所有者は全許可', async () => {
      prisma.app.findUnique.mockResolvedValue({ id: 'app1', createdBy: 'u1' });
      const result = await service.getEffectivePermission('u1', 'StandardUser', 'app1');
      expect(result.canManage).toBe(true);
    });

    it('権限設定が無い非公開アプリは全拒否', async () => {
      prisma.app.findUnique.mockResolvedValue({ id: 'app1', createdBy: 'owner' });
      prisma.appPermission.findMany.mockResolvedValue([]);
      const result = await service.getEffectivePermission('u1', 'StandardUser', 'app1');
      expect(result).toEqual({ canView: false, canAdd: false, canEdit: false, canDelete: false, canManage: false });
    });

    it('User個別権限が適用される', async () => {
      prisma.app.findUnique.mockResolvedValue({ id: 'app1', createdBy: 'owner' });
      prisma.appPermission.findMany.mockResolvedValue([
        perm({ targetType: 'User', targetId: 'u1', canView: true, canAdd: true }),
      ]);
      prisma.user.findUnique.mockResolvedValue({ groupId: null });
      const result = await service.getEffectivePermission('u1', 'StandardUser', 'app1');
      expect(result).toMatchObject({ canView: true, canAdd: true, canEdit: false });
    });

    it('所属グループ権限が適用される', async () => {
      prisma.app.findUnique.mockResolvedValue({ id: 'app1', createdBy: 'owner' });
      prisma.appPermission.findMany.mockResolvedValue([
        perm({ targetType: 'Group', targetId: 'g1', canView: true, canEdit: true }),
      ]);
      prisma.user.findUnique.mockResolvedValue({ groupId: 'g1' });
      const result = await service.getEffectivePermission('u1', 'StandardUser', 'app1');
      expect(result).toMatchObject({ canView: true, canEdit: true });
    });

    it('非所属グループの権限は適用されない', async () => {
      prisma.app.findUnique.mockResolvedValue({ id: 'app1', createdBy: 'owner' });
      prisma.appPermission.findMany.mockResolvedValue([
        perm({ targetType: 'Group', targetId: 'g2', canView: true }),
      ]);
      prisma.user.findUnique.mockResolvedValue({ groupId: 'g1' });
      const result = await service.getEffectivePermission('u1', 'StandardUser', 'app1');
      expect(result.canView).toBe(false);
    });

    it('複数の該当対象はORで結合される', async () => {
      prisma.app.findUnique.mockResolvedValue({ id: 'app1', createdBy: 'owner' });
      prisma.appPermission.findMany.mockResolvedValue([
        perm({ targetType: 'All', canView: true }),
        perm({ targetType: 'User', targetId: 'u1', canAdd: true }),
        perm({ targetType: 'Group', targetId: 'g1', canDelete: true }),
      ]);
      prisma.user.findUnique.mockResolvedValue({ groupId: 'g1' });
      const result = await service.getEffectivePermission('u1', 'StandardUser', 'app1');
      expect(result).toMatchObject({ canView: true, canAdd: true, canDelete: true, canEdit: false, canManage: false });
    });

    it('Viewerロールは閲覧以外を強制無効化（権限が付与されていても）', async () => {
      prisma.app.findUnique.mockResolvedValue({ id: 'app1', createdBy: 'owner' });
      prisma.appPermission.findMany.mockResolvedValue([
        perm({ targetType: 'All', canView: true, canAdd: true, canEdit: true, canDelete: true, canManage: true }),
      ]);
      prisma.user.findUnique.mockResolvedValue({ groupId: null });
      const result = await service.getEffectivePermission('u1', 'Viewer', 'app1');
      expect(result).toEqual({ canView: true, canAdd: false, canEdit: false, canDelete: false, canManage: false });
    });
  });

  describe('assert', () => {
    it('権限があれば有効権限を返す', async () => {
      prisma.app.findUnique.mockResolvedValue({ id: 'app1', createdBy: 'u1' });
      const result = await service.assert('u1', 'StandardUser', 'app1', 'canEdit');
      expect(result.canEdit).toBe(true);
    });

    it('権限が無ければ Forbidden', async () => {
      prisma.app.findUnique.mockResolvedValue({ id: 'app1', createdBy: 'owner' });
      prisma.appPermission.findMany.mockResolvedValue([perm({ targetType: 'All', canView: true })]);
      prisma.user.findUnique.mockResolvedValue({ groupId: null });
      await expect(service.assert('u1', 'StandardUser', 'app1', 'canDelete')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('allowedCreatorIds', () => {
    it('SystemAdmin は null（制限なし）', async () => {
      expect(await service.allowedCreatorIds('app1', 'u1', 'SystemAdmin')).toBeNull();
    });

    it('canManage は null（制限なし）', async () => {
      expect(await service.allowedCreatorIds('app1', 'u1', 'StandardUser', 'view', true)).toBeNull();
    });

    it('所有者は null（全件）', async () => {
      prisma.app.findUnique.mockResolvedValue({ createdBy: 'u1', recordViewScope: 'owner', recordEditScope: 'owner' });
      expect(await service.allowedCreatorIds('app1', 'u1', 'StandardUser')).toBeNull();
    });

    it('scope=all は null', async () => {
      prisma.app.findUnique.mockResolvedValue({ createdBy: 'owner', recordViewScope: 'all', recordEditScope: 'all' });
      expect(await service.allowedCreatorIds('app1', 'u1', 'StandardUser')).toBeNull();
    });

    it('scope=owner は本人のみ', async () => {
      prisma.app.findUnique.mockResolvedValue({ createdBy: 'owner', recordViewScope: 'owner', recordEditScope: 'all' });
      expect(await service.allowedCreatorIds('app1', 'u1', 'StandardUser', 'view')).toEqual(['u1']);
    });

    it('view/edit でscopeを使い分ける', async () => {
      prisma.app.findUnique.mockResolvedValue({ createdBy: 'owner', recordViewScope: 'all', recordEditScope: 'owner' });
      expect(await service.allowedCreatorIds('app1', 'u1', 'StandardUser', 'view')).toBeNull();
      expect(await service.allowedCreatorIds('app1', 'u1', 'StandardUser', 'edit')).toEqual(['u1']);
    });

    it('scope=org は所属+配下メンバー', async () => {
      prisma.app.findUnique.mockResolvedValue({ createdBy: 'owner', recordViewScope: 'org', recordEditScope: 'all' });
      // u1 は g1 所属。g1 の子が g2、g2 のメンバーに u2。
      prisma.user.findUnique.mockResolvedValue({ groupId: 'g1' }); // direct
      prisma.user.findMany.mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]); // members of g1+g2
      prisma.group.findMany.mockResolvedValue([
        { id: 'g1', parentId: null },
        { id: 'g2', parentId: 'g1' },
      ]);
      const result = await service.allowedCreatorIds('app1', 'u1', 'StandardUser', 'view');
      expect(result).toEqual(expect.arrayContaining(['u1', 'u2']));
    });
  });

  describe('orgScopedUserIds', () => {
    it('どのグループにも属さない場合は本人のみ', async () => {
      prisma.user.findUnique.mockResolvedValue({ groupId: null });
      expect(await service.orgScopedUserIds('u1')).toEqual(['u1']);
    });

    it('配下部署を再帰的に辿ってメンバーを集約（本人を必ず含む）', async () => {
      prisma.user.findUnique.mockResolvedValue({ groupId: 'g1' }); // direct
      prisma.user.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]); // members
      prisma.group.findMany.mockResolvedValue([
        { id: 'g1', parentId: null },
        { id: 'g2', parentId: 'g1' },
        { id: 'g3', parentId: 'g2' },
      ]);
      const result = await service.orgScopedUserIds('u1');
      expect(result).toEqual(expect.arrayContaining(['a', 'b', 'u1']));
      // g1,g2,g3 すべてが scope に入っていることを確認
      expect(prisma.user.findMany).toHaveBeenLastCalledWith({
        where: { groupId: { in: expect.arrayContaining(['g1', 'g2', 'g3']) } },
        select: { id: true },
      });
    });

    it('グループに循環があっても無限ループしない', async () => {
      prisma.user.findUnique.mockResolvedValue({ groupId: 'g1' });
      prisma.user.findMany.mockResolvedValue([{ id: 'a' }]);
      // g1 -> g2 -> g1 の循環
      prisma.group.findMany.mockResolvedValue([
        { id: 'g1', parentId: 'g2' },
        { id: 'g2', parentId: 'g1' },
      ]);
      const result = await service.orgScopedUserIds('u1');
      expect(result).toEqual(expect.arrayContaining(['a', 'u1']));
    });
  });

  describe('visibleAppIds', () => {
    it('SystemAdmin は null（全件）', async () => {
      expect(await service.visibleAppIds('u1', 'SystemAdmin')).toBeNull();
    });

    it('所有アプリと閲覧権限アプリを統合し重複排除', async () => {
      prisma.app.findMany.mockResolvedValue([{ id: 'owned1' }]);
      prisma.user.findUnique.mockResolvedValue({ groupId: 'g1' });
      prisma.appPermission.findMany.mockResolvedValue([{ appId: 'shared1' }, { appId: 'owned1' }]);
      const result = await service.visibleAppIds('u1', 'StandardUser');
      expect(result).toEqual(expect.arrayContaining(['owned1', 'shared1']));
      expect(result).toHaveLength(2); // owned1 の重複は排除
    });
  });
});
