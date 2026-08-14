import { type ReactNode } from 'react';

/**
 * 依存ライブラリなしの軽量Markdownレンダラー（オフライン/自前実装方針に準拠）。
 * 見出し・箇条書き・番号付きリスト（ネスト可）・テーブル(GFM)・引用・コード・水平線・
 * 強調（太字/斜体）・インラインコード・リンクに対応。LLM出力の表示を想定。
 * ストリーミング中の不完全なMarkdownでも壊れず、トークン追加のたびに再パースして描画する。
 */
export function Markdown({ content, className = '' }: { content: string; className?: string }) {
  return <div className={`md-body space-y-2 text-sm ${className}`}>{parseBlocks(content || '')}</div>;
}

// ===== ブロック解析 =====
function parseBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // コードブロック ```
    if (/^\s*```/.test(line)) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) { body.push(lines[i]); i++; }
      i++; // 閉じフェンス
      blocks.push(
        <pre key={key++} className="rounded-lg bg-surface-2 p-3 overflow-x-auto text-xs font-mono leading-relaxed">
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    // 見出し
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      blocks.push(<Heading key={key++} level={h[1].length} text={h[2]} />);
      i++;
      continue;
    }

    // 水平線
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="border-border my-3" />);
      i++;
      continue;
    }

    // テーブル（ヘッダ行 + 区切り行 |---|）
    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(splitRow(lines[i])); i++; }
      blocks.push(<Table key={key++} header={header} rows={rows} />);
      continue;
    }

    // 引用
    if (/^\s*>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { body.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      blocks.push(
        <blockquote key={key++} className="border-l-2 border-border pl-3 text-muted">{parseBlocks(body.join('\n'))}</blockquote>,
      );
      continue;
    }

    // リスト（番号付き / 箇条書き、ネスト対応）
    if (isListItem(line)) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)([-*+•]|\d+[.)])\s+(.*)$/);
        if (m) { items.push({ indent: m[1].length, ordered: /\d/.test(m[2]), text: m[3] }); i++; }
        else if (lines[i].trim() === '' && i + 1 < lines.length && isListItem(lines[i + 1])) { i++; }
        else if (/^\s+\S/.test(lines[i]) && items.length) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; }
        else break;
      }
      blocks.push(<div key={key++}>{buildList(items, 0, items.length ? items[0].indent : 0).node}</div>);
      continue;
    }

    // 段落
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i], lines[i + 1])) { para.push(lines[i]); i++; }
    blocks.push(<p key={key++} className="leading-relaxed break-words">{renderInline(para.join(' '))}</p>);
  }

  return blocks;
}

interface ListItem { indent: number; ordered: boolean; text: string }

/** インデントの深さで再帰的にネストした <ul>/<ol> を構築。 */
function buildList(items: ListItem[], pos: number, indent: number): { node: ReactNode; pos: number } {
  const ordered = items[pos]?.ordered ?? false;
  const children: ReactNode[] = [];
  let i = pos;
  while (i < items.length && items[i].indent >= indent) {
    if (items[i].indent > indent) break; // より深い項目は下のネスト処理で消費される
    const liChildren: ReactNode[] = [<span key="t">{renderInline(items[i].text)}</span>];
    i++;
    if (i < items.length && items[i].indent > indent) {
      const sub = buildList(items, i, items[i].indent);
      liChildren.push(<div key="sub" className="mt-1">{sub.node}</div>);
      i = sub.pos;
    }
    children.push(<li key={i} className="leading-relaxed">{liChildren}</li>);
  }
  const cls = ordered ? 'list-decimal' : 'list-disc';
  const node = ordered
    ? <ol className={`${cls} pl-5 space-y-1`}>{children}</ol>
    : <ul className={`${cls} pl-5 space-y-1`}>{children}</ul>;
  return { node, pos: i };
}

function Heading({ level, text }: { level: number; text: string }) {
  const inner = renderInline(text);
  if (level <= 1) return <h3 className="text-base font-bold mt-3 mb-1 first:mt-0">{inner}</h3>;
  if (level === 2) return <h4 className="text-sm font-bold mt-3 mb-1 first:mt-0">{inner}</h4>;
  return <h5 className="text-sm font-semibold mt-2 mb-0.5 first:mt-0">{inner}</h5>;
}

function Table({ header, rows }: { header: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto my-1">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {header.map((c, i) => (
              <th key={i} className="border border-border bg-surface-2 px-2 py-1 text-left font-semibold">{renderInline(c)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri}>
              {header.map((_, ci) => (
                <td key={ci} className="border border-border px-2 py-1 align-top">{renderInline(r[ci] ?? '')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===== インライン解析 =====
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = '';
  let key = 0;
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };

  for (let i = 0; i < text.length; ) {
    const ch = text[i];

    // インラインコード `code`
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        flush();
        out.push(<code key={key++} className="rounded bg-surface-2 px-1 py-0.5 text-[0.85em] font-mono">{text.slice(i + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    // 太字 **text**
    if (ch === '*' && text[i + 1] === '*') {
      const end = text.indexOf('**', i + 2);
      if (end > i + 1) {
        flush();
        out.push(<strong key={key++} className="font-semibold">{renderInline(text.slice(i + 2, end))}</strong>);
        i = end + 2;
        continue;
      }
    }
    // 斜体 *text* / _text_
    if (ch === '*' || ch === '_') {
      const end = text.indexOf(ch, i + 1);
      if (end > i + 1 && !/\s/.test(text[i + 1])) {
        flush();
        out.push(<em key={key++}>{renderInline(text.slice(i + 1, end))}</em>);
        i = end + 1;
        continue;
      }
    }
    // リンク [label](url)
    if (ch === '[') {
      const close = text.indexOf(']', i + 1);
      if (close > i && text[close + 1] === '(') {
        const pend = text.indexOf(')', close + 2);
        if (pend > close) {
          flush();
          const url = text.slice(close + 2, pend);
          out.push(<a key={key++} href={url} target="_blank" rel="noreferrer" className="text-primary underline break-all">{text.slice(i + 1, close)}</a>);
          i = pend + 1;
          continue;
        }
      }
    }
    buf += ch;
    i++;
  }
  flush();
  return out;
}

// ===== 判定ヘルパ =====
function isListItem(line: string): boolean {
  return /^(\s*)([-*+•]|\d+[.)])\s+/.test(line);
}
function isTableSep(line: string): boolean {
  return line.includes('-') && /^\s*\|?[\s:|-]+\|?\s*$/.test(line);
}
function isBlockStart(line: string, next?: string): boolean {
  if (/^#{1,6}\s/.test(line)) return true;
  if (/^\s*```/.test(line)) return true;
  if (/^\s*>\s?/.test(line)) return true;
  if (isListItem(line)) return true;
  if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) return true;
  if (line.includes('|') && next && isTableSep(next)) return true;
  return false;
}
function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}
