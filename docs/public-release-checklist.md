# 公開前チェックリスト

## データと秘密情報

- [ ] `.env`と`backend/.env`がGit対象外
- [ ] DBダンプ、添付、地図キャッシュ、バックアップがGit対象外
- [ ] 個人名、メール、内部IP、個人PCの絶対パスが残っていない
- [ ] サンプルデータが架空情報のみ

## 品質

- [ ] backend lint / build / testが成功
- [ ] frontend lint / buildが成功
- [ ] Dockerの新規DBから起動・ログインできる
- [ ] Windows bat版の新規DBから起動・ログインできる
- [ ] 既存Dockerボリュームからデータを引き継げる
- [ ] `npm audit`のHigh/Criticalが0件

## 文書と公開設定

- [ ] README、LICENSE、SECURITY、CONTRIBUTINGが最新
- [ ] 第三者ライセンス・地図データ条件を確認
- [ ] GitHub ActionsとDependabotが有効
- [ ] Private vulnerability reportingを有効化
- [ ] `v0.1.0`タグとリリースノートを作成
