# Contributing to ノーコードApp

IssueやPull Requestを歓迎します。機密情報や実運用データを投稿しないでください。

**English is welcome.** Issues and pull requests in English are fine — write in whichever language
you are comfortable with. See [Where to start](#where-to-start--はじめの一歩) below.

## はじめの一歩

何から手を付けるか決まっていない場合は、この順で見てください。

1. [good first issue](https://github.com/momomo17svt-dev/nocode-app/labels/good%20first%20issue) — 1〜2ファイルで完結し、手本になる既存テストがあるもの
2. [ロードマップ](docs/roadmap.md)（[English](docs/roadmap.en.md)）— 「やる予定」と、それぞれの難易度
3. [アーキテクチャ設計](docs/architecture.md)（[English](docs/architecture.en.md)）— 主要ロジックがどのファイルにあるか

## 環境を用意する

Docker とComposeプラグインがあれば、Node.jsもPostgreSQLも別途要りません。

```bash
cp .env.example .env      # そのまま起動できる。sample_only_ の秘密情報は公開値なので随時変更
docker compose up -d --build
```

コードを直接いじる場合は[セットアップ手順書](docs/setup-guide.md)（[English](docs/setup-guide.en.md)）の「手動セットアップ」を参照してください。

## 開発手順

1. Issueで目的と影響範囲を共有します。既存Issueがあればそこに一言ください。
2. 小さく確認しやすい変更単位で実装します。
3. `npm ci`でロックファイルどおりに依存関係を用意します。
4. 下記の検証を通します。
5. 画面変更はDocker版またはbat版で動作確認します。

```bash
cd backend  && npm run lint && npm run build && npm test -- --runInBand
cd frontend && npm run lint && npm run build && npm test && npm run i18n:audit
```

CIでは上記に加えて、実PostgreSQLを使うE2E、DBバックアップ復元試験、CodeQL走査、依存関係監査が走ります。

## 気をつけてほしいところ

- **計算エンジンは2か所にあります。** `backend/src/records/compute.util.ts` と `frontend/src/lib/calc.ts` は同じ挙動でなければなりません。片方だけ変えないでください。
- **画面文言を足したら `npm run i18n:audit`。** 英訳が無い日本語があるとCIが落ちます。
- **NestJSのリテラルルートは `:id` ルートより前に宣言してください。**
- **`erasableSyntaxOnly` のため、constructorパラメータプロパティは使えません。**
- **`.bat` はASCII文字のみ・CRLF維持です。**

## Pull Request

- 変更理由、動作確認方法、互換性への影響を書いてください。
- DB変更にはPrismaマイグレーションを含めてください。
- APIや設定を変更した場合は関連ドキュメントも更新してください。
- `.env`、DBダンプ、添付、地図タイル、個人情報をコミットしないでください。

セキュリティ問題は公開Issueに書かず、[SECURITY.md](SECURITY.md)の手順に従ってください。

---

## Where to start / はじめの一歩

Everything above in English, briefly.

- Pick something from [good first issue](https://github.com/momomo17svt-dev/nocode-app/labels/good%20first%20issue),
  or see the [roadmap](docs/roadmap.en.md) for what is planned and how large each item is.
- The [architecture guide](docs/architecture.en.md) tells you which file holds which logic.
- `cp .env.example .env`, then `docker compose up -d --build`. It runs on the published
  `sample_only_` secrets; replace them once anyone else can reach the machine.
- Before opening a PR, run lint, build, and tests for both packages (commands above), plus
  `npm run i18n:audit` in `frontend/` if you touched any UI string.
- Two things bite newcomers: the formula evaluator exists **twice** (`compute.util.ts` and
  `calc.ts`) and must stay identical, and every user-visible Japanese string needs an English
  translation or CI fails.
- Report security problems privately through [SECURITY.md](SECURITY.md), never in a public issue.
