FROM postgres:16-bookworm AS postgres-tools

FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY nest-cli.json tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src

RUN npx --no-install prisma generate \
    && npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl postgresql-client \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data/storage \
    && chown -R node:node /app /data/storage

# DBサーバーと同じメジャーバージョンの工具を固定する（古いpg_dumpは新しいDBを拒否する）。
COPY --from=postgres-tools /usr/lib/postgresql/16/bin/pg_dump /usr/local/bin/pg_dump
COPY --from=postgres-tools /usr/lib/postgresql/16/bin/pg_restore /usr/local/bin/pg_restore

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=node:node /app/package.json ./package.json
# オフライン地図タイルの取得スクリプト。Docker版でも
# docker compose exec backend npm run tiles -- ... で実行できるようにする。
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh

USER node
EXPOSE 3000

ENTRYPOINT ["/app/docker-entrypoint.sh"]
