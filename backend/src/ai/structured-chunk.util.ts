// 一般文書（docKind='plain'）向けの規則性検出チャンカ。
// 行政文書パーサ（gov-doc/）に乗らない文書でも、見出し・番号・記号の規則性を検出して
// 意味の切れ目でチャンクを区切る。小さな節は同一階層内で結合し、大きな段落は文境界で分割する。
// 規則性が全く見つからない文書には null を返し、呼び出し側が従来の固定長分割へフォールバックする。
//
// チャンク書式は gov チャンクと同じ「【タイトル】\n[構造パス]\n本文」。
// これにより ai.service の titleAndSnippet / 出典表示がそのまま機能する。
// structAnchor は付けない（plain ビューアにジャンプ先が無いため）。

export interface StructuredChunk {
  content: string; // 埋め込み対象テキスト（題名・構造パス込み）
  structPath?: string; // 見出しパンくず（"1. 概要 / 1.1 目的"）。前文・段落モードでは無し
  structLabel?: string; // 引用用の見出しラベル（"1.1 目的"）
}

export interface ChunkStructuredOptions {
  title: string; // 文書タイトル。各チャンク先頭に【title】として付与
  chunkSize: number; // 1チャンクの目安文字数（結合上限。段落単体は×1.5まで許容）
  extraPatterns?: ExtraHeadingPattern[]; // 文書固有の見出しパターン（LLM推定等）。既定パターンより優先
}

/** 文書固有の見出しパターン（chunk-hint.util が LLM の例示から導出する）。 */
export interface ExtraHeadingPattern {
  regex: RegExp; // trim 済みの行に対して test する
  level: number; // 小さいほど上位階層
}

/** 見出しラベルの最大長（構造パス・出典表示が伸びすぎないように切り詰める）。 */
const LABEL_MAX = 24;

interface Heading {
  level: number; // 小さいほど上位（章=2 < ■=18 < "1."=20 < "(1)"=24 …）
  label: string; // 表示ラベル（切り詰め済み）
}

interface Section {
  parent: string[]; // 祖先見出しのラベル列（パンくず用）
  label: string; // 自身の見出しラベル（前文は ''）
  level: number;
  heading: string; // 見出し行の原文（前文は ''）
  blocks: string[]; // 空行区切りの段落（見出し行は含まない）
}

const UNIT_LEVEL: Record<string, number> = { 編: 1, 章: 2, 節: 3, 款: 4, 目: 5 };
const NUM = '[0-9０-９]';
const KANJI_NUM = '[一二三四五六七八九十百千]';

function truncateLabel(s: string): string {
  const t = s.trim();
  return t.length > LABEL_MAX ? `${t.slice(0, LABEL_MAX - 1)}…` : t;
}

