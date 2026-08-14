import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface EffectivePermission {
  canView: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canManage: boolean;
}

export type PermissionAction = keyof EffectivePermission;

const ALL: EffectivePermission = {
  canView: true,
  canAdd: true,
  canEdit: true,
  canDelete: true,
  canManage: true,
};
const NONE: EffectivePermission = {
  canView: false,
  canAdd: false,
  canEdit: false,
  canDelete: false,
  canManage: false,
};

/**
 * 仕様書「5. 権限判定ルール」に基づくアプリ別認可の中核。
 *
 *   1. システム管理者なら全許可
 *   2. アプリ所有者なら管理許可（全許可）
 *   3. ユーザー個別権限を適用
 *   4. 所属グループ権限を適用（複数グループはORで結合）
 *   5. 全ユーザー公開の権限を適用
 *   6. それ以外はアクセス拒否
 *
 * 3〜5は該当するすべての対象をORで結合して有効権限とする。
 * 閲覧ユーザー(Viewer)ロールは追加/編集/削除/管理を強制的に無効化する。
 */
@Injectable()
export class PermissionService {
  constructor(private prisma: PrismaService) {}

  async getEffectivePermission(
    userId: string,
    role: string,
    appId: string,
  ): Promise<EffectivePermission> {
    // 1. システム管理者
    if (role === 'SystemAdmin') return { ...ALL };

    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException('アプリが見つかりません');

    // 2. 所有者
    if (app.createdBy === userId) return { ...ALL };

    // 非公開アプリは所有者・管理者以外アクセス不可
    const perms = await this.prisma.appPermission.findMany({ where: { appId } });
    if (perms.length === 0) return { ...NONE };

    const groupIds = await this.myGroupIds(userId);

    // 3〜5. 該当する公開対象をORで結合
    const applicable = perms.filter(
      (p) =>
        p.targetType === 'All' ||
        (p.targetType === 'User' && p.targetId === userId) ||
        (p.targetType === 'Group' && !!p.targetId && groupIds.includes(p.targetId)),
    );

    const result: EffectivePermission = { ...NONE };
    for (const p of applicable) {
      result.canView = result.canView || p.canView;
      result.canAdd = result.canAdd || p.canAdd;
      result.canEdit = result.canEdit || p.canEdit;
      result.canDelete = result.canDelete || p.canDelete;
      result.canManage = result.canManage || p.canManage;
    }

    // 閲覧ユーザーは閲覧のみに制限
    if (role === 'Viewer') {
      result.canAdd = false;
      result.canEdit = false;
      result.canDelete = false;
      result.canManage = false;
    }

    return result;
  }

  /**
   * 指定アクションの権限が無ければ 403 を投げる。
   * @returns 有効権限（呼び出し側で他の判定に再利用可能）
   */
  async assert(
    userId: string,
    role: string,
    appId: string,
    action: PermissionAction,
  ): Promise<EffectivePermission> {
    const perm = await this.getEffectivePermission(userId, role, appId);
    if (!perm[action]) {
      throw new ForbiddenException('このアプリに対する操作権限がありません');
    }
    return perm;
  }

  /**
   * 「作成者は自分が追加したレコードを編集/削除できる」設定を返す。
   * canEdit/canDelete を持たない追加権限ユーザーでも、本設定がONなら
   * 自分が作成したレコードに限り編集/削除を許可するために使う。
   */
  async getOwnMutationFlags(appId: string): Promise<{ editOwn: boolean; deleteOwn: boolean }> {
    const app = await this.prisma.app.findUnique({
      where: { id: appId },
      select: { creatorEditOwn: true, creatorDeleteOwn: true },
    });
    if (!app) throw new NotFoundException('アプリが見つかりません');
    return { editOwn: app.creatorEditOwn, deleteOwn: app.creatorDeleteOwn };
  }

  /**
   * アプリのレコード単位公開範囲を返す（owner=作成者本人のみ）。
   */
  async getRecordScope(appId: string): Promise<{ view: string; edit: string }> {
    const app = await this.prisma.app.findUnique({
      where: { id: appId },
      select: { recordViewScope: true, recordEditScope: true },
    });
    if (!app) throw new NotFoundException('アプリが見つかりません');
    return { view: app.recordViewScope, edit: app.recordEditScope };
  }

  /**
   * 組織スコープ用: ユーザーの所属部署と、その全配下部署に所属するユーザーIDの集合（本人を含む）。
   * 「上位組織のユーザーは配下メンバーが作成したレコードを閲覧/編集できる」を実現する。
   * グループに循環があっても visited で安全に停止する。
   */
  async orgScopedUserIds(userId: string): Promise<string[]> {
    const scopeGroupIds = await this.myScopeGroupIds(userId);
    if (scopeGroupIds.length === 0) return [userId];

    const members = await this.prisma.user.findMany({
      where: { groupId: { in: scopeGroupIds } },
      select: { id: true },
    });
    const ids = new Set<string>(members.map((m) => m.id));
    ids.add(userId); // 念のため本人は常に含める
    return [...ids];
  }

