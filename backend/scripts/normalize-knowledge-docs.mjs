// 既存ナレッジ文書の本文から PDF 由来の字間空白（"請 求 異 動"）を除去し、再インデックスする補助スクリプト。
//   前提: 先に `npm run build`（dist 生成）/ .env に DATABASE_URL・JWT_SECRET / 遠隔LM Studio(埋め込みモデル)到達可
//   実行: cd backend && node scripts/normalize-knowledge-docs.mjs
// NestFactory.createApplicationContext を使う（HTTPポートを bind しない＝稼働中の start_server.bat:3001 に不干渉）。
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/src/app.module.js';
import { PrismaService } from '../dist/src/prisma/prisma.service.js';
import { EmbeddingService } from '../dist/src/ai/embedding.service.js';
import { normalizeCjkSpaces } from '../dist/src/ai/document-extract.util.js';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const prisma = app.get(PrismaService);
  const emb = app.get(EmbeddingService);

  const docs = await prisma.knowledgeDoc.findMany({ orderBy: { createdAt: 'asc' } });
  console.log(`対象ナレッジ文書: ${docs.length} 件`);

  let cleaned = 0;
  let reindexed = 0;
  let failed = 0;

  for (const d of docs) {
    const before = d.content || '';
    const after = normalizeCjkSpaces(before);
    const changed = after !== before;
    if (changed) {
      await prisma.knowledgeDoc.update({ where: { id: d.id }, data: { content: after } });
      cleaned += 1;
    }
    // 本文を更新したら（またはモデル差異のため一律に）再インデックスして埋め込みもクリーンにする。
    try {
      const r = await emb.indexDocument(d.id);
      reindexed += 1;
      console.log(`  ✓ ${d.title}  本文整形=${changed ? 'あり' : 'なし'}  チャンク=${r.chunks}`);
    } catch (e) {
      failed += 1;
      console.error(`  ✗ ${d.title}  再インデックス失敗: ${e?.message || e}`);
    }
  }

  console.log(`\n完了: 本文整形 ${cleaned} 件 / 再インデックス ${reindexed} 件 / 失敗 ${failed} 件`);
  await app.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
