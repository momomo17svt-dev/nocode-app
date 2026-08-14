# Docker起動ガイド

ノーコードAppは、Docker版とWindows bat版の両方に対応しています。

## 起動

1. Docker Desktopを起動します。
2. `start_docker.bat`を実行します。
3. 初回に表示される管理者情報を保存します。
4. <http://localhost:5173>を開きます。

初回は`.env`へランダムなDBパスワード、JWT秘密鍵、管理者パスワードを生成します。

手動起動では`.env.example`を`.env`へコピーし、`change_me`を変更してから実行してください。

```powershell
docker compose up -d --build
```

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

## LM Studio

Windowsホスト上のLM Studioには、Dockerから次のURLで接続します。

```text
http://host.docker.internal:1234/v1
```

管理画面に古い接続先が保存されている場合は、管理画面側の設定が環境変数より優先されるため修正してください。

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
