import { ServiceUnavailableException } from '@nestjs/common';

export interface QueueConfig {
  maxConcurrency: number; // 同時にLM Studioへ流すリクエスト数（LM Studioは実質直列なので既定1）
  maxQueue: number; // 順番待ちの上限。超えると即「混雑」エラー
  queueTimeoutMs: number; // 順番待ちの最大時間。超えたら諦める
}

export interface QueueStats {
  running: number;
  waiting: number;
  maxConcurrency: number;
  maxQueue: number;
}

export interface EnqueueOptions {
  priority?: number; // 大きいほど先に処理（対話=高 / 背景インデックス=低）
  onQueued?: (info: { position: number; waiting: number }) => void; // 順番待ちに入った時（即時開始なら呼ばれない）
  onStart?: () => void; // 順番待ちから実行に移った時に1度だけ
}

type Task<T> = () => Promise<T>;

interface Waiter {
  run: Task<unknown>;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  priority: number;
  seq: number; // 同一優先度内のFIFO用
  timer?: ReturnType<typeof setTimeout>;
  onStart?: () => void;
}

/**
 * 優先度付きの同時実行リミッタ（依存なし・インプロセス）。
 * ローカルLLMは実質1リクエストずつしか捌けないため、全LLM呼び出しをここで直列化し、
 * 混雑時は順番待ち（上限超のみ即エラー）にして一斉送信による総崩れを防ぐ。
 */
export class LlmQueue {
  private cfg: QueueConfig;
  private running = 0;
  private waiters: Waiter[] = [];
  private seqCounter = 0;

  constructor(cfg: QueueConfig) {
    this.cfg = { ...cfg };
  }

  setConfig(cfg: QueueConfig): void {
    this.cfg = { ...cfg };
    this.pump(); // 同時実行数を増やした場合は待機中を起こす
  }

  stats(): QueueStats {
    return {
      running: this.running,
      waiting: this.waiters.length,
      maxConcurrency: this.cfg.maxConcurrency,
      maxQueue: this.cfg.maxQueue,
    };
  }

  /**
   * タスクをキューに投入。空きがあれば待たずに即実行する。
   * 順番待ちに入った場合のみ onQueued（初期位置）を、そこから実行へ移った時に onStart を呼ぶ。
   */
  enqueue<T>(task: Task<T>, opts: EnqueueOptions = {}): Promise<T> {
    const priority = opts.priority ?? 0;
    if (this.running < this.cfg.maxConcurrency) {
      return this.runNow(task);
    }
    if (this.waiters.length >= this.cfg.maxQueue) {
      return Promise.reject(
        new ServiceUnavailableException('AIが混雑しています。少し時間をおいて再度お試しください。'),
      );
    }
    return new Promise<T>((resolve, reject) => {
      const waiter: Waiter = {
        run: task as Task<unknown>,
        resolve: resolve as (v: unknown) => void,
        reject,
        priority,
        seq: this.seqCounter++,
        onStart: opts.onStart,
      };
      if (this.cfg.queueTimeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          const i = this.waiters.indexOf(waiter);
          if (i >= 0) {
            this.waiters.splice(i, 1);
            reject(new ServiceUnavailableException('順番待ちがタイムアウトしました。時間をおいて再度お試しください。'));
          }
        }, this.cfg.queueTimeoutMs);
      }
      this.waiters.push(waiter);
      if (opts.onQueued) {
        const position = this.orderedWaiters().findIndex((w) => w.seq === waiter.seq) + 1;
        try {
          opts.onQueued({ position, waiting: this.waiters.length });
        } catch {
          /* 表示用コールバックの失敗は無視 */
        }
      }
    });
  }

  private runNow<T>(task: Task<T>): Promise<T> {
    this.running++;
    return task().finally(() => {
      this.running--;
      this.pump();
    });
  }

  private orderedWaiters(): Waiter[] {
    // priority降順 → seq昇順（FIFO）
    return [...this.waiters].sort((a, b) => b.priority - a.priority || a.seq - b.seq);
  }

  private pump(): void {
    while (this.running < this.cfg.maxConcurrency && this.waiters.length > 0) {
      const next = this.orderedWaiters()[0];
      this.waiters.splice(this.waiters.indexOf(next), 1);
      if (next.timer) clearTimeout(next.timer);
      try {
        next.onStart?.();
      } catch {
        /* 表示用コールバックの失敗は無視 */
      }
      this.running++;
      Promise.resolve()
        .then(() => next.run())
        .then(
          (v) => next.resolve(v),
          (e) => next.reject(e),
        )
        .finally(() => {
          this.running--;
          this.pump();
        });
    }
  }
}
