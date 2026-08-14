import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, BarChart3, AlertTriangle } from 'lucide-react';
import { analyzeAppStream, type QueuedInfo } from '../../lib/ai';
import { QueueHint } from './QueueHint';
import { Markdown } from '../ui/Markdown';

interface AppLite { id: string; name: string }

/** アプリ単位のAI分析（傾向・改善提案）。集計を即表示し、インサイトをストリーミング表示する。 */
export function AnalysisPanel({ apps, disabled, initialAppId }: { apps: AppLite[]; disabled?: boolean; initialAppId?: string }) {
  const [appId, setAppId] = useState(initialAppId || '');
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any | null>(null);
  const [meta, setMeta] = useState<{ appName: string; recordCount: number } | null>(null);
  const [insight, setInsight] = useState('');
  const [error, setError] = useState('');
  const [queued, setQueued] = useState<QueuedInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { if (initialAppId) setAppId(initialAppId); }, [initialAppId]);

  const run = async () => {
    if (!appId || loading) return;
    setLoading(true);
    setStats(null);
    setMeta(null);
    setInsight('');
    setError('');
    setQueued(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    await analyzeAppStream(appId, {
      signal: ctrl.signal,
      onStats: (s) => { setStats(s.stats); setMeta({ appName: s.appName, recordCount: s.recordCount }); },
      onQueued: (info) => setQueued(info),
      onToken: (t) => { setQueued(null); setInsight((prev) => prev + t); },
      onError: (m) => { setQueued(null); setError(m); },
      onDone: () => { setQueued(null); setLoading(false); abortRef.current = null; },
    });
  };

  const hasResult = stats || insight || error;

  return (
    <div>
      <div className="flex items-end gap-2 flex-wrap">
        <div className="flex-1 min-w-48">
          <label className="label">分析するアプリ</label>
          <select className="input" value={appId} disabled={disabled} onChange={(e) => setAppId(e.target.value)}>
            <option value="">アプリを選択…</option>
            {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <button className="btn btn-primary gap-1.5" onClick={run} disabled={disabled || !appId || loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}分析する
        </button>
      </div>

      {hasResult && (
        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
          {/* AIインサイト */}
          <div className="card p-5">
            <h4 className="flex items-center gap-2 font-semibold text-sm mb-3">
              <Sparkles className="size-4 text-primary-soft-fg" />AIによる分析
            </h4>
            {error ? (
              <div className="flex items-start gap-2 text-sm text-danger">
                <AlertTriangle className="size-4 mt-0.5 shrink-0" />
                <span className="whitespace-pre-wrap break-words">{error}</span>
              </div>
            ) : insight ? (
              <div className="text-sm leading-relaxed">
                <Markdown content={insight} />
                {loading && <span className="inline-block w-1.5 h-4 ml-0.5 align-middle bg-primary-soft-fg animate-pulse" />}
              </div>
            ) : (
              <p className="text-sm text-muted flex items-center gap-2">
                <QueueHint
                  active={loading}
                  queued={queued}
                  fallback={<><Loader2 className="size-4 animate-spin" />AIが分析しています…（思考型モデルは出力開始まで時間がかかる場合があります）</>}
                />
              </p>
            )}
          </div>

          {/* 集計サマリー */}
          <div className="card p-5 h-fit">
            <h4 className="flex items-center gap-2 font-semibold text-sm mb-3"><BarChart3 className="size-4 text-muted" />集計データ</h4>
            {stats ? (
              <>
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-muted">総レコード数</dt><dd className="font-semibold tabular-nums">{stats.total ?? 0}</dd></div>
                  {stats.process && (
                    <div className="flex justify-between"><dt className="text-muted">完了率</dt><dd className="font-semibold tabular-nums">{stats.process.rate}%（未完 {stats.process.open}）</dd></div>
                  )}
                </dl>
                {stats.distributions?.length > 0 && (
                  <div className="mt-4 space-y-3">
                    {stats.distributions.slice(0, 3).map((d: any) => (
                      <div key={d.field}>
                        <p className="text-xs font-medium text-muted mb-1">{d.label}</p>
                        <ul className="space-y-0.5">
                          {d.items.slice(0, 5).map((it: any) => (
                            <li key={it.value} className="flex justify-between text-xs"><span className="truncate">{it.value}</span><span className="tabular-nums text-muted">{it.count}</span></li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
                {stats.numbers?.length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    {stats.numbers.slice(0, 4).map((n: any) => (
                      <div key={n.field} className="text-xs"><span className="text-muted">{n.label}</span>：合計 {n.sum.toLocaleString()} / 平均 {n.avg}</div>
                    ))}
                  </div>
                )}
                {meta && <p className="text-[11px] text-muted mt-4 pt-3 border-t border-border">{meta.appName} ・ {meta.recordCount}件を集計</p>}
              </>
            ) : (
              <p className="text-sm text-muted">集計中…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
