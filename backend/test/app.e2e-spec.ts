import request from 'supertest';
import { createApp, E2EContext } from './helpers';

describe('App health (e2e)', () => {
  let ctx: E2EContext;

  beforeAll(async () => {
    ctx = await createApp();
  });

  afterAll(async () => {
    await ctx.app.close();
  });

  it('GET / は 200 を返す（サーバ稼働確認）', async () => {
    await request(ctx.app.getHttpServer()).get('/').expect(200);
  });

  it('未知のルートは 404', async () => {
    await request(ctx.app.getHttpServer()).get('/api/does-not-exist').expect(404);
  });
});
