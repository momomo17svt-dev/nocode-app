# Changelog

このプロジェクトの重要な変更を記録します。形式はKeep a Changelogを参考にし、バージョン番号はSemantic Versioningに従います。

## [Unreleased]

### Changed

- プロジェクト名を「ノーコードApp」、技術識別子を`nocode-app`へ変更
- Docker版とbat版で安全な初期管理者設定を追加
- 公開リポジトリ向けのデータ・秘密情報除外を追加

### Security

- 固定初期パスワードを廃止
- 添付ファイルを権限確認後に保存する方式へ変更
- 匿名公開フォームへ投稿回数制限を追加
- 未設定時のCORS全許可を廃止
