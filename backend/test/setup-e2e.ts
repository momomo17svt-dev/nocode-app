/**
 * jest の setupFiles（各ワーカーでテスト読込前に実行）。
 * AppModule / PrismaService がインポートされる前に DATABASE_URL を
 * テストDBへ差し替えることで、開発用DBへの接続を完全に防ぐ。
 *
 * dotenv は既存の process.env を上書きしないため、ここで先に設定しておけば
 * prisma.service の `import 'dotenv/config'` で nocode_db に戻ることはない。
 */
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const TEST_DB = process.env.TEST_DB_NAME || 'nocode_test_db';

if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, `/${TEST_DB}$1`);
}

// JWT 署名鍵が無い環境でも起動できるよう、テスト用の固定値を保証する。
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.startsWith('change_me')) {
  process.env.JWT_SECRET = 'e2e_test_secret_key_0123456789abcdef0123456789abcdef';
}
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';