  /** ユーザーの所属部署ID（1人1部署）。未所属は空配列。 */
  private async myGroupIds(userId: string): Promise<string[]> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { groupId: true } });
    return u?.groupId ? [u.groupId] : [];
  }

  /**
   * 組織スコープ用: ユーザーの所属部署と、その全配下部署のグループID集合。
   * 「所属部署＋配下部署」の管轄範囲(ユーザー検索の絞り込み・管理者の管轄)に使う。
   * グループに循環があっても visited で安全に停止する。所属無しは空配列。
   */
  async myScopeGroupIds(userId: string): Promise<string[]> {
    const direct = await this.myGroupIds(userId);
    if (direct.length === 0) return [];

    const all = await this.prisma.group.findMany({ select: { id: true, parentId: true } });
    const childrenMap = new Map<string, string[]>();
    for (const g of all) {
      if (!g.parentId) continue;
      const arr = childrenMap.get(g.parentId);
      if (arr) arr.push(g.id);
      else childrenMap.set(g.parentId, [g.id]);
    }

    const scopeGroupIds = new Set<string>();
    const stack = [...direct];
    while (stack.length) {
      const gid = stack.pop()!;
      if (scopeGroupIds.has(gid)) continue;
      scopeGroupIds.add(gid);
      for (const c of childrenMap.get(gid) ?? []) stack.push(c);
    }
    return [...scopeGroupIds];
  }

  /**
   * 委譲管理(GroupAdmin)用: 対象ユーザーが管理者の管轄(所属部署＋配下部署)に含まれるか。
   * SystemAdmin は常に true。自分自身も常に true。所属無し管理者は false。
   */
  async isUserInScope(adminId: string, role: string, targetUserId: string): Promise<boolean> {
    if (role === 'SystemAdmin') return true;
    if (targetUserId === adminId) return true;
    const groupIds = await this.myScopeGroupIds(adminId);
    if (groupIds.length === 0) return false;
    const t = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { groupId: true },
    });
    return !!(t?.groupId && groupIds.includes(t.groupId));
  }

  /** 委譲管理(GroupAdmin)用: 対象グループが管理者の管轄に含まれるか。SystemAdmin は常に true。 */
  async isGroupInScope(adminId: string, role: string, groupId: string): Promise<boolean> {
    if (role === 'SystemAdmin') return true;
    const groupIds = await this.myScopeGroupIds(adminId);
    return groupIds.includes(groupId);
  }

  /** スコープ外なら 403。SystemAdmin は常に通過。 */
  async assertUserInScope(adminId: string, role: string, targetUserId: string): Promise<void> {
    if (!(await this.isUserInScope(adminId, role, targetUserId))) {
      throw new ForbiddenException('管轄範囲外のユーザーです');
    }
  }

  /** スコープ外なら 403。SystemAdmin は常に通過。 */
  async assertGroupInScope(adminId: string, role: string, groupId: string): Promise<void> {
    if (!(await this.isGroupInScope(adminId, role, groupId))) {
      throw new ForbiddenException('管轄範囲外の部署です');
    }
  }

  /**
   * 指定アクションでアクセスできるレコード作成者(createdBy)の集合を返す。
   *   null     = 制限なし（全件アクセス可）
   *   string[] = その作成者が作成したレコードのみアクセス可
   *
   * 判定: 管理者 or 管理権限(canManage) or アプリ所有者 → null、
   *       scope=all → null / owner → [本人] / org → 所属+配下メンバー。
   * owner/all の挙動は従来の restrictToOwnerUserId と同一で、org を追加したもの。
   */
  async allowedCreatorIds(
    appId: string,
    userId: string,
    role: string,
    kind: 'view' | 'edit' = 'view',
    canManage = false,
  ): Promise<string[] | null> {
    if (role === 'SystemAdmin' || canManage) return null;
    const app = await this.prisma.app.findUnique({
      where: { id: appId },
      select: { createdBy: true, recordViewScope: true, recordEditScope: true },
    });
    if (!app) return null;
    if (app.createdBy === userId) return null; // 所有者は全件
    const scope = kind === 'edit' ? app.recordEditScope : app.recordViewScope;
    if (scope === 'owner') return [userId];
    if (scope === 'org') return this.orgScopedUserIds(userId);
    return null; // 'all'
  }

  /**
   * レコードを「対象社員フィールド基準」で絞る設定の解決。
   *   null                       = 絞らない（特権=管理者/所有者/canManage、または未設定）
   *   { field, userIds }         = 対象社員(field値)が userIds に含まれるレコードのみ許可
   * userIds は本人の所属部署＋配下部署のメンバー。
   */
  async recordFieldScope(
    appId: string,
    userId: string,
    role: string,
    canManage = false,
  ): Promise<{ field: string; userIds: string[] } | null> {
    if (role === 'SystemAdmin' || canManage) return null;
    const app = await this.prisma.app.findUnique({
      where: { id: appId },
      select: { createdBy: true, recordScopeField: true },
    });
    if (!app || !app.recordScopeField) return null;
    if (app.createdBy === userId) return null; // 所有者は全件
    const userIds = await this.orgScopedUserIds(userId);
    return { field: app.recordScopeField, userIds };
  }

  /**
   * ユーザーが閲覧できるアプリのID一覧を返す（一覧フィルタ用）。
   * SystemAdmin は null を返し、呼び出し側で「全件」と解釈する。
   */
  async visibleAppIds(userId: string, role: string): Promise<string[] | null> {
    if (role === 'SystemAdmin') return null;

    const owned = await this.prisma.app.findMany({
      where: { createdBy: userId },
      select: { id: true },
    });
    const ownedIds = owned.map((a) => a.id);

    const groupIds = await this.myGroupIds(userId);

    const perms = await this.prisma.appPermission.findMany({
      where: {
        canView: true,
        OR: [
          { targetType: 'All' },
          { targetType: 'User', targetId: userId },
          { targetType: 'Group', targetId: { in: groupIds.length ? groupIds : ['__none__'] } },
        ],
      },
      select: { appId: true },
    });

    return Array.from(new Set([...ownedIds, ...perms.map((p) => p.appId)]));
  }
}
