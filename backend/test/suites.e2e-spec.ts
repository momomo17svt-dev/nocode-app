import request from 'supertest';
import { bearer, createApp, E2EContext, login, resetDb, seedUser } from './helpers';

describe('App suites (e2e)', () => {
  let ctx: E2EContext;
  const http = () => ctx.app.getHttpServer();
  let token: string;

  beforeAll(async () => {
    ctx = await createApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await seedUser(ctx.prisma, { loginId: 'creator', role: 'AppCreator' });
    token = await login(ctx.app, 'creator');
  });

  it('同じCRM一式の再作成を警告し、明示確認時だけ追加する', async () => {
    const first = await request(http())
      .post('/api/apps/from-suite')
      .set(bearer(token))
      .send({ suiteId: 'crm', withSamples: false })
      .expect(201);
    expect(first.body.apps).toHaveLength(4);

    const blocked = await request(http())
      .post('/api/apps/from-suite')
      .set(bearer(token))
      .send({ suiteId: 'crm', withSamples: false })
      .expect(409);
    expect(blocked.body).toMatchObject({ code: 'SUITE_ALREADY_EXISTS', existingSets: 1 });

    const confirmed = await request(http())
      .post('/api/apps/from-suite')
      .set(bearer(token))
      .send({ suiteId: 'crm', withSamples: false, allowDuplicate: true })
      .expect(201);
    expect(confirmed.body.apps).toHaveLength(4);

    const dashboards = await request(http()).get('/api/dashboards').set(bearer(token)).expect(200);
    expect(dashboards.body).toHaveLength(8);
    expect(dashboards.body.every((dashboard: Record<string, unknown>) => dashboard.createdAt)).toBe(true);
  });
});
