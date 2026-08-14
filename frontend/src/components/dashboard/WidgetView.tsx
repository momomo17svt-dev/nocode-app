import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ChevronRight, Inbox } from 'lucide-react';
import { Chart, type ChartDatum } from '../Chart';
import { MapView, type MapMarker } from '../MapView';
import { StatusPill } from '../ui/StatusPill';
import { Avatar } from '../ui/Avatar';
import { Skeleton } from '../ui/Skeleton';
import { MAP_HEIGHT_CLASS, WIDGET_TYPE_LABELS, widgetHeight, type Widget } from '../../lib/dashboard';

interface Props {
  widget: Widget;
  data: any;
  loading?: boolean;
}

export function WidgetView({ widget, data, loading }: Props) {
  const navigate = useNavigate();
  const title = widget.title?.trim() || autoTitle(widget, data);
  const h = widgetHeight(widget);

  return (
    <div className={`card flex flex-col p-4 min-w-0 ${h ? MAP_HEIGHT_CLASS[h] : 'h-full'}`}>
      <div className="flex items-center gap-2 mb-2 shrink-0">
        <h3 className="text-sm font-semibold truncate">{title}</h3>
        {data?.appName && <span className="badge badge-muted shrink-0 truncate max-w-[8rem]">{data.appName}</span>}
        <span className="text-[10px] text-muted ml-auto shrink-0">{WIDGET_TYPE_LABELS[widget.type]}</span>
      </div>

      <div className={`flex-1 min-w-0 ${h ? 'overflow-auto' : ''}`}>
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : data?.error ? (
          <Notice icon={<AlertCircle className="size-4" />} text={data.error} />
        ) : widget.type === 'chart' ? (
          <ChartBody data={data} />
        ) : widget.type === 'kpi' ? (
          <KpiBody data={data} />
        ) : widget.type === 'list' ? (
          <ListBody data={data} onOpen={(id) => navigate(`/apps/${data.appId}/records/${id}`)} />
        ) : widget.type === 'map' ? (
          <MapBody data={data} onOpen={(id) => navigate(`/apps/${data.appId}/records/${id}`)} />
        ) : (
          <TasksBody data={data} onOpen={(appId, id) => navigate(`/apps/${appId}/records/${id}`)} />
        )}
      </div>
    </div>
  );
}

function autoTitle(widget: Widget, data: any): string {
  if (widget.type === 'chart') return data?.valueLabel || 'グラフ';
  if (widget.type === 'kpi') return data?.sub || 'KPI';
  if (widget.type === 'list') return data?.appName || 'レコード一覧';
  if (widget.type === 'map') return data?.appName || '地図';
  return '自分のタスク';
}

function Notice({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="h-full min-h-24 grid place-items-center text-center text-sm text-muted px-2">
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-muted">{icon}</span>
        <span>{text}</span>
      </div>
    </div>
  );
}

function ChartBody({ data }: { data: any }) {
  const arr: ChartDatum[] = data?.data || [];
  if (arr.length === 0) return <Notice icon={<Inbox className="size-5" />} text="表示するデータがありません。" />;
  return <Chart type={data.chartType || 'bar'} data={arr} valueLabel={data.valueLabel} />;
}

function KpiBody({ data }: { data: any }) {
  const gauge = typeof data?.gauge === 'number' ? data.gauge : null;
  return (
    <div className="h-full flex flex-col justify-center py-2">
      <div className="flex items-end gap-1.5">
        <span className={`text-4xl font-bold leading-none tabular-nums ${data?.accent ? 'text-warning' : ''}`}>
          {typeof data?.value === 'number' ? data.value.toLocaleString('ja-JP') : '—'}
        </span>
        {data?.suffix && <span className="text-sm text-muted font-medium mb-0.5">{data.suffix}</span>}
      </div>
      {data?.sub && <div className="text-xs text-muted mt-2">{data.sub}</div>}
      {gauge !== null && (
        <div className="mt-2 h-2 rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${Math.min(100, Math.max(0, gauge))}%`, background: gauge >= 100 ? 'var(--success)' : 'var(--primary)' }}
          />
        </div>
      )}
    </div>
  );
}

