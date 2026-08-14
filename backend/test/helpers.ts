import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

export interface E2EContext {
  app: INestApplication;
  prisma: PrismaService;
}

/** AppModule を起動し、main.ts と同じ ValidationPipe を適用したアプリを返す。 */
export async function createApp(): Promise<E2EContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma };
}

/** 全業務テーブルを TRUNCATE（_prisma_migrations は除く）。テスト間の独立性を担保。 */
export async function resetDb(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`,
  );
  if (rows.length === 0) return;
  const list = rows.map((r) => `"${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** bcryptハッシュ付きでユーザーを直接作成する（ロール/有効状態を自由に指定）。 */
export async function seedUser(
  prisma: PrismaService,
  opts: { loginId: string; password?: string; role?: string; isActive?: boolean },
) {
  return prisma.user.create({
    data: {
      loginId: opts.loginId,
      passwordHash: await bcrypt.hash(opts.password ?? 'password123', 10),
      role: opts.role ?? 'StandardUser',
      isActive: opts.isActive ?? true,
    },
  });
}

interface SeedField {
  fieldCode: string;
  fieldType: string;
  label: string;
  required?: boolean;
  settings?: any;
}
interface SeedPerm {
  targetType: 'All' | 'User' | 'Group';
  targetId?: string | null;
  canView?: boolean;
  canAdd?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
  canManage?: boolean;
}

/** アプリ・フィールド・権限をまとめて作成する（認可シナリオの前提づくり）。 */
export async function seedApp(
  prisma: PrismaService,
  opts: {
    createdBy: string;
    name?: string;
    recordViewScope?: string;
    recordEditScope?: string;
    fields?: SeedField[];
    permissions?: SeedPerm[];
  },
) {
  return prisma.app.create({
    data: {
      name: opts.name ?? 'E2Eアプリ',
      createdBy: opts.createdBy,
      status: 'published',
      recordViewScope: opts.recordViewScope ?? 'all',
      recordEditScope: opts.recordEditScope ?? 'all',
      fields: opts.fields ? { create: opts.fields.map((f) => ({ ...f, settings: f.settings ?? {} })) } : undefined,
      permissions: opts.permissions
        ? {
            create: opts.permissions.map((p) => ({
              targetType: p.targetType,
              targetId: p.targetId ?? null,
              canView: p.canView ?? false,
              canAdd: p.canAdd ?? false,
              canEdit: p.canEdit ?? false,
              canDelete: p.canDelete ?? false,
              canManage: p.canManage ?? false,
            })),
          }
        : undefined,
    },
  });
}

/** ユーザーをグループに所属させる（無ければグループも作る）。 */
export async function addToGroup(prisma: PrismaService, userId: string, groupId: string) {
  return prisma.groupMember.create({ data: { userId, groupId } });
}

/** 実HTTPでログインしてアクセストークンを取得する。 */
export async function login(
  app: INestApplication,
  loginId: string,
  password = 'password123',
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ loginId, password })
    .expect(200);
  return res.body.access_token as string;
}

/** Authorization ヘッダ用のショートカット。 */
export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
