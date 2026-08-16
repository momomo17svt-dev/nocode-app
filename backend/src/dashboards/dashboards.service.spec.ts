import { DashboardsService } from './dashboards.service';

/**
 * ダッシュボード集計のレコード可視性テスト。
 * ウィジェット種別ごとに素の findMany を書くと owner/org スコープを取りこぼすため、
 * 「自分のタスク」も通常ウィジェットと同じ絞り込みを通ることを固定する。
 */
describe('DashboardsService レコード公開範囲', () => {
  let prisma: any;
  let permission: any;
  let service: DashboardsService;

  const app = {
    id: 'app1',
    name: '案件管理',
    processConfig: { enabled: true, statusField: 'status', actions: [{ from: '対応中', to: '完了' }] },
  };

  beforeEach(() => {
    prisma = {
      app: { findMany: jest.fn().mockResolvedValue([app]), findUnique: jest.fn().mockResolvedValue(app) },
      field: {
        findMany: jest.fn().mockResolvedValue([
          { fieldCode: 'title', fieldType: 'text', label: '件名', settings: {} },
          { fieldCode: 'assignee', fieldType: 'user_select', label: '担当', settings: {} },
          { fieldCode: 'status', fieldType: 'status', label: '状態', settings: { options: ['対応中', '完了'] } },
        ]),
      },
      record: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            updatedAt: new Date('2026-08-01T00:00:00Z'),
            dataJson: { title: '自分の担当', assignee: 'u1', status: '対応中' },
          },
        ]),
      },
      user: { findMany: jest.fn().mockResolvedValue([]) },
    };
    permission = {
      visibleAppIds: jest.fn().mockResolvedValue(['app1']),
      allowedCreatorIds: jest.fn().mockResolvedValue(['u1']),
      recordFieldScope: jest.fn().mockResolvedValue(null),
    };
    service = new DashboardsService(prisma, permission);
  });

  it('「自分のタスク」も作成者スコープで絞り込む', async () => {
    const res = await service.computeWidgets('u1', 'StandardUser', [{ id: 'w1', type: 'mytasks' } as any]);

    expect(permission.allowedCreatorIds).toHaveBeenCalledWith('app1', 'u1', 'StandardUser', 'view');
    expect(prisma.record.findMany).toHaveBeenCalledWith({
      where: { appId: 'app1', createdBy: { in: ['u1'] } },
      orderBy: { updatedAt: 'desc' },
    });
    expect(res.w1.tasks).toHaveLength(1);
  });

  it('「自分のタスク」も対象社員フィールドのスコープで絞り込む', async () => {
    permission.allowedCreatorIds.mockResolvedValue(null);
    permission.recordFieldScope.mockResolvedValue({ field: 'assignee', userIds: ['u2'] });

    const res = await service.computeWidgets('u1', 'StandardUser', [{ id: 'w1', type: 'mytasks' } as any]);

    // 担当が u1 のレコードはスコープ(u2のみ)の外なのでタスクに出ない
    expect(res.w1.tasks).toHaveLength(0);
  });

  it('通常ウィジェットも同じ絞り込みを通る', async () => {
    await service.computeWidgets('u1', 'StandardUser', [
      { id: 'w1', type: 'list', appId: 'app1', columns: ['title'] } as any,
    ]);

    expect(prisma.record.findMany).toHaveBeenCalledWith({
      where: { appId: 'app1', createdBy: { in: ['u1'] } },
      orderBy: { updatedAt: 'desc' },
    });
  });
});
