import 'dotenv/config';
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService
  extends PrismaClient<
    Prisma.PrismaClientOptions & {
      log: [{ emit: 'event'; level: 'query' }];
    }
  >
  implements OnModuleInit, OnModuleDestroy
{
  // driver adapter ではプールのライフサイクルはアプリ側の責務。終了時に明示的に閉じる。
  private readonly pool: Pool;
  private readonly logger = new Logger('Database');

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    const pool = new Pool({ connectionString });
    const adapter = new PrismaPg(pool);
    const slowQueryMs = Number(process.env.DB_SLOW_QUERY_MS || 500);
    const observeQueries = Number.isFinite(slowQueryMs) && slowQueryMs > 0;
    super({
      adapter,
      log: [{ emit: 'event', level: 'query' }],
    });
    this.pool = pool;
    if (observeQueries) {
      this.$on('query', (event) => {
        if (event.duration < slowQueryMs) return;
        this.logger.warn(
          JSON.stringify({
            event: 'slow_query',
            durationMs: event.duration,
            target: event.target,
            query: event.query.replace(/\s+/g, ' ').slice(0, 500),
          }),
        );
      });
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    // プールを閉じないと接続が残り、グレースフルシャットダウン/テスト終了を妨げる。
    await this.pool.end();
  }
}
