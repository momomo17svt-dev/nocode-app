import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RecordsService } from './records.service';

/**
 * records.service の単体テスト。Prisma / 通知 / 埋め込み / 権限を全てモックし、
 * 計算フィールド・自動採番・承認者ルーティング・検索フィルタ・CSV・インポートのロジックを検証する。
 */
describe('RecordsService', () => {
  let prisma: any;
  let tx: any;
  let notifications: any;
  let embeddings: any;
  let permission: any;
  let service: RecordsService;

  beforeEach(() => {
    tx = {
      field: { findMany: jest.fn().mockResolvedValue([]) },
      record: {
        create: jest.fn((args) => ({
          id: 'r-new',
          appId: args.data.appId,
          dataJson: args.data.dataJson,
          createdBy: args.data.createdBy,
          updatedBy: args.data.updatedBy,
        })),
        update: jest.fn((args) => ({
          id: args.where.id,
          dataJson: args.data.dataJson,
          updatedBy: args.data.updatedBy,
        })),
      },
      recordHistory: { create: jest.fn().mockResolvedValue({}) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ n: 1 }]),
    };

    prisma = {
      record: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      field: { findMany: jest.fn().mockResolvedValue([]) },
      app: { findUnique: jest.fn().mockResolvedValue({ name: 'App', processConfig: null }) },
      user: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (cb: any) => cb(tx)),
    };

    notifications = { notify: jest.fn().mockResolvedValue(undefined), notifyMany: jest.fn().mockResolvedValue(undefined) };
    embeddings = {
      maybeIndexRecord: jest.fn().mockResolvedValue(undefined),
      removeRecord: jest.fn().mockResolvedValue(undefined),
      removeRecords: jest.fn().mockResolvedValue(undefined),
    };
    permission = { allowedCreatorIds: jest.fn().mockResolvedValue(null) };

    service = new RecordsService(prisma, notifications, embeddings, permission);
  });

  describe('create', () => {
    it('自動採番フィールドを採番してフォーマットする', async () => {
      tx.field.findMany.mockResolvedValue([
        { fieldType: 'auto_number', fieldCode: 'no', settings: { prefix: 'A-', padding: 3 } },
      ]);
      tx.$queryRawUnsafe.mockResolvedValue([{ n: 5 }]);

      await service.create('app1', {}, 'u1');

      const arg = tx.record.create.mock.calls[0][0];
      expect(arg.data.dataJson.no).toBe('A-005');
    });

    it('計算フィールドをサーバ側で評価する', async () => {
      tx.field.findMany.mockResolvedValue([
        { fieldType: 'calc', fieldCode: 'total', settings: { formula: 'qty * price' } },
      ]);

      await service.create('app1', { qty: 2, price: 50 }, 'u1');

      const arg = tx.record.create.mock.calls[0][0];
      expect(arg.data.dataJson.total).toBe(100);
    });

    it('作成後に埋め込みインデックス更新を呼ぶ', async () => {
      await service.create('app1', { name: 'x' }, 'u1');
      expect(embeddings.maybeIndexRecord).toHaveBeenCalledWith('app1', 'r-new');
    });

    it('user_selectフィールドの担当者へ通知する', async () => {
      tx.field.findMany.mockResolvedValue([{ fieldType: 'user_select', fieldCode: 'assignee' }]);
      prisma.field.findMany.mockResolvedValue([{ fieldType: 'user_select', fieldCode: 'assignee', label: '担当' }]);

      await service.create('app1', { assignee: 'u2' }, 'u1');

      expect(notifications.notify).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u2', type: 'assignment', actorId: 'u1' }),
      );
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.record.findUnique.mockResolvedValue({
        id: 'r1',
        appId: 'app1',
        dataJson: { no: 'A-001', name: 'old' },
      });
    });

    it('既存データとマージし、変更履歴を記録する', async () => {
      await service.update('r1', { name: 'new' }, 'u1');

      const hist = tx.recordHistory.create.mock.calls[0][0];
      expect(hist.data.oldData).toEqual({ no: 'A-001', name: 'old' });
      expect(hist.data.newData).toMatchObject({ name: 'new' });
      expect(tx.record.update).toHaveBeenCalled();
    });

    it('自動採番はクライアントの上書きを無視し既存値を保持する', async () => {
      tx.field.findMany.mockResolvedValue([{ fieldType: 'auto_number', fieldCode: 'no' }]);

      await service.update('r1', { no: 'HACKED', name: 'new' }, 'u1');

      const arg = tx.record.update.mock.calls[0][0];
      expect(arg.data.dataJson.no).toBe('A-001');
    });

    it('存在しないレコードは NotFound', async () => {
      prisma.record.findUnique.mockResolvedValue(null);
      await expect(service.update('missing', {}, 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('承認者ルーティング (assertProcessApprover)', () => {
    beforeEach(() => {
      prisma.record.findUnique.mockResolvedValue({
        id: 'r1',
        appId: 'app1',
        dataJson: { status: 'pending', mgr: 'u-mgr' },
      });
      prisma.app.findUnique.mockResolvedValue({
        name: 'App',
        processConfig: {
          enabled: true,
          statusField: 'status',
          actions: [{ from: 'pending', to: 'approved', approver: 'mgr' }],
        },
      });
    });

    it('指定承認者以外がステータス遷移すると Forbidden', async () => {
      await expect(
        service.update('r1', { status: 'approved' }, 'intruder', { canManage: false }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('指定承認者本人は遷移できる', async () => {
      await expect(service.update('r1', { status: 'approved' }, 'u-mgr', {})).resolves.toBeDefined();
    });

    it('管理権限者は承認者でなくても遷移できる', async () => {
      await expect(
        service.update('r1', { status: 'approved' }, 'intruder', { canManage: true }),
      ).resolves.toBeDefined();
    });
  });

  describe('findAll', () => {
    beforeEach(() => {
      prisma.record.findMany.mockResolvedValue([
        { id: '1', dataJson: { name: 'Apple', cat: 'fruit' } },
        { id: '2', dataJson: { name: 'Carrot', cat: 'veg' } },
        { id: '3', dataJson: { name: 'Banana', cat: 'fruit' } },
      ]);
    });

    it('フィールド別フィルタ（部分一致）', async () => {
      const res = await service.findAll('app1', { filters: { cat: 'fruit' } });
      expect(res.map((r: any) => r.id)).toEqual(['1', '3']);
    });

    it('キーワード検索は全フィールド横断・大文字小文字無視', async () => {
      const res = await service.findAll('app1', { search: 'carr' });
      expect(res.map((r: any) => r.id)).toEqual(['2']);
    });

    it('allowedCreatorIds指定時はwhereに作成者フィルタを付与', async () => {
      await service.findAll('app1', {}, ['u1', 'u2']);
      expect(prisma.record.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { appId: 'app1', createdBy: { in: ['u1', 'u2'] } },
        }),
      );
    });
  });

  describe('bulkRemove', () => {
    it('作成者制限付きで削除し件数を返す', async () => {
      prisma.record.deleteMany.mockResolvedValue({ count: 2 });
      const res = await service.bulkRemove('app1', ['a', 'b'], ['u1']);
      expect(res).toEqual({ deleted: 2 });
      expect(prisma.record.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['a', 'b'] }, appId: 'app1', createdBy: { in: ['u1'] } },
      });
    });
  });

  describe('importRows', () => {
    it('必須未入力の行はエラー、未定義カラムは無視して取り込む', async () => {
      prisma.field.findMany.mockResolvedValue([
        { fieldCode: 'name', required: true, fieldType: 'text' },
        { fieldCode: 'age', required: false, fieldType: 'number' },
      ]);
      const rows = [
        { name: 'Alice', age: 30, junk: 'ignored' },
        { age: 5 }, // name 未入力
      ];
      const res = await service.importRows('app1', rows, 'u1');
      expect(res.created).toBe(1);
      expect(res.errors).toHaveLength(1);
      expect(res.errors[0].row).toBe(2);
      expect(res.errors[0].message).toContain('必須');
    });
  });

  describe('exportCsv', () => {
    it('BOM付きでヘッダ＋行を出力し、カンマ/引用符をエスケープする', async () => {
      prisma.field.findMany.mockResolvedValue([
        { fieldCode: 'name', label: '氏名' },
        { fieldCode: 'note', label: 'メモ' },
      ]);
      prisma.record.findMany.mockResolvedValue([{ id: 'r1', dataJson: { name: 'Alice', note: 'a,b"c' } }]);

      const csv = await service.exportCsv('app1');
      const [bomHeader, line] = csv.split('\r\n');
      expect(bomHeader).toBe('﻿レコードID,氏名,メモ');
      expect(line).toBe('r1,Alice,"a,b""c"');
    });
  });

  describe('remove', () => {
    it('レコードを削除し埋め込みも除去する', async () => {
      prisma.record.delete.mockResolvedValue({ id: 'r1' });
      await service.remove('r1');
      expect(prisma.record.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
      expect(embeddings.removeRecord).toHaveBeenCalledWith('r1');
    });
  });

  describe('duplicate', () => {
    it('自動採番をクリアして再採番する', async () => {
      prisma.record.findUnique.mockResolvedValue({
        id: 'r1',
        appId: 'app1',
        dataJson: { no: 'A-001', name: 'orig' },
      });
      prisma.field.findMany.mockResolvedValue([{ fieldType: 'auto_number', fieldCode: 'no' }]);
      // create 内 computeFields が参照する tx 側にも同じ定義を返す
      tx.field.findMany.mockResolvedValue([
        { fieldType: 'auto_number', fieldCode: 'no', settings: { prefix: 'A-', padding: 3 } },
      ]);
      tx.$queryRawUnsafe.mockResolvedValue([{ n: 9 }]);

      await service.duplicate('r1', 'u1');

      const arg = tx.record.create.mock.calls[0][0];
      expect(arg.data.dataJson.name).toBe('orig');
      expect(arg.data.dataJson.no).toBe('A-009'); // 旧A-001はクリアされ再採番
    });
  });
});
