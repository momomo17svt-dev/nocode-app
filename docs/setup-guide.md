# セットアップ手順書

*[English version](setup-guide.en.md)*

ノーコードAppをLAN内・オフライン環境で動かす手順です。OSを問わずDocker版を推奨します。

## Docker版（OS共通）

DockerとComposeプラグインがあれば、Node.jsもPostgreSQLも別途用意する必要はありません。

```bash
cp .env.example .env
```

`.env`はコピーしたままでも起動します。ただし秘密情報2つは`sample_only_`で始まるサンプル値で、**このリポジトリで公開されています**。自分1台で試す場合を除き、次の値を固有のものへ変更してください（Windowsの`start_docker.bat`は`sample_only_`の値を自動で置き換えます）。

| 変数 | 設定する値 |
| --- | --- |
| `POSTGRES_PASSWORD` | 任意の強いパスワード。コンテナ間でのみ使います |
| `JWT_SECRET` | ランダムな32文字以上。後から変えると全員ログアウトします |
| `INITIAL_ADMIN_PASSWORD` | 空のままで構いません。管理者は初回アクセス時にブラウザで作成します（無人セットアップで自動作成したい場合だけ12文字以上を設定） |

`JWT_SECRET`は`openssl rand -hex 32`で作れます。

```bash
docker compose up -d --build
```

<http://localhost:5173>を開き、`admin`と設定したパスワードでログインします。管理者は空のDBに対する初回起動時にだけ作成されます。

Windowsでは`start_docker.bat`が上記2手順をまとめて実行し、秘密情報も自動生成するため`.env`を手で編集する必要はありません。停止とログ確認は`stop_docker.bat`と`logs_docker.bat`です。

詳細は[docker-guide.md](docker-guide.md)を参照してください。

### HTTPS終端の背後へ置く場合

前段にTLS終端がある構成では`AUTH_COOKIE_SECURE=true`にします。LAN内のHTTP運用では`false`のままにしてください（`true`にするとブラウザがセッションCookieを保持しません）。

## DockerなしのWindows版

### 前提

- Node.js 22
- PostgreSQL 16以降
- npm依存関係を取得できる環境、または事前に作成したオフライン配布物

**PostgreSQL本体はこのリポジトリに含まれていません。** ライセンスと容量の都合で、ソース配布物からは除外しています。次のいずれかを用意してください。

- 通常のインストーラー版PostgreSQL 16以降を使う
- ポータブル版（EnterpriseDBの「Windows x86-64 binaries」zipなど）を各自でダウンロードする
  - <https://www.enterprisedb.com/download-postgresql-binaries>

ポータブル版はプロジェクト直下の`pgsql/`へ展開します（`pgsql\bin\postgres.exe`が存在する形）。別の場所へ置く場合は、起動前に`NOCODEAPP_PG_HOME`へPostgreSQLのルートディレクトリを設定してください。

```powershell
$env:NOCODEAPP_PG_HOME = 'C:\path\to\postgresql'
```

`extract-postgresql.bat`は、オフライン配布用に`postgresql.zip`を同梱した配布物向けの補助スクリプトです。Gitからcloneした場合はこのzipが無いため、上記のいずれかで`pgsql/`を用意してください。

### 初回セットアップ

`setup.bat`を実行します。次の処理が自動実行されます。

1. `backend/.env`とランダムな秘密情報を作成
2. PostgreSQLの初期化と`nocode_db`作成
3. Prismaマイグレーション
4. 初期管理者の作成
5. バックエンドのビルドとフロントエンド依存関係の確認

管理者パスワードは環境設定を新規作成したときだけ画面に表示されます。固定の共通パスワードはありません。

### 起動

`start_server.bat`を実行し、<http://localhost:5173>を開きます。

bat版のバックエンドは3001番、フロントエンドは5173番を使用します。LAN内の別PCから直接アクセスする場合は、`backend/.env`の`CORS_ORIGINS`へ実際のフロントエンドURLを追加し、Windowsファイアウォールも設定してください。

## 手動セットアップ

`backend/.env.example`を`backend/.env`へコピーします。そのままでも動きますが、`JWT_SECRET`は公開されているサンプル値なので固有の値へ変更してください。管理者は初回アクセス時にブラウザで作成します。

```bash
cd backend
npm ci
npm run db:setup
npm run start
```

別のターミナルでフロントエンドを起動します。

```bash
cd frontend
npm ci
npm run dev -- --host 0.0.0.0
```

## バックアップ

DBと`storage/attachments/`を必ずセットで保存します。DBダンプや添付は機密情報を含む可能性があるため、Gitへ追加しないでください。

```text
export-db.bat
```

Docker版のバックアップは[docker-guide.md](docker-guide.md)を参照してください。

## 運用上の注意

- `JWT_SECRET`を変更すると既存のログイン状態は無効になります。
- `.env`と`backend/.env`を共有・公開しないでください。
- Docker版とbat版は同じ5173番ポートを使うため同時起動できません。
- インターネットへ直接公開する場合は[SECURITY.md](../SECURITY.md)の追加対策が必要です。
