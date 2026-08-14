import request from 'supertest';
import { bearer, createApp, E2EContext, login, resetDb, seedUser } from './helpers';

describe('Audit logs (e2e)', () => {
  let ctx: E2EContext;
  const http = () => ctx.app.getHttpServer();

  beforeAll(async () => {
    ctx = await createApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  beforeEach(async () => {
    await resetDb(ctx.prisma);
    await seedUser(ctx.prisma, { loginId: 'admin', role: 'SystemAdmin' });
    await seedUser(ctx.prisma, { loginId: 'member', role: 'StandardUser' });
  });

  it('システム管理者へ新しい順のページ情報を返す', async () => {
    const token = await login(ctx.app, 'admin');
    await ctx.prisma.auditLog.deleteMany();
    await ctx.prisma.auditLog.createMany({
      data: Array.from({ length: 51 }, (_, index) => ({
        actionType: `TEST_${index + 1}`,
        targetResource: 'E2E',
        createdAt: new Date(Date.UTC(2026, 7, 14, 0, 0, index)),
      })),
    });

    const first = await request(http())
      .get('/api/audit-logs?page=1&pageSize=50')
      .set(bearer(token))
      .expect(200);
    expect(first.body).toMatchObject({ total: 51, page: 1, pageSize: 50, totalPages: 2 });
    expect(first.body.items).toHaveLength(50);
    expect(first.body.items[0].actionType).toBe('TEST_51');

    const second = await request(http())
      .get('/api/audit-logs?page=2&pageSize=50')
      .set(bearer(token))
      .expect(200);
    expect(second.body).toMatchObject({ total: 51, page: 2, pageSize: 50, totalPages: 2 });
    expect(second.body.items).toHaveLength(1);
    expect(second.body.items[0].actionType).toBe('TEST_1');
  });

  it('一般ユーザーには公開しない', async () => {
    const token = await login(ctx.app, 'member');
    await request(http()).get('/api/audit-logs').set(bearer(token)).expect(403);
  });
});
