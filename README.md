# ノーコードApp

ノーコードAppは、LAN内・オフライン環境でも利用できる業務アプリ基盤です。フォーム、一覧、権限、ワークフロー、ダッシュボード、監査ログ、任意のLLM連携などを備えています。

> 現在は公開準備中の`v0.1.0`です。インターネットへ直接公開する前に、[SECURITY.md](SECURITY.md)と[既知の課題](docs/known-issues.md)を確認してください。

## 主な技術

- Backend: NestJS 11 / Prisma 7 / PostgreSQL / JWT（HttpOnly Cookie）
- Frontend: React 19 / TypeScript / Vite / Tailwind CSS
- Storage: ローカル添付ファイル・任意のオフライン地図タイル
- AI: LM Studio、Ollama、OpenAI、OpenRouter、Groq、Gemini、Mistral、任意のOpenAI互換API（任意）

## Dockerで起動

WindowsではDocker Desktopを起動し、`start_docker.bat`を実行します。

```text
start_docker.bat
```

初回はランダムなDBパスワード、JWT秘密鍵、管理者パスワードを生成し、管理者情報を一度だけ画面に表示します。起動後は <http://localhost:5173> を開いてください。

手動で起動する場合は`.env.example`を`.env`へコピーし、`change_me`の値をすべて変更してから実行します。

```bash
docker compose up -d --build
```

停止とログ確認には`stop_docker.bat`、`logs_docker.bat`を使用できます。

## Dockerなしで起動（Windows）

Node.js 22とPostgreSQL 16以降を用意します。ポータブルPostgreSQLを使う場合は`pgsql/`へ配置するか、`NOCODEAPP_PG_HOME`で場所を指定します。

```text
setup.bat
start_server.bat
```

`setup.bat`は環境設定と初期管理者を安全に生成し、DBマイグレーションとビルドを行います。Docker版とbat版は同じ5173番ポートを使うため、同時には起動しないでください。

詳しくは[セットアップガイド](docs/setup-guide.md)と[Dockerガイド](docs/docker-guide.md)を参照してください。

## AI接続（任意）

管理画面からプロバイダー、ベースURL、チャットモデル、埋め込みモデルを設定できます。クラウド接続ではAPIキーも登録できますが、保存済みのキーは画面や設定APIへ再表示されません。AI検索を使う場合は、接続先が埋め込みAPIにも対応していることを確認してください。

## データとバックアップ

- DockerのDBは名前付きボリュームへ保存されます。
- bat版のDBは指定したPostgreSQLデータディレクトリへ保存されます。
- 添付ファイルは`storage/attachments/`へ保存されます。
- DBダンプ、添付、環境設定、地図キャッシュはGit管理対象外です。

別PCへフォルダごと移す前に`export-db.bat`を実行してください。Docker版とbat版を自動判定して`migration/nocode_db.sql`を作成し、移行先の新規Dockerまたは`setup.bat`から復元できます。復元の確認方法は[バックアップ・復元ガイド](docs/backup-restore-guide.md)にまとめています。

本番データを移動する場合は[オフライン移行ガイド](docs/offline-migration.md)を参照してください。

## 開発

```bash
cd backend
npm ci
npm run build
npm test -- --runInBand
npm run test:e2e

cd ../frontend
npm ci
npm run build
npm test
```

Pull Requestでは、両方の`lint`・`build`・単体テスト、実PostgreSQLを使うE2E、DBバックアップ復元試験、依存関係監査が自動実行されます。詳細は[CONTRIBUTING.md](CONTRIBUTING.md)にあります。

## 地図データ

地図タイル本体はリポジトリに含まれません。配信元ごとの利用規約、出典表示、複製・使用手続を確認してください。特に`tile.openstreetmap.org`のタイルはオフライン用一括取得に使用できません。

## ライセンス

ソースコードは[MIT License](LICENSE)で公開します。地図、PostgreSQL、各npm依存関係など第三者の成果物にはそれぞれの条件が適用されます。[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)も確認してください。
