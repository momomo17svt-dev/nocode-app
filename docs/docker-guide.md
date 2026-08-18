# Docker起動ガイド

ノーコードAppは、Docker版とWindows bat版の両方に対応しています。

## 起動

1. Docker Desktopを起動します。
2. `start_docker.bat`を実行します。
3. <http://localhost:5173>を開きます。
4. 初回だけ表示される作成画面で、管理者アカウントを決めます。

初回は`.env`へランダムなDBパスワードとJWT秘密鍵を生成します。管理者パスワードは`.env`へ保存しません（ブラウザの作成画面で決めます）。`.env`を先にコピーしてある場合も、`sample_only_`のサンプル値・空欄・`change_me`のまま残っている値は生成値へ置き換えます（DBパスワードだけは後述の理由で既存ボリュームがあるときは変更しません）。

手動起動では`.env.example`を`.env`へコピーすればそのまま実行できます。ただし`POSTGRES_PASSWORD`と`JWT_SECRET`は公開されているサンプル値なので、他の端末から届く場所で使う前に変更してください。

```powershell
docker compose up -d --build
```

## 起動しないとき

`required variable POSTGRES_PASSWORD is missing a value`のように、composeがビルド前に止まる場合は、`.env`がまだ無いか、その変数が空です。`.env.example`をコピーしてから起動し直します（Windowsは`start_docker.bat`が作成まで行います）。

`dependency failed to start: container nocode-app-backend-1 is unhealthy`で止まったら、まず`docker compose logs backend`を読みます。

- `JWT_SECRET is empty or still an example placeholder`
  古い`.env`に`change_me`が残っています。`openssl rand -hex 32`などで固有の値を設定してください。この値を変えると、発行済みのログインCookieはすべて無効になります。
- `INITIAL_ADMIN_PASSWORD is set but unusable`
  無人セットアップ用に値を入れたものの、12文字未満かプレースホルダのままです。空にすれば初回アクセス時にブラウザで管理者を作成できます。自動作成したい場合は12文字以上を設定してください。
- `PostgreSQL rejected the credentials from .env`
  `.env`の`POSTGRES_PASSWORD`と、既存DBボリュームの作成時パスワードが食い違っています。PostgreSQLはデータディレクトリの初期化時にしか`POSTGRES_PASSWORD`を読まないため、後から`.env`だけ変えても反映されません。作成時の値へ戻すか、バックアップのうえでDBを作り直します（`docker compose down -v`はデータを削除します）。バックエンドは待たずにこのメッセージを出して終了します。
- `PostgreSQL did not become ready in time`
  DBコンテナが起動していないか、接続先が違います。最後の接続エラーが同じログに出るので、そこを手掛かりにしてください。

## ログインできないとき

- `ログイン試行回数が上限に達しました。あと◯分後に再試行してください`
  既定では**5回失敗すると15分**、そのログインIDとIPの組み合わせがロックされます。この間は正しいパスワードでも拒否されます。回数と時間は管理画面の「システム設定」で変更できます。
  待たずに解除する場合は、DBのロック記録を消します。

  ```powershell
  docker compose exec db psql -U postgres -d nocode_db -c "DELETE FROM \"LoginThrottle\";"
  ```

- 管理者のパスワードが分からなくなった場合は、DBを作り直すと初回セットアップ画面からやり直せます（`docker compose down -v`は業務データも削除します）。

## 地図が真っ白なとき

背景地図の既定は内蔵タイル（`storage/tiles/`）ですが、タイルはリポジトリに含まれていません。未取得のままだとピンだけが表示され、背景が出ません。対処は2つです。

- **オンライン地図に切り替える**: システム設定 → 地図 → 既定の背景地図（国土地理院／OpenStreetMap）。閲覧画面の地図右上でも、利用者がその場で切り替えられます。
- **タイルを取得する（オフライン運用はこちら）**: インターネットに接続できる端末で次のいずれかを実行します。取得後は`storage/tiles/`をフォルダごとオフライン端末へ移せます。

  ```text
  get_tiles.bat --bbox 139.74,35.65,139.80,35.70 --zoom 13-17
  ```

  ```bash
  docker compose exec backend npm run tiles -- --japan --zoom 0-12
  ```

  枚数はズームを1段上げるごとに約4倍になるため、まず`--dry-run`で見積もってください。配信元の利用規約の確認も必要です（[storage/tiles/README.md](../storage/tiles/README.md)）。

## 停止とログ

- 停止: `stop_docker.bat`
- ログ: `logs_docker.bat`

通常の停止ではDBデータを削除しません。

## 初期DB

ソースリポジトリにDBダンプは含まれません。空のDBではバックエンドがPrismaマイグレーションを適用し、管理者が1人もいない状態で起動します。最初の管理者は、ブラウザで開いた初回セットアップ画面から作成します（`.env`の`INITIAL_ADMIN_PASSWORD`に12文字以上を設定しておくと、その値で自動作成されます）。

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

次回起動時は空DBからマイグレーションが実行され、管理者は初回セットアップ画面で作り直します。
