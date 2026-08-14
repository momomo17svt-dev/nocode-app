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

function initialAdminPassword(): string {
  const password = process.env.INITIAL_ADMIN_PASSWORD?.trim() || '';
  const unsafe =
    password.length < 12 ||
    /change_me/i.test(password) ||
    password.toLowerCase() === 'password123';
  if (unsafe) {
    throw new Error(
      'A new administrator is required. Set INITIAL_ADMIN_PASSWORD to a unique password of 12 or more characters.',
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

  const passwordHash = await bcrypt.hash(initialAdminPassword(), 12);
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
