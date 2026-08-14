# アーキテクチャ設計 (Architecture Design)

## 1. システム概要
本システムは、完全オフライン環境（Windows 10）で動作するノーコード業務アプリ基盤である。
インターネット接続なしで完結し、LAN内のクライアントPCからブラウザを通じてアクセスする。

## 2. システム構成

### 2.1 物理構成
- **サーバー**: Windows 10 マシン
- **クライアント**: LANに接続されたPCのWebブラウザ

### 2.2 ソフトウェアスタック
- **Frontend**: React 18, TypeScript, Vite, React Router, TanStack Query
- **Backend**: Node.js, NestJS, TypeScript, REST API
- **Database**: PostgreSQL
- **ORM**: Prisma

## 3. ディレクトリ構成方針
```text
/
├── frontend/        # Vite + React (SPA)
│   ├── public/      # ローカルフォント、アイコン、画像
│   └── src/
├── backend/         # NestJS (API Server)
│   ├── src/
│   └── prisma/      # スキーマ、マイグレーション
├── storage/         # 添付ファイル保存先 (バックエンドからのみアクセス可)
│   └── attachments/
└── docs/            # 仕様書、設計書
```

## 4. 通信方式
- クライアントからのリクエストはすべてバックエンド（NestJS）のREST APIを経由する。
- 静的ファイル（フロントエンドのビルド成果物）はバックエンドサーバ（または別途ローカルのHTTPサーバ）から配信する。

## 5. オフライン要件の対応
- Google Fonts、CDN経由のライブラリ（Bootstrap等）は一切使用せず、すべて `frontend/public` または `node_modules` に同梱してビルドする。
- 外部APIやSaaS連携機能は排除する。