function ListBody({ data, onOpen }: { data: any; onOpen: (id: string) => void }) {
  const cols: { code: string; label: string; fieldType: string; colorMap?: Record<string, string> }[] = data?.columns || [];
  const rows: { id: string; cells: Record<string, string> }[] = data?.rows || [];
  if (rows.length === 0) return <Notice icon={<Inbox className="size-5" />} text="該当するレコードがありません。" />;
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted border-b border-border">
            {cols.map((c) => (
              <th key={c.code} className="font-medium px-1.5 py-1.5 whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-b border-border/60 last:border-0 cursor-pointer hover:bg-surface-2 transition-colors"
              onClick={() => onOpen(r.id)}
            >
              {cols.map((c) => (
                <td key={c.code} className="px-1.5 py-1.5 align-middle">
                  <Cell type={c.fieldType} text={r.cells[c.code] || ''} color={c.colorMap?.[r.cells[c.code]]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {typeof data?.total === 'number' && data.total > rows.length && (
        <div className="text-[11px] text-muted mt-1.5 px-1.5">全 {data.total.toLocaleString('ja-JP')} 件中 {rows.length} 件を表示</div>
      )}
    </div>
  );
}

function MapBody({ data, onOpen }: { data: any; onOpen: (id: string) => void }) {
  const markers: MapMarker[] = (data?.markers || []).map((m: any) => ({
    id: m.id,
    lat: m.lat,
    lng: m.lng,
    label: m.label,
    onClick: () => onOpen(m.id),
  }));
  if (markers.length === 0) {
    return <Notice icon={<Inbox className="size-5" />} text="地図に表示できる位置データがありません。" />;
  }
  // 地図はカードの高さに追従して領域を満たす（地図ウィジェットは常に高さを持つ）。
  return (
    <div className="h-full flex flex-col gap-1.5">
      <MapView markers={markers} fitToMarkers center={data?.center} zoom={data?.zoom} className="flex-1 min-h-0" />
      <div className="text-[11px] text-muted px-0.5 shrink-0">{markers.length.toLocaleString('ja-JP')} 件をピン表示（クリックで開く）</div>
    </div>
  );
}

function Cell({ type, text, color }: { type: string; text: string; color?: string }) {
  if (!text) return <span className="text-muted">—</span>;
  if ((type === 'status' || type === 'select' || type === 'radio') && color) {
    return <StatusPill value={text} color={color} />;
  }
  if (type === 'user_select') {
    return (
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <Avatar name={text} />
        <span className="truncate">{text}</span>
      </span>
    );
  }
  if (type === 'number' || type === 'calc') return <span className="tabular-nums whitespace-nowrap">{text}</span>;
  return <span className="truncate inline-block max-w-[14rem] align-bottom">{text}</span>;
}

function TasksBody({ data, onOpen }: { data: any; onOpen: (appId: string, id: string) => void }) {
  const tasks: any[] = data?.tasks || [];
  if (tasks.length === 0) {
    return <Notice icon={<CheckCircle2 className="size-5 text-success" />} text="未完了のタスクはありません。" />;
  }
  return (
    <div className="space-y-1.5">
      {tasks.map((t) => (
        <button
          key={t.recordId}
          onClick={() => onOpen(t.appId, t.recordId)}
          className="group w-full text-left flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 hover:border-border-strong hover:bg-surface-2 transition-colors"
        >
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-muted truncate">{t.appName}</div>
            <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">{t.title}</div>
          </div>
          {t.status && <span className="shrink-0"><StatusPill value={t.status} color={t.color} /></span>}
          <ChevronRight className="size-4 text-muted shrink-0" />
        </button>
      ))}
      {typeof data?.total === 'number' && data.total > tasks.length && (
        <div className="text-[11px] text-muted px-1">ほか {data.total - tasks.length} 件</div>
      )}
    </div>
  );
}
