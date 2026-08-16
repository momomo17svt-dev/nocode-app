import { useId, useRef, useState, type ReactNode } from 'react';
import { paletteColor } from '../lib/colors';
import { getLocale } from '../lib/i18n';

export interface ChartDatum {
  label: string;
  value: number;
  /** 任意。指定すればこの色で描画（ステータス色など）。未指定はパレット自動割当。 */
  color?: string;
}

export type ChartType = 'bar' | 'pie' | 'donut' | 'line' | 'area';

/** 外部ライブラリ不使用のSVGグラフ。棒/円/ドーナツ/折れ線/エリア。ホバーで値ツールチップ。 */
export function Chart({ type, data, valueLabel }: { type: ChartType; data: ChartDatum[]; valueLabel?: string }) {
  if (data.length === 0) return <p className="text-sm text-muted">表示するデータがありません。</p>;
  if (type === 'line' || type === 'area') return <LineChart data={data} valueLabel={valueLabel} area={type === 'area'} />;
  if (type === 'pie' || type === 'donut') return <PieChart data={data} valueLabel={valueLabel} donut={type === 'donut'} />;
  return <BarChart data={data} valueLabel={valueLabel} />;
}

const fmt = (n: number) => n.toLocaleString(getLocale());

/* ===== ホバーツールチップ ===== */
function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; node: ReactNode } | null>(null);
  const move = (e: { clientX: number; clientY: number }, node: ReactNode) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, node });
  };
  const hide = () => setTip(null);
  const overlay = tip && (
    <div
      className="pointer-events-none absolute z-20 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-[var(--shadow-pop)] whitespace-nowrap animate-fade-in"
      style={{ left: tip.x, top: tip.y, transform: 'translate(-50%, calc(-100% - 12px))' }}
    >
      {tip.node}
    </div>
  );
  return { ref, move, hide, overlay };
}

function TipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block size-2.5 rounded-[3px]" style={{ background: color }} />
      <span className="font-medium text-content">{label}</span>
      <span className="text-muted tabular-nums">{value}</span>
    </span>
  );
}

/* ===== 棒グラフ（横棒・トラック背景・グリッド・平均線） ===== */
function BarChart({ data, valueLabel }: { data: ChartDatum[]; valueLabel?: string }) {
  const { ref, move, hide, overlay } = useTip();
  const max = Math.max(...data.map((d) => d.value), 1);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const avg = total / data.length;
  const barH = 26, gap = 12, labelW = 140, chartW = 340, padR = 88, top = 6, bottom = 24;
  const height = top + data.length * (barH + gap) + bottom;
  const vbW = labelW + chartW + padR;
  const ticks = 4;
  const avgX = labelW + (avg / max) * chartW;
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-muted mb-1.5">
        <span>{valueLabel}</span>
        {data.length > 1 && (
          <span className="flex items-center gap-1">
            <svg width="16" height="8"><line x1="0" y1="4" x2="16" y2="4" stroke="var(--warning)" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
            平均 {fmt(Math.round(avg * 10) / 10)}
          </span>
        )}
      </div>
      <div className="relative" ref={ref}>
        <svg width="100%" viewBox={`0 0 ${vbW} ${height}`} style={{ maxWidth: 720 }} onMouseLeave={hide}>
          {Array.from({ length: ticks + 1 }).map((_, i) => {
            const gx = labelW + (chartW / ticks) * i;
            return (
              <g key={i}>
                <line x1={gx} y1={top} x2={gx} y2={height - bottom} stroke="var(--border)" strokeWidth="1" strokeDasharray={i === 0 ? undefined : '3 4'} />
                <text x={gx} y={height - bottom + 15} textAnchor="middle" fontSize="10" className="fill-muted">{fmt(Math.round((max / ticks) * i))}</text>
              </g>
            );
          })}
          {data.map((d, i) => {
            const y = top + i * (barH + gap);
            const w = Math.max(2, (d.value / max) * chartW);
            const color = d.color || paletteColor(i);
            const pct = Math.round((d.value / total) * 100);
            return (
              <g key={i} onMouseMove={(e) => move(e, <TipRow color={color} label={d.label} value={`${fmt(d.value)}（${pct}%）`} />)} className="cursor-default">
                <rect x={0} y={y} width={vbW} height={barH} fill="transparent" />
                <text x={labelW - 10} y={y + barH / 2 + 4} textAnchor="end" fontSize="12.5" className="fill-muted">{truncate(d.label, 12)}</text>
                <rect x={labelW} y={y} width={chartW} height={barH} rx="6" fill="var(--surface-2)" />
                <rect x={labelW} y={y} width={w} height={barH} rx="6" fill={color}
                  className="animate-chart-grow-x" style={{ transformBox: 'fill-box', transformOrigin: 'left center', animationDelay: `${i * 40}ms` }} />
                <text x={labelW + w + 8} y={y + barH / 2 + 4} fontSize="12.5" fontWeight="600" className="fill-content">{fmt(d.value)}</text>
              </g>
            );
          })}
          {data.length > 1 && <line x1={avgX} y1={top} x2={avgX} y2={height - bottom} stroke="var(--warning)" strokeWidth="1.5" strokeDasharray="4 3" />}
        </svg>
        {overlay}
      </div>
    </div>
  );
}

