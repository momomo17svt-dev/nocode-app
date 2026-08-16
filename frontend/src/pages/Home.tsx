import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks, LayoutGrid, ChevronRight, CheckCircle2, ClipboardCheck, ArrowUpRight, Star, Clock } from 'lucide-react';
import { api } from '../lib/api';
import { Layout } from '../components/Layout';
import { getUser, userDisplay } from '../lib/auth';
import { getFavorites, getRecent } from '../lib/prefs';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { StatusPill } from '../components/ui/StatusPill';
import { useToast } from '../components/ui/Toast';
import { Chart } from '../components/Chart';
import { colorForLabel } from '../lib/colors';

interface AppSummary {
  id: string; name: string; status: string; total: number; open: number; hasProcess: boolean;
}
interface MyTask {
  appId: string; appName: string; recordId: string; title: string; status: string | null; assigneeLabel: string; updatedAt: string;
}

export function Home() {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();
  const user = getUser();

  useEffect(() => {
    api.get('/portal/summary')
      .then((r) => { setApps(r.apps); setTasks(r.myTasks); })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [toast]);

  const totalOpen = apps.reduce((s, a) => s + (a.hasProcess ? a.open : 0), 0);
  const procApps = apps.filter((a) => a.hasProcess);
  const totAll = procApps.reduce((s, a) => s + a.total, 0);
  const totDone = procApps.reduce((s, a) => s + (a.total - a.open), 0);
  const overallRate = totAll > 0 ? Math.round((totDone / totAll) * 100) : null;
  const byId = (id: string) => apps.find((a) => a.id === id);
  const favApps = getFavorites().map(byId).filter(Boolean) as AppSummary[];
  const recentApps = getRecent().map(byId).filter(Boolean) as AppSummary[];

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-xl font-bold tracking-tight">こんにちは、{userDisplay(user)} さん</h1>
        <p className="text-sm text-muted mt-0.5">あなたの未完了タスクと、利用中アプリの状況です。</p>
      </div>

      {!loading && (favApps.length > 0 || recentApps.length > 0) && (
        <div className="mb-7 space-y-3">
          {favApps.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1"><Star className="size-3.5" />お気に入り</div>
              <div className="flex flex-wrap gap-2">
                {favApps.map((a) => <AppChip key={a.id} name={a.name} onClick={() => navigate(`/apps/${a.id}`)} />)}
              </div>
            </div>
          )}
          {recentApps.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-muted mb-1.5 flex items-center gap-1"><Clock className="size-3.5" />最近使ったアプリ</div>
              <div className="flex flex-wrap gap-2">
                {recentApps.map((a) => <AppChip key={a.id} name={a.name} onClick={() => navigate(`/apps/${a.id}`)} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* サマリ指標 */}
      <div className="grid gap-4 sm:grid-cols-3 mb-7">
        <StatCard icon={<ClipboardCheck className="size-5" />} label="自分の未完了タスク" value={loading ? null : tasks.length} accent />
        <StatCard icon={<LayoutGrid className="size-5" />} label="利用中アプリ" value={loading ? null : apps.length} />
        <StatCard icon={<ListChecks className="size-5" />} label="未完了レコード（全体）" value={loading ? null : totalOpen} />
      </div>

      {/* 全体の完了状況 */}
      {!loading && overallRate !== null && (
        <div className="card p-5 mb-7">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-muted flex items-center gap-1.5"><CheckCircle2 className="size-4" />全体の完了状況</h2>
            <span className="text-sm font-semibold tabular-nums">完了率 {overallRate}%</span>
          </div>
          <Chart
            type="donut"
            valueLabel="レコード"
            data={[
              { label: '完了', value: totDone, color: '#16a34a' },
              { label: '未完了', value: totAll - totDone, color: '#94a3b8' },
            ]}
          />
        </div>
      )}

      {/* 自分のタスク */}
      <section className="mb-8">
        <h2 className="text-sm font-bold text-muted mb-3 flex items-center gap-1.5">
          <ClipboardCheck className="size-4" />自分のタスク
        </h2>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 className="size-6" />}
            title="未完了のタスクはありません"
            description="あなたが担当に設定された未完了のレコードがここに表示されます。"
          />
        ) : (
          <div className="space-y-2">
            {tasks.map((t) => (
              <button
                key={t.recordId}
                onClick={() => navigate(`/apps/${t.appId}/records/${t.recordId}`)}
                className="card group w-full p-4 text-left flex items-center gap-3 transition-all hover:border-border-strong hover:shadow-[var(--shadow-pop)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs text-muted mb-0.5">
                    <span className="badge badge-muted">{t.appName}</span>
                    <span>{t.assigneeLabel}</span>
                  </div>
                  <div className="font-medium truncate group-hover:text-primary transition-colors">{t.title}</div>
                </div>
                {t.status && <span className="shrink-0"><StatusPill value={t.status} color={colorForLabel(t.status)} /></span>}
                <ChevronRight className="size-4 text-muted shrink-0" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* アプリ一覧サマリ */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-muted flex items-center gap-1.5"><LayoutGrid className="size-4" />アプリ</h2>
          <button className="text-xs text-primary inline-flex items-center gap-1 hover:underline" onClick={() => navigate('/apps')}>
            すべて見る<ArrowUpRight className="size-3.5" />
          </button>
        </div>
        {loading ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : apps.length === 0 ? (
          <EmptyState icon={<LayoutGrid className="size-6" />} title="アプリがありません" />
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {apps.map((a) => {
              const rate = a.hasProcess && a.total > 0 ? Math.round(((a.total - a.open) / a.total) * 100) : null;
              return (
                <button
                  key={a.id}
                  onClick={() => navigate(`/apps/${a.id}`)}
                  className="card group p-4 text-left transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-pop)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="grid place-items-center size-9 rounded-lg bg-primary-soft text-primary-soft-fg shrink-0">
                      <LayoutGrid className="size-[18px]" />
                    </span>
                    <span className={`badge ${a.status === 'published' ? 'badge-success' : 'badge-muted'}`}>
                      {a.status === 'published' ? '公開中' : '下書き'}
                    </span>
                  </div>
                  <h3 className="font-semibold leading-snug mt-2 truncate group-hover:text-primary transition-colors">{a.name}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted mt-2">
                    <span>{a.total}件</span>
                    {a.hasProcess && <span>未完了 {a.open}件</span>}
                  </div>
                  {rate !== null && (
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${rate}%` }} />
                      </div>
                      <div className="text-[11px] text-muted mt-1">完了率 {rate}%</div>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </Layout>
  );
}

function AppChip({ name, onClick }: { name: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:border-border-strong hover:bg-surface-2 transition-colors">
      <LayoutGrid className="size-3.5 text-muted" />
      <span className="truncate max-w-[12rem]">{name}</span>
    </button>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number | null; accent?: boolean }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <span className={`grid place-items-center size-11 rounded-xl shrink-0 ${accent ? 'bg-primary text-primary-fg' : 'bg-primary-soft text-primary-soft-fg'}`}>
        {icon}
      </span>
      <div>
        <div className="text-2xl font-bold leading-none">{value === null ? '—' : value}</div>
        <div className="text-xs text-muted mt-1">{label}</div>
      </div>
    </div>
  );
}
