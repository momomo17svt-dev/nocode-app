import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, RefreshCw, Loader2, Clock } from 'lucide-react';
import { aiApi, type LlmHealth } from '../../lib/ai';
import { useLlmQueue } from './QueueHint';

/** LM Studio 接続状態のバナー。未接続時は案内を表示する。順番待ち/モデル読込中も表示。 */
export function LlmStatusBadge({ onHealth }: { onHealth?: (h: LlmHealth) => void }) {
  const [health, setHealth] = useState<LlmHealth | null>(null);
  const [loading, setLoading] = useState(true);
  // 接続済みの間だけキューを軽量ポーリング（LM Studio非接触）
  const queue = useLlmQueue(!!health?.ok);

  const load = () => {
    setLoading(true);
    aiApi
      .health()
      .then((h) => { setHealth(h); onHealth?.(h); })
      .catch(() => setHealth(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load();   }, []);

  const ok = !!health?.ok;
  const q = queue || health?.queue || null;
  const modelLoading = q?.loading?.chat || q?.loading?.embed;
  const waiting = q?.waiting ?? 0;
  const running = q?.running ?? 0;
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${
        ok ? 'border-success/40 bg-success-soft' : 'border-warning/40 bg-warning-soft'
      }`}
    >
      <span className="mt-0.5 shrink-0">
        {loading ? <Loader2 className="size-5 animate-spin text-muted" /> : ok ? <CheckCircle2 className="size-5 text-success" /> : <AlertTriangle className="size-5 text-warning" />}
      </span>
      <div className="flex-1 min-w-0">
        {ok ? (
          <>
            <p className="font-medium">ローカルLLMに接続済み</p>
            <p className="text-xs text-muted mt-0.5 break-words">
              {health?.baseUrl}　/　チャット: {health?.resolvedChatModel || '—'}{!health?.chatModel && health?.resolvedChatModel ? '（自動）' : ''}　/　埋め込み: {health?.resolvedEmbedModel || '未検出'}{!health?.embedModel && health?.resolvedEmbedModel ? '（自動）' : ''}
            </p>
            {!health?.resolvedEmbedModel && (
              <p className="text-xs text-warning mt-1">※ 埋め込みモデルが見つかりません。LM Studio で埋め込みモデルをロードすると RAG・検索が使えます。</p>
            )}
            {(modelLoading || waiting > 0 || running > 0) && (
              <p className="text-xs text-muted mt-1 flex items-center gap-1.5">
                {modelLoading ? (
                  <><Loader2 className="size-3.5 animate-spin" />モデル読込中: {modelLoading}</>
                ) : (
                  <><Clock className="size-3.5" />処理中 {running}件{waiting > 0 ? ` / 順番待ち ${waiting}件` : ''}</>
                )}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="font-medium">ローカルLLMに接続できません</p>
            <p className="text-xs text-muted mt-0.5 break-words">
              {health?.error || 'LM Studio でローカルサーバとモデルを起動してください。'}（{health?.baseUrl}）
            </p>
          </>
        )}
      </div>
      <button className="btn btn-ghost btn-icon btn-sm shrink-0" onClick={load} aria-label="再確認" title="再確認">
        <RefreshCw className="size-4" />
      </button>
    </div>
  );
}
