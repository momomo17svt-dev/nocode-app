# セキュリティ・可用性・バグチェックレポート

> これは2026年6月28日時点の履歴資料です。固定初期パスワード、CORS既定全許可、添付保存順序、権限一括更新など一部の指摘は2026年8月の公開準備で対応されています。現在の状態は`SECURITY.md`と最新の自動検査結果を優先してください。

作成日: 2026-06-28
対象: ローカル開発ワークスペース

## 1. 概要

本プロジェクトは NestJS 11 + Prisma 7 + PostgreSQL のバックエンドと、React 19 + Vite のフロントエンドで構成されたノーコード業務アプリです。認証・ロール・アプリ単位権限・レコード公開範囲は実装されており、主要な CRUD API の多くは `JwtAuthGuard` と権限サービスを経由しています。

一方で、公開フォーム、ファイルアップロード、ダッシュボード集計、CSV/Markdown/リンク表示、依存関係の脆弱性に重点対応が必要です。特に `multer` 系の監査指摘、アップロード失敗時の孤立ファイル、公開フォームの無制限投稿、ダッシュボード「自分のタスク」のレコードスコープ漏れは優先度が高いです。

## 2. 実行した検証

| 項目 | 結果 |
|---|---|
| `backend npm audit --json` | 25 件: high 4 / moderate 21 |
| `frontend npm audit --json` | 0 件 |
| `backend npm test -- --runInBand` | 23 suites / 220 tests passed |
| `backend npm run build` | 成功 |
| `frontend npm run build` | 成功。Vite の 500 kB 超チャンク警告あり |
| `frontend npm run lint` | 369 problems: 347 errors / 22 warnings |

注: build / lint は最初に開発環境の権限制約で失敗したため、権限を調整して同一コマンドを再実行しました。

## 3. 良い点

- JWT 秘密鍵は未設定・プレースホルダ時に起動失敗する実装で、ハードコード fallback は撤去されています。`backend/src/auth/jwt.constants.ts`
- `ValidationPipe` の `whitelist: true` により DTO 外プロパティは基本的に除去されます。`backend/src/main.ts:32`
- 多くの API が `JwtAuthGuard` と `PermissionService` を通しており、アプリ単位の `canView/canAdd/canEdit/canDelete/canManage` は中心化されています。
- 添付ファイル保存名は UUID 化され、ダウンロード時もパストラバーサル対策の `resolveAttachmentPath` を使っています。
- フロントエンドは `dangerouslySetInnerHTML` を使っておらず、通常の HTML 注入には強い構成です。

## 4. 主要指摘

### [High] バックエンド依存関係に高リスク脆弱性

`npm audit` で backend に high 4 / moderate 21 が出ています。特に `multer` の DoS 脆弱性が `@nestjs/platform-express` 経由で入っており、ファイルアップロード機能を持つ本アプリでは影響面があります。

根拠:
- `backend/package.json:28-33`
- `backend/package.json:64-69`
- 監査結果: `multer` high, `@nestjs/platform-express` high, `@nestjs/core` high, `@nestjs/testing` high

推奨:
- `@nestjs/platform-express` と `multer` の修正済み組み合わせを検証して更新する。
- `npm audit fix --force` は Nest/Prisma/Jest の大きな巻き戻し候補を出すため、鵜呑みにしない。
- アップロード系 E2E とサイズ制限/中断ケースのテストを追加してから更新する。

### [High] 添付ファイルが権限確認前にディスクへ保存される

`FileInterceptor` + `diskStorage` により、リクエストハンドラに入る前にファイルが `ATTACHMENTS_DIR` へ保存されます。その後で `recordId` 必須チェックやレコード権限チェックをしているため、無権限・不正 `recordId`・存在しないレコードへのアップロードでも孤立ファイルが残る可能性があります。

根拠:
- `backend/src/attachments/attachments.controller.ts:52-61`
- `backend/src/attachments/attachments.controller.ts:64-75`
- `backend/src/attachments/attachments.controller.ts:79-83`

影響:
- 認証済みユーザーによるストレージ枯渇。
- DB メタデータに残らないファイルの管理不能化。

推奨:
- `memoryStorage` に変更し、権限確認後に保存する。
- 既存の `diskStorage` を使う場合は、権限エラー/バリデーションエラー時に `file.path` を確実に削除する。
- MIME/拡張子 whitelist とウイルススキャンまたは隔離運用を追加する。

### [High] 公開フォームに投稿制限・必須/型検証・濫用対策がない

公開フォームは非認証で `POST /api/public/forms/:token` からレコード作成できます。安全なフィールド種別のみに絞る実装はありますが、必須項目・型・文字数・行数・投稿頻度の検証が不足しています。

根拠:
- `backend/src/public-forms/public-forms.service.ts:52-63`
- `backend/src/public-forms/dto/public-form.dto.ts:3-5`
- `backend/src/main.ts:18-19`

