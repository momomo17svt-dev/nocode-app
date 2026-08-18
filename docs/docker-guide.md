# Docker起動ガイド

ノーコードAppは、Docker版とWindows bat版の両方に対応しています。

## 起動

1. Docker Desktopを起動します。
2. `start_docker.bat`を実行します。
3. 初回に表示される管理者情報を保存します。
4. <http://localhost:5173>を開きます。

初回は`.env`へランダムなDBパスワード、JWT秘密鍵、管理者パスワードを生成します。`.env`を先にコピーしてある場合も、`change_me`のまま残っている値は生成値へ置き換えます（DBパスワードだけは後述の理由で既存ボリュームがあるときは変更しません）。

手動起動では`.env.example`を`.env`へコピーし、`change_me`を変更してから実行してください。

```powershell
docker compose up -d --build
```

## 起動しないとき

`dependency failed to start: container nocode-app-backend-1 is unhealthy`で止まったら、まず`docker compose logs backend`を読みます。

- `Set INITIAL_ADMIN_PASSWORD to a unique password of 12 or more characters`
  `.env`が`.env.example`のままです。バックエンドは初期管理者を作れずに終了し、再起動を繰り返すためヘルスチェックが通りません。Windowsは`start_docker.bat`を実行すれば残ったプレースホルダを置き換えます。他の環境では`.env`の`change_me`を書き換えて起動し直してください。
- `password authentication failed for user "postgres"`
  `.env`の`POSTGRES_PASSWORD`と、既存DBボリュームの作成時パスワードが食い違っています。PostgreSQLはデータディレクトリの初期化時にしか`POSTGRES_PASSWORD`を読まないため、後から`.env`だけ変えても反映されません。作成時の値へ戻すか、バックアップのうえでDBを作り直します（`docker compose down -v`はデータを削除します）。

## 停止とログ

- 停止: `stop_docker.bat`
- ログ: `logs_docker.bat`

通常の停止ではDBデータを削除しません。

## 初期DB

ソースリポジトリにDBダンプは含まれません。空のDBではバックエンドがPrismaマイグレーションを適用し、`.env`の`INITIAL_ADMIN_*`から最初の管理者を作成します。

別PCから移した`migration/nocode_db.sql`がある場合、新しいDockerボリュームの初回作成時にPostgreSQLが自動復元します。既存ボリュームへは再適用しません。

旧名称から移行した環境では、`.env`の`POSTGRES_VOLUME_NAME=antigravity-nocode_postgres_data`によって既存データを引き継ぎます。新規環境の既定値は`nocode-app_postgres_data`です。

## 保存場所

- PostgreSQL: `POSTGRES_VOLUME_NAME`で指定したDockerボリューム
- 添付: `storage/attachments/`
- オフライン地図: `storage/tiles/`

## AI接続

管理画面ではLM Studio、Ollama、OpenAI、OpenRouter、Groq、Gemini、Mistral、任意のOpenAI互換APIを選べます。Windowsホスト上のローカルサーバーへDockerから接続するときは、`localhost`ではなく`host.docker.internal`を使います。

```text
LM Studio: http://host.docker.internal:1234/v1
Ollama:    http://host.docker.internal:11434/v1
```

クラウド接続ではAPIキーを管理画面または`.env`の`LLM_API_KEY`へ設定します。管理画面に保存した接続先とキーは環境変数より優先されます。保存済みキーは画面へ再表示されません。

## バックアップ

```text
export-db.bat
```

Docker版が起動していればDockerのDBを、起動していなければbat版のローカルDBを自動判定し、`migration/nocode_db.sql`へ保存します。DBと`storage/attachments/`を一緒に保存してください。

## 完全初期化

次の操作はDBボリュームを削除します。必ずバックアップ後に実行してください。

```powershell
docker compose down -v
```

次回起動時は空DBからマイグレーションと初期管理者作成が実行されます。
