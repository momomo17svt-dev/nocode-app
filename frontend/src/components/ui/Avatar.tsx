import { colorForLabel, softColor } from '../../lib/colors';

/** ユーザー名のイニシャル円。名前から安定色を割り当てる。 */
export function Avatar({ name, size = 'sm' }: { name: string; size?: 'sm' | 'md' }) {
  const label = (name || '?').trim();
  const ch = label.charAt(0).toUpperCase() || '?';
  const color = colorForLabel(label || '?');
  const cls = size === 'md' ? 'size-8 text-xs' : 'size-5 text-[10px]';
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full font-bold shrink-0 ${cls}`}
      style={{ background: softColor(color, 0.18), color }}
      title={name}
    >
      {ch}
    </span>
  );
}