影響:
- スパム投稿や 15 MB JSON の連続投稿による DB/CPU/ストレージ圧迫。
- 必須項目欠落や不正型のレコード混入。

推奨:
- トークン単位/IP 単位のレート制限を入れる。
- 公開フォーム専用に必須・型・最大長・配列長・サブテーブル行数をサーバ側で検証する。
- 必要に応じて CAPTCHA、投稿監査、管理者通知を追加する。

### [High] ダッシュボード「自分のタスク」がレコード公開範囲を迂回する

通常ウィジェットは `scopedRecords` 経由で `allowedCreatorIds` を適用していますが、`computeMyTasks` は可視アプリの全レコードを取得し、ユーザー選択フィールドに本人が入っているかだけでタスク表示しています。`recordViewScope=owner/org` のアプリで、通常一覧では見えないレコードのタイトル・ステータス・更新時刻が漏れる可能性があります。

根拠:
- 通常ウィジェット: `backend/src/dashboards/dashboards.service.ts:214-215`
- mytasks 分岐: `backend/src/dashboards/dashboards.service.ts:223`
- mytasks 実装: `backend/src/dashboards/dashboards.service.ts:472-494`

推奨:
- `computeMyTasks` でもアプリごとに `allowedCreatorIds(appId, userId, role, 'view')` を適用する。
- owner/org スコープの E2E テストに dashboard mytasks を追加する。

### [High] Markdown/リンクフィールドの URL スキーム未制限

Markdown レンダラとレコード詳細のリンクフィールドがユーザー/AI/文書由来の URL をそのまま `href` に入れています。React は HTML をエスケープしますが、`javascript:` などの危険なスキームはクリック時 XSS になり得ます。

根拠:
- `frontend/src/components/ui/Markdown.tsx:202`
- `frontend/src/pages/RecordDetail.tsx:257`

推奨:
- `http:`, `https:`, `mailto:`, `tel:` など許可スキームのみ通す `safeHref` ヘルパーを作る。
- 許可外はテキスト表示に落とす。
- Markdown のリンクにも同じ処理を適用する。

### [Medium] CORS が未設定時に全許可

`CORS_ORIGINS` が未設定だと `origin: true` になり、かつ `credentials: true` です。バックエンドは `0.0.0.0` で listen するため、LAN 内利用でも運用時は明示許可が望ましいです。

根拠:
- `backend/src/main.ts:44-52`
- `.env` では `CORS_ORIGINS` がコメントアウトされています。`backend/.env:15`

推奨:
- 本番/常用環境では `CORS_ORIGINS` を必須にする。
- 未設定時は `localhost` のみに限定するか、起動失敗にする。

### [Medium] レコード API の入力検証が弱い

通常のレコード作成/更新では `data` がオブジェクトであることしか DTO 検証していません。`RecordsService.create` はフィールド定義外のキーも保存し、必須項目チェックや型変換は CSV import 側にしかありません。

根拠:
- `backend/src/records/dto/record.dto.ts:3-13`
- `backend/src/records/records.service.ts:117-121`
- CSV import のみ検証: `backend/src/records/records.service.ts:480-494`

推奨:
- `appId` のフィールド定義からサーバ側で `sanitizeRecordData` を作り、create/update/import/public submit で共通利用する。
- 必須、型、最大長、選択肢、配列長、サブテーブル行数を検証する。
- 更新時は自動採番/計算フィールドの上書きを明示的に拒否する。

### [Medium] 権限一括更新が非トランザクション

アプリ権限の保存は既存権限を削除してから `createMany` しています。途中で DB エラーや不正データが起きると権限が空になり、アプリが意図せず非公開化/管理不能化するリスクがあります。

根拠:
- `backend/src/app-permissions/app-permissions.service.ts:12-24`

推奨:
- `deleteMany` と `createMany` を `$transaction` で包む。
- `targetType=All` の `targetId` は必ず `null`、`User/Group` は実在確認を行う。

### [Medium] CSV Formula Injection

CSV 出力はクォート処理されていますが、Excel/スプレッドシートで開く場合、`=`, `+`, `-`, `@` で始まるユーザー入力が式として解釈される可能性があります。

根拠:
- `backend/src/records/records.service.ts:449-465`
- `backend/src/records/records.service.ts:507-514`

推奨:
- CSV セルが危険文字で始まる場合は先頭に `'` またはタブを付ける設定を追加する。
- 「Excel 安全モード」と「生 CSV」を分ける場合は UI に明示する。

### [Medium] 一覧/検索/AI 検索がメモリ上で全件処理

レコード一覧は全件 `findMany` 後にメモリで検索/フィルタしています。AI 検索も候補 embedding を全件取得して Node 側で cosine 計算しています。データ量が増えると応答遅延やメモリ圧迫につながります。

