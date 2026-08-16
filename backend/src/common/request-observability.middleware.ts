import { Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function requestIdFrom(value: unknown): string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value) ? value : randomUUID();
}

export function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** リクエストID、応答時間、失敗・低速リクエストを構造化JSONで記録する。 */
@Injectable()
export class RequestObservabilityMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');
  private readonly slowMs = positiveNumber(process.env.SLOW_REQUEST_MS, 1_000);
  private readonly logAll = process.env.HTTP_LOG_MODE === 'all';

  use(req: Request, res: Response, next: NextFunction) {
    const requestId = requestIdFrom(req.headers['x-request-id']);
    const started = process.hrtime.bigint();
    res.setHeader('X-Request-Id', requestId);

    res.once('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      const entry = JSON.stringify({
        event: 'http_request',
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        ip: req.ip,
      });

      if (res.statusCode >= 500) this.logger.error(entry);
      else if (durationMs >= this.slowMs) this.logger.warn(entry);
      else if (this.logAll) this.logger.log(entry);
    });
    next();
  }
}
