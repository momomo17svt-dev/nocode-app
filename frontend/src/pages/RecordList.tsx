import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Settings, Download, Upload, Plus, Pencil, Trash2, Search,
  ChevronUp, ChevronDown, ChevronsUpDown, SlidersHorizontal, Inbox, BarChart3, List,
  Columns3, CalendarDays, Target, ChevronLeft, ChevronRight, UserPlus, Megaphone, X, MapPin,
  CheckCircle2, ListChecks, CircleDashed, GripVertical, Sparkles, Printer, type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { Layout } from '../components/Layout';
import { FieldInput } from '../components/FieldInput';
import { MapView, type MapMarker } from '../components/MapView';
import { isGeoPoint, mapZoom, mapHeightClass, buildSwitcherBasemaps, getAvailableTileStyles } from '../lib/map';
import { type FieldDef, formatValue, groupKey } from '../lib/fields';
import { buildOptionColors, softColor, NEUTRAL_COLOR } from '../lib/colors';
import { parseCsv, readCsvFile } from '../lib/csv';
import { getUser } from '../lib/auth';
import { getLocale } from '../lib/i18n';
import { pushRecent } from '../lib/prefs';
import { Chart, type ChartDatum } from '../components/Chart';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Field } from '../components/ui/Field';
import { Skeleton, SkeletonRows } from '../components/ui/Skeleton';
import { Avatar } from '../components/ui/Avatar';
import { StatusPill } from '../components/ui/StatusPill';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { cn } from '../lib/cn';

type Tab = 'list' | 'kanban' | 'calendar' | 'map' | 'progress' | 'chart';

interface Perm { canView: boolean; canAdd: boolean; canEdit: boolean; canDelete: boolean; canManage: boolean; }
interface FilterCond { field: string; op: string; value: string; }
interface ViewDef {
  id?: string;
  name: string;
  isShared: boolean;
  columns: string[];
  conditions: FilterCond[];
  sort: { field: string; order: 'asc' | 'desc' } | null;
}

const OPS: { v: string; label: string }[] = [
  { v: 'contains', label: 'を含む' },
  { v: 'eq', label: 'と等しい' },
  { v: 'ne', label: 'と異なる' },
  { v: 'gt', label: 'より大きい' },
  { v: 'lt', label: 'より小さい' },
  { v: 'empty', label: 'が空' },
  { v: 'notempty', label: 'が空でない' },
];

const PAGE_SIZE = 50;