/* ===== 円／ドーナツグラフ ===== */
function PieChart({ data, valueLabel, donut }: { data: ChartDatum[]; valueLabel?: string; donut?: boolean }) {
  const { ref, move, hide, overlay } = useTip();
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const cx = 120, cy = 120, r = 104, rInner = donut ? 60 : 0;
  const cumulative = data.reduce<number[]>((values, item) => {
    values.push((values.at(-1) ?? 0) + item.value);
    return values;
  }, []);
  const slices = data.map((d, i) => {
    const frac = d.value / total;
    const previous = i === 0 ? 0 : cumulative[i - 1];
    const a0 = -Math.PI / 2 + (previous / total) * Math.PI * 2;
    const a1 = -Math.PI / 2 + (cumulative[i] / total) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    const large = frac > 0.5 ? 1 : 0;
    const color = d.color || paletteColor(i);
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    let path: string;
    if (donut) {
      const xi0 = cx + rInner * Math.cos(a0), yi0 = cy + rInner * Math.sin(a0);
      const xi1 = cx + rInner * Math.cos(a1), yi1 = cy + rInner * Math.sin(a1);
      path = `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} L ${xi1.toFixed(2)} ${yi1.toFixed(2)} A ${rInner} ${rInner} 0 ${large} 0 ${xi0.toFixed(2)} ${yi0.toFixed(2)} Z`;
    } else {
      path = `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`;
    }
    return { path, color, d, pct: Math.round(frac * 100), frac, mid };
  });
  const labelR = donut ? (r + rInner) / 2 : r * 0.64;
  return (
    <div className="relative flex items-center gap-6 flex-wrap" ref={ref}>
      <svg width="240" height="240" viewBox="0 0 240 240" className="shrink-0 animate-fade-in" onMouseLeave={() => { hide(); setActive(null); }}>
        {slices.map((s, i) => {
          const popped = active === i;
          const dx = popped ? Math.cos(s.mid) * 6 : 0, dy = popped ? Math.sin(s.mid) * 6 : 0;
          return (
            <path key={i} d={s.path} fill={s.color} stroke="var(--surface)" strokeWidth="2"
              transform={`translate(${dx.toFixed(2)} ${dy.toFixed(2)})`}
              className="transition-transform cursor-default"
              style={{ opacity: active === null || popped ? 1 : 0.5 }}
              onMouseMove={(e) => { setActive(i); move(e, <TipRow color={s.color} label={s.d.label} value={`${fmt(s.d.value)}（${s.pct}%）`} />); }} />
          );
        })}
        {slices.map((s, i) => s.frac >= 0.07 ? (
          <text key={i} x={cx + labelR * Math.cos(s.mid)} y={cy + labelR * Math.sin(s.mid) + 4}
            textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" className="pointer-events-none select-none">{s.pct}%</text>
        ) : null)}
        {donut && (
          <>
            <text x={cx} y={cy - 2} textAnchor="middle" fontSize="26" fontWeight="800" className="fill-content">{fmt(total)}</text>
            <text x={cx} y={cy + 17} textAnchor="middle" fontSize="11" className="fill-muted">{valueLabel || '合計'}</text>
          </>
        )}
      </svg>
      <div className="min-w-44 flex-1">
        {valueLabel && <div className="text-xs text-muted mb-1.5">{valueLabel}</div>}
        {slices.map((s, i) => (
          <div key={i} className="flex items-center justify-between gap-2 py-1 text-sm cursor-default rounded px-1.5 -mx-1.5 transition-colors hover:bg-surface-2"
            style={{ opacity: active === null || active === i ? 1 : 0.5 }}
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="inline-block size-3 rounded-[3px] shrink-0" style={{ background: s.color }} />
              <span className="truncate">{truncate(s.d.label, 16)}</span>
            </span>
            <span className="text-muted tabular-nums shrink-0">{fmt(s.d.value)}（{s.pct}%）</span>
          </div>
        ))}
      </div>
      {overlay}
    </div>
  );
}

