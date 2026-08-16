import request from 'supertest';
import { createApp, resetDb, seedUser, seedApp, login, bearer, E2EContext } from './helpers';

/**
 * レコードのライフサイクルを実DB通しで検証:
 * フィールド定義 → 作成(自動採番/計算) → 更新(履歴/採番保持) → 検索/絞り込み → 削除。
 */
describe('Records lifecycle (e2e)', () => {
  let ctx: E2EContext;
  const http = () => ctx.app.getHttpServer();
  let appId: string;
  let token: string;

  beforeAll(async () => {
    ctx = await createApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    const owner = await seedUser(ctx.prisma, { loginId: 'owner', role: 'AppCreator' });
    await seedUser(ctx.prisma, { loginId: 'user', role: 'StandardUser' });
    const app = await seedApp(ctx.prisma, {
      createdBy: owner.id,
      fields: [
        { fieldCode: 'no', fieldType: 'auto_number', label: '番号', settings: { prefix: 'INV-', padding: 4 } },
        { fieldCode: 'title', fieldType: 'text', label: '件名' },
        { fieldCode: 'qty', fieldType: 'number', label: '数量' },
        { fieldCode: 'price', fieldType: 'number', label: '単価' },
        { fieldCode: 'total', fieldType: 'calc', label: '金額', settings: { formula: 'qty * price' } },
      ],
      permissions: [{ targetType: 'All', canView: true, canAdd: true, canEdit: true, canDelete: true }],
    });
    appId = app.id;
    token = await login(ctx.app, 'user');
  });

  const create = (data: any) =>
    request(http()).post('/api/records').set(bearer(token)).send({ appId, data });

  it('作成時に自動採番され、計算フィールドがサーバ側で確定する', async () => {
    const r1 = await create({ title: 'A', qty: 2, price: 50 }).expect(201);
    expect(r1.body.dataJson.no).toBe('INV-0001');
    expect(r1.body.dataJson.total).toBe(100);

    const r2 = await create({ title: 'B', qty: 1, price: 30 }).expect(201);
    expect(r2.body.dataJson.no).toBe('INV-0002'); // 連番が進む
    expect(r2.body.dataJson.total).toBe(30);
  });

  it('更新で計算は再計算、自動採番はクライアント上書きを無視、履歴が残る', async () => {
    const created = await create({ title: 'A', qty: 2, price: 50 }).expect(201);
    const id = created.body.id;

    const updated = await request(http())
      .put(`/api/records/${id}`)
      .set(bearer(token))
      .send({ data: { qty: 3, no: 'HACK' }, expectedVersion: created.body.version })
      .expect(200);
    expect(updated.body.dataJson.total).toBe(150); // 再計算
    expect(updated.body.dataJson.no).toBe('INV-0001'); // 採番は保持

    const detail = await request(http()).get(`/api/records/${id}`).set(bearer(token)).expect(200);
    expect(detail.body.histories.length).toBeGreaterThanOrEqual(1);
    expect(detail.body.histories[0].oldData.qty).toBe(2);
  });

  it('キーワード検索とフィールド絞り込みが効く', async () => {
    await create({ title: 'りんご', qty: 1, price: 100 }).expect(201);
    await create({ title: 'みかん', qty: 2, price: 80 }).expect(201);

    const search = await request(http())
      .get(`/api/records?appId=${appId}&search=りんご`)
      .set(bearer(token))
      .expect(200);
    expect(search.body).toHaveLength(1);
    expect(search.body[0].dataJson.title).toBe('りんご');

    const filtered = await request(http())
      .get(`/api/records?appId=${appId}&filter[title]=みかん`)
      .set(bearer(token))
      .expect(200);
    expect(filtered.body).toHaveLength(1);
    expect(filtered.body[0].dataJson.title).toBe('みかん');
  });

  it('一覧をDB側で検索・条件指定・並び替え・ページ分割する', async () => {
    await create({ title: '青森りんご', qty: 3, price: 100 }).expect(201);
    await create({ title: '長野りんご', qty: 8, price: 120 }).expect(201);
    await create({ title: 'みかん', qty: 20, price: 80 }).expect(201);

    const response = await request(http())
      .get('/api/records')
      .query({
        appId,
        page: 1,
        pageSize: 1,
        search: 'りんご',
        conditions: JSON.stringify([{ field: 'qty', op: 'gt', value: '2' }]),
        sortField: 'qty',
        sortOrder: 'desc',
      })
      .set(bearer(token))
      .expect(200);

    expect(response.body).toMatchObject({ total: 2, page: 1, pageSize: 1, totalPages: 2 });
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].dataJson.title).toBe('長野りんご');
  });

  it('削除すると一覧から消える', async () => {
    const a = await create({ title: 'A', qty: 1, price: 1 }).expect(201);
    await create({ title: 'B', qty: 1, price: 1 }).expect(201);

    await request(http()).delete(`/api/records/${a.body.id}`).set(bearer(token)).expect(200);

    const list = await request(http()).get(`/api/records?appId=${appId}`).set(bearer(token)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].dataJson.title).toBe('B');
  });

  it('未認証では一覧取得は 401', async () => {
    await request(http()).get(`/api/records?appId=${appId}`).expect(401);
  });
});
