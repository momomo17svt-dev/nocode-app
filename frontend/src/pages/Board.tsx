import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Clock, Maximize2, Minimize2, RefreshCw, X } from 'lucide-react';
import { api } from '../lib/api';
import { WidgetView } from '../components/dashboard/WidgetView';
import { sizeSpan, type DashboardDef, type Widget } from '../lib/dashboard';

/**
 * 状況把握ボード（サイネージ / キオスク表示）。
 * 既存ダッシュボードを全画面・暗テーマ・自動更新で表示する。指揮所・当直室・災害対策本部の壁面表示向け。
 * クエリ: ?refresh=秒 (既定30) / ?rotate=秒 (複数ボードを自動切替) / ?theme=light
 */
export function Board() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const refreshSec = Math.max(10, Number(params.get('refresh')) || 30);
  const rotateSec = Math.max(0, Number(params.get('rotate')) || 0);
  const light = params.get('theme') === 'light';

  const [dashboards, setDashboards] = useState<DashboardDef[]>([]);
  const [curId, setCurId] = useState<string | undefined>(id);
  const [data, setData] = useState<Record<string, any>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(new Date());
  const [err, setErr] = useState('');
  const [isFull, setIsFull] = useState(false);

  const current = useMemo(() => dashboards.find((d) => d.id === curId) || null, [dashboards, curId]);
  // 最新の current を定期実行のクロージャから参照するための ref。
  const currentRef = useRef<DashboardDef | null>(null);
  currentRef.current = current;

  // ダッシュボード一覧を取得
  useEffect(() => {
    api.get('/dashboards')
      .then((rows: DashboardDef[]) => {
        setDashboards(rows || []);
        setCurId((prev) => (rows?.some((d) => d.id === prev) ? prev : rows?.[0]?.id));
      })
      .catch((e) => setErr(e.message));
  }, []);

  const load = async (d: DashboardDef | null) => {
    if (!d) return;
    if (!d.widgets || d.widgets.length === 0) { setData({}); setUpdatedAt(new Date()); return; }
    try {
      const res = await api.post('/dashboards/data', { widgets: d.widgets });
      setData(res);
      setUpdatedAt(new Date());
      setErr('');
    } catch (e: any) {
      setErr(e.message);
    }
  };

  // 選択ボードが変わったら再算出
  useEffect(() => { setData({}); load(current);   }, [curId, dashboards]);

  // 定期更新
  useEffect(() => {
    const t = setInterval(() => load(currentRef.current), refreshSec * 1000);
    return () => clearInterval(t);
  }, [refreshSec]);

  // 時計
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 複数ボードの自動切替（ローテーション）
  useEffect(() => {
    if (!rotateSec || dashboards.length < 2) return;
    const t = setInterval(() => {
      setCurId((prev) => {
        const idx = dashboards.findIndex((d) => d.id === prev);
        return dashboards[(idx + 1) % dashboards.length].id;
      });
    }, rotateSec * 1000);
    return () => clearInterval(t);
  }, [rotateSec, dashboards]);

  // 画面スリープ防止（Screen Wake Lock）。可視復帰時に取り直す。
  useEffect(() => {
    let lock: any = null;
    const request = async () => {
      try { lock = await (navigator as any).wakeLock?.request('screen'); } catch { /* 非対応環境は無視 */ }
    };
    request();
    const onVis = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      try { lock?.release?.(); } catch { /* noop */ }
    };
  }, []);

  // フルスクリーン
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  };
  useEffect(() => {
    const onFs = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  return (
    <div className={`${light ? '' : 'dark'} min-h-screen bg-canvas text-content`}>
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-surface/85 px-4 py-2 backdrop-blur">
        <h1 className="truncate text-lg font-bold tracking-tight">{current?.name || '状況把握ボード'}</h1>
        {rotateSec > 0 && dashboards.length > 1 && <span className="badge badge-muted shrink-0">自動切替 {rotateSec}秒</span>}
        <div className="flex-1" />
        <div className="hidden items-center gap-1.5 text-sm tabular-nums text-muted sm:flex">
          <Clock className="size-4" />
          <span>{now.toLocaleString('ja-JP', { hour12: false })}</span>
        </div>
        {updatedAt && (
          <span className="hidden text-xs text-muted md:inline">更新 {updatedAt.toLocaleTimeString('ja-JP', { hour12: false })}</span>
        )}
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => load(current)} title="今すぐ更新"><RefreshCw className="size-4" /></button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={toggleFull} title={isFull ? '全画面を終了' : '全画面'}>
          {isFull ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => navigate('/dashboards')} title="閉じる"><X className="size-4" /></button>
      </header>

      {/* 手動切替タブ（ローテーション未使用時の切替に便利） */}
      {dashboards.length > 1 && (
        <div className="flex gap-2 overflow-x-auto px-4 py-2">
          {dashboards.map((d) => (
            <button
              key={d.id}
              onClick={() => setCurId(d.id)}
              className={`whitespace-nowrap rounded-full border px-3 py-1 text-sm transition-colors ${
                d.id === curId ? 'border-primary bg-primary-soft text-primary-soft-fg font-medium' : 'border-border bg-surface hover:bg-surface-2'
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {err && (
        <div className="mx-4 mt-3 rounded-lg border border-danger-soft bg-danger-soft px-3 py-2 text-sm text-danger-soft-fg">{err}</div>
      )}

      <main className="p-4">
        {!current ? (
          <div className="grid h-[70vh] place-items-center text-muted">表示できるダッシュボードがありません</div>
        ) : current.widgets.length === 0 ? (
          <div className="grid h-[70vh] place-items-center text-muted">このダッシュボードにはウィジェットがありません</div>
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {current.widgets.map((w: Widget) => (
              <div key={w.id} className={sizeSpan(w.size)}>
                <WidgetView widget={w} data={data[w.id]} loading={!data[w.id]} />
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