/* ===== 折れ線／エリアグラフ ===== */
function LineChart({ data, valueLabel, area }: { data: ChartDatum[]; valueLabel?: string; area?: boolean }) {
  const { ref, move, hide, overlay } = useTip();
  const [active, setActive] = useState<number | null>(null);
  const gid = useId().replace(/:/g, '');
  const max = Math.max(...data.map((d) => d.value), 1);
  const w = 660, h = 260, padL = 46, padB = 30, padT = 14, padR = 14;
  const innerW = w - padL - padR, innerH = h - padT - padB;
  const n = data.length;
  const baseY = padT + innerH;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const areaPts = `${x(0).toFixed(1)},${baseY} ${pts} ${x(n - 1).toFixed(1)},${baseY}`;
  const ticks = 4;
  return (
    <div>
      {valueLabel && <div className="text-xs text-muted mb-1.5">{valueLabel}</div>}
      <div className="relative" ref={ref}>
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ maxWidth: 760 }} onMouseLeave={() => { hide(); setActive(null); }}>
          <defs>
            <linearGradient id={`g-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
            </linearGradient>
          </defs>
          {Array.from({ length: ticks + 1 }).map((_, i) => {
            const val = Math.round((max / ticks) * i);
            const yy = y(val);
            return (
              <g key={i}>
                <line x1={padL} y1={yy} x2={w - padR} y2={yy} stroke="var(--border)" strokeWidth="1" strokeDasharray={i === 0 ? undefined : '3 4'} />
                <text x={padL - 8} y={yy + 4} textAnchor="end" fontSize="10" className="fill-muted">{fmt(val)}</text>
              </g>
            );
          })}
          {area && n > 1 && <polygon points={areaPts} fill={`url(#g-${gid})`} />}
          {n > 1 && <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" pathLength={1} className="animate-chart-draw" />}
          {active !== null && <line x1={x(active)} y1={padT} x2={x(active)} y2={baseY} stroke="var(--primary)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />}
          {data.map((d, i) => (
            <g key={i}>
              {(n <= 14 || i % Math.ceil(n / 14) === 0) && (
                <text x={x(i)} y={h - padB + 16} textAnchor="middle" fontSize="10.5" className="fill-muted">{truncate(d.label, 8)}</text>
              )}
              <circle cx={x(i)} cy={y(d.value)} r={active === i ? 5.5 : 3.5} fill="var(--primary)" stroke="var(--surface)" strokeWidth="1.5" className="transition-all" />
              <circle cx={x(i)} cy={y(d.value)} r="14" fill="transparent"
                onMouseMove={(e) => { setActive(i); move(e, <TipRow color="var(--primary)" label={d.label} value={fmt(d.value)} />); }} />
            </g>
          ))}
        </svg>
        {overlay}
      </div>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
