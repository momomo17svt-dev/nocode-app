import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';

describe('GroupsService', () => {
  let prisma: any;
  let service: GroupsService;

  beforeEach(() => {
    prisma = {
      group: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn((a) => ({ id: 'g-new', ...a.data })),
        update: jest.fn((a) => ({ id: a.where.id, ...a.data })),
        delete: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: null } }),
      },
      user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    service = new GroupsService(prisma);
  });

  describe('descendantGroupIds', () => {
    it('全配下グループを再帰的に返す', async () => {
      prisma.group.findMany.mockResolvedValue([
        { id: 'g1', parentId: null },
        { id: 'g2', parentId: 'g1' },
        { id: 'g3', parentId: 'g2' },
        { id: 'g4', parentId: null },
      ]);
      const res = await service.descendantGroupIds('g1');
      expect(res.sort()).toEqual(['g2', 'g3']);
    });

    it('循環があっても停止する', async () => {
      prisma.group.findMany.mockResolvedValue([
        { id: 'g1', parentId: 'g2' },
        { id: 'g2', parentId: 'g1' },
      ]);
      const res = await service.descendantGroupIds('g1');
      expect(res).toEqual(['g2']);
    });
  });

  describe('create', () => {
    it('最上位グループを末尾の表示順で作成する', async () => {
      prisma.group.aggregate.mockResolvedValue({ _max: { sortOrder: 2 } });
      await service.create({ name: '営業部' });
      expect(prisma.group.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ name: '営業部', parentId: null, sortOrder: 3 }) }),
      );
    });

    it('存在しない親を指定すると NotFound', async () => {
      prisma.group.findUnique.mockResolvedValue(null);
      await expect(service.create({ name: '課', parentId: 'ghost' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('update (親の検証)', () => {
    it('自分自身を親にすると BadRequest', async () => {
      await expect(service.update('g1', { parentId: 'g1' })).rejects.toThrow(BadRequestException);
    });

    it('配下グループを親にすると循環参照で BadRequest', async () => {
      prisma.group.findUnique.mockResolvedValue({ id: 'g3' }); // 親g3は存在
      prisma.group.findMany.mockResolvedValue([
        { id: 'g1', parentId: null },
        { id: 'g2', parentId: 'g1' },
        { id: 'g3', parentId: 'g2' }, // g3 は g1 の子孫
      ]);
      await expect(service.update('g1', { parentId: 'g3' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('addMember', () => {
    it('既に同じ部署所属なら Conflict', async () => {
      prisma.user.findUnique.mockResolvedValue({ groupId: 'g1' });
      await expect(service.addMember('g1', 'u1')).rejects.toThrow(ConflictException);
    });

    it('所属部署をこの部署に設定（異動）する', async () => {
      prisma.user.findUnique.mockResolvedValue({ groupId: null });
      await service.addMember('g1', 'u1');
      expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { groupId: 'g1' }, select: { id: true } });
    });
  });

  describe('reorder', () => {
    it('端での操作は何もしない', async () => {
      prisma.group.findUnique.mockResolvedValue({ parentId: null });
      prisma.group.findMany.mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]);
      const res = await service.reorder('g1', 'up'); // 先頭をupは端
      expect(res).toEqual({ ok: true });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('入れ替え可能な場合は再採番トランザクションを実行する', async () => {
      prisma.group.findUnique.mockResolvedValue({ parentId: null });
      prisma.group.findMany.mockResolvedValue([{ id: 'g1' }, { id: 'g2' }]);
      await service.reorder('g2', 'up');
      expect(prisma.$transaction).toHaveBeenCalled();
    });
  });

  describe('importRows', () => {
    it('部署名未入力はエラー、既存は更新・新規は作成、親部署を解決する', async () => {
      // 1行目: 既存「営業部」を更新（親なし）
      // 2行目: 新規「国内営業課」+ 親=営業部（同CSV内で解決）
      // 3行目: 名前空 → エラー
      // Pass1 findFirst: 営業部=既存, 国内営業課=新規, （未知の親解決は idByName で済むため呼ばれない）
      prisma.group.findFirst
        .mockResolvedValueOnce({ id: 'g-eigyo', name: '営業部' })
        .mockResolvedValueOnce(null);
      // assertValidParent が親存在チェックで引く findUnique
      prisma.group.findUnique.mockResolvedValue({ id: 'g-eigyo' });

      const res = await service.importRows([
        { name: '営業部', description: '更新' },
        { name: '国内営業課', parent: '営業部' },
        { name: '' },
      ]);

      expect(res.updated).toBe(1);
      expect(res.created).toBe(1);
      expect(res.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ row: 3 }), // empty name
        ]),
      );
      // 親=営業部(g-eigyo) が国内営業課に設定される
      expect(prisma.group.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ parentId: 'g-eigyo' }) }),
      );
    });
  });
});