interface RecordPageResponse {
  items: any[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function RecordList() {
  const { appId } = useParams();
  const navigate = useNavigate();
  const me = getUser();
  const toast = useToast();
  const { confirm } = useConfirm();

  const [app, setApp] = useState<any>(null);
  const [perm, setPerm] = useState<Perm | null>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [views, setViews] = useState<ViewDef[]>([]);
  const [selectedViewId, setSelectedViewId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ field: string; order: 'asc' | 'desc' } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>('list');
  const [importing, setImporting] = useState<{ rows: Record<string, any>[]; count: number } | null>(null);
  const [editView, setEditView] = useState<ViewDef | null>(null);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<{ id: string; loginId: string }[]>([]);
  const [distributing, setDistributing] = useState(false);
  const [quickView, setQuickView] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [recordTotal, setRecordTotal] = useState(0);
  const [serverTotalPages, setServerTotalPages] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const activeView = useMemo(
    () => views.find((view) => view.id === selectedViewId) || null,
    [views, selectedViewId],
  );

  // レコード単位の編集/削除可否。アプリ権限(編集範囲owner/org含む)に加え、
  // 「追加権限ユーザーは自分が追加したレコードを編集/削除できる」設定を考慮する。
  const canEditRecord = (r: any) => {
    const isOwner = r?.createdBy === me?.id;
    const ownerOnly = app?.recordEditScope === 'owner' && !perm?.canManage;
    const allowMutate = !ownerOnly || isOwner;
    return (!!perm?.canEdit && allowMutate) || (!!perm?.canAdd && !!app?.creatorEditOwn && isOwner);
  };
  const canDeleteRecord = (r: any) => {
    const isOwner = r?.createdBy === me?.id;
    const ownerOnly = app?.recordEditScope === 'owner' && !perm?.canManage;
    const allowMutate = !ownerOnly || isOwner;
    return (!!perm?.canDelete && allowMutate) || (!!perm?.canAdd && !!app?.creatorDeleteOwn && isOwner);
  };

  const loadRecords = useCallback(async () => {
    if (!appId) return;
    setLoading(true);
    try {
      if (tab === 'list') {
        const params = new URLSearchParams({ appId, page: String(page), pageSize: String(PAGE_SIZE) });
        if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
        if (activeView?.conditions?.length) params.set('conditions', JSON.stringify(activeView.conditions));
        const effectiveSort = sort || activeView?.sort || null;
        if (effectiveSort) {
          params.set('sortField', effectiveSort.field);
          params.set('sortOrder', effectiveSort.order);
        }
        const result: RecordPageResponse = await api.get(`/records?${params.toString()}`);
        setRecords(result.items || []);
        setRecordTotal(result.total || 0);
        setServerTotalPages(result.totalPages || 1);
        if (result.page !== page) setPage(result.page);
      } else {
        const rows: any[] = await api.get(`/records?appId=${encodeURIComponent(appId)}`);
        setRecords(rows || []);
        setRecordTotal(rows?.length || 0);
        setServerTotalPages(1);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'レコードの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [activeView, appId, debouncedSearch, page, sort, tab, toast]);

  const loadViews = useCallback(() => {
    if (!appId) return Promise.resolve();
    return api.get(`/views?appId=${appId}`).then((vs: any[]) =>
      setViews(vs.map((v) => ({ id: v.id, name: v.name, isShared: v.isShared, columns: v.columns || [], conditions: v.conditions || [], sort: v.sort || null })))
    ).catch(() => undefined);
  }, [appId]);

  useEffect(() => {
    if (!appId) return;
    pushRecent(appId);
    api.get(`/apps/${appId}`).then((a) => { setApp(a); setPerm(a.myPermission); }).catch((e) => toast.error(e.message));
    api.get(`/fields?appId=${appId}`).then(setFields).catch(() => {});
    api.get('/directory/users').then((us: any[]) => { setUsers(us); setUserMap(Object.fromEntries(us.map((u) => [u.id, u.loginId]))); }).catch(() => {});
    loadViews();
  }, [appId, loadViews, toast]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    void loadRecords();
  }, [loadRecords]);

  useEffect(() => { setPage(1); }, [search, selectedViewId, sort]);

  const columns = useMemo(() => {
    const usable = fields.filter((f) => f.fieldType !== 'section');
    const codes = activeView?.columns?.length ? activeView.columns : usable.slice(0, 8).map((f) => f.fieldCode);
    return codes.map((c) => usable.find((f) => f.fieldCode === c)).filter(Boolean) as FieldDef[];
  }, [activeView, fields]);

  const cellText = (field: FieldDef, value: any): string => {
    if (field.fieldType === 'user_select') return userMap[value] || (value ? String(value) : '');
    return formatValue(field, value);
  };

  // ステータス／セレクト項目ごとの「選択肢→色」対応表（かんばん・進捗と色を共有）
  const statusColorMaps = useMemo(() => {
    const m: Record<string, Record<string, string>> = {};
    for (const f of fields) if (f.fieldType === 'status' || f.fieldType === 'select') m[f.fieldCode] = buildOptionColors(f.settings?.options || []);
    return m;
  }, [fields]);

  // ステータス/セレクトはその場で変更（楽観的更新→失敗時は再読込）
  const inlineEdit = async (recordId: string, code: string, value: any) => {
    const current = records.find((r) => r.id === recordId);
    if (!current) return;
    setRecords((rs) => rs.map((r) => (r.id === recordId ? { ...r, dataJson: { ...r.dataJson, [code]: value } } : r)));
    try {
      const updated = await api.put(`/records/${recordId}`, { data: { [code]: value }, expectedVersion: current.version || 1 });
      setRecords((rows) => rows.map((record) => record.id === recordId ? { ...record, version: updated.version, updatedAt: updated.updatedAt } : record));
    } catch (e: any) {
      toast.error(e.message || '更新に失敗しました');
      loadRecords();
    }
  };

  const renderCell = (f: FieldDef, r: any) => {
    const v = r.dataJson?.[f.fieldCode];
    if (f.fieldType === 'user_select') {
      const name = userMap[v] || (v ? String(v) : '');
      return name
        ? <span className="inline-flex items-center gap-1.5 min-w-0"><Avatar name={name} /><span className="truncate">{name}</span></span>
        : <span className="text-muted">—</span>;
    }
    if (f.fieldType === 'status' || f.fieldType === 'select') {
      const opts: string[] = f.settings?.options || [];
      const colors = statusColorMaps[f.fieldCode] || {};
      const color = colors[String(v ?? '')] || NEUTRAL_COLOR;
      const editable = canEditRecord(r) && opts.length > 0;
      if (editable) {
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full shrink-0" style={{ background: v ? color : 'var(--border-strong)' }} />
            <select
              className="text-xs rounded-md border border-border bg-surface-2 px-1.5 py-0.5 cursor-pointer hover:border-border-strong max-w-[150px]"
              value={v ?? ''}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => { e.stopPropagation(); inlineEdit(r.id, f.fieldCode, e.target.value); }}
            >
              <option value="">—</option>
              {opts.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </span>
        );
      }
      return <StatusPill value={String(v ?? '')} color={color} />;
    }
    return cellText(f, v);
  };

  const displayed = useMemo(() => {
    if (tab === 'list') return records;
    let rows = [...records];
    for (const c of activeView?.conditions || []) {
      rows = rows.filter((r) => matchCond(r.dataJson?.[c.field], c));
    }
    if (search) {
      const kw = search.toLowerCase();
      rows = rows.filter((r) => Object.values(r.dataJson || {}).some((v) => String(v ?? '').toLowerCase().includes(kw)));
    }
    const s = sort || activeView?.sort || null;
    if (s) {
      const f = fields.find((x) => x.fieldCode === s.field);
      rows.sort((a, b) => {
        let av = a.dataJson?.[s.field], bv = b.dataJson?.[s.field];
        if (f && (f.fieldType === 'number' || f.fieldType === 'calc')) { av = Number(av) || 0; bv = Number(bv) || 0; }
        else { av = String(av ?? ''); bv = String(bv ?? ''); }
        return (av < bv ? -1 : av > bv ? 1 : 0) * (s.order === 'asc' ? 1 : -1);
      });
    }
    return rows;
  }, [records, activeView, search, sort, fields, tab]);

  const toggleSort = (code: string) => {
    setSort((s) => s && s.field === code ? { field: code, order: s.order === 'asc' ? 'desc' : 'asc' } : { field: code, order: 'asc' });
  };

  const selectTab = (nextTab: Tab) => {
    if (nextTab === tab) return;
    setRecords([]);
    setSelected(new Set());
    setPage(1);
    setLoading(true);
    setTab(nextTab);
  };

  const exportCsv = async () => {
    try {
      const blob = await api.getBlob(`/records/export/csv?appId=${appId}`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${app?.name || 'records'}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e.message); }
  };

  const onImportFile = async (file: File) => {
    try {
      const grid = parseCsv(await readCsvFile(file));
      if (grid.length < 2) { toast.error('データ行がありません'); return; }
      const colMap = grid[0].map((h) => fields.find((x) => x.label === h || x.fieldCode === h)?.fieldCode || null);
      const rows = grid.slice(1).map((r) => { const o: Record<string, any> = {}; r.forEach((v, i) => { if (colMap[i]) o[colMap[i] as string] = v; }); return o; });
      setImporting({ rows, count: rows.length });
    } catch (e: any) { toast.error(e.message || 'CSV読み込み失敗'); }
  };
  const confirmImport = async () => {
    if (!importing) return;
    try {
      const res = await api.post('/records/import', { appId, rows: importing.rows });
      if (res.errors.length) {
        toast.error(`${res.created}件を取り込みました。エラー${res.errors.length}件:\n` + res.errors.map((e: any) => `行${e.row}: ${e.message}`).join('\n'));
      } else {
        toast.success(`${res.created}件を取り込みました。`);
      }
      setImporting(null); loadRecords();
    } catch (e: any) { toast.error(e.message); }
  };

  /** このレコード群が他アプリから参照されている件数に応じた警告文（削除前確認に付加）。 */
  const referencingWarn = async (ids: string[]): Promise<string> => {
    try {
      const { count } = await api.post('/records/referencing-count', { appId, ids });
      return count > 0
        ? `\n\n⚠ 他アプリの${count}件のレコードから参照されています。削除すると参照リンクが切れます。`
        : '';
    } catch { return ''; }
  };

  const removeRecord = async (id: string) => {
    const warn = await referencingWarn([id]);
    if (!(await confirm({ message: `このレコードを削除しますか？${warn}`, danger: true, confirmText: '削除' }))) return;
    try {
      await api.delete(`/records/${id}`);
      setRecords((rows) => rows.filter((record) => record.id !== id));
      setRecordTotal((total) => Math.max(0, total - 1));
      toast.success('削除しました');
    } catch (e: any) { toast.error(e.message); }
  };
  const bulkDelete = async () => {
    if (selected.size === 0) return;
    const warn = await referencingWarn(Array.from(selected));
    if (!(await confirm({ message: `選択した${selected.size}件を削除しますか？${warn}`, danger: true, confirmText: '削除' }))) return;
    try {
      const res = await api.post('/records/bulk-delete', { appId, ids: Array.from(selected) });
      toast.success(`${res.deleted}件を削除しました。`);
      setSelected(new Set()); loadRecords();
    } catch (e: any) { toast.error(e.message); }
  };

  const toggleSelect = (id: string) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
  const allSelected = displayed.length > 0 && displayed.every((r) => selected.has(r.id));
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(displayed.map((r) => r.id)));

  // 帳票テンプレートがあれば印刷可。チェックボックス列は「削除」か「印刷」のどちらかが可能なら表示。
  const reportTemplates: { id: string; name: string }[] = (app?.reportConfig?.templates || []).map((t: any) => ({ id: t.id, name: t.name }));
  const canSelect = !!perm?.canDelete || reportTemplates.length > 0;
  // 選択レコードを一覧の表示順で並べたID配列
  const selectedIds = displayed.filter((r) => selected.has(r.id)).map((r) => r.id);

  const saveView = async (v: ViewDef) => {
    try {
      if (v.id) await api.put(`/views/${v.id}`, v);
      else { const created = await api.post('/views', { appId, ...v }); v.id = created.id; }
      setEditView(null); await loadViews();
      toast.success('ビューを保存しました');
    } catch (e: any) { toast.error(e.message); }
  };
  const deleteView = async (id?: string) => {
    if (!id) return;
    if (!(await confirm({ message: 'このビューを削除しますか？', danger: true, confirmText: '削除' }))) return;
    try { await api.delete(`/views/${id}`); setEditView(null); if (selectedViewId === id) setSelectedViewId(''); await loadViews(); toast.success('ビューを削除しました'); } catch (e: any) { toast.error(e.message); }
  };

  if (!app) {
    return (
      <Layout>
        <Skeleton className="h-8 w-56 mb-6" />
        <SkeletonRows rows={6} cols={5} />
      </Layout>
    );
  }
  const ownerOnly = app.recordEditScope === 'owner' && !perm?.canManage;
  const totalPages = tab === 'list'
    ? serverTotalPages
    : Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const curPage = Math.min(page, totalPages);
  const paged = tab === 'list'
    ? displayed
    : displayed.slice((curPage - 1) * PAGE_SIZE, curPage * PAGE_SIZE);
  const visibleTotal = tab === 'list' ? recordTotal : displayed.length;

  return (
    <Layout>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => navigate('/apps')} aria-label="戻る" />
          <h1 className="text-xl font-bold tracking-tight truncate">{app.name}</h1>
          <span className={`badge ${app.status === 'published' ? 'badge-success' : 'badge-muted'}`}>{app.status === 'published' ? '公開中' : '下書き'}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button icon={<Sparkles className="size-4" />} onClick={() => navigate(`/ai?app=${appId}&tab=analyze`)}>AI分析</Button>
          {perm?.canManage && <Button icon={<Settings className="size-4" />} onClick={() => navigate(`/apps/${appId}/settings`)}>設定</Button>}
          {perm?.canManage && <Button icon={<Download className="size-4" />} onClick={exportCsv}>CSV出力</Button>}
          {perm?.canAdd && (
            <label className="btn cursor-pointer">
              <Upload className="size-4" />CSV取込
              <input type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && onImportFile(e.target.files[0])} />
            </label>
          )}
          {perm?.canAdd && fields.some((f) => f.fieldType === 'user_select') && (
            <Button icon={<UserPlus className="size-4" />} onClick={() => setDistributing(true)}>一括配布</Button>
          )}
          {perm?.canAdd && <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => navigate(`/apps/${appId}/records/new`)}>レコード追加</Button>}
        </div>
      </div>

      <div className="flex gap-1 border-b border-border mb-3 overflow-x-auto">
        <TabButton active={tab === 'list'} onClick={() => selectTab('list')} icon={<List className="size-4" />}>一覧</TabButton>
        <TabButton active={tab === 'kanban'} onClick={() => selectTab('kanban')} icon={<Columns3 className="size-4" />}>かんばん</TabButton>
        <TabButton active={tab === 'calendar'} onClick={() => selectTab('calendar')} icon={<CalendarDays className="size-4" />}>カレンダー</TabButton>
        {fields.some((f) => f.fieldType === 'location') && (
          <TabButton active={tab === 'map'} onClick={() => selectTab('map')} icon={<MapPin className="size-4" />}>地図</TabButton>
        )}
        <TabButton active={tab === 'progress'} onClick={() => selectTab('progress')} icon={<Target className="size-4" />}>進捗</TabButton>
        <TabButton active={tab === 'chart'} onClick={() => selectTab('chart')} icon={<BarChart3 className="size-4" />}>集計・グラフ</TabButton>
      </div>

      {tab === 'list' && (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <select className="input w-auto" value={selectedViewId} onChange={(e) => { setSelectedViewId(e.target.value); setSort(null); }}>
                <option value="">（すべて）</option>
                {views.map((v) => <option key={v.id} value={v.id}>{v.name}{v.isShared ? '' : '（自分用）'}</option>)}
              </select>
              <div className="relative">
                <Search className="size-4 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input className="input pl-8 w-56" placeholder="キーワード検索..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              {perm?.canView && (
                <Button
                  icon={<SlidersHorizontal className="size-4" />}
                  onClick={() => setEditView(activeView ? { ...activeView } : { name: '', isShared: true, columns: fields.slice(0, 6).map((f) => f.fieldCode), conditions: [], sort: null })}
                >
                  {activeView ? 'ビュー編集' : 'ビュー作成'}
                </Button>
              )}
            </div>
            {selected.size > 0 && (
              <div className="flex items-center gap-2">
                {appId && reportTemplates.length > 0 && (
                  <BulkPrintButton appId={appId} ids={selectedIds} count={selected.size} templates={reportTemplates} />
                )}
                {perm?.canDelete && (
                  <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={bulkDelete}>選択した{selected.size}件を削除</Button>
                )}
              </div>
            )}
          </div>

          {activeView && (activeView.conditions.length > 0 || activeView.sort) && (
            <div className="flex items-center gap-1.5 flex-wrap mb-3">
              <span className="text-xs text-muted">適用中:</span>
              {activeView.conditions.map((c, i) => {
                const fl = fields.find((f) => f.fieldCode === c.field)?.label || c.field;
                const ol = OPS.find((o) => o.v === c.op)?.label || c.op;
                return (
                  <span key={i} className="badge badge-muted">
                    {fl} {ol}{!['empty', 'notempty'].includes(c.op) && ` ${c.value}`}
                  </span>
                );
              })}
              {activeView.sort && (
                <span className="badge badge-muted">
                  並び: {fields.find((f) => f.fieldCode === activeView.sort!.field)?.label || activeView.sort.field}（{activeView.sort.order === 'asc' ? '昇順' : '降順'}）
                </span>
              )}
              <button className="text-xs text-primary hover:underline ml-1" onClick={() => setEditView({ ...activeView })}>編集</button>
            </div>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  {canSelect && (
                    <th className="w-10 px-3 py-2 text-left">
                      <input type="checkbox" className="accent-[var(--primary)]" checked={allSelected} onChange={toggleSelectAll} />
                    </th>
                  )}
                  {columns.map((f) => {
                    const isSorted = sort?.field === f.fieldCode;
                    return (
                      <th
                        key={f.fieldCode}
                        className="px-4 py-2 text-left font-semibold text-muted whitespace-nowrap cursor-pointer select-none hover:text-content"
                        onClick={() => toggleSort(f.fieldCode)}
                      >
                        <span className="inline-flex items-center gap-1">
                          {f.label}
                          {isSorted ? (sort!.order === 'asc' ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />) : <ChevronsUpDown className="size-3.5 opacity-40" />}
                        </span>
                      </th>
                    );
                  })}
                  <th className="px-4 py-2 text-left font-semibold text-muted whitespace-nowrap">作成者</th>
                  <th className="px-4 py-2 text-left font-semibold text-muted whitespace-nowrap">更新日時</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td colSpan={columns.length + (canSelect ? 4 : 3)} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                    </tr>
                  ))
                ) : (
                  paged.map((r) => {
                    const isOwner = r.createdBy === me?.id;
                    const allowMutate = !ownerOnly || isOwner;
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0 hover:bg-surface-hover cursor-pointer transition-colors" onClick={() => setQuickView(r)}>
                        {canSelect && (
                          <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" className="accent-[var(--primary)]" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} disabled={!!perm?.canDelete && !allowMutate} />
                          </td>
                        )}
                        {columns.map((f) => <td key={f.fieldCode} className="px-4 py-1.5 align-top">{renderCell(f, r)}</td>)}
                        <td className="px-4 py-1.5 text-muted whitespace-nowrap">{r.creator?.loginId}</td>
                        <td className="px-4 py-1.5 text-muted whitespace-nowrap">{new Date(r.updatedAt).toLocaleString(getLocale())}</td>
                        <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-0.5 justify-end">
                            {canEditRecord(r) && <Button variant="ghost" size="sm" icon={<Pencil className="size-4" />} onClick={() => navigate(`/apps/${appId}/records/${r.id}/edit`)} aria-label="編集" />}
                            {canDeleteRecord(r) && <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => removeRecord(r.id)} aria-label="削除" />}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
                {!loading && displayed.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + (canSelect ? 4 : 3)} className="px-4 py-14">
                      <div className="flex flex-col items-center gap-2 text-muted">
                        <Inbox className="size-8" />
                        <span className="text-sm">レコードがありません</span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {!loading && (
            <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
              <p className="text-xs text-muted">
                {visibleTotal} 件
                {visibleTotal > PAGE_SIZE && `（${(curPage - 1) * PAGE_SIZE + 1}–${Math.min(curPage * PAGE_SIZE, visibleTotal)} 件目を表示）`}
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" icon={<ChevronLeft className="size-4" />} onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={curPage <= 1} aria-label="前のページ" />
                  <span className="text-xs text-muted tabular-nums px-1">{curPage} / {totalPages}</span>
                  <Button variant="ghost" size="sm" icon={<ChevronRight className="size-4" />} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={curPage >= totalPages} aria-label="次のページ" />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'kanban' && <KanbanView fields={fields} records={displayed} appId={appId!} onOpen={(p) => navigate(p)} userMap={userMap} canEdit={!!perm?.canEdit && !ownerOnly} onChangeStatus={inlineEdit} />}
      {tab === 'calendar' && <CalendarView fields={fields} records={displayed} appId={appId!} onOpen={(p) => navigate(p)} />}
      {tab === 'map' && <MapTab fields={fields} records={displayed} appId={appId!} onOpen={(p) => navigate(p)} />}
      {tab === 'progress' && (
        <ProgressPanel app={app} fields={fields} records={records} userMap={userMap} canRemind={!!perm?.canView} appId={appId!} />
      )}
      {tab === 'chart' && <AggregatePanel fields={fields} records={records} userMap={userMap} />}

      {distributing && (
        <BulkDistributeModal
          appId={appId!}
          fields={fields}
          users={users}
          onClose={() => setDistributing(false)}
          onDone={() => { setDistributing(false); loadRecords(); }}
        />
      )}

      {quickView && (
        <QuickViewDrawer
          record={quickView}
          fields={fields}
          userMap={userMap}
          canEdit={canEditRecord(quickView)}
          onOpen={() => navigate(`/apps/${appId}/records/${quickView.id}`)}
          onEdit={() => navigate(`/apps/${appId}/records/${quickView.id}/edit`)}
          onClose={() => setQuickView(null)}
        />
      )}

      {/* CSVインポート確認 */}
      <Modal
        open={!!importing}
        onClose={() => setImporting(null)}
        title="CSVインポート確認"
        size="lg"
        footer={
          <>
            <Button onClick={() => setImporting(null)}>キャンセル</Button>
            <Button variant="primary" onClick={confirmImport}>取り込む</Button>
          </>
        }
      >
        {importing && (
          <>
            <p className="text-sm mb-3">{importing.count}件を取り込みます。先頭5件のプレビュー:</p>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {fields.slice(0, 5).map((f) => <th key={f.fieldCode} className="px-3 py-2 text-left font-semibold text-muted whitespace-nowrap">{f.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {importing.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {fields.slice(0, 5).map((f) => <td key={f.fieldCode} className="px-3 py-2">{String(row[f.fieldCode] ?? '')}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>

      {editView && <ViewEditor view={editView} fields={fields} onChange={setEditView} onSave={saveView} onDelete={deleteView} onClose={() => setEditView(null)} />}
    </Layout>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors',
        active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-content',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function matchCond(value: any, c: FilterCond): boolean {
  const s = String(value ?? '');
  switch (c.op) {
    case 'contains': return s.includes(c.value);
    case 'eq': return s === c.value;
    case 'ne': return s !== c.value;
    case 'gt': return Number(value) > Number(c.value);
    case 'lt': return Number(value) < Number(c.value);
    case 'empty': return s === '';
    case 'notempty': return s !== '';
    default: return true;
  }
}

/* ===== ビュー編集モーダル ===== */
function ViewEditor({ view, fields, onChange, onSave, onDelete, onClose }: {
  view: ViewDef; fields: FieldDef[];
  onChange: (v: ViewDef) => void; onSave: (v: ViewDef) => void; onDelete: (id?: string) => void; onClose: () => void;
}) {
  const toggleCol = (code: string) => {
    const cols = view.columns.includes(code) ? view.columns.filter((c) => c !== code) : [...view.columns, code];
    onChange({ ...view, columns: cols });
  };
  const addCond = () => onChange({ ...view, conditions: [...view.conditions, { field: fields[0]?.fieldCode || '', op: 'contains', value: '' }] });
  const updCond = (i: number, patch: Partial<FilterCond>) => { const cs = [...view.conditions]; cs[i] = { ...cs[i], ...patch }; onChange({ ...view, conditions: cs }); };
  const delCond = (i: number) => onChange({ ...view, conditions: view.conditions.filter((_, idx) => idx !== i) });

  return (
    <Modal
      open
      onClose={onClose}
      title="ビュー設定"
      size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <div>{view.id && <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => onDelete(view.id)}>削除</Button>}</div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose}>キャンセル</Button>
            <Button variant="primary" onClick={() => onSave(view)} disabled={!view.name.trim()}>保存</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="ビュー名">
          <input className="input" value={view.name} onChange={(e) => onChange({ ...view, name: e.target.value })} />
        </Field>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-[var(--primary)]" checked={view.isShared} onChange={(e) => onChange({ ...view, isShared: e.target.checked })} />
          全体で共有する（オフにすると自分専用ビュー）
        </label>

        <Field label="表示する列">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {fields.map((f) => (
              <label key={f.fieldCode} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="accent-[var(--primary)]" checked={view.columns.includes(f.fieldCode)} onChange={() => toggleCol(f.fieldCode)} />{f.label}
              </label>
            ))}
          </div>
        </Field>

        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="label mb-0">絞り込み条件（すべて満たす）</span>
            <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={addCond}>条件追加</Button>
          </div>
          <div className="space-y-2">
            {view.conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-2 flex-wrap">
                <select className="input w-auto" value={c.field} onChange={(e) => updCond(i, { field: e.target.value })}>
                  {fields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
                </select>
                <select className="input w-auto" value={c.op} onChange={(e) => updCond(i, { op: e.target.value })}>
                  {OPS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                </select>
                {!['empty', 'notempty'].includes(c.op) && <input className="input flex-1 min-w-32" value={c.value} onChange={(e) => updCond(i, { value: e.target.value })} />}
                <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => delCond(i)} aria-label="削除" />
              </div>
            ))}
          </div>
        </div>

        <Field label="並び順">
          <div className="flex items-center gap-2">
            <select className="input w-auto" value={view.sort?.field || ''} onChange={(e) => onChange({ ...view, sort: e.target.value ? { field: e.target.value, order: view.sort?.order || 'asc' } : null })}>
              <option value="">（なし）</option>
              {fields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
            </select>
            {view.sort && (
              <select className="input w-auto" value={view.sort.order} onChange={(e) => onChange({ ...view, sort: { field: view.sort!.field, order: e.target.value as 'asc' | 'desc' } })}>
                <option value="asc">昇順</option><option value="desc">降順</option>
              </select>
            )}
          </div>
        </Field>
      </div>
    </Modal>
  );
}

/* ===== クイックビュー（行クリックの右ドロワー） ===== */
function QuickViewDrawer({ record, fields, userMap, canEdit, onOpen, onEdit, onClose }: {
  record: any; fields: FieldDef[]; userMap: Record<string, string>;
  canEdit: boolean; onOpen: () => void; onEdit: () => void; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cell = (f: FieldDef, v: any): ReactNode => {
    if (f.fieldType === 'user_select') {
      const name = userMap[v] || (v ? String(v) : '');
      return name ? <span className="inline-flex items-center gap-1.5"><Avatar name={name} />{name}</span> : null;
    }
    if (f.fieldType === 'status' || f.fieldType === 'select') {
      const s = String(v ?? '');
      if (!s) return null;
      const colors = buildOptionColors(f.settings?.options || []);
      return <StatusPill value={s} color={colors[s] || NEUTRAL_COLOR} />;
    }
    return formatValue(f, v) || null;
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/40 animate-fade-in" />
      <div className="relative w-[26rem] max-w-[92vw] h-full bg-surface border-l border-border shadow-[var(--shadow-pop)] flex flex-col animate-slide-in-right" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-2 px-5 h-14 border-b border-border shrink-0">
          <h3 className="font-semibold text-sm">レコードのプレビュー</h3>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="閉じる"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-auto px-5 py-4">
          <dl className="divide-y divide-border">
            {fields.filter((f) => f.fieldType !== 'section').map((f) => (
              <div key={f.fieldCode} className="py-2.5">
                <dt className="text-xs text-muted">{f.label}</dt>
                <dd className="text-sm mt-0.5 break-words">{cell(f, record.dataJson?.[f.fieldCode]) || <span className="text-muted">—</span>}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex items-center gap-2 px-5 py-3 border-t border-border shrink-0">
          <Button variant="primary" className="flex-1" onClick={onOpen}>詳細を開く</Button>
          {canEdit && <Button className="flex-1" icon={<Pencil className="size-4" />} onClick={onEdit}>編集</Button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ===== 共通ヘルパー ===== */
function resolveKey(field: FieldDef | undefined, value: any, userMap: Record<string, string>): string {
  if (field?.fieldType === 'user_select') return userMap[value] || (value ? String(value) : '(未設定)');
  return groupKey(value);
}
function recordTitle(fields: FieldDef[], r: any): string {
  const tf = fields.find((f) => f.fieldType === 'text') || fields.find((f) => !['file', 'user_select', 'group_select', 'reference'].includes(f.fieldType));
  return (tf && formatValue(tf, r.dataJson?.[tf.fieldCode])) || '(無題のレコード)';
}

/** 集計パネル用の小さな指標チップ。 */
function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2 px-3 py-1.5">
      <div className="text-[10px] text-muted leading-none">{label}</div>
      <div className="text-sm font-bold tabular-nums mt-1 leading-none">{value}</div>
    </div>
  );
}

/** 進捗ダッシュボード用のKPIカード。 */
function StatCard({ icon: Icon, label, value, suffix, color }: {
  icon: LucideIcon; label: string; value: string | number; suffix?: string; color: string;
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <span className="inline-flex items-center justify-center size-10 rounded-xl shrink-0" style={{ background: softColor(color, 0.14), color }}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="text-xs text-muted truncate">{label}</div>
        <div className="text-2xl font-bold leading-tight tabular-nums">{value}{suffix && <span className="text-base font-semibold text-muted ml-0.5">{suffix}</span>}</div>
      </div>
    </div>
  );
}

/* ===== 集計・グラフパネル（グラフ + クロス集計） ===== */
function AggregatePanel({ fields, records, userMap }: { fields: FieldDef[]; records: any[]; userMap: Record<string, string> }) {
  const groupable = fields.filter((f) => !['file', 'subtable', 'section', 'location'].includes(f.fieldType));
  const numberFields = fields.filter((f) => f.fieldType === 'number' || f.fieldType === 'calc');
  const [mode, setMode] = useState<'chart' | 'crosstab'>('chart');
  const [groupBy, setGroupBy] = useState(groupable[0]?.fieldCode || '');
  const [aggregate, setAggregate] = useState<'count' | 'sum'>('count');
  const [sumField, setSumField] = useState(numberFields[0]?.fieldCode || '');
  const [chartType, setChartType] = useState<'bar' | 'pie' | 'donut' | 'line' | 'area'>('bar');
  const [rowField, setRowField] = useState(groupable[0]?.fieldCode || '');
  const [colField, setColField] = useState(groupable[1]?.fieldCode || groupable[0]?.fieldCode || '');

  const data: ChartDatum[] = useMemo(() => {
    const map = new Map<string, number>();
    const gf = fields.find((f) => f.fieldCode === groupBy);
    for (const r of records) {
      const key = resolveKey(gf, r.dataJson?.[groupBy], userMap);
      const add = aggregate === 'count' ? 1 : Number(r.dataJson?.[sumField]) || 0;
      map.set(key, (map.get(key) || 0) + add);
    }
    const arr = Array.from(map.entries()).map(([label, value]) => ({ label, value }));
    return chartType === 'line' ? arr.sort((a, b) => (a.label < b.label ? -1 : 1)) : arr.sort((a, b) => b.value - a.value);
  }, [records, groupBy, aggregate, sumField, fields, userMap, chartType]);

  const cross = useMemo(() => {
    const rf = fields.find((f) => f.fieldCode === rowField);
    const cf = fields.find((f) => f.fieldCode === colField);
    const rowKeys = new Set<string>(); const colKeys = new Set<string>();
    const cell = new Map<string, number>();
    for (const r of records) {
      const rk = resolveKey(rf, r.dataJson?.[rowField], userMap);
      const ck = resolveKey(cf, r.dataJson?.[colField], userMap);
      rowKeys.add(rk); colKeys.add(ck);
      const k = rk + '\u0000' + ck;
      cell.set(k, (cell.get(k) || 0) + 1);
    }
    return { rows: Array.from(rowKeys).sort(), cols: Array.from(colKeys).sort(), get: (r: string, c: string) => cell.get(r + '\u0000' + c) || 0 };
  }, [records, rowField, colField, fields, userMap]);

  return (
    <div className="card p-5">
      <div className="flex gap-1.5 mb-4">
        <button className={cn('btn btn-sm', mode === 'chart' && 'btn-primary')} onClick={() => setMode('chart')}>グラフ</button>
        <button className={cn('btn btn-sm', mode === 'crosstab' && 'btn-primary')} onClick={() => setMode('crosstab')}>クロス集計</button>
      </div>
      {mode === 'chart' ? (
        <>
          <div className="flex gap-4 flex-wrap mb-5">
            <Field label="分類（グループ化）">
              <select className="input w-auto" value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
                {groupable.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
              </select>
            </Field>
            <Field label="集計方法">
              <select className="input w-auto" value={aggregate} onChange={(e) => setAggregate(e.target.value as any)}>
                <option value="count">件数</option>
                <option value="sum" disabled={numberFields.length === 0}>合計</option>
              </select>
            </Field>
            {aggregate === 'sum' && (
              <Field label="合計する数値フィールド">
                <select className="input w-auto" value={sumField} onChange={(e) => setSumField(e.target.value)}>
                  {numberFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="グラフ">
              <select className="input w-auto" value={chartType} onChange={(e) => setChartType(e.target.value as any)}>
                <option value="bar">棒グラフ</option>
                <option value="pie">円グラフ</option>
                <option value="donut">ドーナツ</option>
                <option value="line">折れ線（推移）</option>
                <option value="area">エリア（推移）</option>
              </select>
            </Field>
          </div>
          {data.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <MiniStat label="分類" value={data.length.toLocaleString(getLocale())} />
              <MiniStat label="合計" value={data.reduce((s, d) => s + d.value, 0).toLocaleString(getLocale())} />
              <MiniStat label="平均" value={(Math.round((data.reduce((s, d) => s + d.value, 0) / data.length) * 10) / 10).toLocaleString(getLocale())} />
              <MiniStat label="最大" value={Math.max(...data.map((d) => d.value)).toLocaleString(getLocale())} />
            </div>
          )}
          <Chart type={chartType} data={data} valueLabel={aggregate === 'count' ? '件数' : '合計'} />
        </>
      ) : (
        <>
          <div className="flex gap-4 flex-wrap mb-5">
            <Field label="行">
              <select className="input w-auto" value={rowField} onChange={(e) => setRowField(e.target.value)}>
                {groupable.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
              </select>
            </Field>
            <Field label="列">
              <select className="input w-auto" value={colField} onChange={(e) => setColField(e.target.value)}>
                {groupable.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
              </select>
            </Field>
          </div>
          {cross.cols.length === 0 ? (
            <p className="text-sm text-muted">表示するデータがありません。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-muted border-b border-border" />
                    {cross.cols.map((c) => <th key={c} className="px-3 py-2 text-right font-semibold text-muted border-b border-border whitespace-nowrap">{c}</th>)}
                    <th className="px-3 py-2 text-right font-semibold border-b border-border">計</th>
                  </tr>
                </thead>
                <tbody>
                  {cross.rows.map((rk) => {
                    const rowTotal = cross.cols.reduce((s, c) => s + cross.get(rk, c), 0);
                    return (
                      <tr key={rk} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 font-medium whitespace-nowrap">{rk}</td>
                        {cross.cols.map((c) => { const v = cross.get(rk, c); return <td key={c} className="px-3 py-2 text-right tabular-nums">{v || ''}</td>; })}
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{rowTotal}</td>
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-border">
                    <td className="px-3 py-2 font-semibold">計</td>
                    {cross.cols.map((c) => { const colTotal = cross.rows.reduce((s, r) => s + cross.get(r, c), 0); return <td key={c} className="px-3 py-2 text-right font-semibold tabular-nums">{colTotal}</td>; })}
                    <td className="px-3 py-2 text-right font-bold tabular-nums">{records.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ===== かんばんビュー（色分け・数値サマリ・ドラッグ＆ドロップ） ===== */
function KanbanView({ fields, records, appId, onOpen, userMap, canEdit, onChangeStatus }: {
  fields: FieldDef[]; records: any[]; appId: string; onOpen: (p: string) => void; userMap: Record<string, string>;
  canEdit: boolean; onChangeStatus: (recordId: string, fieldCode: string, value: any) => void;
}) {
  const statusFields = fields.filter((f) => f.fieldType === 'status' || f.fieldType === 'select');
  const [statusCode, setStatusCode] = useState(statusFields[0]?.fieldCode || '');
  const numberFields = fields.filter((f) => f.fieldType === 'number' || f.fieldType === 'calc');
  const [metricCode, setMetricCode] = useState('');
  const sf = fields.find((f) => f.fieldCode === statusCode);
  const metricField = fields.find((f) => f.fieldCode === metricCode);
  const userField = fields.find((f) => f.fieldType === 'user_select');
  const subFields = fields
    .filter((f) => f.fieldCode !== statusCode && f.fieldCode !== metricCode && f.fieldType !== 'user_select' && !['file', 'reference', 'subtable', 'location', 'section'].includes(f.fieldType))
    .slice(0, 2);

  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  if (statusFields.length === 0) {
    return <div className="card p-8 text-center text-sm text-muted">ステータス／セレクトボックス項目がありません。かんばん表示にはステータス項目が必要です。</div>;
  }

  const options: string[] = sf?.settings?.options || [];
  const colors = buildOptionColors(options);
  const columns = [...options];
  const hasUnset = records.some((r) => !options.includes(String(r.dataJson?.[statusCode] ?? '')));
  if (hasUnset) columns.push('(未設定)');

  const inColumn = (col: string) => records.filter((r) => {
    const v = String(r.dataJson?.[statusCode] ?? '');
    return col === '(未設定)' ? !options.includes(v) : v === col;
  });
  const colSum = (items: any[]) => items.reduce((s, r) => s + (Number(r.dataJson?.[metricCode]) || 0), 0);

  const drop = (col: string) => {
    setOverCol(null);
    const id = dragId; setDragId(null);
    if (!id || !canEdit) return;
    const r = records.find((x) => x.id === id);
    const cur = String(r?.dataJson?.[statusCode] ?? '');
    const next = col === '(未設定)' ? '' : col;
    if (cur === next) return;
    onChangeStatus(id, statusCode, next);
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">分類:</span>
          <select className="input w-auto" value={statusCode} onChange={(e) => setStatusCode(e.target.value)}>
            {statusFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
          </select>
        </div>
        {numberFields.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">集計:</span>
            <select className="input w-auto" value={metricCode} onChange={(e) => setMetricCode(e.target.value)}>
              <option value="">件数のみ</option>
              {numberFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}の合計</option>)}
            </select>
          </div>
        )}
        {canEdit && <span className="text-xs text-muted">カードをドラッグして列を移動できます</span>}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {columns.map((col) => {
          const items = inColumn(col);
          const color = colors[col] || NEUTRAL_COLOR;
          const isOver = overCol === col;
          return (
            <div
              key={col}
              className={cn('w-72 shrink-0 rounded-xl border transition-colors', isOver ? 'border-primary bg-primary-soft/40' : 'border-transparent')}
              onDragOver={(e) => { if (dragId && canEdit) { e.preventDefault(); setOverCol(col); } }}
              onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
              onDrop={() => drop(col)}
            >
              <div className="flex items-center justify-between px-2 py-1.5 mb-1 rounded-lg" style={{ background: softColor(color, 0.12) }}>
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="size-2.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-sm font-semibold truncate">{col}</span>
                </span>
                <span className="text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-full" style={{ background: softColor(color, 0.18), color }}>{items.length}</span>
              </div>
              {metricField && (
                <div className="px-2 mb-1.5 text-xs text-muted tabular-nums">
                  {metricField.label}: <span className="font-semibold text-content">{colSum(items).toLocaleString(getLocale())}{metricField.settings?.unit ? ` ${metricField.settings.unit}` : ''}</span>
                </div>
              )}
              <div className="space-y-2 min-h-[60px] px-0.5 pb-1">
                {items.map((r) => {
                  const assignee = userField ? userMap[r.dataJson?.[userField.fieldCode]] : '';
                  return (
                    <div
                      key={r.id}
                      draggable={canEdit}
                      onDragStart={() => setDragId(r.id)}
                      onDragEnd={() => { setDragId(null); setOverCol(null); }}
                      onClick={() => onOpen(`/apps/${appId}/records/${r.id}`)}
                      className={cn(
                        'card w-full p-3 text-left transition-all hover:border-border-strong hover:shadow-[var(--shadow-pop)] cursor-pointer border-l-[3px] animate-pop-in',
                        dragId === r.id && 'opacity-40',
                      )}
                      style={{ borderLeftColor: color }}
                    >
                      <div className="flex items-start gap-2">
                        {canEdit && <GripVertical className="size-3.5 text-muted/60 shrink-0 mt-0.5 cursor-grab" />}
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm truncate">{recordTitle(fields, r)}</div>
                          {subFields.map((f) => {
                            const txt = formatValue(f, r.dataJson?.[f.fieldCode]);
                            return txt ? <div key={f.fieldCode} className="text-xs text-muted truncate mt-0.5">{f.label}: {txt}</div> : null;
                          })}
                          {(assignee || metricField) && (
                            <div className="flex items-center justify-between gap-2 mt-2">
                              {assignee ? <span className="flex items-center gap-1.5 text-xs text-muted min-w-0"><Avatar name={assignee} /><span className="truncate">{assignee}</span></span> : <span />}
                              {metricField && r.dataJson?.[metricCode] != null && r.dataJson?.[metricCode] !== '' && (
                                <span className="text-xs font-semibold tabular-nums shrink-0">{formatValue(metricField, r.dataJson?.[metricCode])}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div className={cn('text-xs text-muted px-1 py-6 text-center rounded-lg border border-dashed', isOver ? 'border-primary text-primary' : 'border-border')}>
                    {isOver ? 'ここにドロップ' : 'なし'}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

/* ===== カレンダービュー（ステータス色分け） ===== */
function CalendarView({ fields, records, appId, onOpen }: {
  fields: FieldDef[]; records: any[]; appId: string; onOpen: (p: string) => void;
}) {
  const dateFields = fields.filter((f) => f.fieldType === 'date' || f.fieldType === 'datetime');
  const statusFields = fields.filter((f) => f.fieldType === 'status' || f.fieldType === 'select');
  const [dateCode, setDateCode] = useState(dateFields[0]?.fieldCode || '');
  const [colorCode, setColorCode] = useState(statusFields[0]?.fieldCode || '');
  const today = new Date();
  const [cursor, setCursor] = useState({ y: today.getFullYear(), m: today.getMonth() });

  if (dateFields.length === 0) {
    return <div className="card p-8 text-center text-sm text-muted">日付／日時項目がありません。カレンダー表示には日付項目が必要です。</div>;
  }

  const colorField = fields.find((f) => f.fieldCode === colorCode);
  const colors = buildOptionColors(colorField?.settings?.options || []);
  const colorOf = (r: any) => (colorCode ? (colors[String(r.dataJson?.[colorCode] ?? '')] || NEUTRAL_COLOR) : 'var(--primary)');

  const byDay = new Map<string, any[]>();
  for (const r of records) {
    const raw = r.dataJson?.[dateCode];
    if (!raw) continue;
    const day = String(raw).slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(r);
  }

  const first = new Date(cursor.y, cursor.m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const pad = (n: number) => String(n).padStart(2, '0');
  const keyFor = (d: number) => `${cursor.y}-${pad(cursor.m + 1)}-${pad(d)}`;
  const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const prev = () => setCursor((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }));
  const next = () => setCursor((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }));
  const goToday = () => setCursor({ y: today.getFullYear(), m: today.getMonth() });
  const monthCount = cells.reduce((s: number, d) => s + (d ? (byDay.get(keyFor(d))?.length || 0) : 0), 0);

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<ChevronLeft className="size-4" />} onClick={prev} aria-label="前の月" />
          <span className="font-semibold w-28 text-center">{cursor.y}年 {cursor.m + 1}月</span>
          <Button variant="ghost" size="sm" icon={<ChevronRight className="size-4" />} onClick={next} aria-label="次の月" />
          <Button variant="ghost" size="sm" onClick={goToday}>今日</Button>
          <span className="badge badge-muted">{monthCount} 件</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">基準日:</span>
            <select className="input w-auto" value={dateCode} onChange={(e) => setDateCode(e.target.value)}>
              {dateFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
            </select>
          </div>
          {statusFields.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted">色分け:</span>
              <select className="input w-auto" value={colorCode} onChange={(e) => setColorCode(e.target.value)}>
                <option value="">なし</option>
                {statusFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
              </select>
            </div>
          )}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
        {['日', '月', '火', '水', '木', '金', '土'].map((d, i) => (
          <div key={d} className={cn('bg-surface-2 text-center text-xs font-semibold py-1.5', i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-muted')}>{d}</div>
        ))}
        {cells.map((d, i) => {
          const k = d ? keyFor(d) : '';
          const items = d ? byDay.get(k) || [] : [];
          const isToday = k === todayKey;
          return (
            <div key={i} className={cn('bg-surface min-h-[92px] p-1.5 align-top transition-colors', !d && 'bg-canvas', isToday && 'bg-primary-soft/30')}>
              {d && (
                <>
                  <div className={cn('text-xs mb-1 inline-flex items-center justify-center size-5 rounded-full', isToday ? 'bg-primary text-primary-fg font-bold' : 'text-muted')}>{d}</div>
                  <div className="space-y-0.5">
                    {items.slice(0, 4).map((r) => {
                      const c = colorOf(r);
                      return (
                        <button
                          key={r.id}
                          onClick={() => onOpen(`/apps/${appId}/records/${r.id}`)}
                          className="flex items-center gap-1 w-full text-left text-[11px] leading-tight px-1.5 py-0.5 rounded border-l-2 truncate transition-opacity hover:opacity-80"
                          style={{ background: softColor(c, 0.14), borderLeftColor: c }}
                          title={recordTitle(fields, r)}
                        >
                          <span className="truncate">{recordTitle(fields, r)}</span>
                        </button>
                      );
                    })}
                    {items.length > 4 && <div className="text-[10px] text-muted px-1">+{items.length - 4}件</div>}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      {colorCode && colorField && (colorField.settings?.options || []).length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-3">
          {(colorField.settings?.options || []).map((o: string) => (
            <span key={o} className="flex items-center gap-1.5 text-xs text-muted">
              <span className="size-2.5 rounded-[3px]" style={{ background: colors[o] }} />{o}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===== 地図ビュー ===== */
function MapTab({ fields, records, appId, onOpen }: {
  fields: FieldDef[]; records: any[]; appId: string; onOpen: (p: string) => void;
}) {
  const locFields = fields.filter((f) => f.fieldType === 'location');
  const [code, setCode] = useState(locFields[0]?.fieldCode || '');
  const locField = fields.find((f) => f.fieldCode === code);
  const [tileStyles, setTileStyles] = useState<string[]>([]);
  useEffect(() => { getAvailableTileStyles().then(setTileStyles); }, []);
  const sw = useMemo(() => buildSwitcherBasemaps(locField?.settings, tileStyles), [locField, tileStyles]);

  const markers: MapMarker[] = useMemo(() => {
    const out: MapMarker[] = [];
    for (const r of records) {
      const v = r.dataJson?.[code];
      if (!isGeoPoint(v)) continue;
      out.push({
        id: r.id,
        lat: v.lat,
        lng: v.lng,
        label: v.label || recordTitle(fields, r),
        onClick: () => onOpen(`/apps/${appId}/records/${r.id}`),
      });
    }
    return out;
  }, [records, code, fields, appId, onOpen]);

  if (locFields.length === 0) {
    return <div className="card p-8 text-center text-sm text-muted">位置（地図）項目がありません。地図表示には位置項目が必要です。</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        {locFields.length > 1 && (
          <>
            <span className="text-sm text-muted">位置項目:</span>
            <select className="input w-auto" value={code} onChange={(e) => setCode(e.target.value)}>
              {locFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
            </select>
          </>
        )}
        <span className="badge badge-muted">{markers.length} 件をプロット</span>
        {sw.activeUnavailable && (
          <span className="text-xs text-warning">地図タイルが未取得です。右上の切替でオンライン地図を選ぶか、オフラインで使うならタイルを取得してください（システム設定 → 地図）。</span>
        )}
      </div>
      <MapView
        className={locField?.settings?.height ? mapHeightClass(locField.settings) : 'h-[calc(100vh-14rem)] min-h-[520px]'}
        markers={markers}
        fitToMarkers
        zoom={mapZoom(locField?.settings)}
        basemaps={sw.list}
        activeBasemapId={sw.activeId}
      />
    </div>
  );
}

/* ===== 進捗ダッシュボード ===== */
function ProgressPanel({ app, fields, records, userMap, canRemind, appId }: {
  app: any; fields: FieldDef[]; records: any[]; userMap: Record<string, string>; canRemind: boolean; appId: string;
}) {
  const toast = useToast();
  const statusFields = fields.filter((f) => f.fieldType === 'status' || f.fieldType === 'select');
  const userFields = fields.filter((f) => f.fieldType === 'user_select');
  const proc = app?.processConfig;
  const [statusCode, setStatusCode] = useState<string>(proc?.statusField || statusFields[0]?.fieldCode || '');
  const [assigneeCode, setAssigneeCode] = useState<string>(userFields[0]?.fieldCode || '');
  const sf = fields.find((f) => f.fieldCode === statusCode);
  const options = useMemo<string[]>(() => sf?.settings?.options || [], [sf]);

  // 既定の「完了」状態: プロセス定義があれば遷移先に無い（終端）状態、無ければ最後の選択肢
  const terminalDefault = useMemo(() => {
    if (proc?.enabled && proc.statusField === statusCode && Array.isArray(proc.actions)) {
      const fromSet = new Set(proc.actions.map((a: any) => a.from));
      const term = options.filter((o) => !fromSet.has(o));
      return term.length ? term : (options.length ? [options[options.length - 1]] : []);
    }
    return options.length ? [options[options.length - 1]] : [];
  }, [proc, statusCode, options]);

  const [doneSet, setDoneSet] = useState<Set<string>>(new Set());
  useEffect(() => { setDoneSet(new Set(terminalDefault)); }, [terminalDefault]);

  const isDone = useCallback(
    (r: any) => doneSet.has(String(r.dataJson?.[statusCode] ?? '')),
    [doneSet, statusCode],
  );
  const total = records.length;
  const done = records.filter(isDone).length;
  const rate = total > 0 ? Math.round((done / total) * 100) : 0;

  const optColors = useMemo(() => buildOptionColors(options), [options]);
  const statusCounts = useMemo<ChartDatum[]>(() => {
    const m = new Map<string, number>();
    for (const r of records) { const k = groupKey(r.dataJson?.[statusCode]); m.set(k, (m.get(k) || 0) + 1); }
    const out: ChartDatum[] = [];
    for (const o of options) if (m.has(o)) { out.push({ label: o, value: m.get(o)!, color: optColors[o] }); m.delete(o); }
    for (const [label, value] of m) out.push({ label, value, color: optColors[label] || NEUTRAL_COLOR });
    return out;
  }, [records, statusCode, options, optColors]);

  // 担当者別の進捗（完了率つき）
  const byAssignee = useMemo(() => {
    if (!assigneeCode) return [];
    const m = new Map<string, { total: number; done: number }>();
    for (const r of records) {
      const uid = r.dataJson?.[assigneeCode];
      if (!uid) continue;
      const key = String(uid);
      const e = m.get(key) || { total: 0, done: 0 };
      e.total++; if (isDone(r)) e.done++;
      m.set(key, e);
    }
    return Array.from(m.entries())
      .map(([uid, v]) => ({ uid, total: v.total, done: v.done, rate: Math.round((v.done / v.total) * 100) }))
      .sort((a, b) => a.rate - b.rate || b.total - a.total);
  }, [records, assigneeCode, isDone]);
  const pendingUsers = byAssignee.filter((a) => a.rate < 100);

  const remind = async (userIds: string[]) => {
    if (userIds.length === 0) return;
    try {
      const res = await api.post('/notifications/remind', { appId, userIds });
      toast.success(`${res.sent}名に催促を送信しました`);
    } catch (e: any) { toast.error(e.message); }
  };

  if (statusFields.length === 0) {
    return <div className="card p-8 text-center text-sm text-muted">ステータス項目がありません。進捗管理にはステータス／セレクトボックス項目が必要です。</div>;
  }

  const C = { primary: '#6366f1', success: '#16a34a', warning: '#d97706' };

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex gap-4 flex-wrap mb-4">
          <Field label="ステータス項目">
            <select className="input w-auto" value={statusCode} onChange={(e) => setStatusCode(e.target.value)}>
              {statusFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="担当者項目">
            <select className="input w-auto" value={assigneeCode} onChange={(e) => setAssigneeCode(e.target.value)}>
              <option value="">（なし）</option>
              {userFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
            </select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={ListChecks} label="総レコード数" value={total.toLocaleString(getLocale())} color={C.primary} />
          <StatCard icon={CheckCircle2} label="完了" value={done.toLocaleString(getLocale())} color={C.success} />
          <StatCard icon={CircleDashed} label="未完了" value={(total - done).toLocaleString(getLocale())} color={C.warning} />
          <StatCard icon={Target} label="完了率" value={rate} suffix="%" color={C.primary} />
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-muted mb-2">「完了」とみなすステータス</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {options.map((o) => (
              <label key={o} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  className="accent-[var(--primary)]"
                  checked={doneSet.has(o)}
                  onChange={(e) => setDoneSet((s) => {
                    const next = new Set(s);
                    if (e.target.checked) next.add(o);
                    else next.delete(o);
                    return next;
                  })}
                />
                {o}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold">ステータス分布</h4>
          <span className="text-xs text-muted">全 {total} 件</span>
        </div>
        {total === 0 ? (
          <p className="text-sm text-muted">表示するデータがありません。</p>
        ) : (
          <>
            <div className="flex h-4 w-full rounded-full overflow-hidden bg-surface-2">
              {statusCounts.map((s) => (
                <div
                  key={s.label}
                  className="h-full first:rounded-l-full last:rounded-r-full transition-all"
                  style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
                  title={`${s.label}: ${s.value}件（${Math.round((s.value / total) * 100)}%）`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
              {statusCounts.map((s) => (
                <span key={s.label} className="flex items-center gap-1.5 text-xs">
                  <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
                  <span className="text-content">{s.label}</span>
                  <span className="text-muted tabular-nums">{s.value}（{Math.round((s.value / total) * 100)}%）</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2 items-start">
        <div className="card p-5">
          <h4 className="font-semibold mb-3">ステータス別件数</h4>
          <Chart type="bar" data={statusCounts} valueLabel="件数" />
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold">担当者別の進捗</h4>
            {canRemind && pendingUsers.length > 0 && (
              <Button size="sm" icon={<Megaphone className="size-4" />} onClick={() => remind(pendingUsers.map((p) => p.uid))}>
                未完了者に催促
              </Button>
            )}
          </div>
          {!assigneeCode ? (
            <p className="text-sm text-muted">担当者項目を選択してください。</p>
          ) : byAssignee.length === 0 ? (
            <p className="text-sm text-muted">担当者が設定されたレコードがありません。</p>
          ) : (
            <div className="space-y-3">
              {byAssignee.map((p) => (
                <div key={p.uid} className="flex items-center gap-3">
                  <Avatar name={userMap[p.uid] || p.uid} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-sm truncate">{userMap[p.uid] || p.uid.slice(0, 8)}</span>
                      <span className="text-xs text-muted tabular-nums shrink-0">{p.done}/{p.total}・{p.rate}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${p.rate}%`, background: p.rate === 100 ? C.success : C.primary }} />
                    </div>
                  </div>
                  {canRemind && p.rate < 100 && (
                    <Button variant="ghost" size="sm" icon={<Megaphone className="size-4" />} onClick={() => remind([p.uid])} aria-label="催促" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ===== 選択レコードの一括印刷ボタン ===== */
function BulkPrintButton({ appId, ids, count, templates }: {
  appId: string; ids: string[]; count: number; templates: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const openPrint = (templateId: string) => {
    setOpen(false);
    if (ids.length === 0) { toast.info('印刷するレコードを選択してください'); return; }
    const url = `/apps/${appId}/print/${templateId}?ids=${encodeURIComponent(ids.join(','))}`;
    window.open(url, '_blank', 'noopener');
  };

  if (templates.length === 1) {
    return <Button icon={<Printer className="size-4" />} onClick={() => openPrint(templates[0].id)}>選択した{count}件を印刷</Button>;
  }

  return (
    <div className="relative">
      <Button icon={<Printer className="size-4" />} onClick={() => setOpen((v) => !v)}>
        選択した{count}件を印刷 <ChevronDown className="size-3.5 -mr-1" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 min-w-48 rounded-lg border border-border bg-surface py-1 shadow-lg">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => openPrint(t.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <Printer className="size-3.5 text-muted shrink-0" />
                <span className="truncate">{t.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ===== 一括配布モーダル ===== */
function BulkDistributeModal({ appId, fields, users, onClose, onDone }: {
  appId: string; fields: FieldDef[]; users: { id: string; loginId: string }[]; onClose: () => void; onDone: () => void;
}) {
  const toast = useToast();
  const userFields = fields.filter((f) => f.fieldType === 'user_select');
  const baseFields = fields.filter((f) => !['user_select', 'auto_number', 'calc', 'file', 'subtable', 'section', 'location'].includes(f.fieldType));
  const [assigneeField, setAssigneeField] = useState(userFields[0]?.fieldCode || '');
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [baseData, setBaseData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);

  const toggleUser = (id: string) => setSelectedUsers((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const submit = async () => {
    if (!assigneeField || selectedUsers.size === 0) { toast.error('担当者項目と配布先を選択してください'); return; }
    setSubmitting(true);
    try {
      const res = await api.post('/records/bulk-distribute', {
        appId, assigneeField, userIds: Array.from(selectedUsers), baseData,
      });
      toast.success(`${res.created}件を配布しました`);
      onDone();
    } catch (e: any) {
      toast.error(e.message || '配布に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="一括配布（担当者ごとにレコード作成）"
      size="lg"
      footer={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button variant="primary" icon={<UserPlus className="size-4" />} onClick={submit} loading={submitting} disabled={selectedUsers.size === 0}>
            {selectedUsers.size}名に配布
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="担当者を設定する項目" hint="選んだ人ごとに、この項目を本人に設定したレコードを1件ずつ作成します。">
          <select className="input" value={assigneeField} onChange={(e) => setAssigneeField(e.target.value)}>
            {userFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
          </select>
        </Field>

        <Field label={`配布先（${selectedUsers.size}名選択中）`}>
          <div className="max-h-48 overflow-auto rounded-lg border border-border divide-y divide-border">
            {users.map((u) => (
              <label key={u.id} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface-2 cursor-pointer">
                <input type="checkbox" className="accent-[var(--primary)]" checked={selectedUsers.has(u.id)} onChange={() => toggleUser(u.id)} />
                {u.loginId}
              </label>
            ))}
          </div>
        </Field>

        {baseFields.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted mb-2">共通の初期値（任意・全レコードに設定）</div>
            <div className="space-y-3">
              {baseFields.map((f) => (
                <div key={f.fieldCode}>
                  <label className="label">{f.label}</label>
                  <FieldInput
                    field={f}
                    value={baseData[f.fieldCode]}
                    onChange={(v) => setBaseData((d) => ({ ...d, [f.fieldCode]: v }))}
                    users={users}
                    groups={[]}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
