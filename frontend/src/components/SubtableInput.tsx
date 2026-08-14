import { Plus, Trash2 } from 'lucide-react';
import { evalFormula, evalRules } from '../lib/calc';
import type { FieldDef } from '../lib/fields';

export interface SubColumn { fieldCode: string; fieldType: string; label: string; settings?: any; }

/** テーブル（明細行）フィールドの入力。行の追加・削除・行内calc・数値列の合計に対応。 */
export function SubtableInput({ field, value, onChange }: { field: FieldDef; value: any; onChange: (v: any) => void; }) {
  const columns: SubColumn[] = field.settings?.columns || [];
  const rows: Record<string, any>[] = Array.isArray(value) ? value : [];

  if (columns.length === 0) {
    return <p className="text-sm text-muted">列が未設定です（アプリ設定でテーブルの列を定義してください）。</p>;
  }

  const recalcRow = (row: Record<string, any>) => {
    const next = { ...row };
    for (const c of columns) {
      if (c.fieldType !== 'calc') continue;
      const s = c.settings || {};
      next[c.fieldCode] = s.mode === 'rules' ? evalRules(s, next) : (s.formula ? evalFormula(s.formula, next) : '');
    }
    return next;
  };
  const setCell = (i: number, code: string, v: any) => onChange(rows.map((r, idx) => (idx === i ? recalcRow({ ...r, [code]: v }) : r)));
  const addRow = () => onChange([...rows, recalcRow({})]);
  const delRow = (i: number) => onChange(rows.filter((_, idx) => idx !== i));

  const numericCols = columns.filter((c) => c.fieldType === 'number' || c.fieldType === 'calc');
  const totals: Record<string, number> = {};
  for (const c of numericCols) totals[c.fieldCode] = rows.reduce((s, r) => s + (Number(r[c.fieldCode]) || 0), 0);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            {columns.map((c) => <th key={c.fieldCode} className="px-2 py-2 text-left font-semibold text-muted whitespace-nowrap">{c.label}</th>)}
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {columns.map((c) => (
                <td key={c.fieldCode} className="px-1.5 py-1 align-top">
                  <SubCell col={c} value={row[c.fieldCode]} onChange={(v) => setCell(i, c.fieldCode, v)} />
                </td>
              ))}
              <td className="px-1 py-1 text-center">
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => delRow(i)} aria-label="行を削除"><Trash2 className="size-4" /></button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={columns.length + 1} className="px-3 py-3 text-sm text-muted text-center">行がありません</td></tr>}
        </tbody>
        {numericCols.length > 0 && rows.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-2 font-semibold">
              {columns.map((c, idx) => (
                <td key={c.fieldCode} className="px-2 py-2 text-right tabular-nums">
                  {idx === 0 ? <span className="text-muted font-normal block text-left">合計</span> : (c.fieldType === 'number' || c.fieldType === 'calc') ? fmtNum(totals[c.fieldCode], c) : ''}
                </td>
              ))}
              <td />
            </tr>
          </tfoot>
        )}
      </table>
      <div className="p-1.5">
        <button type="button" className="btn btn-sm" onClick={addRow}><Plus className="size-3.5" />行を追加</button>
      </div>
    </div>
  );
}

function SubCell({ col, value, onChange }: { col: SubColumn; value: any; onChange: (v: any) => void }) {
  const opts: string[] = col.settings?.options || [];
  switch (col.fieldType) {
    case 'number':
      return <input className="input min-w-20" type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />;
    case 'date':
      return <input className="input min-w-32" type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'datetime':
      return <input className="input min-w-44" type="datetime-local" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'email':
      return <input className="input min-w-40" type="email" placeholder={col.settings?.placeholder || 'name@example.com'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'phone':
      return <input className="input min-w-32" type="tel" placeholder={col.settings?.placeholder || '03-1234-5678'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'link':
      return <input className="input min-w-40" type="url" placeholder={col.settings?.placeholder || 'https://...'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'textarea':
      return <textarea className="input min-w-44" rows={2} placeholder={col.settings?.placeholder} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'select':
      return (
        <select className="input min-w-24" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value=""></option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'checkbox': {
      const arr: string[] = Array.isArray(value) ? value : [];
      const toggle = (o: string) => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o]);
      return (
        <div className="flex flex-col gap-1 min-w-28">
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-sm whitespace-nowrap">
              <input type="checkbox" className="accent-[var(--primary)]" checked={arr.includes(o)} onChange={() => toggle(o)} /> {o}
            </label>
          ))}
        </div>
      );
    }
    case 'radio':
      return (
        <div className="flex flex-col gap-1 min-w-28">
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-sm whitespace-nowrap">
              <input type="radio" className="accent-[var(--primary)]" checked={value === o} onChange={() => onChange(o)} /> {o}
            </label>
          ))}
        </div>
      );
    case 'calc':
      return <input className="input min-w-20 bg-surface-2" value={value ?? ''} disabled />;
    default:
      return <input className="input min-w-28" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

function fmtNum(n: number, col: SubColumn) {
  let s = col.settings?.thousandSeparator ? n.toLocaleString('ja-JP') : String(n);
  if (col.settings?.unit) s = `${s} ${col.settings.unit}`;
  return s;
}
