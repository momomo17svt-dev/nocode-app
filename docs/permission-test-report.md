# 権限テストレポート (Permission Test Report)

実DB（PostgreSQL）+ 実APIサーバに対して `curl` で検証した結果。すべて期待どおり。

シードデータ:
- ユーザー: admin(SystemAdmin) / creator(AppCreator) / user1(StandardUser, 営業部所属) / viewer1(Viewer)
- アプリ「問い合わせ管理」(所有者: creator)
  - 公開設定: 全ユーザー=閲覧+追加 / 営業部グループ=閲覧+追加+編集

| # | テスト | 期待 | 結果 |
|---|---|---|---|
| 1 | 各ユーザーのログイン | access_token 取得 | ✅ |
| 2 | 未認証で `/api/apps` | 401 | ✅ |
| 3 | 不正パスワード | 「ログイン情報が正しくありません」 | ✅ |
| 4 | viewer が `/api/users` | 403 | ✅ |
| 4 | admin が `/api/users` | 200 | ✅ |
| 5 | user1 が `/api/audit-logs` | 403 | ✅ |
| 6 | viewer がアプリ作成 | 403 | ✅ |
| 7 | viewer の myPermission | 閲覧のみ（add/edit/delete/manage=false） | ✅ |
| 7 | user1 の myPermission | view+add+edit=true（グループ権限のOR結合） | ✅ |
| 8 | viewer がレコード追加 | 403 | ✅ |
| 8 | user1 がレコード追加 | 成功 | ✅ |
| 9 | user1 がCSVエクスポート | 403（管理権限なし） | ✅ |
| 9 | admin がCSVエクスポート | 成功 | ✅ |
| 10 | レコード更新で変更履歴 | 1件記録 | ✅ |
| 11 | CSVエスケープ | `A,B"C` → `"A,B""C"` | ✅ |
| 12 | 監査ログ記録 | 各操作が記録 | ✅ |
| 13 | 添付アップロード(admin) | 成功 | ✅ |
| 14 | 保存ファイル名 | UUID化（原名と分離） | ✅ |
| 15 | 添付ダウンロード | 原名・内容を復元 | ✅ |
| 16 | viewer(canView)の添付DL | 200 | ✅ |
| 11(直URL) | 未認証の添付DL | 401 | ✅ |
| 17 | CSVインポート | 1件作成・必須未入力行をエラー返却 | ✅ |

## レコード単位公開範囲（owner）の検証
アプリ「問い合わせ管理」を `recordViewScope=owner` / `recordEditScope=owner` に設定して検証。

| # | テスト | 期待 | 結果 |
|---|---|---|---|
| A | owner設定の保存 | view=owner edit=owner | ✅ |
| B | 閲覧件数 creator(管理)=5 / user1(本人)=3 | user1は自分の分のみ | ✅ |
| C | user1 が creator作成レコードを閲覧 | 403 | ✅ |
| C | user1 が creator作成レコードを編集（改ざん） | 403 | ✅ |
| C | user1 が creator作成レコードを削除 | 403 | ✅ |
| D | `all` に戻すと user1=5件 | 全件閲覧に復帰 | ✅ |

## アプリ削除・複製の検証
| # | テスト | 期待 | 結果 |
|---|---|---|---|
| E | creator がアプリ複製 | 成功・フィールド6件コピー | ✅ |
| E | 複製アプリの削除 | 成功 | ✅ |
| E | user1(管理権限なし)のアプリ削除 | 403 | ✅ |

## 補足（コードレベルの対策）
- パストラバーサル: `resolveAttachmentPath()` が `..`・絶対パス・区切り文字を含む保存名を例外で拒否し、解決後パスが `storage/attachments` 配下であることを保証。
- ファイル名: 保存名は `randomUUID()+拡張子`。元ファイル名はDBメタデータのみに保持。
- JWT: シークレットを `.env` 化（ハードコードのフォールバックは残置するが本番は環境変数を使用）。
