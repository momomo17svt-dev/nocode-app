import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GroupsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    // parentId はスカラ項目なので自動で含まれる。フロントはこれでツリーを組み立てる。
    // 並びは表示順(sortOrder)昇順、同値は作成順。兄弟部署の並べ替えに対応。
    // 注: 2万件規模では findChildren による遅延展開を使うこと（これは小規模/互換用）。
    return this.prisma.group.findMany({
      include: { _count: { select: { members: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * 組織ツリーの遅延展開用: 指定親(null=最上位)の「直下」グループだけを返す。
   * 各グループにメンバー数と子グループ数を付け、フロントは展開可否を判断できる。
   */
  async findChildren(parentId: string | null) {
    const groups = await this.prisma.group.findMany({
      where: { parentId: parentId ?? null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { members: true, children: true } } },
    });
    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      parentId: g.parentId,
      sortOrder: g.sortOrder,
      memberCount: g._count.members,
      childCount: g._count.children,
    }));
  }

  /**
   * 委譲管理(GroupAdmin)用: そのユーザーの所属部署を「ツリーのルート」として返す。
   * 親も同じユーザーの所属なら重複を避けてルートから外す。形は findChildren と同じ。
   */
  async findUserRootGroups(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { groupId: true } });
    const direct = u?.groupId ? [u.groupId] : [];
    if (direct.length === 0) return [];
    const directSet = new Set(direct);
    const groups = await this.prisma.group.findMany({
      where: { id: { in: direct } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { members: true, children: true } } },
    });
    return groups
      .filter((g) => !(g.parentId && directSet.has(g.parentId)))
      .map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        parentId: g.parentId,
        sortOrder: g.sortOrder,
        memberCount: g._count.members,
        childCount: g._count.children,
      }));
  }

  /**
   * グループ名の部分一致検索（最大take件）。各件に祖先名を連結したパスを付ける。
   * 結果は最大100件なので、祖先はキャッシュ付きで個別に辿る（全件ロードしない）。
   */
  async searchGroups(q: string, take = 50) {
    const term = (q ?? '').trim();
    if (!term) return [];
    const limit = Math.min(100, Math.max(1, take));
    const groups = await this.prisma.group.findMany({
      where: { name: { contains: term, mode: 'insensitive' } },
      orderBy: [{ name: 'asc' }],
      take: limit,
      include: { _count: { select: { members: true, children: true } } },
    });

    const cache = new Map<string, { name: string; parentId: string | null }>();
    const getNode = async (id: string) => {
      const hit = cache.get(id);
      if (hit) return hit;
      const n = await this.prisma.group.findUnique({
        where: { id },
        select: { name: true, parentId: true },
      });
      if (n) cache.set(id, n);
      return n;
    };

    const result: any[] = [];
    for (const g of groups) {
      const path: string[] = [];
      let pid = g.parentId;
      let guard = 0;
      while (pid && guard++ < 50) {
        const n = await getNode(pid);
        if (!n) break;
        path.unshift(n.name);
        pid = n.parentId;
      }
      result.push({
        id: g.id,
        name: g.name,
        parentId: g.parentId,
        path: path.join(' / '),
        memberCount: g._count.members,
        childCount: g._count.children,
      });
    }
    return result;
  }

  /** グループのメタ情報（メンバーは含めず件数のみ）。メンバーは findMembers で取得する。 */
  async findMeta(id: string) {
    const g = await this.prisma.group.findUnique({
      where: { id },
      include: { _count: { select: { members: true, children: true } } },
    });
    if (!g) throw new NotFoundException('グループが見つかりません');
    return {
      id: g.id,
      name: g.name,
      description: g.description,
      parentId: g.parentId,
      memberCount: g._count.members,
      childCount: g._count.children,
    };
  }

  /** グループメンバーの検索・ページング取得。 */
  async findMembers(groupId: string, query: { q?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 50));
    const q = (query.q ?? '').trim();
    // 1人1部署: 部署メンバー = groupId が一致するユーザー。
    const where: any = { groupId };
    if (q) {
      where.OR = [
        { loginId: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { loginId: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, loginId: true, name: true, role: true, isActive: true },
      }),
      this.prisma.user.count({ where }),
    ]);
    return {
      // memberId は一覧の key 用（= ユーザーID）。
      items: rows.map((u) => ({ memberId: u.id, ...u })),
      total,
      page,
      pageSize,
    };
  }

  /** 指定親の中での次の表示順（末尾）を返す。 */
  private async nextSortOrder(parentId: string | null): Promise<number> {
    const max = await this.prisma.group.aggregate({
      where: { parentId },
      _max: { sortOrder: true },
    });
    return (max._max.sortOrder ?? -1) + 1;
  }

  /** 指定グループの全配下（子孫）グループIDを返す。循環があっても visited で安全に停止。 */
  async descendantGroupIds(groupId: string): Promise<string[]> {
    const all = await this.prisma.group.findMany({ select: { id: true, parentId: true } });
    const childrenMap = new Map<string, string[]>();
    for (const g of all) {
      if (!g.parentId) continue;
      const arr = childrenMap.get(g.parentId);
      if (arr) arr.push(g.id);
      else childrenMap.set(g.parentId, [g.id]);
    }
    const result: string[] = [];
    const visited = new Set<string>([groupId]);
    const stack = [...(childrenMap.get(groupId) ?? [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (visited.has(id)) continue;
      visited.add(id);
      result.push(id);
      for (const c of childrenMap.get(id) ?? []) stack.push(c);
    }
    return result;
  }

  /** 親部署として指定可能か検証する（存在・自己参照・循環参照のチェック）。 */
  private async assertValidParent(parentId: string, selfId?: string) {
    if (selfId && parentId === selfId) {
      throw new BadRequestException('自分自身を親部署にはできません');
    }
    const parent = await this.prisma.group.findUnique({ where: { id: parentId } });
    if (!parent) throw new NotFoundException('親部署が見つかりません');
    if (selfId) {
      const desc = await this.descendantGroupIds(selfId);
      if (desc.includes(parentId)) {
        throw new BadRequestException('配下の部署を親部署にはできません（循環参照）');
      }
    }
  }

  async findOne(id: string) {
    const group = await this.prisma.group.findUnique({
      where: { id },
      include: {
        // 1人1部署: members は所属ユーザーそのもの。
        members: { select: { id: true, loginId: true, name: true, role: true } },
      },
    });
    if (!group) throw new NotFoundException('グループが見つかりません');
    return group;
  }

  async create(data: { name: string; description?: string; parentId?: string | null }) {
    const parentId = data.parentId || null;
    if (parentId) await this.assertValidParent(parentId);
    return this.prisma.group.create({
      data: {
        name: data.name,
        description: data.description ?? null,
        parentId,
        sortOrder: await this.nextSortOrder(parentId), // 末尾に追加
      },
    });
  }

  async update(id: string, data: { name?: string; description?: string; parentId?: string | null }) {
    // parentId は「空文字/null=最上位へ」「値あり=親設定（検証）」を区別する。
    let movedSortOrder: number | undefined;
    if (data.parentId !== undefined) {
      const parentId = data.parentId || null;
      if (parentId) await this.assertValidParent(parentId, id);
      // 親が実際に変わるときは移動先の末尾に配置する。
      const current = await this.prisma.group.findUnique({ where: { id }, select: { parentId: true } });
      if (!current) throw new NotFoundException('部署が見つかりません');
      if ((current.parentId || null) !== parentId) {
        movedSortOrder = await this.nextSortOrder(parentId);
      }
    }
    return this.prisma.group.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId || null } : {}),
        ...(movedSortOrder !== undefined ? { sortOrder: movedSortOrder } : {}),
      },
    });
  }

  /**
   * 兄弟部署内で上下に並べ替える。同じ親の部署を順に再採番してから隣と入れ替える。
   * 端での操作は何もしない。
   */
  async reorder(id: string, direction: 'up' | 'down') {
    const group = await this.prisma.group.findUnique({ where: { id }, select: { parentId: true } });
    if (!group) throw new NotFoundException('部署が見つかりません');
    const siblings = await this.prisma.group.findMany({
      where: { parentId: group.parentId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true },
    });
    const idx = siblings.findIndex((s) => s.id === id);
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swap < 0 || swap >= siblings.length) return { ok: true }; // 端: 何もしない
    [siblings[idx], siblings[swap]] = [siblings[swap], siblings[idx]];
    // 連番に振り直して確定（既存が全て0でも安定する）
    await this.prisma.$transaction(
      siblings.map((s, i) => this.prisma.group.update({ where: { id: s.id }, data: { sortOrder: i } })),
    );
    return { ok: true };
  }

  /**
   * 部署を削除する。**配下（子孫）の部署もまとめて削除**する。
   * 所属していたユーザーは User.groupId が onDelete: SetNull で未所属になる。
   */
  async remove(id: string) {
    const group = await this.prisma.group.findUnique({ where: { id }, select: { id: true } });
    if (!group) throw new NotFoundException('部署が見つかりません');
    const descendants = await this.descendantGroupIds(id);
    const ids = [id, ...descendants];
    await this.prisma.group.deleteMany({ where: { id: { in: ids } } });
    return { deleted: ids.length };
  }

  /**
   * ユーザーの所属部署をこの部署に設定する（1人1部署）。
   * 既に別部署に所属している場合はこの部署へ異動する。
   */
  async addMember(groupId: string, userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { groupId: true } });
    if (!user) throw new NotFoundException('ユーザーが見つかりません');
    if (user.groupId === groupId) throw new ConflictException('既にこの部署に所属しています');
    return this.prisma.user.update({ where: { id: userId }, data: { groupId }, select: { id: true } });
  }

  /** この部署に所属している場合のみ所属を外す（未所属にする）。 */
  async removeMember(groupId: string, userId: string) {
    await this.prisma.user.updateMany({ where: { id: userId, groupId }, data: { groupId: null } });
    return { success: true };
  }

  /**
   * CSVインポート。フロントでパース済みの行配列（name/parent/sortOrder/description）を受け取る。
   * グループは組織ツリー専用（ユーザーは参照しない）。所属は User CSV 側で設定する。
   * 同名グループが既にある場合は再利用して更新する（再取込で重複作成しない）。
   * 親部署は部署名で指定。子→親の順でも解決できるよう2パスで処理する。
   */
  async importRows(
    rows: Record<string, any>[],
  ): Promise<{ created: number; updated: number; errors: { row: number; message: string }[] }> {
    const errors: { row: number; message: string }[] = [];
    let created = 0;
    let updated = 0;

    // 行を正規化。親部署は名前で指定されるため、子→親の順でも解決できるよう2パスで処理する。
    const parsed = rows.map((raw, i) => {
      const r = raw ?? {};
      const sortRaw = String(r.sortOrder ?? '').trim();
      const sortNum = Number(sortRaw);
      return {
        row: i + 1,
        name: String(r.name ?? '').trim(),
        description: String(r.description ?? '').trim(),
        parentName: String(r.parent ?? '').trim(),
        // 整数として解釈できなければ未指定扱い。
        sortOrder: sortRaw !== '' && Number.isInteger(sortNum) ? sortNum : undefined,
      };
    });

    // Pass 1: 部署本体を作成/更新（親はまだ設定しない）。名前→ID を集める。
    const idByName = new Map<string, string>();
    for (const p of parsed) {
      if (!p.name) {
        errors.push({ row: p.row, message: '部署名（グループ名）が未入力です' });
        continue;
      }
      try {
        let group = await this.prisma.group.findFirst({ where: { name: p.name } });
        if (group) {
          const data: any = {};
          if (p.description) data.description = p.description;
          if (p.sortOrder !== undefined) data.sortOrder = p.sortOrder;
          if (Object.keys(data).length) {
            await this.prisma.group.update({ where: { id: group.id }, data });
          }
          updated++;
        } else {
          group = await this.prisma.group.create({
            data: { name: p.name, description: p.description || null, sortOrder: p.sortOrder ?? 0 },
          });
          created++;
        }
        idByName.set(p.name, group.id);
      } catch (e: any) {
        errors.push({ row: p.row, message: `「${p.name}」: ${e?.message ?? '取込に失敗しました'}` });
      }
    }

    // Pass 2: 親部署を設定（部署名で照合。CSV内で先に作られた部署 or 既存部署）。
    for (const p of parsed) {
      const groupId = p.name ? idByName.get(p.name) : undefined;
      if (!groupId) continue; // 未入力 or Pass1で失敗した行はスキップ
      if (!p.parentName) continue;

      if (p.parentName === p.name) {
        errors.push({ row: p.row, message: `「${p.name}」: 自分自身を親部署にできません` });
        continue;
      }
      let parentId = idByName.get(p.parentName);
      if (!parentId) {
        const parent = await this.prisma.group.findFirst({ where: { name: p.parentName } });
        parentId = parent?.id;
      }
      if (!parentId) {
        errors.push({ row: p.row, message: `「${p.name}」: 親部署が見つかりません: ${p.parentName}` });
        continue;
      }
      try {
        // 循環参照（親が自分の子孫）を防止してから設定。
        await this.assertValidParent(parentId, groupId);
        await this.prisma.group.update({ where: { id: groupId }, data: { parentId } });
      } catch (e: any) {
        errors.push({ row: p.row, message: `「${p.name}」: 親部署の設定に失敗: ${e?.message ?? ''}` });
      }
    }
    return { created, updated, errors };
  }
}
