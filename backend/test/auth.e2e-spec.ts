import request from 'supertest';
import { createApp, resetDb, seedUser, login, bearer, E2EContext } from './helpers';

describe('Auth (e2e)', () => {
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
    await seedUser(ctx.prisma, { loginId: 'alice', password: 'password123', role: 'StandardUser' });
    await seedUser(ctx.prisma, { loginId: 'frozen', password: 'password123', isActive: false });
  });

  describe('POST /api/auth/login', () => {
    it('正しい資格情報で 200・トークン・パスワードハッシュ非露出', async () => {
      const res = await request(http()).post('/api/auth/login').send({ loginId: 'alice', password: 'password123' });
      expect(res.status).toBe(200);
      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.user.loginId).toBe('alice');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('パスワード違いは 401', async () => {
      await request(http()).post('/api/auth/login').send({ loginId: 'alice', password: 'wrong' }).expect(401);
    });

    it('存在しないユーザーは 401', async () => {
      await request(http()).post('/api/auth/login').send({ loginId: 'ghost', password: 'password123' }).expect(401);
    });

    it('無効化ユーザーは 401', async () => {
      await request(http()).post('/api/auth/login').send({ loginId: 'frozen', password: 'password123' }).expect(401);
    });
  });

  describe('保護ルート', () => {
    it('トークン無しの profile は 401', async () => {
      await request(http()).get('/api/auth/profile').expect(401);
    });

    it('トークン有りの profile は本人情報を返す', async () => {
      const token = await login(ctx.app, 'alice');
      const res = await request(http()).get('/api/auth/profile').set(bearer(token)).expect(200);
      expect(res.body).toMatchObject({ loginId: 'alice', role: 'StandardUser' });
    });

    it('改ざんトークンは 401', async () => {
      const token = await login(ctx.app, 'alice');
      await request(http()).get('/api/auth/profile').set(bearer(token + 'x')).expect(401);
    });
  });

  describe('POST /api/auth/change-password', () => {
    it('変更後は新パスワードでログインでき、旧パスワードは失敗する', async () => {
      const token = await login(ctx.app, 'alice');
      await request(http())
        .post('/api/auth/change-password')
        .set(bearer(token))
        .send({ currentPassword: 'password123', newPassword: 'newpassword456' })
        .expect(200);

      await request(http()).post('/api/auth/login').send({ loginId: 'alice', password: 'newpassword456' }).expect(200);
      await request(http()).post('/api/auth/login').send({ loginId: 'alice', password: 'password123' }).expect(401);
    });

    it('現在のパスワードが違えば 400', async () => {
      const token = await login(ctx.app, 'alice');
      await request(http())
        .post('/api/auth/change-password')
        .set(bearer(token))
        .send({ currentPassword: 'wrong', newPassword: 'newpassword456' })
        .expect(400);
    });
  });
});
