import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { Modal } from '../ui/Modal';
import { Field } from '../ui/Field';
import {
  CHART_KIND_LABELS,
  FILTER_OPS,
  KPI_MODE_LABELS,
  MAP_HEIGHT_LABELS,
  METRIC_LABELS,
  SIZE_LABELS,
  WIDGET_TYPE_LABELS,
  defaultWidget,
  isGroupable,
  isNumeric,
  type ChartKind,
  type KpiMode,
  type MapHeight,
  type Metric,
  type Widget,
  type WidgetSize,
  type WidgetType,
} from '../../lib/dashboard';

interface FieldDef {
  fieldCode: string;
  fieldType: string;
  label: string;
  settings?: any;
}
interface AppLite {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  initial: Widget;
  apps: AppLite[];
  onSave: (w: Widget) => void;
}

export function WidgetEditor({ open, onClose, initial, apps, onSave }: Props) {
  const [w, setW] = useState<Widget>(initial);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);

  useEffect(() => {
    if (open) setW(initial);
  }, [open, initial]);

  // 選択アプリのフィールド定義を取得
  useEffect(() => {
    if (!open || w.type === 'mytasks' || !w.appId) {
      setFields([]);
      return;
    }
    let alive = true;
    setLoadingFields(true);
    api.get(`/fields?appId=${w.appId}`)
      .then((rows: FieldDef[]) => { if (alive) setFields(rows || []); })
      .catch(() => { if (alive) setFields([]); })
      .finally(() => { if (alive) setLoadingFields(false); });
    return () => { alive = false; };
  }, [open, w.appId, w.type]);

  const set = (patch: Partial<Widget>) => setW((p) => ({ ...p, ...patch }));
  const changeType = (type: WidgetType) => setW((p) => ({ ...defaultWidget(type), id: p.id, title: p.title, appId: p.appId }));

  const groupable = fields.filter((f) => isGroupable(f.fieldType));
  const numeric = fields.filter((f) => isNumeric(f.fieldType));
  const needApp = w.type !== 'mytasks';
  const canSave = w.type === 'mytasks' || !!w.appId;

  const save = () => {
    if (!canSave) return;
    onSave(w);
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="ウィジェットの設定"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>キャンセル</button>
          <button className="btn btn-primary" onClick={save} disabled={!canSave}>保存</button>
        </>
      }
    >
      <div className="space-y-4">
        {/* 種類 */}
        <Field label="種類">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(WIDGET_TYPE_LABELS) as WidgetType[]).map((t) => (
              <button
                key={t}
                onClick={() => changeType(t)}
                className={`rounded-lg border px-3 py-2 text-sm transition-colors ${
                  w.type === t ? 'border-primary bg-primary-soft text-primary-soft-fg font-medium' : 'border-border hover:bg-surface-2'
                }`}
              >
                {WIDGET_TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="タイトル（任意）">
            <input className="input" value={w.title || ''} onChange={(e) => set({ title: e.target.value })} placeholder="未入力なら自動表示" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="サイズ">
              <select className="input" value={w.size || 'md'} onChange={(e) => set({ size: e.target.value as WidgetSize })}>
                {(Object.keys(SIZE_LABELS) as WidgetSize[]).map((s) => <option key={s} value={s}>{SIZE_LABELS[s]}</option>)}
              </select>
            </Field>
            <Field label="高さ">
              <select
                className="input"
                value={w.height || ''}
                onChange={(e) => set({ height: (e.target.value || undefined) as MapHeight | undefined })}
              >
                {w.type !== 'map' && <option value="">自動</option>}
                {(Object.keys(MAP_HEIGHT_LABELS) as MapHeight[]).map((h) => <option key={h} value={h}>{MAP_HEIGHT_LABELS[h]}</option>)}
              </select>
            </Field>
          </div>
        </div>

        {w.type === 'mytasks' && (
          <p className="text-sm text-muted">あなたが担当に設定された、プロセス管理アプリの未完了レコードを横断表示します。設定項目はありません。</p>
        )}

        {needApp && (
          <Field label="対象アプリ" required>
            <select className="input" value={w.appId || ''} onChange={(e) => set({ appId: e.target.value, groupField: undefined, valueField: undefined, columns: undefined, sortField: undefined, filters: [] })}>
              <option value="">選択してください</option>
              {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        )}

        {needApp && w.appId && (
          loadingFields ? (
            <p className="text-sm text-muted">項目を読み込み中…</p>
          ) : (
            <>
              {/* グラフ設定 */}
              {w.type === 'chart' && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="グラフの種類">
                    <select className="input" value={w.chartType || 'bar'} onChange={(e) => set({ chartType: e.target.value as ChartKind })}>
                      {(Object.keys(CHART_KIND_LABELS) as ChartKind[]).map((k) => <option key={k} value={k}>{CHART_KIND_LABELS[k]}</option>)}
                    </select>
                  </Field>
                  <Field label="分類（集計の軸）">
                    <select className="input" value={w.groupField || ''} onChange={(e) => set({ groupField: e.target.value })}>
                      <option value="">選択してください</option>
                      {groupable.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
                    </select>
                  </Field>
                  <Field label="集計方法">
                    <select className="input" value={w.metric || 'count'} onChange={(e) => set({ metric: e.target.value as Metric })}>
                      {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
                    </select>
                  </Field>
                  {w.metric && w.metric !== 'count' && (
                    <Field label="対象の数値項目">
                      <select className="input" value={w.valueField || ''} onChange={(e) => set({ valueField: e.target.value })}>
                        <option value="">選択してください</option>
                        {numeric.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
                      </select>
                    </Field>
                  )}
                </div>
              )}

              {/* KPI設定 */}
              {w.type === 'kpi' && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <Field label="指標">
                    <select className="input" value={w.kpiMode || 'count'} onChange={(e) => set({ kpiMode: e.target.value as KpiMode })}>
                      {(Object.keys(KPI_MODE_LABELS) as KpiMode[]).map((m) => <option key={m} value={m}>{KPI_MODE_LABELS[m]}</option>)}
                    </select>
                  </Field>
                  {(w.kpiMode === 'sum' || w.kpiMode === 'avg') && (
                    <Field label="対象の数値項目">
                      <select className="input" value={w.valueField || ''} onChange={(e) => set({ valueField: e.target.value })}>
                        <option value="">選択してください</option>
                        {numeric.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
                      </select>
                    </Field>
                  )}
                  {(w.kpiMode === 'open' || w.kpiMode === 'rate') && (
                    <p className="text-xs text-muted sm:col-span-2">完了率・未完了件数はプロセス管理（ワークフロー）が設定されたアプリでのみ算出できます。</p>
                  )}
                </div>
              )}

              {/* レコード一覧設定 */}
              {w.type === 'list' && (
                <>
                  <Field label="表示する列（最大6つ）">
                    <div className="max-h-44 overflow-auto rounded-lg border border-border p-2 grid grid-cols-2 gap-1">
                      {fields.filter((f) => f.fieldType !== 'section').map((f) => {
                        const checked = (w.columns || []).includes(f.fieldCode);
                        return (
                          <label key={f.fieldCode} className="flex items-center gap-2 text-sm px-1.5 py-1 rounded hover:bg-surface-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                const cur = w.columns || [];
                                if (e.target.checked) { if (cur.length < 6) set({ columns: [...cur, f.fieldCode] }); }
                                else set({ columns: cur.filter((c) => c !== f.fieldCode) });
                              }}
                            />
                            <span className="truncate">{f.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </Field>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <Field label="並べ替え項目">
                      <select className="input" value={w.sortField || ''} onChange={(e) => set({ sortField: e.target.value })}>
                        <option value="">既定（更新順）</option>
                        {fields.filter((f) => isGroupable(f.fieldType) || isNumeric(f.fieldType)).map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
                      </select>
                    </Field>
                    <Field label="並び順">
                      <select className="input" value={w.sortDir || 'desc'} onChange={(e) => set({ sortDir: e.target.value as 'asc' | 'desc' })}>
                        <option value="desc">降順</option>
                        <option value="asc">昇順</option>
                      </select>
                    </Field>
                    <Field label="表示件数">
                      <input type="number" min={1} max={50} className="input" value={w.limit ?? 5} onChange={(e) => set({ limit: Math.min(50, Math.max(1, Number(e.target.value) || 5)) })} />
                    </Field>
                  </div>
                </>
              )}

              {/* 地図設定 */}
              {w.type === 'map' && (() => {
                const locs = fields.filter((f) => f.fieldType === 'location');
                if (locs.length === 0) {
                  return <p className="text-sm text-warning">このアプリには位置情報の項目がありません。位置情報（location）項目を持つアプリを選択してください。</p>;
                }
                return (
                  <Field label="表示する位置情報の項目">
                    <select className="input" value={w.groupField || ''} onChange={(e) => set({ groupField: e.target.value })}>
                      <option value="">（先頭の位置情報項目）</option>
                      {locs.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
                    </select>
                  </Field>
                );
              })()}

              {/* 絞込（グラフ/KPI/一覧/地図 共通） */}
              {w.type !== 'mytasks' && (
                <FilterEditor fields={fields} value={w.filters || []} onChange={(filters) => set({ filters })} />
              )}
            </>
          )
        )}
      </div>
    </Modal>
  );
}

function FilterEditor({ fields, value, onChange }: { fields: FieldDef[]; value: { field: string; op: string; value?: string }[]; onChange: (f: any[]) => void }) {
  const usable = fields.filter((f) => f.fieldType !== 'section' && f.fieldType !== 'subtable' && f.fieldType !== 'file');
  const add = () => onChange([...value, { field: usable[0]?.fieldCode || '', op: 'eq', value: '' }]);
  const upd = (i: number, patch: any) => onChange(value.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const del = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  const noValue = (op: string) => op === 'empty' || op === 'notempty';
  return (
    <Field label="絞込条件（任意・すべてに一致）">
      <div className="space-y-2">
        {value.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <select className="input flex-1 min-w-0" value={r.field} onChange={(e) => upd(i, { field: e.target.value })}>
              {usable.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
            </select>
            <select className="input w-24 shrink-0" value={r.op} onChange={(e) => upd(i, { op: e.target.value })}>
              {FILTER_OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
            </select>
            {!noValue(r.op) && (
              <input className="input w-32 shrink-0" value={r.value || ''} onChange={(e) => upd(i, { value: e.target.value })} placeholder="値" />
            )}
            <button className="btn btn-ghost btn-icon btn-sm shrink-0 text-danger" onClick={() => del(i)} aria-label="削除"><Trash2 className="size-4" /></button>
          </div>
        ))}
        <button className="btn btn-ghost btn-sm gap-1" onClick={add}><Plus className="size-4" />条件を追加</button>
      </div>
    </Field>
  );
}