根拠:
- レコード一覧: `backend/src/records/records.service.ts:48-82`
- AI 検索: `backend/src/ai/ai.service.ts:99-114`
- embedding 候補取得: `backend/src/ai/ai.service.ts:443-461`

推奨:
- レコード一覧にページング、DB 側フィルタ、上限を入れる。
- AI 検索は pgvector 等の DB ベクトル検索か、少なくとも app/doc 単位の候補上限を設ける。

### [Medium] 認証トークンを localStorage に保存

アクセストークンを `localStorage` に保存しています。XSS が一つ成立すると Bearer トークンを奪取されやすくなります。また logout はサーバ側失効ではなくクライアント削除中心です。

根拠:
- `frontend/src/pages/Login.tsx:21-22`
- `frontend/src/lib/api.ts:9-17`
- `frontend/src/lib/auth.ts:19-24`

推奨:
- 短命 access token + refresh token、または httpOnly/SameSite cookie を検討する。
- JWT の `jti` と失効リスト、パスワード変更時の既存トークン失効を追加する。

### [Medium] 初期アカウントの共通パスワード

seed で `admin / creator / user1 / viewer1` に共通パスワード `password123` を設定します。README には運用前変更の注意がありますが、初期構築後に残ると重大です。

根拠:
- `backend/prisma/seed.ts:15-35`
- `README.md:31-37`
- `docs/setup-guide.md:45-52`

推奨:
- 初回起動時に強制変更フラグを持つ。
- seed 実行時に `SEED_DEFAULT_PASSWORD` 未設定ならランダム生成してコンソール表示/ファイル出力しない。
- 本番では seed デモアカウントを作らない。

### [Low-Medium] private view を一般ユーザーが shared に昇格できる

個人ビューは `canView` で作成でき、更新時は更新前メタデータが private なら作成者本人に許可されます。その更新で `isShared: true` を送ると、`canManage` なしで共有ビュー化できます。

根拠:
- `backend/src/views/views.controller.ts:34-43`
- `backend/src/views/views.controller.ts:54-58`
- `backend/src/views/views.service.ts:47`

推奨:
- `UpdateViewDto.isShared === true` または private -> shared 遷移時は `canManage` を要求する。

### [Low-Medium] `.env` が作業ツリーに実体として存在

`.gitignore` では `.env` が除外されていますが、現ワークスペースには DB 接続情報と JWT 秘密鍵が含まれる `.env` が存在します。レポートには値を記載しません。

根拠:
- `backend/.gitignore`
- `backend/.env:1`
- `backend/.env:5`

推奨:
- `.env.example` へ置き換え、実値は OS/秘密情報ストア/デプロイ環境変数で管理する。
- 共有済みの可能性がある場合は JWT_SECRET と DB パスワードをローテーションする。

### [Low-Medium] フロントエンド lint が大量に失敗

`npm run lint` は 347 errors / 22 warnings で失敗しました。多くは `any`、React hooks ルール、ref の render 中更新ですが、`Chart.tsx` の render 後変数再代入など実バグ化し得るものも含まれています。

例:
- `frontend/src/components/Chart.tsx:120`
- `frontend/src/components/MapView.tsx:90-92`
- `frontend/src/components/CommandPalette.tsx:19-24`

推奨:
- `no-explicit-any` の方針を緩めるか、段階的に型付けする対象を決める。
- React Compiler 系の hooks/immutability 指摘は、表示ずれや再レンダリング問題につながる箇所から修正する。

## 5. 優先対応ロードマップ

1. `multer` / Nest platform-express の脆弱性対応、アップロード保存順序の修正、アップロード中断/権限エラー時のクリーンアップテスト追加。
2. 公開フォームのレート制限、サーバ側フィールド検証、投稿サイズ/件数上限。
3. `computeMyTasks` にレコード公開範囲を適用し、owner/org スコープの回帰テストを追加。
4. Markdown/リンクフィールドの `href` スキーム制限。
5. レコード create/update/public/import の入力サニタイズ共通化。
6. 権限更新のトランザクション化。
7. レコード一覧・AI 検索・ダッシュボード集計のページング/DB 側絞り込み。
8. 初期アカウント強制変更、JWT 失効、CORS 本番必須設定。
9. フロント lint を段階的に修正し、CI に build/test/audit/lint を組み込む。

## 6. 追加で推奨するテスト

- 無権限ユーザーが添付アップロードを試したとき、ファイルがディスクに残らないこと。
- 公開フォームで必須項目欠落、巨大文字列、配列過多、未知キーが拒否されること。
- `recordViewScope=owner/org` で mytasks が通常一覧と同じ可視性になること。
- Markdown と link フィールドで `javascript:` がリンク化されないこと。
- `setPermissions` の `createMany` 失敗時に既存権限が保持されること。
- CSV エクスポートで `=cmd|...` などが式として解釈されない形に変換されること。
