/**
 * E2E用テストデータベースの準備（jest起動前に1回実行）。
 *   1. .env の DATABASE_URL のDB名を nocode_test_db に差し替える
 *   2. 無ければ CREATE DATABASE する（postgres 管理DBへ接続）
 *   3. prisma migrate deploy でスキーマを適用する
 *
 * 開発用 nocode_db には一切触れない。`npm run test:e2e` の pre ステップとして使う。
 */
require('dotenv/config');
const { Pool } = require('pg');
const { execSync } = require('child_process');

const TEST_DB = process.env.TEST_DB_NAME || 'nocode_test_db';

function toTestUrl(url) {
  // postgresql://user:pass@host:port/nocode_db?... -> .../nocode_test_db?...
  return url.replace(/\/[^/?]+(\?|$)/, `/${TEST_DB}$1`);
}

async function main() {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) throw new Error('DATABASE_URL が未設定です（.env を確認）');

  const testUrl = toTestUrl(baseUrl);
  const adminUrl = baseUrl.replace(/\/[^/?]+(\?|$)/, '/postgres$1');

  // 1) テストDBの存在確認・作成
  const admin = new Pool({ connectionString: adminUrl, connectionTimeoutMillis: 5000 });
  try {
    const r = await admin.query('select 1 from pg_database where datname = $1', [TEST_DB]);
    if (r.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${TEST_DB}"`);
      console.log(`[e2e] created database ${TEST_DB}`);
    } else {
      console.log(`[e2e] database ${TEST_DB} already exists`);
    }
  } finally {
    await admin.end();
  }

  // 2) マイグレーション適用（テストDBに対して）
  console.log('[e2e] applying migrations...');
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: testUrl },
  });
  console.log('[e2e] database ready.');
}

main().catch((e) => {
  console.error('[e2e] prepare-db failed:', e.message);
  process.exit(1);
});
