// LLM による「文書固有の区切り規則」推定の補助（純関数のみ。LLM呼び出しは embedding.service 側）。
//
// 仕組み: 文書の冒頭サンプルを LLM に見せ、「見出し・区切りの行」を原文のまま JSON 配列で
// 抜き出させる。抜き出された例がサンプル内に実在することを検証した上で、番号部分だけを
// 数字クラスへ一般化した行頭パターン（ExtraHeadingPattern）を決定的に導出する。
// LLM に正規表現そのものを書かせない（ハルシネーション・ReDoS を構造的に防ぐ）。

import { ChatMessage } from '../llm/llm.types';
import { ExtraHeadingPattern } from './structured-chunk.util';

/** 推定に使う冒頭サンプルの既定長。行境界で切る。 */
export function sampleForHint(text: string, maxLen = 1200): string {
  const clean = (text || '').replace(/\r\n?/g, '\n');
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const nl = cut.lastIndexOf('\n');
  return nl > maxLen / 2 ? cut.slice(0, nl) : cut;
}

/** 見出し例の抽出を依頼するプロンプト。小型ローカルモデルでも守れるよう出力は JSON 配列のみ。 */
export function buildHintMessages(sample: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'あなたは文書構造の分析器です。出力は JSON 配列（文字列の配列）のみ。説明文は書かないでください。',
    },
    {
      role: 'user',
      content: [
        '次の文書の冒頭から、章・節・項目の「見出しとして使われている行」を原文のまま抜き出し、',
        'JSON配列で返してください（最大8行）。本文の行は含めない。見出しが無ければ [] を返す。',
        '',
        '----',
        sample,
        '----',
      ].join('\n'),
    },
  ];
}

/** LLM 応答から文字列配列を取り出す。JSON 以外の前置き・後置きは無視する。 */
export function parseHintResponse(raw: string): string[] {
  const s = (raw || '').trim();
  const candidates: string[] = [];
  const greedy = s.match(/\[[\s\S]*\]/);
  if (greedy) candidates.push(greedy[0]);
  const lazy = s.match(/\[[\s\S]*?\]/);
  if (lazy && lazy[0] !== greedy?.[0]) candidates.push(lazy[0]);
  for (const c of candidates) {
    try {
      const arr = JSON.parse(c);
      if (Array.isArray(arr)) {
        return arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, 12);
      }
    } catch {
      /* 次の候補へ */
    }
  }
  return [];
}

const NUM_CLASS = '[0-9０-９一二三四五六七八九十百]';
const KANA_CLASS = '[ア-ンあ-ん]';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 見出し例の行から「接頭辞＋番号＋区切り記号」を抽出し、番号を一般化した行頭正規表現を作る。
 * 例: 「第１ 要旨」→ /^第[0-9０-９…]{1,4}[\s　]/、「STEP1: 準備」→ /^STEP[0-9…]{1,4}[:：]/
 * 番号が無い短い行（「背景」等）は行全体一致のリテラルにする。導出できなければ null。
 */
export function templateOf(line: string): string | null {
  const t = line.trim();
  if (!t || t.length > 80) return null;
  // 行頭: 接頭辞（4文字以内・空白と数字を含まない）＋番号（数字/漢数字 or 仮名1字）＋区切り
  const m = t.match(
    new RegExp(`^([^\\s　0-9０-９一二三四五六七八九十]{0,4}?)(${NUM_CLASS}{1,4}|${KANA_CLASS})([.．、。)）:：]?)([\\s　]|$)?`),
  );
  // 番号の直後に区切り記号か空白（行末）が実在するときだけ見出し様式とみなす
  // （「売上は前年比…」の "は" をかな番号と誤認しないため）
  if (m && (m[3] || m[4] !== undefined)) {
    const numPart = /^[0-9０-９一二三四五六七八九十百]/.test(m[2]) ? `${NUM_CLASS}{1,4}` : KANA_CLASS;
    const sep = m[3] ? escapeRegExp(m[3]) : '';
    // 区切り記号が無い場合は空白境界を要求（「1000人」のような本文行頭を拾わないため）
    const boundary = sep ? '' : '(?:[\\s　]|$)';
    return `^${escapeRegExp(m[1])}${numPart}${sep}${boundary}`;
  }
  // 番号の無い短い見出し（「背景」「まとめ」等）は行全体のリテラル一致
  if (t.length <= 12 && !/[。、]/.test(t)) return `^${escapeRegExp(t)}$`;
  return null;
}

/**
 * LLM が挙げた見出し例からパターン集合を導出する。
 * - サンプル内に行として実在しない例（ハルシネーション）は捨てる
 * - 同一テンプレートは統合し、サンプル中の初出順にレベルを振る（最大4種）
 */
export function derivePatterns(examples: string[], sample: string): ExtraHeadingPattern[] {
  const lines = sample.split('\n').map((l) => l.trim());
  const lineIndex = new Map<string, number>();
  lines.forEach((l, i) => {
    if (l && !lineIndex.has(l)) lineIndex.set(l, i);
  });

  const byTemplate = new Map<string, number>(); // template -> 初出行番号
  for (const ex of examples) {
    const t = ex.trim();
    const idx = lineIndex.get(t);
    if (idx === undefined) continue; // サンプルに無い＝捏造の可能性
    const tpl = templateOf(t);
    if (!tpl) continue;
    if (!new RegExp(tpl).test(t)) continue; // 導出パターンが元の行に一致しない＝不適格
    const cur = byTemplate.get(tpl);
    if (cur === undefined || idx < cur) byTemplate.set(tpl, idx);
  }

  return [...byTemplate.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4)
    .map(([tpl], i) => ({ regex: new RegExp(tpl), level: 30 + i }));
}