/** 1行が見出しかどうかを判定する。見出しでなければ null。 */
export function detectHeading(raw: string, extras?: ExtraHeadingPattern[]): Heading | null {
  const line = raw.trim();
  if (!line) return null;

  // 文書固有の推定パターン（既定より優先）
  if (extras) {
    for (const e of extras) {
      if (e.regex.test(line)) return { level: e.level, label: truncateLabel(line) };
    }
  }

  // Markdown 見出し（# 〜 ######）
  let m = line.match(/^(#{1,6})\s+(.+)$/);
  if (m) return { level: 9 + m[1].length, label: truncateLabel(m[2]) };

  // 編・章・節・款・目（「第1章　総則」「第２節」）。本文中の「第1章の規定…」は除外
  m = line.match(new RegExp(`^第(?:${NUM}|${KANJI_NUM})+([編章節款目])(?:[　\\s]+\\S.*)?$`));
  if (m && line.length <= 40) return { level: UNIT_LEVEL[m[1]], label: truncateLabel(line) };

  // 【見出し】（行全体が隅付き括弧）
  m = line.match(/^【([^【】]{1,30})】$/);
  if (m) return { level: 17, label: truncateLabel(m[1]) };

  // 記号見出し（■ 概要 など）。箇条書きに多用される「・」「-」は対象外
  m = line.match(/^[■□◆◇●○〇◎▲△▼▽★☆][　\s]*(\S.*)$/);
  if (m) return { level: 18, label: truncateLabel(line) };

  // ローマ数字（Ⅰ．はじめに）
  m = line.match(/^[Ⅰ-Ⅹ][.．、）)　\s]/u);
  if (m) return { level: 19, label: truncateLabel(line) };

  // 多階層番号（1.1 設計 / 2.3.1 手順）。空白必須（"1.5倍にする" を除外）
  m = line.match(new RegExp(`^(${NUM}{1,2}(?:[.．]${NUM}{1,2})+)[.．]?[　\\s]+\\S.*$`));
  if (m) {
    const dots = (m[1].match(/[.．]/g) || []).length;
    return { level: 20 + Math.min(dots, 3), label: truncateLabel(line) };
  }

  // 単一番号（1. 概要 / １．はじめに / 2) ほげ）。直後が数字なら "1.5倍" 等の本文とみなす
  m = line.match(new RegExp(`^${NUM}{1,2}([.．、)）])(?!${NUM}).*$`));
  if (m) return { level: 20, label: truncateLabel(line) };

  // 括弧番号（(1) / （一））
  m = line.match(new RegExp(`^[（(](?:${NUM}{1,2}|${KANJI_NUM}{1,3})[）)].*$`));
  if (m) return { level: 24, label: truncateLabel(line) };

  // 丸数字（① 〜 ⑳）
  if (/^[①-⑳]/.test(line)) return { level: 26, label: truncateLabel(line) };

  return null;
}

/** 罫線・区切り線（---- / ==== / ────）は空行と同じ扱いにする。 */
function isSeparator(line: string): boolean {
  return /^[-=＝*＊_＿─―ー━]{3,}$/.test(line.trim());
}

/** 本文をセクション列（前文＋見出しごと）へ解析する。 */
function parseSections(text: string, extras?: ExtraHeadingPattern[]): Section[] {
  const sections: Section[] = [];
  const stack: { level: number; label: string }[] = [];
  let cur: Section = { parent: [], label: '', level: Number.MAX_SAFE_INTEGER, heading: '', blocks: [] };
  sections.push(cur);
  let buf: string[] = [];
  const flush = () => {
    const b = buf.join('\n').trim();
    if (b) cur.blocks.push(b);
    buf = [];
  };
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim() || isSeparator(line)) {
      flush();
      continue;
    }
    const h = detectHeading(line, extras);
    if (h) {
      flush();
      while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
      cur = { parent: stack.map((s) => s.label), label: h.label, level: h.level, heading: line.trim(), blocks: [] };
      stack.push({ level: h.level, label: h.label });
      sections.push(cur);
      continue;
    }
    buf.push(line);
  }
  flush();
  return sections;
}

/** 文境界（。．！？!? と改行、閉じ括弧込み）で分割する。 */
function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      out.push(text.slice(start, i + 1));
      start = i + 1;
      continue;
    }
    if ('。．！？!?'.includes(ch)) {
      let end = i + 1;
      while (end < text.length && '」』）)”"\''.includes(text[end])) end++;
      out.push(text.slice(start, end));
      start = end;
      i = end - 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

/** 巨大なテキストを文境界優先で size 以下に詰める。句読点の無い塊は最後の手段として固定長で切る。 */
function packSentences(text: string, size: number): string[] {
  const out: string[] = [];
  let buf = '';
  const flush = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = '';
  };
  for (const s of splitSentences(text)) {
    if (s.length > size) {
      flush();
      for (let i = 0; i < s.length; i += size) {
        const piece = s.slice(i, i + size).trim();
        if (piece) out.push(piece);
      }
      continue;
    }
    if (buf && buf.length + s.length > size) flush();
    buf += s;
  }
  flush();
  return out;
}

/** 段落（ブロック）列を size 目安で詰める。段落単体は size×1.5 まで分割せず保持する。 */
function packBlocks(blocks: string[], size: number): string[] {
  const out: string[] = [];
  let buf = '';
  const flush = () => {
    const t = buf.trim();
    if (t) out.push(t);
    buf = '';
  };
  for (const b of blocks) {
    if (b.length > size * 1.5) {
      flush();
      out.push(...packSentences(b, size));
      continue;
    }
    if (buf && buf.length + 1 + b.length > size) flush();
    buf = buf ? `${buf}\n${b}` : b;
  }
  flush();
  return out;
}

function sectionText(s: Section): string {
  return [s.heading, ...s.blocks].filter(Boolean).join('\n');
}

