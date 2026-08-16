import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { SettingsService } from '../system-settings/settings.service';

const VALID_ROLES = ['SystemAdmin', 'GroupAdmin', 'AppCreator', 'StandardUser', 'Viewer'];
/** CSV取込で日本語ロール名でも指定できるようにするための対応表。 */
const ROLE_BY_LABEL: Record<string, string> = {
  'システム管理者': 'SystemAdmin',
  '管理者': 'GroupAdmin',
  '部署管理者': 'GroupAdmin',
  'アプリ作成者': 'AppCreator',
  '一般ユーザー': 'StandardUser',
  '閲覧ユーザー': 'Viewer',
  '閲覧者': 'Viewer',
};
/** ロールのコード/日本語名/別名を正規のロールコードへ正規化する。 */
function normalizeRole(raw: string): string | null {
  const v = (raw || '').trim();
  if (!v) return 'StandardUser';
  if (VALID_ROLES.includes(v)) return v;
  return ROLE_BY_LABEL[v] ?? null;
}
const SAFE_SELECT = {
  id: true,
  loginId: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
};

/**
 * 匿名公開フォーム投稿用のセンチネルユーザー（seed.ts で作成、id='anonymous'）。
 * レコードの createdBy FK に使われるため削除不可。ユーザー管理の一覧・操作対象から除外する。
 */
