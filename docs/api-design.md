# API設計

## 共通仕様

- Base path: `/api`
- JSON、ファイル時は`multipart/form-data`
- 認証: `nocode_session` HttpOnly Cookie、またはBearer JWT
- Cookie認証によるPOST/PUT/DELETE: `X-CSRF-Token`必須
- エラー: HTTP状態コードと`message`
- 応答ヘッダー: `X-Request-Id`

## 主なエンドポイント

- `GET /setup/status`, `POST /setup/admin`（初回セットアップ。管理者が1人もいない間だけ有効）
- `POST /auth/login`, `POST /auth/logout`, `GET /auth/profile`, `POST /auth/change-password`
- `GET|POST /apps`, `GET|PUT|DELETE /apps/:id`, `POST /apps/:id/duplicate`
- `GET|POST|PUT|DELETE /fields`, `/views`, `/app-permissions`
- `GET|POST /records`, `GET|PUT|DELETE /records/:id`
- `POST /records/import`, `GET /records/export/csv`
- `GET|POST|DELETE /attachments`
- `/directory/users`, `/directory/groups`, `/groups`
- `/dashboards`, `/notifications`, `/portal`, `/audit-logs`
- `/llm`, `/ai`, `/public/forms`

## レコード一覧

`GET /api/records?appId=...`

従来互換の全件配列を返します。可視化タブで使用します。

`GET /api/records?appId=...&page=1&pageSize=50`

一覧タブ用で、次を返します。

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 50, "totalPages": 1 }
```

追加クエリは`search`、`conditions`（JSON、最大20条件）、`sortField`、`sortOrder=asc|desc`です。`pageSize`の上限は100です。権限による作成者/組織/対象社員範囲は常にサーバー側で適用されます。

## 監査ログ

`GET /api/audit-logs?page=1&pageSize=50`

システム管理者だけが利用できます。新しいログから順に、レコード一覧と同じページ情報を返します。`pageSize`の上限は100です。

```json
{ "items": [], "total": 0, "page": 1, "pageSize": 50, "totalPages": 1 }
```

## LLM設定

`GET /api/llm/config`は接続設定を返しますが、保存済みAPIキー本体は返しません。`apiKey`は常に空文字、`apiKeyConfigured`は登録有無です。

`PUT /api/llm/config`では、同じプロバイダーのまま空の`apiKey`を送ると既存キーを維持します。キーを消す場合は`clearApiKey: true`を送ります。プロバイダー変更時は、旧キーの誤送信を避けるため、新しいキーを同時指定しない限り既存キーを破棄します。対応する`provider`は`lmstudio`、`ollama`、`openai`、`openrouter`、`groq`、`gemini`、`mistral`、`custom`です。`custom`ではBearer、`api-key`、`x-api-key`の認証ヘッダーを選べます。
