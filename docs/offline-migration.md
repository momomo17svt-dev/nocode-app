# オフライン別PCへの移行

ノーコードAppをインターネットへ接続できないWindows PCへ移す手順です。DBや添付には機密情報が含まれるため、暗号化した媒体を使用してください。

## オンライン環境で用意するもの

- Node.js 22のWindows x64インストーラ
- PostgreSQL 16以降、またはライセンス確認済みのポータブル配布物
- `npm ci`済みの`backend/node_modules`と`frontend/node_modules`を含む非公開オフライン配布物
- AIをオフラインで使う場合はLM StudioまたはOllama、チャットモデル、埋め込みモデル
- 必要な範囲だけ取得し、利用条件を確認した地図データ

GitHubの公開ソースZIPには、依存物、PostgreSQLバイナリ、地図、DB、添付、秘密情報は含まれません。

## 移設元での退避

1. `export-db.bat`を実行して`migration/nocode_db.sql`を作成します。Docker版が起動中ならDockerのDBを、それ以外ではbat版のDBを自動判定します。
2. `storage/attachments/`をコピーします。
3. `backend/.env`を安全にコピーします。
4. 必要なら`storage/tiles/`をコピーします。

## 移設先での構築

1. Node.jsとPostgreSQLをインストールします。
2. ASCIIパスを推奨し、例として`C:\apps\nocode-app`へ配置します。
3. PostgreSQLを`pgsql/`へ置くか、`NOCODEAPP_PG_HOME`を設定します。
4. DBダンプを移す場合は`migration/nocode_db.sql`へ配置します。
5. 添付を`storage/attachments/`へ戻します。
6. Docker版では`start_docker.bat`を実行します。空のDockerボリュームなら移行SQLが自動復元されます。
7. bat版では`setup.bat`、`start_server.bat`の順に実行します。
8. 新規DBでは初回に表示される管理者情報を保存します。DBを復元した場合は移設元のアカウントを使用します。

## AI設定

LM StudioまたはOllamaのローカルサーバーを起動し、管理画面でプロバイダーを選びます。bat版の標準URLはLM Studioが`http://localhost:1234/v1`、Ollamaが`http://localhost:11434/v1`です。Docker版ではホスト名を`host.docker.internal`へ変更します。チャット機能とAI検索では必要なモデルが異なる場合があります。

## 注意事項

- `.env`をメールや公開ストレージで共有しないでください。
- DBと添付は同じ時点のものを一緒に移行してください。
- `.bat`はASCII・CRLFを維持してください。
- OSM標準タイルはオフライン用の一括取得に使用できません。
- 32bit Windowsや別OSへ`node_modules`をそのまま移すことはできません。