function sameParent(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** 直後のセクションが自分の子（パンくずに自分を含む）かどうか。 */
function hasChild(sections: Section[], i: number): boolean {
  const s = sections[i];
  const nx = sections[i + 1];
  return !!nx && nx.parent.length > s.parent.length && nx.parent[s.parent.length] === s.label;
}

function mergeLabel(first: string, last: string): string {
  const joined = `${first}〜${last}`;
  return joined.length <= LABEL_MAX + 6 ? joined : `${first} ほか`;
}

function toChunk(title: string, pathParts: string[] | null, label: string | undefined, body: string): StructuredChunk {
  const head = title ? `【${title}】` : '';
  const path = pathParts && pathParts.length ? pathParts.join(' / ') : '';
  const content = [head, path ? `[${path}]` : '', body].filter(Boolean).join('\n').trim();
  return { content, structPath: path || undefined, structLabel: label || undefined };
}

function emitSections(sections: Section[], opts: ChunkStructuredOptions): StructuredChunk[] {
  const size = Math.max(opts.chunkSize, 100);
  const out: StructuredChunk[] = [];
  let i = 0;
  while (i < sections.length) {
    const s = sections[i];
    const own = sectionText(s);
    if (!own.trim()) {
      i++;
      continue;
    }
    // 本文の無い容器見出し（章・親番号）は出力しない（子のパンくずに現れる）
    if (!s.blocks.length && s.heading && hasChild(sections, i)) {
      i++;
      continue;
    }
    if (s.label && own.length <= size) {
      // 同一階層の小さな節を chunkSize まで結合（細切れチャンクの抑制）
      const texts = [own];
      let total = own.length;
      let last = s;
      let j = i + 1;
      while (j < sections.length) {
        const t = sections[j];
        if (!t.label || !sameParent(t.parent, s.parent)) break;
        const tx = sectionText(t);
        if (total + 1 + tx.length > size) break;
        texts.push(tx);
        total += 1 + tx.length;
        last = t;
        j++;
      }
      if (j - i >= 2) {
        const label = mergeLabel(s.label, last.label);
        out.push(toChunk(opts.title, [...s.parent, label], label, texts.join('\n')));
      } else {
        out.push(toChunk(opts.title, [...s.parent, s.label], s.label, own));
      }
      i = j > i + 1 ? j : i + 1;
      continue;
    }
    // 大きな節・前文: 段落→文の順で分割。分割片には見出しとパスを複製する
    const pieces = packBlocks(s.blocks, size);
    if (!pieces.length && s.heading) pieces.push('');
    for (const p of pieces) {
      const body = [s.heading, p].filter(Boolean).join('\n');
      out.push(toChunk(opts.title, s.label ? [...s.parent, s.label] : null, s.label || undefined, body));
    }
    i++;
  }
  return out;
}

/**
 * 規則性検出チャンカの入口。
 * - 見出しが2つ以上 → 見出し単位で分割（構造パス付き）
 * - 見出しが無くても段落・文の区切りがある → 段落単位で詰める（パス無し）
 * - どの規則性も無い → null（呼び出し側で従来の固定長分割にフォールバック）
 */
export function chunkStructured(text: string, opts: ChunkStructuredOptions): StructuredChunk[] | null {
  const clean = (text || '').replace(/\r\n?/g, '\n');
  if (!clean.trim()) return [];
  const sections = parseSections(clean, opts.extraPatterns);
  const headingCount = sections.filter((s) => s.heading).length;
  if (headingCount >= 2) {
    const out = emitSections(sections, opts);
    return out.length ? out : null;
  }
  // 段落モード: 空行区切り or 文境界だけでも固定長ぶつ切りよりは意味を保てる
  const blocks: string[] = [];
  let buf: string[] = [];
  for (const line of clean.split('\n')) {
    if (!line.trim() || isSeparator(line)) {
      if (buf.length) blocks.push(buf.join('\n').trim());
      buf = [];
    } else buf.push(line.trimEnd());
  }
  if (buf.length) blocks.push(buf.join('\n').trim());
  const sentenceCount = (clean.match(/[。．！？!?]/g) || []).length;
  if (blocks.length < 2 && sentenceCount < 2) return null;
  const size = Math.max(opts.chunkSize, 100);
  return packBlocks(blocks, size).map((p) => toChunk(opts.title, null, undefined, p));
}
