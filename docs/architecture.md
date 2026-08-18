# アーキテクチャ設計

*[English version](architecture.en.md)*

## 概要

ノーコードAppは、WindowsのLAN内・オフライン環境を主対象とする業務アプリ基盤です。同じプロジェクトフォルダからDocker構成とDockerなしのbat構成を選べます。

## 構成

- Frontend: React 19 / TypeScript / Vite / React Router / Tailwind CSS
- Backend: Node.js 22 / NestJS 11 / REST API
- Database: PostgreSQL 16 / Prisma 7
- Storage: `storage/attachments`と`storage/tiles`
- Optional AI: LM Studio、Ollama、主要クラウド、任意のOpenAI互換API

Docker版はNginxがSPA、`/api`、`/tiles`を同一オリジンで公開します。bat版はViteの5173番とNestJSの3001番を起動し、許可したローカルオリジンだけをCORSで受け入れます。

## 認証と防御

管理者が1人もいない状態では`GET /api/setup/status`が`required: true`を返し、画面は初回セットアップへ遷移します。`POST /api/setup/admin`が最初のSystemAdminを作成し、そのまま認証Cookieを発行します。管理者が存在する間、このエンドポイントは403しか返しません（認証ガードは付けず、作成可否だけで判断します）。

ログイン成功時にJWTをHttpOnly・SameSite Cookieへ、CSRFトークンを読取可能Cookieへ保存します。フロントエンドは更新通信にCSRFヘッダーを付けます。Bearer認証も外部API連携とテストのために受け付けますが、ログイン本文へのBearer返却は既定で無効です。

NginxとAPIはCSP、クリックジャッキング防止、MIMEスニッフィング防止等のヘッダーを返します。アップロードはメモリで受け、認可とファイル内容検証を通過してからUUID名で保存します。

## データ取得

一覧タブはPostgreSQLで権限範囲、検索、条件、並び替え、ページ分割を処理します。監査ログも作成日時とIDの複合インデックスを使い、50件単位で取得します。アプリID・作成日時・更新日時・作成者・JSONBにインデックスを持ちます。フロントエンドは短時間GETキャッシュと同時リクエスト重複排除を行います。各画面は遅延読み込みされます。

## AI接続

LLMクライアントはOpenAI互換のモデル一覧、チャット、ストリーミング、埋め込みAPIを共通利用します。LM StudioとOllamaはローカル接続、OpenAI・OpenRouter・Groq・Gemini・Mistralはプリセット、その他はカスタムURLで接続します。APIキーはサーバー側の設定DBに保存し、フロントエンドへは登録済みかどうかだけを返します。LM Studio固有のモデル読込・解放機能は、LM Studio選択時だけ有効です。

## 可観測性

APIはリクエストID、経路、状態コード、処理時間をJSONログへ出力します。既定では低速または失敗したリクエストを記録し、`HTTP_LOG_MODE=all`で全件記録できます。`DB_SLOW_QUERY_MS`を超えるSQLも警告ログへ出力します。

## オフライン要件

実行に必要な画面ライブラリはビルドへ同梱します。オンライン地図と任意のAI接続は選択機能で、ローカル地図タイルとAI無効設定で完全オフライン運用できます。
