import { useEffect, useState, type ReactNode } from 'react';
import { Loader2, Clock } from 'lucide-react';
import { aiApi, type QueueStatus, type QueuedInfo } from '../../lib/ai';

/** GET /llm/queue を軽量ポーリング（active時のみ）。外部LLM非接触なので頻繁に呼んでよい。 */
export function useLlmQueue(active: boolean, intervalMs = 3000): QueueStatus | null {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  useEffect(() => {
    if (!active) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    const tick = () => aiApi.queue().then((s) => { if (!cancelled) setStatus(s); }).catch(() => {});
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [active, intervalMs]);
  return status;
}

/** モデル読込中 or 順番待ちの状況テキストを返す（無ければ null）。 */
export function queueHintText(q: QueueStatus | null, queued?: QueuedInfo | null): string | null {
  if (q?.loading?.chat || q?.loading?.embed) return 'モデル読込中…（初回は時間がかかります）';
  if (queued && queued.position > 0) return `順番待ち ${queued.position}番目…`;
  if (q && q.waiting > 0) return `順番待ち（${q.waiting}件）…`;
  return null;
}

/**
 * 「モデル読込中…」「順番待ち N番目…」を表示する小さなインジケータ。
 * active の間だけキューを監視し、queued には当該リクエストのSSE順番待ち位置を渡せる。
 * 表示すべき状況が無い場合は fallback（省略時は何も表示しない）を返す。
 */
export function QueueHint({
  active,
  queued,
  className,
  fallback = null,
}: {
  active: boolean;
  queued?: QueuedInfo | null;
  className?: string;
  fallback?: ReactNode;
}) {
  const q = useLlmQueue(active);
  const text = queueHintText(q, queued);
  if (!text) return <>{fallback}</>;
  const loading = !!(q?.loading?.chat || q?.loading?.embed);
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-muted ${className || ''}`}>
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Clock className="size-3.5" />}
      {text}
    </span>
  );
}
