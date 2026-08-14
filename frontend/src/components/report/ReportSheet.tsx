import { type FieldDef, formatValue } from '../../lib/fields';
import { type ReportTemplate, type ReportBlock, sheetSizeMm, renderTokens } from '../../lib/report';

export type Resolver = (f: FieldDef, v: any) => string;

/** user_select / group_select を名前解決する値整形関数を作る。 */
export function makeResolver(dirUsers: Record<string, string>, dirGroups: Record<string, string>): Resolver {
  return (f, v) => {
    if (f.fieldType === 'user_select') return dirUsers[v] || (v ?? '');
    if (f.fieldType === 'group_select') return dirGroups[v] || (v ?? '');
    return formatValue(f, v);
  };
}

/**
 * 1レコード分の帳票（用紙1枚）を描画する共通コンポーネント。
 * 印刷時は `@page { margin: 0 }` 前提で、この sheet 自身の padding が余白になる。
 * pageBreakAfter=true で次の用紙へ改ページ（複数レコード印刷で使用）。
 */
export function ReportSheet({ template, fields, data, resolve, pageBreakAfter }: {
  template: ReportTemplate;
  fields: FieldDef[];
  data: Record<string, any>;
  resolve: Resolver;
  pageBreakAfter?: boolean;
}) {
  const sheet = sheetSizeMm(template.paper, template.orientation);
  return (
    <div
      className={`report-sheet box-border bg-white text-neutral-900 shadow-lg ${pageBreakAfter ? 'break-after-page' : ''}`}
      style={{ width: `${sheet.width}mm`, minHeight: `${sheet.height}mm`, padding: '14mm' }}
    >
      <ReportHeader template={template} fields={fields} data={data} resolve={resolve} />
      <div className="mt-5 space-y-4">
        {template.blocks.map((b, i) => (
          <BlockView key={i} block={b} fields={fields} data={data} resolve={resolve} />
        ))}
      </div>
      {template.footer && (
        <div className="mt-8 border-t border-neutral-300 pt-2 text-xs whitespace-pre-wrap text-neutral-600">
          {renderTokens(template.footer, fields, data, resolve)}
        </div>
      )}
    </div>
  );
}

function ReportHeader({ template, fields, data, resolve }: {
  template: ReportTemplate; fields: FieldDef[]; data: Record<string, any>; resolve: Resolver;
}) {
  return (
    <header>
      {template.showDate && (
        <div className="text-right text-xs text-neutral-600">
          発行日: {new Date().toLocaleDateString('ja-JP')}
        </div>
      )}
      <h1 className="text-center text-2xl font-bold tracking-[0.3em] mt-1">{template.title}</h1>
      {template.subtitle && (
        <p className="text-center text-sm text-neutral-600 mt-1 whitespace-pre-wrap">
          {renderTokens(template.subtitle, fields, data, resolve)}
        </p>
      )}
    </header>
  );
}

function BlockView({ block, fields, data, resolve }: {
  block: ReportBlock; fields: FieldDef[]; data: Record<string, any>; resolve: Resolver;
}) {
  if (block.type === 'spacer') return <div className="h-6" />;

  if (block.type === 'heading') {
    return <h2 className="text-sm font-bold border-b-2 border-neutral-800 pb-1">{block.content}</h2>;
  }

  if (block.type === 'text') {
    return (
      <div className="text-sm whitespace-pre-wrap leading-relaxed">
        {renderTokens(block.content, fields, data, resolve)}
      </div>
    );
  }

  if (block.type === 'fields') {
    const cols = block.columns === 1 ? 1 : 2;
    const list = block.fieldCodes
      .map((code) => fields.find((f) => f.fieldCode === code))
      .filter((f): f is FieldDef => !!f);
    if (list.length === 0) return null;
    return (
      <table className="w-full border-collapse text-sm">
        <tbody>
          {chunk(list, cols).map((row, ri) => (
            <tr key={ri}>
              {row.map((f) => (
                <FieldCell key={f.fieldCode} field={f} value={resolve(f, data[f.fieldCode])} />
              ))}
              {row.length < cols && cols === 2 && (
                <><td className="border border-neutral-300" /><td className="border border-neutral-300" /></>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (block.type === 'subtable') {
    const f = fields.find((x) => x.fieldCode === block.fieldCode && x.fieldType === 'subtable');
    if (!f) return null;
    return <SubtablePrint field={f} rows={data[block.fieldCode]} />;
  }

  return null;
}

function FieldCell({ field, value }: { field: FieldDef; value: string }) {
  return (
    <>
      <th className="border border-neutral-300 bg-neutral-100 px-2.5 py-1.5 text-left align-top font-medium text-neutral-600 whitespace-nowrap w-px">
        {field.label}
      </th>
      <td className="border border-neutral-300 px-2.5 py-1.5 align-top whitespace-pre-wrap break-words">
        {value || <span className="text-neutral-400">—</span>}
      </td>
    </>
  );
}

/** 明細表（数値・計算列は合計を表示）。 */
function SubtablePrint({ field, rows }: { field: FieldDef; rows: any }) {
  const columns: any[] = field.settings?.columns || [];
  const list: Record<string, any>[] = Array.isArray(rows) ? rows : [];
  const numericCols = columns.filter((c) => c.fieldType === 'number' || c.fieldType === 'calc');
  const fmt = (c: any, v: any) => {
    if ((c.fieldType === 'number' || c.fieldType === 'calc') && v !== '' && v !== null && v !== undefined && !isNaN(Number(v))) {
      let s = c.settings?.thousandSeparator ? Number(v).toLocaleString('ja-JP') : String(v);
      if (c.settings?.unit) s = `${s} ${c.settings.unit}`;
      return s;
    }
    return v ?? '';
  };
  return (
    <div>
      <div className="text-sm font-medium text-neutral-600 mb-1">{field.label}</div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.fieldCode} className="border border-neutral-400 bg-neutral-100 px-2.5 py-1.5 text-left font-semibold whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.fieldCode} className={`border border-neutral-300 px-2.5 py-1.5 ${c.fieldType === 'number' || c.fieldType === 'calc' ? 'text-right tabular-nums' : ''}`}>
                  {fmt(c, row[c.fieldCode])}
                </td>
              ))}
            </tr>
          ))}
          {list.length === 0 && (
            <tr><td className="border border-neutral-300 px-2.5 py-3 text-center text-neutral-400" colSpan={columns.length || 1}>明細がありません</td></tr>
          )}
        </tbody>
        {numericCols.length > 0 && list.length > 0 && (
          <tfoot>
            <tr className="font-semibold">
              {columns.map((c, idx) => {
                const isNum = c.fieldType === 'number' || c.fieldType === 'calc';
                const total = isNum ? list.reduce((s, r) => s + (Number(r[c.fieldCode]) || 0), 0) : 0;
                return (
                  <td key={c.fieldCode} className={`border border-neutral-400 bg-neutral-100 px-2.5 py-1.5 ${isNum ? 'text-right tabular-nums' : ''}`}>
                    {idx === 0 ? '合計' : isNum ? fmt(c, total) : ''}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
