import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * 無人セットアップ用の初期パスワード。未設定なら空を返し、管理者は作らない
 * （最初のアクセスで画面から作成する）。設定してあるのに使えない値なら停止する。
 */
function initialAdminPassword(): string {
  const password = process.env.INITIAL_ADMIN_PASSWORD?.trim() || '';
  if (!password) return '';
  const unsafe =
    password.length < 12 ||
    /change_me/i.test(password) ||
    password.toLowerCase() === 'password123';
  if (unsafe) {
    throw new Error(
      'INITIAL_ADMIN_PASSWORD is set but unusable. Use 12 or more characters, or leave it empty and create the administrator in the browser.',
    );
  }
  return password;
}

async function ensureInitialAdmin() {
  const loginId = process.env.INITIAL_ADMIN_LOGIN?.trim() || 'admin';
  const existing = await prisma.user.findUnique({ where: { loginId } });
  if (existing) {
    if (existing.role !== 'SystemAdmin') {
      throw new Error(`INITIAL_ADMIN_LOGIN=${loginId} already exists without the SystemAdmin role.`);
    }
    console.log(`Initial administrator already exists: ${loginId}`);
    return;
  }

  const password = initialAdminPassword();
  if (!password) {
    console.log('No administrator yet. Open the app in a browser and create one on the setup screen.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      loginId,
      name: process.env.INITIAL_ADMIN_NAME?.trim() || 'Administrator',
      passwordHash,
      role: 'SystemAdmin',
    },
  });
  console.log(`Initial administrator created: ${loginId}`);
}

async function ensureAnonymousUser() {
  await prisma.user.upsert({
    where: { id: 'anonymous' },
    update: { isActive: false },
    create: {
      id: 'anonymous',
      loginId: '__anonymous__',
      passwordHash: '',
      role: 'Viewer',
      isActive: false,
    },
  });
}

async function main() {
  await ensureInitialAdmin();
  await ensureAnonymousUser();
  console.log('Initial database setup completed.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