const ANON_USER_ID = 'anonymous';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  async findAll() {
    return this.prisma.user.findMany({
      where: { id: { not: ANON_USER_ID } },
      select: SAFE_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * 検索・ページング付きのユーザー一覧。15万件規模でも一覧画面が一括取得しないようにする。
   * q=ログインID部分一致 / role=ロール絞込 / active=有効状態絞込。
   */
  async findPaged(
    query: {
      q?: string;
      role?: string;
      active?: 'active' | 'inactive';
      page?: number;
      pageSize?: number;
    },
    // 委譲管理(GroupAdmin)の管轄に絞る場合のグループID集合。null/undefined=絞らない(全件)。
    scopeGroupIds?: string[] | null,
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    // 匿名センチネルは管理対象外なので常に除外。
    const where: any = { id: { not: ANON_USER_ID } };
    const q = (query.q ?? '').trim();
    // ログインID・氏名のどちらかに部分一致。
    if (q) {
      where.OR = [
        { loginId: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (query.role) where.role = query.role;
    if (query.active === 'active') where.isActive = true;
    else if (query.active === 'inactive') where.isActive = false;
    if (scopeGroupIds) {
      // 管轄部署のいずれかに所属するユーザーのみ。管轄が空なら該当なし。
      where.groupId = scopeGroupIds.length ? { in: scopeGroupIds } : '__none__';
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          ...SAFE_SELECT,
          group: { select: { id: true, name: true } },
        },
        orderBy: { loginId: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    // 所属部署は単一の {id,name}（未所属は null）として group で返す。
    const items = rows.map((u) => ({ ...u, group: u.group ?? null }));
    return { items, total, page, pageSize };
  }

  /** 認証用: パスワードハッシュを含む完全なレコードを返す。 */
  async findOne(loginId: string) {
    return this.prisma.user.findUnique({ where: { loginId } });
  }

  async create(data: { loginId: string; name?: string; password: string; role?: string; groupId?: string }) {
    if (data.role && !VALID_ROLES.includes(data.role)) {
      throw new BadRequestException('不正なロールです');
    }
    const minLength = this.settings.authPolicyCached().passwordMinLength;
    if (!data.password || data.password.length < minLength) {
      throw new BadRequestException(`パスワードは${minLength}文字以上にしてください`);
    }
    const existing = await this.prisma.user.findUnique({ where: { loginId: data.loginId } });
    if (existing) {
      throw new ConflictException('このログインIDは既に使われています');
    }
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await this.prisma.user.create({
      data: {
        loginId: data.loginId,
        name: data.name?.trim() || null,
        passwordHash,
        role: data.role || 'StandardUser',
        // 所属部署（単一）。委譲管理(GroupAdmin)の作成では呼び出し側で必須・スコープ検証済み。
        ...(data.groupId ? { groupId: data.groupId } : {}),
      },
      select: SAFE_SELECT,
    });
    return user;
  }

  async update(
    id: string,
    data: { name?: string; role?: string; password?: string; isActive?: boolean; groupId?: string | null },
  ) {
    if (data.role && !VALID_ROLES.includes(data.role)) {
      throw new BadRequestException('不正なロールです');
    }
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name.trim() || null;
    if (data.role !== undefined) updateData.role = data.role;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    // 所属部署の変更/解除（空文字/null=未所属）。
    if (data.groupId !== undefined) updateData.groupId = data.groupId || null;
    if (data.password) {
      const minLength = this.settings.authPolicyCached().passwordMinLength;
      if (data.password.length < minLength) {
        throw new BadRequestException(`パスワードは${minLength}文字以上にしてください`);
      }
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }
    if (data.password || data.role !== undefined || data.isActive !== undefined) {
      updateData.authVersion = { increment: 1 };
    }
    try {
      return await this.prisma.user.update({
        where: { id },
        data: updateData,
        select: SAFE_SELECT,
      });
    } catch {
      throw new NotFoundException('ユーザーが見つかりません');
    }
  }

  async setPassword(id: string, newPassword: string) {
    const passwordHash = await bcrypt.hash(newPassword, 10);
    return this.prisma.user.update({
      where: { id },
      data: { passwordHash, authVersion: { increment: 1 } },
      select: SAFE_SELECT,
    });
  }

  /**
   * 削除をブロックしている参照（どのアプリ・レコードに紐づくか）を人間可読な説明にして返す。
   * 削除を妨げるFKは App.createdBy / Record.createdBy / Record.updatedBy の3つ（いずれもRestrict）。
   * 所属部署(User.groupId)は本人カラムなので削除をブロックしない。
   */
  private async userBlockingRefs(id: string): Promise<string[]> {
    const lines: string[] = [];

    // 作成したアプリ
    const apps = await this.prisma.app.findMany({ where: { createdBy: id }, select: { name: true } });
    for (const a of apps) lines.push(`アプリ「${a.name}」の作成者`);

    // 作成・更新したレコードをアプリ単位で集計
    const [created, updated] = await Promise.all([
      this.prisma.record.groupBy({ by: ['appId'], where: { createdBy: id }, _count: { _all: true } }),
      this.prisma.record.groupBy({ by: ['appId'], where: { updatedBy: id }, _count: { _all: true } }),
    ]);
    const appIds = Array.from(new Set([...created, ...updated].map((g) => g.appId)));
    const appName = new Map(
      (await this.prisma.app.findMany({ where: { id: { in: appIds } }, select: { id: true, name: true } })).map(
        (a) => [a.id, a.name] as const,
      ),
    );
    for (const g of created) {
      lines.push(`アプリ「${appName.get(g.appId) ?? g.appId}」のレコード作成者（${g._count._all}件）`);
    }
    for (const g of updated) {
      lines.push(`アプリ「${appName.get(g.appId) ?? g.appId}」のレコード最終更新者（${g._count._all}件）`);
    }
    return lines;
  }

  async remove(id: string) {
    if (id === ANON_USER_ID) {
      throw new BadRequestException('匿名投稿用のシステムユーザーは削除できません');
    }
    // どのアプリ・レコードに紐づくかを先に集計し、ブロック理由を具体的に提示する。
    const refs = await this.userBlockingRefs(id);
    if (refs.length) {
      throw new BadRequestException(
        'このユーザーは以下に紐づいているため削除できません。先に紐づきを解消するか「無効化」してください。\n' +
          refs.map((r) => '・' + r).join('\n'),
      );
    }
    try {
      return await this.prisma.user.delete({ where: { id }, select: { id: true } });
    } catch (e: any) {
      // 念のためのフォールバック（同時実行で参照が増えた等）。
      if (e?.code === 'P2003') {
        throw new BadRequestException(
          'このユーザーは作成したアプリ・レコードに紐づいているため削除できません。代わりに「無効化」してください。',
        );
      }
      throw new NotFoundException('ユーザーが見つかりません');
    }
  }

  /**
   * CSVインポート。フロントでパース済みの行配列（loginId/password/role）を受け取り作成する。
   * 1行ずつ検証し、エラー行はスキップして続行する。
   */
  async importRows(
    rows: Record<string, any>[],
  ): Promise<{ created: number; errors: { row: number; message: string }[] }> {
    const errors: { row: number; message: string }[] = [];
    let created = 0;

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i] ?? {};
      const loginId = String(raw.loginId ?? '').trim();
      const name = String(raw.name ?? '').trim();
      const groupName = String(raw.group ?? '').trim();
      const password = String(raw.password ?? '').trim();
      const role = normalizeRole(String(raw.role ?? ''));

      if (!loginId) {
        errors.push({ row: i + 1, message: 'ログインIDが未入力です' });
        continue;
      }
      if (password.length < 8) {
        errors.push({ row: i + 1, message: `「${loginId}」のパスワードが8文字未満です` });
        continue;
      }
      if (role === null) {
        errors.push({ row: i + 1, message: `「${loginId}」のロールが不正です: ${raw.role}` });
        continue;
      }
      // 所属部署（任意）。部署名で照合。先に部署を取り込んでおく必要がある。
      let groupId: string | undefined;
      if (groupName) {
        const g = await this.prisma.group.findFirst({ where: { name: groupName }, select: { id: true } });
        if (!g) {
          errors.push({ row: i + 1, message: `「${loginId}」の所属部署が見つかりません: ${groupName}` });
          continue;
        }
        groupId = g.id;
      }
      try {
        await this.create({ loginId, name, password, role, groupId });
        created++;
      } catch (e: any) {
        errors.push({ row: i + 1, message: `「${loginId}」: ${e?.message ?? '作成に失敗しました'}` });
      }
    }
    return { created, errors };
  }
}
