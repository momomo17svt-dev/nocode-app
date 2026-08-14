# ノーコードApp — 開発メモ

LAN内・オフライン利用を主目的とする、ノーコード業務アプリ基盤です。

## 技術スタック

- Backend: NestJS 11 / Prisma 7 / PostgreSQL / JWT / bcrypt（bat版はポート3001）
- Frontend: React 19 / TypeScript / Vite / Tailwind CSS v4（ポート5173）
- Storage: `storage/attachments/`と`storage/tiles/`
- AI/LLM: OpenAI互換API。窓口は`backend/src/llm/llm.service.ts`

## 起動

- Docker: `start_docker.bat`
- Windowsローカル: `setup.bat`の後に`start_server.bat`
- DBバックアップ: `export-db.bat`

既存のDockerデータは旧ボリューム`antigravity-nocode_postgres_data`から移行される場合があります。この文字列は互換処理以外では使用しません。

## 厳守事項

- `.bat`はASCII文字だけを使い、CRLFを維持する。
- 秘密情報、DBダンプ、添付、地図キャッシュ、依存物、PostgreSQLバイナリをGitへ追加しない。
- ユーザーが作成したアプリやレコードを削除しない。
- 計算エンジンは`backend/src/records/compute.util.ts`と`frontend/src/lib/calc.ts`を同じ仕様に保つ。
- Nestのリテラルルートは`:id`ルートより前に宣言する。
- `erasableSyntaxOnly`のためconstructorパラメータプロパティを使わない。
- 地図データの取得・再配布前に配信元の最新規約を確認する。

## 検証

```text
backend:  npm run lint / npm run build / npm test -- --runInBand
frontend: npm run lint / npm run build
root:     docker compose config / docker compose up -d --build
```

## 公開

GitHubへpushする前に`docs/public-release-checklist.md`を確認します。`submit.ps1`は秘密情報やランタイムデータを除いたソースZIPを`release/`へ作成します。
