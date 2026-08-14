// 構造ツリーを「条単位（＋構造パス）」のチャンクへ変換する。
// 法令型は1条=1チャンク（大きすぎる条は項単位に分割）、通知型は鑑文/本文/記書き項目をチャンク化。

import { GovChunk, GovNode, GovStructure } from './gov-types';

export interface ChunkGovOptions {
  title: string; // 文書タイトル（題名）。各チャンク先頭に【title】として付与。
  chunkSize: number; // 大きな条を項分割する閾値の基準（chunkSize*3 超で分割）
}

/** ノード自身＋子孫の本文を、ラベル付きで1つのテキストへ平坦化。 */
function collectText(node: GovNode, withSelfLabel: boolean): string {
  const lines: string[] = [];
  const selfLabel = labelPrefix(node);
  if (node.text.trim()) {
    lines.push(withSelfLabel && selfLabel ? `${selfLabel}${node.text}` : node.text);
  } else if (withSelfLabel && selfLabel && node.children.length) {
    lines.push(selfLabel.trimEnd());
  }
  for (const c of node.children) {
    lines.push(collectText(c, true));
  }
  return lines.filter(Boolean).join('\n');
}

/** 子本文を行頭ラベル付きで出すための接頭辞（号・イロハ・項）。 */
function labelPrefix(node: GovNode): string {
  switch (node.kind) {
    case 'paragraph': return `${node.label}　`; // 第2項
    case 'item': return `${node.label}　`; // 一
    case 'subitem': return `${node.label}　`;
    default: return '';
  }
}

function header(title: string, path: string): string {
  const h = title ? `【${title}】` : '';
  return `${h}\n[${path}]`;
}

/** 条見出し（（目的）等）を本文先頭に付ける。 */
function articleBody(node: GovNode): string {
  const cap = node.caption ? `（${node.caption}）\n` : '';
  // 条本体（第1項）＋ 項/号/イロハ
  const body = collectText(node, false);
  return `${cap}${node.label}　${body}`.trim();
}

function emitArticle(node: GovNode, opts: ChunkGovOptions, out: GovChunk[]): void {
  const full = articleBody(node);
  const limit = Math.max(opts.chunkSize * 3, 1200);
  if (full.length <= limit || node.children.filter((c) => c.kind === 'paragraph').length === 0) {
    out.push({
      content: `${header(opts.title, node.path)}\n${full}`,
      structPath: node.path,
      structLabel: node.label,
      structAnchor: node.id,
    });
    return;
  }
  // 大きい条は「第1項（条本体）」＋各項に分割。各断片に条ヘッダ・パスを複製。
  const cap = node.caption ? `（${node.caption}）\n` : '';
  const firstBody = [node.text, ...node.children.filter((c) => c.kind !== 'paragraph').map((c) => collectText(c, true))].filter(Boolean).join('\n');
  if (firstBody.trim()) {
    out.push({
      content: `${header(opts.title, `${node.path} / 第1項`)}\n${cap}${node.label}　${firstBody}`,
      structPath: `${node.path} / 第1項`,
      structLabel: `${node.label}第1項`,
      structAnchor: node.id,
    });
  }
  for (const p of node.children.filter((c) => c.kind === 'paragraph')) {
    const pbody = collectText(p, false);
    out.push({
      content: `${header(opts.title, p.path)}\n${cap}${node.label}${p.label}　${pbody}`,
      structPath: p.path,
      structLabel: `${node.label}${p.label}`,
      structAnchor: p.id,
    });
  }
}

function emitNote(node: GovNode, opts: ChunkGovOptions, out: GovChunk[]): void {
  if (node.text.trim()) {
    out.push({ content: `${header(opts.title, node.path)}\n記\n${node.text}`, structPath: node.path, structLabel: '記', structAnchor: node.id });
  }
  for (const it of node.children) {
    out.push({
      content: `${header(opts.title, it.path)}\n${it.label}　${it.text}`,
      structPath: it.path,
      structLabel: it.label,
      structAnchor: it.id,
    });
  }
}

function emitLeaf(node: GovNode, opts: ChunkGovOptions, out: GovChunk[]): void {
  const body = collectText(node, false);
  if (!body.trim()) return;
  out.push({
    content: `${header(opts.title, node.path)}\n${body}`,
    structPath: node.path,
    structLabel: node.label,
    structAnchor: node.id,
  });
}

const CONTAINER_KINDS = new Set(['part', 'chapter', 'section', 'subsection', 'division', 'supplementary']);

function walk(node: GovNode, opts: ChunkGovOptions, out: GovChunk[]): void {
  if (node.kind === 'article') { emitArticle(node, opts, out); return; }
  if (node.kind === 'note') { emitNote(node, opts, out); return; }
  if (CONTAINER_KINDS.has(node.kind)) {
    // 章/節等の容器：直下に本文があれば（附則の柱書等）1チャンク、子は再帰
    if (node.text.trim() && node.children.every((c) => c.kind !== 'article')) emitLeaf(node, opts, out);
    else if (node.text.trim() && node.kind === 'supplementary') emitLeaf({ ...node, children: [] }, opts, out);
    for (const c of node.children) walk(c, opts, out);
    return;
  }
  // cover / preamble / body / appendix / 孤立した項・号
  emitLeaf(node, opts, out);
  for (const c of node.children) walk(c, opts, out);
}

/** 構造ツリーをチャンク配列へ。空テキストの構造は出力しない。 */
export function chunkGov(structure: GovStructure, opts: ChunkGovOptions): GovChunk[] {
  const out: GovChunk[] = [];
  const title = structure.title || opts.title || '';
  for (const n of structure.nodes) walk(n, { ...opts, title }, out);
  return out;
}
