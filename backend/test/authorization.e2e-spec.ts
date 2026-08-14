import request from 'supertest';
import { createApp, resetDb, seedUser, seedApp, addToGroup, login, bearer, E2EContext } from './helpers';

/**
 * 認可の通し検証（実HTTP・実DB）。
 * 仕様「アプリ別認可 + ロール + レコード単位公開範囲」がエンドツーエンドで効くことを確認する。
 */
describe('Authorization (e2e)', () => {
  let ctx: E2EContext;
  const http = () => ctx.app.getHttpServer();

  // 役割ごとのユーザーID
  let owner: any, member: any, member2: any;
  let groupId: string;

  beforeAll(async () => {
    ctx = await createApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await seedUser(ctx.prisma, { loginId: 'admin', role: 'SystemAdmin' });
    owner = await seedUser(ctx.prisma, { loginId: 'owner', role: 'AppCreator' });
    member = await seedUser(ctx.prisma, { loginId: 'member', role: 'StandardUser' });
    member2 = await seedUser(ctx.prisma, { loginId: 'member2', role: 'StandardUser' });
    await seedUser(ctx.prisma, { loginId: 'outsider', role: 'StandardUser' });
    await seedUser(ctx.prisma, { loginId: 'viewer', role: 'Viewer' });
    const g = await ctx.prisma.group.create({ data: { name: '営業部' } });
    groupId = g.id;
    await addToGroup(ctx.prisma, member.id, groupId);
    await addToGroup(ctx.prisma, member2.id, groupId);
  });

  const titleField = [{ fieldCode: 'title', fieldType: 'text', label: 'タイトル' }];

  describe('アプリ別権限のゲート', () => {
    it('権限の無いユーザーは一覧取得が 403、グループ閲覧権限者は 200', async () => {
      const app = await seedApp(ctx.prisma, {
        createdBy: owner.id,
        fields: titleField,
        permissions: [{ targetType: 'Group', targetId: groupId, canView: true }],
      });

      const outToken = await login(ctx.app, 'outsider');
      await request(http()).get(`/api/records?appId=${app.id}`).set(bearer(outToken)).expect(403);

      const memToken = await login(ctx.app, 'member');
      const res = await request(http()).get(`/api/records?appId=${app.id}`).set(bearer(memToken)).expect(200);
      expect(res.body).toEqual([]);
    });

    it('canAdd が無ければ作成は 403、有れば 201', async () => {
      const app = await seedApp(ctx.prisma, {
        createdBy: owner.id,
        fields: titleField,
        permissions: [{ targetType: 'Group', targetId: groupId, canView: true, canAdd: true }],
      });

      const outToken = await login(ctx.app, 'outsider');
      await request(http())
        .post('/api/records')
        .set(bearer(outToken))
        .send({ appId: app.id, data: { title: 'x' } })
        .expect(403);

      const memToken = await login(ctx.app, 'member');
      await request(http())
        .post('/api/records')
        .set(bearer(memToken))
        .send({ appId: app.id, data: { title: 'Hello' } })
        .expect(201);

      const list = await request(http()).get(`/api/records?appId=${app.id}`).set(bearer(memToken)).expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0].dataJson.title).toBe('Hello');
    });

    it('SystemAdmin は明示権限が無くても全操作できる', async () => {
      const app = await seedApp(ctx.prisma, { createdBy: owner.id, fields: titleField, permissions: [] });
      const adminToken = await login(ctx.app, 'admin');
      await request(http()).get(`/api/records?appId=${app.id}`).set(bearer(adminToken)).expect(200);
      await request(http())
        .post('/api/records')
        .set(bearer(adminToken))
        .send({ appId: app.id, data: { title: 'by admin' } })
        .expect(201);
    });
  });

  describe('Viewerロールの強制読み取り専用', () => {
    it('canAddを付与されていてもViewerは作成 403（閲覧は200）', async () => {
      const app = await seedApp(ctx.prisma, {
        createdBy: owner.id,
        fields: titleField,
        permissions: [{ targetType: 'All', canView: true, canAdd: true, canEdit: true }],
      });

      const vToken = await login(ctx.app, 'viewer');
      await request(http()).get(`/api/records?appId=${app.id}`).set(bearer(vToken)).expect(200);
      await request(http())
        .post('/api/records')
        .set(bearer(vToken))
        .send({ appId: app.id, data: { title: 'nope' } })
        .expect(403);

      // 同じAll権限でも StandardUser は作成できる（ロール差を担保）
      const sToken = await login(ctx.app, 'outsider');
      await request(http())
        .post('/api/records')
        .set(bearer(sToken))
        .send({ appId: app.id, data: { title: 'ok' } })
        .expect(201);
    });
  });

  describe('レコード単位の公開範囲（owner）', () => {
    it('view=owner: 他人のレコードは一覧に出ず、個別取得は 403。所有者/管理者は閲覧可', async () => {
      const app = await seedApp(ctx.prisma, {
        createdBy: owner.id,
        recordViewScope: 'owner',
        fields: titleField,
        permissions: [{ targetType: 'Group', targetId: groupId, canView: true, canAdd: true }],
      });

      // member が1件作成
      const memToken = await login(ctx.app, 'member');
      const created = await request(http())
        .post('/api/records')
        .set(bearer(memToken))
        .send({ appId: app.id, data: { title: 'memberの秘密' } })
        .expect(201);
      const recId = created.body.id;

      // member2 は同じ権限でも他人のレコードを見られない
      const mem2Token = await login(ctx.app, 'member2');
      const list2 = await request(http()).get(`/api/records?appId=${app.id}`).set(bearer(mem2Token)).expect(200);
      expect(list2.body).toHaveLength(0);
      await request(http()).get(`/api/records/${recId}`).set(bearer(mem2Token)).expect(403);

      // 本人は見られる
      await request(http()).get(`/api/records/${recId}`).set(bearer(memToken)).expect(200);
      // アプリ所有者・管理者も見られる
      const ownerToken = await login(ctx.app, 'owner');
      await request(http()).get(`/api/records/${recId}`).set(bearer(ownerToken)).expect(200);
      const adminToken = await login(ctx.app, 'admin');
      await request(http()).get(`/api/records/${recId}`).set(bearer(adminToken)).expect(200);
    });

    it('edit=owner: 他人のレコードの更新は 403、本人と管理者は可', async () => {
      const app = await seedApp(ctx.prisma, {
        createdBy: owner.id,
        recordEditScope: 'owner',
        fields: titleField,
        permissions: [{ targetType: 'Group', targetId: groupId, canView: true, canAdd: true, canEdit: true }],
      });

      const memToken = await login(ctx.app, 'member');
      const created = await request(http())
        .post('/api/records')
        .set(bearer(memToken))
        .send({ appId: app.id, data: { title: '原本' } })
        .expect(201);
      const recId = created.body.id;

      // member2 は編集権限はあるが範囲外 → 403
      const mem2Token = await login(ctx.app, 'member2');
      await request(http())
        .put(`/api/records/${recId}`)
        .set(bearer(mem2Token))
        .send({ data: { title: '改ざん' } })
        .expect(403);

      // 本人は更新できる
      await request(http())
        .put(`/api/records/${recId}`)
        .set(bearer(memToken))
        .send({ data: { title: '本人更新' } })
        .expect(200);

      // 管理者も更新できる
      const adminToken = await login(ctx.app, 'admin');
      await request(http())
        .put(`/api/records/${recId}`)
        .set(bearer(adminToken))
        .send({ data: { title: '管理者更新' } })
        .expect(200);
    });
  });
});
