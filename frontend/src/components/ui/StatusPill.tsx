import { softColor } from '../../lib/colors';

/** ステータス／セレクト値を色付きピルで表示。色は呼び出し側が選択肢順から決める。 */
export function StatusPill({ value, color }: { value: string; color: string }) {
  if (!value) return <span className="text-muted">—</span>;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ background: softColor(color, 0.16) }}
    >
      <span className="size-2 rounded-full shrink-0" style={{ background: color }} />
      {value}
    </span>
  );
}
