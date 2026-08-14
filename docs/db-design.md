# データベース設計 (Database Design)

ノーコードプラットフォームとして、アプリごとに物理テーブルを作成するのではなく、メタデータ（定義情報）と実データ（JSONB）を分離して管理する方式を採用する。

## 主要テーブル構成

### 1. 組織・ユーザー管理
- **users**: ユーザー情報 (ID, login_id, password_hash, role, is_active, etc.)
- **groups**: グループ情報 (ID, name, description)
- **group_members**: ユーザーとグループの中間テーブル

### 2. アプリ定義（メタデータ）
- **apps**: アプリ基本情報 (ID, name, description, created_by, status)
- **app_permissions**: アプリ権限設定 (app_id, target_type(User/Group/All), target_id, can_view, can_add, can_edit, can_delete, can_manage)
- **fields**: フォームのフィールド定義 (ID, app_id, field_code, field_type, label, required, settings(JSON))
- **views**: ビュー設定 (ID, app_id, name, is_shared, created_by, conditions(JSON), columns(JSON), sort(JSON))

### 3. データ（レコード）
- **records**: 実データ (ID, app_id, created_by, updated_by, data_json(JSONB))
  - `data_json` には `{ "field_code": "value" }` の形式でデータを格納。
- **record_comments**: レコードへのコメント
- **record_histories**: レコードの変更履歴 (ID, record_id, changed_by, old_data(JSONB), new_data(JSONB))

### 4. システム機能
- **attachments**: 添付ファイルメタデータ (ID, original_name, saved_name(UUID), mime_type, size, record_id, field_code)
- **audit_logs**: 監査ログ (ID, user_id, action_type, target_resource, target_id, details(JSON), ip_address)
- **settings**: システム全体設定
