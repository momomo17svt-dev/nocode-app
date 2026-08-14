# API設計 (API Design)

バックエンドはRESTful APIを提供する。すべてのエンドポイント（認証系を除く）において、認証トークン（JWT等）の検証および認可チェックを必須とする。

## 共通仕様
- Base Path: `/api/v1`
- Content-Type: `application/json` (ファイルアップロード時は `multipart/form-data`)

## エンドポイント一覧

### 1. 認証 (Auth)
- `POST /auth/login` : ログイン
- `POST /auth/logout` : ログアウト
- `PUT /auth/password` : パスワード変更

### 2. ユーザー・グループ管理 (User/Group)
- `GET /users`, `POST /users`, `PUT /users/:id`, `DELETE /users/:id`
- `GET /groups`, `POST /groups`, `PUT /groups/:id`, `DELETE /groups/:id`

### 3. アプリ管理 (App)
- `GET /apps` : アプリ一覧取得
- `POST /apps` : アプリ作成
- `GET /apps/:id` : アプリ詳細取得
- `PUT /apps/:id` : アプリ編集
- `DELETE /apps/:id` : アプリ削除
- `POST /apps/:id/duplicate` : アプリ複製

### 4. アプリ定義・権限
- `GET /apps/:id/fields`, `PUT /apps/:id/fields` : フィールド定義の取得・更新
- `GET /apps/:id/permissions`, `PUT /apps/:id/permissions` : 公開範囲・権限設定
- `GET /apps/:id/views`, `POST /apps/:id/views`, `PUT /apps/:id/views/:viewId`, `DELETE /apps/:id/views/:viewId`

### 5. レコード操作 (Record)
- `GET /apps/:id/records` : レコード一覧（検索・絞り込み）
- `POST /apps/:id/records` : レコード新規作成
- `GET /apps/:id/records/:recordId` : レコード詳細
- `PUT /apps/:id/records/:recordId` : レコード更新
- `DELETE /apps/:id/records/:recordId` : レコード削除

### 6. ファイル・CSV
- `POST /attachments/upload` : 添付ファイルアップロード
- `GET /attachments/:id/download` : ファイルダウンロード
- `POST /apps/:id/records/export` : CSVエクスポート
- `POST /apps/:id/records/import` : CSVインポート

### 7. 監査ログ
- `GET /audit-logs` : 監査ログ取得（システム管理者のみ）
