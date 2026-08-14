import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Gauge, Plus, Pencil, Trash2, GripVertical, Check, Share2, RefreshCw, LayoutGrid, Settings2, MonitorPlay,
  ChevronDown, Search,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { getUser, canCreateApp } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { Modal } from '../components/ui/Modal';
import { Field } from '../components/ui/Field';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { WidgetView } from '../components/dashboard/WidgetView';
import { WidgetEditor } from '../components/dashboard/WidgetEditor';
import { AccessEditor } from '../components/dashboard/AccessEditor';
import {
  MAP_HEIGHT_LABELS, SIZE_LABELS, defaultWidget, sizeSpan, widgetHeight, type AccessConfig, type DashboardDef, type MapHeight, type Widget, type WidgetSize, type WidgetType,
} from '../lib/dashboard';

interface AppLite { id: string; name: string }
interface DirUser { id: string; loginId: string; name?: string | null }
interface DirGroup { id: string; name: string }

const LS_KEY = 'dash:selected';
const PRIVATE_ACCESS: AccessConfig = { mode: 'private', shares: [] };
const MAX_VISIBLE_DASHBOARDS = 6;

export function Dashboard() {
  const user = getUser();
  const toast = useToast();
  const { confirm } = useConfirm();

  const [dashboards, setDashboards] = useState<DashboardDef[]>([]);
  const [apps, setApps] = useState<AppLite[]>([]);
  const [dirUsers, setDirUsers] = useState<DirUser[]>([]);
  const [dirGroups, setDirGroups] = useState<DirGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dashboardQuery, setDashboardQuery] = useState('');
  const dashboardMenuRef = useRef<HTMLDetailsElement>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<Widget | null>(null);
  const [nameModal, setNameModal] = useState<{ mode: 'create' | 'rename'; name: string; access: AccessConfig } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const selected = useMemo(() => dashboards.find((d) => d.id === selectedId) || null, [dashboards, selectedId]);
  const canManage = !!selected?.canManage; // 名前/共有/削除
  const canEditW = !!selected?.canEdit;     // ウィジェット編集
  const canPublic = canCreateApp(user);

  const duplicatePosition = useMemo(() => {
    const totals = new Map<string, number>();
    const seen = new Map<string, number>();
    const result = new Map<string, { current: number; total: number }>();
    dashboards.forEach((dashboard) => totals.set(dashboard.name, (totals.get(dashboard.name) || 0) + 1));
    dashboards.forEach((dashboard) => {
      const current = (seen.get(dashboard.name) || 0) + 1;
      seen.set(dashboard.name, current);
      result.set(dashboard.id, { current, total: totals.get(dashboard.name) || 1 });
    });
    return result;
  }, [dashboards]);

  const visibleDashboards = useMemo(() => {
    const prioritized = selected
      ? [selected, ...dashboards.filter((dashboard) => dashboard.id !== selected.id)]
      : dashboards;
    return prioritized.slice(0, MAX_VISIBLE_DASHBOARDS);
  }, [dashboards, selected]);

  const appNames = useMemo(() => new Map(apps.map((app) => [app.id, app.name])), [apps]);
  const matchingDashboards = useMemo(() => {
    const query = dashboardQuery.trim().toLocaleLowerCase('ja');
    if (!query) return dashboards;
    return dashboards.filter((dashboard) => {
      const targets = dashboard.widgets
        .map((widget) => widget.appId && appNames.get(widget.appId))
        .filter(Boolean)
        .join(' ');
      return `${dashboard.name} ${targets}`.toLocaleLowerCase('ja').includes(query);
    });
  }, [appNames, dashboardQuery, dashboards]);

  const displayDashboardName = (dashboard: DashboardDef) => {
    const duplicate = duplicatePosition.get(dashboard.id);
    return duplicate && duplicate.total > 1
      ? `${dashboard.name} ${duplicate.current}/${duplicate.total}`
      : dashboard.name;
  };

  const dashboardTarget = (dashboard: DashboardDef) => {
    const targets = Array.from(new Set(
      dashboard.widgets.map((widget) => widget.appId && appNames.get(widget.appId)).filter((name): name is string => !!name),
    ));
    return targets.length ? targets.join('・') : 'アプリ指定なし';
  };

  const selectDashboard = (id: string) => {
    setSelectedId(id);
    setDashboardQuery('');
    dashboardMenuRef.current?.removeAttribute('open');
  };

  // 初期ロード
  useEffect(() => {
    Promise.all([
      api.get('/dashboards'),
      api.get('/apps'),
      api.get('/directory/users').catch(() => []),
      api.get('/directory/groups').catch(() => []),
    ])
      .then(([dashes, appList, users, groups]: [DashboardDef[], any[], DirUser[], DirGroup[]]) => {
        setDashboards(dashes || []);
        setApps((appList || []).map((a) => ({ id: a.id, name: a.name })));
        setDirUsers(users || []);
        setDirGroups(groups || []);
        const remembered = localStorage.getItem(LS_KEY);
        const pick = (dashes || []).find((d) => d.id === remembered) || (dashes || [])[0] || null;
        setSelectedId(pick ? pick.id : null);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [toast]);

  const computeData = useCallback(async (widgets: Widget[], replace = false) => {
    if (!widgets || widgets.length === 0) { if (replace) setData({}); return; }
    setDataLoading(true);
    try {
      const res = await api.post('/dashboards/data', { widgets });
      setData((prev) => (replace ? res : { ...prev, ...res }));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDataLoading(false);
    }
  }, [toast, setData, setDataLoading]);

  // ダッシュボード切替でデータ算出
  useEffect(() => {
    if (!selected) { setData({}); return; }
    localStorage.setItem(LS_KEY, selected.id);
    setEditing(false);
    void computeData(selected.widgets, true);
  }, [selected, computeData]);

  // ウィジェット配列を保存（レイアウト変更）。recompute=trueで再集計。
  const saveWidgets = async (widgets: Widget[], recompute: Widget[] | null = null) => {
    if (!selected) return;
    setDashboards((prev) => prev.map((d) => (d.id === selected.id ? { ...d, widgets } : d)));
    try {
      await api.put(`/dashboards/${selected.id}`, { widgets });
    } catch (e: any) {
      toast.error(e.message);
    }
    if (recompute && recompute.length) computeData(recompute);
  };

  // --- ダッシュボード操作 ---
  const submitName = async () => {
    if (!nameModal) return;
    const name = nameModal.name.trim() || '無題のダッシュボード';
    try {
      if (nameModal.mode === 'create') {
        const created: DashboardDef = await api.post('/dashboards', { name, access: nameModal.access, widgets: [] });
        setDashboards((prev) => [...prev, created]);
        setSelectedId(created.id);
        setEditing(true);
        toast.success('ダッシュボードを作成しました');
      } else if (selected) {
        const updated: DashboardDef = await api.put(`/dashboards/${selected.id}`, { name, access: nameModal.access });
        setDashboards((prev) => prev.map((d) => (d.id === updated.id ? { ...d, ...updated } : d)));
        toast.success('設定を保存しました');
      }
      setNameModal(null);
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  const openCreate = () => setNameModal({ mode: 'create', name: '', access: { ...PRIVATE_ACCESS } });

  const removeDashboard = async () => {
    if (!selected) return;
    const ok = await confirm({ title: 'ダッシュボードを削除', message: `「${selected.name}」を削除します。よろしいですか？`, confirmText: '削除', danger: true });
    if (!ok) return;
    try {
      await api.delete(`/dashboards/${selected.id}`);
      const rest = dashboards.filter((d) => d.id !== selected.id);
      setDashboards(rest);
      setSelectedId(rest[0]?.id ?? null);
      toast.success('削除しました');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // --- ウィジェット操作 ---
  const openNewWidget = (type: WidgetType) => { setEditingWidget(defaultWidget(type)); setEditorOpen(true); };
  const openEditWidget = (w: Widget) => { setEditingWidget(w); setEditorOpen(true); };
  const saveWidget = (w: Widget) => {
    if (!selected) return;
    const exists = selected.widgets.some((x) => x.id === w.id);
    const widgets = exists ? selected.widgets.map((x) => (x.id === w.id ? w : x)) : [...selected.widgets, w];
    saveWidgets(widgets, [w]);
  };
  const deleteWidget = (id: string) => {
    if (!selected) return;
    saveWidgets(selected.widgets.filter((x) => x.id !== id));
    setData((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };
  const resizeWidget = (id: string, size: WidgetSize) => {
    if (!selected) return;
    saveWidgets(selected.widgets.map((x) => (x.id === id ? { ...x, size } : x)));
  };
  const setHeight = (id: string, height: MapHeight | undefined) => {
    if (!selected) return;
    saveWidgets(selected.widgets.map((x) => (x.id === id ? { ...x, height } : x)));
  };

  // 並べ替え（HTML5 D&D）
  const onDrop = (target: number) => {
    if (!selected || dragIndex === null || dragIndex === target) { setDragIndex(null); setOverIndex(null); return; }
    const ws = [...selected.widgets];
    const [moved] = ws.splice(dragIndex, 1);
    ws.splice(target, 0, moved);
    saveWidgets(ws);
    setDragIndex(null);
    setOverIndex(null);
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-9 w-64" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* ヘッダ */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h1 className="text-xl font-bold tracking-tight flex items-center gap-2"><Gauge className="size-5 text-primary" />ダッシュボード</h1>
        <div className="flex-1" />
        {selected && (
          <>
            <button className="btn btn-ghost btn-sm gap-1.5" onClick={() => computeData(selected.widgets, true)} title="再読み込み">
              <RefreshCw className={`size-4 ${dataLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">更新</span>
            </button>
            <a className="btn btn-ghost btn-sm gap-1.5" href={`/board/${selected.id}`} target="_blank" rel="noopener noreferrer" title="サイネージ表示（全画面・自動更新）">
              <MonitorPlay className="size-4" />
              <span className="hidden sm:inline">サイネージ</span>
            </a>
            {canEditW && (
              editing ? (
                <button className="btn btn-primary btn-sm gap-1.5" onClick={() => setEditing(false)}><Check className="size-4" />完了</button>
              ) : (
                <button className="btn btn-ghost btn-sm gap-1.5" onClick={() => setEditing(true)}><Settings2 className="size-4" />編集</button>
              )
            )}
          </>
        )}
        <button className="btn btn-ghost btn-sm gap-1.5" onClick={openCreate}>
          <Plus className="size-4" /><span className="hidden sm:inline">新規</span>
        </button>
      </div>

      {/* ダッシュボード切替 */}
      {dashboards.length > 0 && (
        <div className="flex items-center gap-2 mb-5 min-w-0">
          <div className="flex items-center gap-2 min-w-0 overflow-x-auto pb-1" data-testid="dashboard-shortcuts">
            {visibleDashboards.map((d) => (
              <button
                key={d.id}
                onClick={() => selectDashboard(d.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  d.id === selectedId ? 'border-primary bg-primary-soft text-primary-soft-fg font-medium' : 'border-border bg-surface hover:bg-surface-2'
                }`}
                title={`${displayDashboardName(d)}（${dashboardTarget(d)}）`}
              >
                <LayoutGrid className="size-3.5" />
                <span className="truncate max-w-[12rem]">{displayDashboardName(d)}</span>
                {d.isShared && <Share2 className="size-3 text-muted" />}
              </button>
            ))}
          </div>
          {dashboards.length > MAX_VISIBLE_DASHBOARDS && (
            <details ref={dashboardMenuRef} className="relative shrink-0">
              <summary className="btn btn-ghost btn-sm gap-1.5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                すべて <span className="badge badge-muted tabular-nums">{dashboards.length}</span><ChevronDown className="size-3.5" />
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-[23rem] max-w-[calc(100vw-2rem)] card p-2 shadow-[var(--shadow-pop)] animate-pop-in">
                <div className="flex items-center gap-2 px-2 py-1.5 mb-1 rounded-lg border border-border bg-surface-2">
                  <Search className="size-4 text-muted shrink-0" />
                  <input
                    className="w-full bg-transparent text-sm outline-none"
                    value={dashboardQuery}
                    onChange={(event) => setDashboardQuery(event.target.value)}
                    placeholder="名前・対象アプリで検索"
                    aria-label="ダッシュボードを検索"
                  />
                </div>
                <div className="max-h-80 overflow-auto space-y-0.5" data-testid="dashboard-menu-list">
                  {matchingDashboards.map((dashboard) => (
                    <button
                      key={dashboard.id}
                      className={`w-full rounded-lg px-3 py-2 text-left hover:bg-surface-2 ${dashboard.id === selectedId ? 'bg-primary-soft text-primary-soft-fg' : ''}`}
                      onClick={() => selectDashboard(dashboard.id)}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <LayoutGrid className="size-3.5 shrink-0" />{displayDashboardName(dashboard)}
                        {dashboard.isShared && <Share2 className="size-3 text-muted" />}
                      </span>
                      <span className="block mt-0.5 text-xs text-muted truncate">
                        対象: {dashboardTarget(dashboard)}
                        {dashboard.createdAt ? `・作成 ${new Date(dashboard.createdAt).toLocaleString('ja-JP')}` : ''}
                      </span>
                    </button>
                  ))}
                  {matchingDashboards.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted">一致するダッシュボードがありません</p>}
                </div>
              </div>
            </details>
          )}
        </div>
      )}

      {/* 本体 */}
      {!selected ? (
        <EmptyState
          icon={<Gauge className="size-6" />}
          title="ダッシュボードがありません"
          description="グラフ・KPI・レコード一覧などを自由に並べた、あなた専用の集計画面を作成できます。"
          action={<button className="btn btn-primary gap-1.5" onClick={openCreate}><Plus className="size-4" />ダッシュボードを作成</button>}
        />
      ) : (
        <>
          {/* 編集ツールバー */}
          {editing && canEditW && (
            <div className="card p-3 mb-4 flex items-center gap-2 flex-wrap bg-surface-2/50">
              <span className="text-sm font-medium mr-1">ウィジェットを追加:</span>
              <button className="btn btn-sm gap-1" onClick={() => openNewWidget('chart')}><Plus className="size-3.5" />グラフ</button>
              <button className="btn btn-sm gap-1" onClick={() => openNewWidget('kpi')}><Plus className="size-3.5" />KPI</button>
              <button className="btn btn-sm gap-1" onClick={() => openNewWidget('list')}><Plus className="size-3.5" />一覧</button>
              <button className="btn btn-sm gap-1" onClick={() => openNewWidget('map')}><Plus className="size-3.5" />地図</button>
              <button className="btn btn-sm gap-1" onClick={() => openNewWidget('mytasks')}><Plus className="size-3.5" />自分のタスク</button>
              <div className="flex-1" />
              {canManage && (
                <>
                  <button className="btn btn-ghost btn-sm gap-1" onClick={() => setNameModal({ mode: 'rename', name: selected.name, access: selected.access || { ...PRIVATE_ACCESS } })}><Pencil className="size-3.5" />名前/共有</button>
                  <button className="btn btn-ghost btn-sm gap-1 text-danger" onClick={removeDashboard}><Trash2 className="size-3.5" />削除</button>
                </>
              )}
            </div>
          )}

          {selected.widgets.length === 0 ? (
            <EmptyState
              icon={<LayoutGrid className="size-6" />}
              title="ウィジェットがありません"
              description={canEditW ? '「編集」からグラフやKPIを追加してダッシュボードを組み立てましょう。' : 'このダッシュボードにはまだウィジェットがありません。'}
              action={canEditW && !editing ? <button className="btn btn-primary gap-1.5" onClick={() => setEditing(true)}><Settings2 className="size-4" />編集する</button> : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
              {selected.widgets.map((w, i) => (
                <div
                  key={w.id}
                  className={`${sizeSpan(w.size)} relative ${editing ? 'ring-1 ring-border rounded-xl' : ''} ${overIndex === i && dragIndex !== null ? 'outline outline-2 outline-primary rounded-xl' : ''} ${dragIndex === i ? 'opacity-50' : ''}`}
                  draggable={editing}
                  onDragStart={() => editing && setDragIndex(i)}
                  onDragOver={(e) => { if (editing && dragIndex !== null) { e.preventDefault(); setOverIndex(i); } }}
                  onDrop={() => onDrop(i)}
                  onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
                >
                  {editing && (
                    <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-0.5 rounded-lg border border-border bg-surface/95 shadow-[var(--shadow-pop)] px-1 py-0.5 backdrop-blur">
                      <span className="cursor-grab active:cursor-grabbing px-1 text-muted" title="ドラッグで並べ替え"><GripVertical className="size-4" /></span>
                      <select
                        className="bg-transparent text-xs py-0.5 px-0.5 rounded hover:bg-surface-2 cursor-pointer outline-none"
                        value={w.size || 'md'}
                        onChange={(e) => resizeWidget(w.id, e.target.value as WidgetSize)}
                        title="サイズ"
                      >
                        {(Object.keys(SIZE_LABELS) as WidgetSize[]).map((s) => <option key={s} value={s}>{SIZE_LABELS[s]}</option>)}
                      </select>
                      <select
                        className="bg-transparent text-xs py-0.5 px-0.5 rounded hover:bg-surface-2 cursor-pointer outline-none"
                        value={widgetHeight(w) || ''}
                        onChange={(e) => setHeight(w.id, (e.target.value || undefined) as MapHeight | undefined)}
                        title="高さ"
                      >
                        {w.type !== 'map' && <option value="">高さ:自動</option>}
                        {(Object.keys(MAP_HEIGHT_LABELS) as MapHeight[]).map((h) => <option key={h} value={h}>高さ:{MAP_HEIGHT_LABELS[h]}</option>)}
                      </select>
                      <button className="btn btn-ghost btn-icon btn-sm size-7" onClick={() => openEditWidget(w)} title="設定"><Pencil className="size-3.5" /></button>
                      <button className="btn btn-ghost btn-icon btn-sm size-7 text-danger" onClick={() => deleteWidget(w.id)} title="削除"><Trash2 className="size-3.5" /></button>
                    </div>
                  )}
                  <WidgetView widget={w} data={data[w.id]} loading={dataLoading && !data[w.id]} />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ウィジェット設定モーダル */}
      {editingWidget && (
        <WidgetEditor
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          initial={editingWidget}
          apps={apps}
          onSave={saveWidget}
        />
      )}

      {/* 名前/共有モーダル */}
      <Modal
        open={!!nameModal}
        onClose={() => setNameModal(null)}
        title={nameModal?.mode === 'create' ? 'ダッシュボードを作成' : 'ダッシュボードの設定'}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setNameModal(null)}>キャンセル</button>
            <button className="btn btn-primary" onClick={submitName}>{nameModal?.mode === 'create' ? '作成' : '保存'}</button>
          </>
        }
      >
        {nameModal && (
          <div className="space-y-4">
            <Field label="名前">
              <input className="input" autoFocus value={nameModal.name} onChange={(e) => setNameModal({ ...nameModal, name: e.target.value })} placeholder="例: 営業ダッシュボード" onKeyDown={(e) => { if (e.key === 'Enter') submitName(); }} />
            </Field>
            <AccessEditor
              value={nameModal.access}
              onChange={(access) => setNameModal({ ...nameModal, access })}
              users={dirUsers}
              groups={dirGroups}
              canPublic={canPublic}
            />
          </div>
        )}
      </Modal>
    </Layout>
  );
}
