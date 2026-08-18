# 公開前チェックリスト

## データと秘密情報

- [ ] `.env`と`backend/.env`がGit対象外
- [ ] DBダンプ、添付、地図キャッシュ、バックアップがGit対象外
- [ ] 個人名、メール、内部IP、個人PCの絶対パスが残っていない
- [ ] サンプルデータが架空情報のみ

## 品質

- [ ] backend lint / build / testが成功
- [ ] frontend lint / buildが成功
- [ ] Dockerの新規DBから起動し、初回セットアップ画面で管理者を作成してログインできる
- [ ] Windows bat版の新規DBから起動し、同じく初回セットアップ画面から始められる
- [ ] 管理者作成後、`POST /api/setup/admin`が403を返す
- [ ] 既存Dockerボリュームからデータを引き継げる
- [ ] `npm audit`のHigh/Criticalが0件

## 文書と公開設定

- [ ] README（日本語・英語）、LICENSE、SECURITY、CONTRIBUTINGが最新
- [ ] 第三者ライセンス・地図データ条件を確認
- [ ] GitHub Actions、Dependabot、CodeQLが有効
- [ ] Private vulnerability reportingを有効化
- [ ] 未修正の指摘を含む内部レポートを同梱していない
- [ ] `v0.1.0`タグとリリースノートを作成
