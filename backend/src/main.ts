import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import { AppModule } from './app.module';
import { ensureStorageDirs, TILES_DIR } from './common/storage.util';

async function bootstrap() {
  // 添付ファイル・地図タイル保存ディレクトリを起動時に用意
  ensureStorageDirs();

  // 既定のbodyParser(JSON上限100kb)を無効化し、上限を引き上げたものを登録する。
  // ナレッジ文書は本文最大20万字＝日本語UTF-8で約600KB。デフォルトのままだと
  // 大きな行政文書の作成/編集でPayloadTooLargeError(413)になるため。
  // (ファイルアップロードはmulter/multipartで別経路なので影響しない)
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  // Dockerでは直前のNginx 1段だけを信頼し、監査ログと公開フォーム制限に実IPを使う。
  // bat版の直接公開ではTRUST_PROXYを設定せず、転送ヘッダーの偽装を防ぐ。
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=()');
    next();
  });
  app.use(json({ limit: '15mb' }));
  app.use(urlencoded({ extended: true, limit: '15mb' }));

  // 地図タイル(XYZ {z}/{x}/{y}.png)を /tiles から静的配信する。
  // 画像なので認証は付けず(=Leafletの<img>から直接読める)、未DL領域は404→空タイル表示。
  // immutable は付けない: 地図種(標準/淡色/写真)を差し替えた際、同じURLでも
  // 更新が反映されるよう、ブラウザに ETag/更新日時で再検証させる(LAN内なので304は安価)。
  app.useStaticAssets(TILES_DIR, {
    prefix: '/tiles/',
    fallthrough: true,
    maxAge: '1h',
    etag: true,
    lastModified: true,
  });

  // 入力検証: DTO に定義されていないプロパティは自動除去する。
  // (サーバから取得したエンティティをそのまま送り返すケースに対応するため、
  //  未知プロパティは拒否せず whitelist で取り除く)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // 本番Dockerは同一オリジンのNginx経由なので、未設定時はCORSを有効化しない。
  // bat/devモードではローカルViteだけを既定許可し、LAN利用時は明示設定する。
  const configuredOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const developmentOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const allowedOrigins = configuredOrigins.length
    ? configuredOrigins
    : process.env.NODE_ENV === 'production'
      ? []
      : developmentOrigins;
  if (allowedOrigins.length) {
    app.enableCors({ origin: allowedOrigins, credentials: true });
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`Backend listening on http://0.0.0.0:${port}`);
}
bootstrap();
