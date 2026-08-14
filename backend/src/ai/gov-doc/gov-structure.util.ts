// 行政文書の構造パーサ（純TS・外部依存ゼロ）。
// プレーンテキスト（改行保持）を、章/節/条/項/号 や 鑑文/記書き のツリーへ寛容に解析する。
// 取りこぼした行はプレーン段落（body）として保持し、RAG自体は劣化させない方針。

import { GovFamily, GovMeta, GovNode, GovNodeKind, GovStructure, GovTocEntry } from './gov-types';

// ===== 文字・数値ユーティリティ =====
const KANJI_DIGIT: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};

/** 漢数字（十百千まで）を整数へ。失敗時は NaN。表示は原文ラベルを使うので補助用途。 */
function kanjiToNum(s: string): number {
  if (!s) return NaN;
  if (/^[0-9０-９]+$/.test(s)) return Number(s.replace(/[０-９]/g, (d) => String('０１２３４５６７８９'.indexOf(d))));
  let total = 0;
  let cur = 0;
  let matched = false;
  for (const ch of s) {
    if (ch in KANJI_DIGIT) { cur = cur * 10 + KANJI_DIGIT[ch]; matched = true; }
    else if (ch === '十') { cur = (cur || 1) * 10; total += cur; cur = 0; matched = true; }
    else if (ch === '百') { cur = (cur || 1) * 100; total += cur; cur = 0; matched = true; }
    else if (ch === '千') { cur = (cur || 1) * 1000; total += cur; cur = 0; matched = true; }
    else return NaN;
  }
  return matched ? total + cur : NaN;
}

// ===== 行頭パターン =====
// PDF抽出で「第 10 章」「第 10 条」のように数字前後に空白が入るケースを許容する。
interface HeadingMatch { num: string; unit: string; caption?: string }
/**
 * 編・章・節・款・目の見出し行を解析する。
 * 数字と単位の間に空白がある場合は、単位の直後が行末か空白のときだけ見出しとみなす
 * （「第１ 目的及び記述範囲」の「目」を款目の単位と誤認しないため）。
 */
function matchHeading(t: string): HeadingMatch | null {
  let m = t.match(/^第[\s　]*([一二三四五六七八九十百千〇零0-9０-９]+)(編|章|節|款|目)(?:[\s　]*(.*))?$/);
  if (m) return { num: m[1], unit: m[2], caption: m[3] };
  m = t.match(/^第[\s　]*([一二三四五六七八九十百千〇零0-9０-９]+)[\s　]+(編|章|節|款|目)(?:$|[\s　]+(.*)$)/);
  if (m) return { num: m[1], unit: m[2], caption: m[3] };
  return null;
}
// 第○条 / 第○条の２（枝番）。条見出しの直後行から始まる。
const RE_ARTICLE = /^第[\s　]*([一二三四五六七八九十百千〇零0-9０-９]+)[\s　]*条(?:[\s　]*の[\s　]*([一二三四五六七八九十0-9０-９]+))?/;
// 単位なし「第○」見出し（達・要綱・細則が条の代わりに使う。「第１ 要旨」）。
// 数字の直後に空白＋本文が続くときのみ。「第１章」「第５３条」「第１６号」は一致せず
// （章・条は本パターンより先に判定される）、PDF折返しの裸の「第１０」行も対象外。
const RE_HEADNOTE = /^第[\s　]*([一二三四五六七八九十百千〇零0-9０-９]+)[\s　]+(?=\S)/;
// 目次スキップの脱出に使う前書きの定型見出し。
const RE_FOREWORD = /^(はしがき|まえがき|前書き|序文|序章|はじめに|凡例)$/;
// 条見出し：行全体が （…）。条行の直前に置かれる。
const RE_CAPTION = /^[（(]([^）)]+)[)）]$/;
// 項（第2項以降）：行頭の全角/半角アラビア数字、または丸数字。
const RE_PARAGRAPH = /^([２-９][０-９]*|[0-9]{1,3}|[②-⑳])[\s　　]/;
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
// 号：行頭の漢数字＋（全角）空白。
const RE_ITEM = /^([一二三四五六七八九十]+)[　\s]/;
// 号の別表記：(1) （１）
const RE_ITEM_PAREN = /^[（(]([0-9０-９]{1,3})[)）]/;
// イロハ
const RE_SUBITEM = /^([イロハニホヘトチリヌルヲワカヨタレソ])[　\s]/;
const RE_SUPPL = /^附[\s　]*則/;
const RE_APPENDIX = /^(別表|別記様式|別記|様式)/;

const HEADING_KIND: Record<string, GovNodeKind> = {
  編: 'part', 章: 'chapter', 節: 'section', 款: 'subsection', 目: 'division',
};

const DEPTH: Partial<Record<GovNodeKind, number>> = {
  part: 1, chapter: 2, section: 3, subsection: 4, division: 5,
  article: 6, paragraph: 7, item: 8, subitem: 9,
};

// ===== メタ抽出（鑑文用） =====
// 発番号。達号(陸自達第71―5号)を最優先に。参照先の訓令番号を拾わないよう「裸の第…号」は使わない。
const RE_DOCNUM = /([^\s　、。（(]{0,10}達示?第[0-9０-９―－‐-]+号|[^\s　、。（(]{0,10}発第[0-9０-９]+号|[^\s　、。（(]{0,8}例規第[0-9０-９]+号|条例第[0-9０-９]+号|規則第[0-9０-９]+号|訓令第[0-9０-９]+号|訓第[0-9０-９]+号|告示第[0-9０-９]+号)/;
// 題名らしい独立行（「○○規則／条例／規程／要綱／細則／訓令」等で終わる短行・括弧/条/号を含まない）。
function looksLikeTitle(t: string): boolean {
  return (
    t.length >= 3 && t.length <= 30 &&
    /(規則|条例|規程|要綱|細則|訓令|告示|規定|基準|要領|達)$/.test(t) &&
    !/[（(]/.test(t) && !/第[0-9０-９一二三四五六七八九十百]+条/.test(t) && !/号/.test(t)
  );
}
const RE_WAREKI = /(令和|平成|昭和|大正)[元0-9０-９]+年[0-9０-９]+月[0-9０-９]+日/;
const RE_ENFORCE = /(?:この(?:条例|規則|要綱|規程|訓令|告示|法律)(?:等)?は、?)?\s*((?:令和|平成|昭和)[元0-9０-９]+年[0-9０-９]+月[0-9０-９]+日|公布の日)から(?:施行|適用)/;
const RE_SUBJECT_SUFFIX = /について[（(](?:通知|通達|依頼|照会|回答|報告)[)）]\s*$/;
// 発信者（役職名で終わる短い行）。宛先(殿/各位)や句読点・括弧で終わる行は除外。
const RE_ISSUER = /(?:大臣|長官|知事|市長|町長|村長|区長|議長|会長|理事長|委員長|本部長|部長|課長|室長|局長|所長|署長|園長|校長|社長|総長|教育長|本部)$/;

function extractMeta(lines: string[]): GovMeta {
  const meta: GovMeta = {};
  // 本文（条/章/記/附則）に入ったらメタ走査を打ち切る（附則の日付を公布日と誤検出しないため）。
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (RE_ARTICLE.test(t) || matchHeading(t) || RE_HEADNOTE.test(t) || RE_SUPPL.test(t) || t === '記') break;
    if (!meta.docNumber) {
      const m = t.match(RE_DOCNUM);
      if (m) meta.docNumber = m[1];
    }
    if (!meta.date) {
      const m = t.match(RE_WAREKI);
      if (m) meta.date = m[0];
    }
    if (!meta.addressee && /(殿|各位)$/.test(t) && t.length <= 40) meta.addressee = t;
    if (!meta.subject && RE_SUBJECT_SUFFIX.test(t)) meta.subject = t;
    if (!meta.issuer && t.length <= 15 && RE_ISSUER.test(t) && !/(殿|各位|。|、|）|\))$/.test(t) && t !== meta.addressee) {
      meta.issuer = t;
    }
  }
  // 施行日は本文末尾（附則）まで含めて走査
  for (const l of lines) {
    const m = l.match(RE_ENFORCE);
    if (m) { meta.enforceDate = m[1]; break; }
  }
  return meta;
}

// ===== 本体 =====
export function parseGovDoc(rawText: string): GovStructure {
  const text = (rawText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n');
  const meta = extractMeta(lines);

  const roots: GovNode[] = [];
  const stack: { node: GovNode; depth: number }[] = [];
  let counter = 0;
  const nid = () => `n${counter++}`;

  let pendingCaption: string | undefined; // 直前に出た条見出し（次の条へ付与）
  let title: string | undefined;
  let articleCount = 0;
  let noticeSignals = 0;
  let inToc = false; // 「目次」ブロックを読み飛ばし中
  let tocMaxChapter = 0; // 目次に現れた最大章番号（本文開始＝章番号リセットの検出用）
  let tocMaxHeadnote = 0; // 目次に現れた最大「第○」番号（章と同じ巻き戻り検出用）

  // 鑑文（cover）: 先頭付近のメタ行をまとめる
  let coverNode: GovNode | undefined;
  if (meta.docNumber || meta.addressee || meta.subject) {
    noticeSignals++;
    coverNode = { id: nid(), kind: 'cover', label: '鑑文', text: '', path: '鑑文', children: [] };
    const coverLines: string[] = [];
    if (meta.docNumber) coverLines.push(meta.docNumber);
    if (meta.date) coverLines.push(meta.date);
    if (meta.addressee) coverLines.push(meta.addressee);
    if (meta.issuer) coverLines.push(meta.issuer);
    if (meta.subject) coverLines.push(meta.subject);
    coverNode.text = coverLines.join('\n');
    roots.push(coverNode);
  }

  const attach = (node: GovNode, depth: number) => {
    while (stack.length && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = stack.length ? stack[stack.length - 1].node : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push({ node, depth });
  };

  const appendText = (line: string) => {
    if (stack.length) {
      const top = stack[stack.length - 1].node;
      top.text = top.text ? `${top.text}\n${line}` : line;
    } else if (!coverNode && title === undefined && line.trim()) {
      // 鑑文の無い文書（条例・規則）の最初の意味ある行＝題名。
      title = line.trim();
    } else if (line.trim()) {
      // 構造の外＝前文/本文段落として保持
      const last = roots[roots.length - 1];
      if (last && (last.kind === 'preamble' || last.kind === 'body')) {
        last.text += `\n${line}`;
      } else {
        // 鑑文が無く、まだ条が無い段階＝前文（制定文）。それ以外は本文。
        const k: GovNodeKind = !coverNode && articleCount === 0 ? 'preamble' : 'body';
        const node: GovNode = { id: nid(), kind: k, label: k === 'preamble' ? '前文' : '本文', text: line, path: k === 'preamble' ? '前文' : '本文', children: [] };
        roots.push(node);
      }
    }
  };

  // 記書き（記〜以上）状態
  let noteNode: GovNode | undefined;
  let noteItem: GovNode | undefined;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const t = rawLine.trim();
    if (!t) { if (noteItem) noteItem = undefined; continue; }

    // メタ行（鑑文に集約済み）は本文ツリーから除外
    if (coverNode && (t === meta.docNumber || t === meta.date || t === meta.addressee || t === meta.subject || t === meta.issuer)) continue;

    // PDF抽出のページ区切り「-- 1 of 174 --」を除去
    if (/^--\s*\d+\s+of\s+\d+\s*--$/.test(t)) continue;

    // 目次ブロック: 「目次」で開始し、本文（章番号のリセット or 行頭の条）に達するまで読み飛ばす。
    // 目次行（第○章 …（第○条－第○条））を実構造として取り込んでしまうのを防ぐ。
    if (!inToc && /^目[\s　]*次$/.test(t)) { inToc = true; tocMaxChapter = 0; tocMaxHeadnote = 0; continue; }
    if (inToc) {
      const hmToc = matchHeading(t);
      const hnToc = hmToc ? null : t.match(RE_HEADNOTE);
      if (RE_FOREWORD.test(t)) {
        inToc = false; // はしがき等の前書き＝本文開始（この行を本文として処理）
      } else if (hmToc && hmToc.unit === '章') {
        const n = kanjiToNum(hmToc.num);
        if (!isNaN(n) && n <= tocMaxChapter) inToc = false; // 章番号が戻った＝本文開始（この行を本文として処理）
        else { if (!isNaN(n)) tocMaxChapter = Math.max(tocMaxChapter, n); continue; }
      } else if (hnToc) {
        const n = kanjiToNum(hnToc[1]);
        if (!isNaN(n) && n <= tocMaxHeadnote) inToc = false; // 「第○」番号が戻った＝本文開始
        else { if (!isNaN(n)) tocMaxHeadnote = Math.max(tocMaxHeadnote, n); continue; }
      } else if (RE_ARTICLE.test(t)) {
        inToc = false; // 行頭に条が出た＝本文開始（この行を本文として処理）
      } else {
        continue; // 目次の節・別紙・附則・ページ番号等は読み飛ばす
      }
    }

    // 題名（鑑文ありで未設定のとき。条例/規則名の独立行を拾う）
    if (title === undefined && coverNode && i < 80 && looksLikeTitle(t)) { title = t; continue; }

    // 記書き
    if (t === '記') {
      noteNode = { id: nid(), kind: 'note', label: '記', text: '', path: '記', children: [] };
      roots.push(noteNode);
      noticeSignals++;
      stack.length = 0;
      continue;
    }
    if (noteNode && /^以上$/.test(t)) { noteNode = undefined; noteItem = undefined; continue; }
    if (noteNode) {
      const im = t.match(/^[（(]?([0-9０-９]+)[)）.．、　\s]\s*(.*)$/) || t.match(/^([・･])[　\s]*(.*)$/);
      if (im) {
        const num = im[1];
        noteItem = { id: nid(), kind: 'noteItem', num, label: `記 ${num}`, text: im[2] || '', path: `記 / ${num}`, children: [] };
        noteNode.children.push(noteItem);
      } else if (noteItem) {
        noteItem.text += `\n${t}`;
      } else {
        noteNode.text = noteNode.text ? `${noteNode.text}\n${t}` : t;
      }
      continue;
    }

    // 附則
    if (RE_SUPPL.test(t)) {
      const node: GovNode = { id: nid(), kind: 'supplementary', label: '附則', text: '', path: '附則', children: [] };
      stack.length = 0;
      roots.push(node);
      stack.push({ node, depth: 1 });
      continue;
    }
    // 別表・別記様式
    if (RE_APPENDIX.test(t)) {
      const node: GovNode = { id: nid(), kind: 'appendix', label: t.slice(0, 30), text: '', path: t.slice(0, 30), children: [] };
      stack.length = 0;
      roots.push(node);
      stack.push({ node, depth: 1 });
      continue;
    }

    // 編・章・節・款・目
    const hm = matchHeading(t);
    if (hm) {
      const kind = HEADING_KIND[hm.unit];
      const caption = (hm.caption || '').trim();
      const label = `第${hm.num}${hm.unit}`;
      const node: GovNode = { id: nid(), kind, num: hm.num, label, caption: caption || undefined, text: '', path: '', children: [] };
      attach(node, DEPTH[kind]!);
      pendingCaption = undefined;
      continue;
    }

    // 条見出し（（…）単独行）：次の条へ
    if (RE_CAPTION.test(t)) {
      // ただし直後が条でなければ本文かもしれない → いったん保留
      const cap = t.match(RE_CAPTION)![1];
      const next = (lines[i + 1] || '').trim();
      if (RE_ARTICLE.test(next) || RE_HEADNOTE.test(next)) { pendingCaption = cap; continue; }
      // 条が続かなければ本文として扱う
      appendText(rawLine);
      continue;
    }

    // 条
    const am = t.match(RE_ARTICLE);
    if (am) {
      const branch = am[2] ? `の${am[2]}` : '';
      const label = `第${am[1]}条${branch}`;
      const rest = t.slice(am[0].length).replace(/^[\s　　]+/, '');
      const node: GovNode = {
        id: nid(), kind: 'article', num: `${am[1]}${branch}`, label,
        caption: pendingCaption, text: rest, path: '', children: [],
      };
      attach(node, DEPTH.article!);
      pendingCaption = undefined;
      articleCount++;
      continue;
    }

    // 単位なし「第○」見出し（達・要綱スタイル。条に相当する深さで扱う）
    const hn = t.match(RE_HEADNOTE);
    if (hn) {
      const label = `第${hn[1]}`;
      const rest = t.slice(hn[0].length).replace(/^[\s　]+/, '');
      const node: GovNode = {
        id: nid(), kind: 'article', num: hn[1], label,
        caption: pendingCaption, text: rest, path: '', children: [],
      };
      attach(node, DEPTH.article!);
      pendingCaption = undefined;
      articleCount++;
      continue;
    }

    // 項（第2項以降）
    const pm = t.match(RE_PARAGRAPH);
    if (pm && stack.length && circledOrNum(pm[1])) {
      // 直近に条があるときのみ項として扱う
      const hasArticle = stack.some((s) => s.node.kind === 'article');
      if (hasArticle) {
        const numLabel = normalizeParaNum(pm[1]);
        const rest = t.slice(pm[0].length).replace(/^[\s　　]+/, '');
        const node: GovNode = { id: nid(), kind: 'paragraph', num: numLabel, label: `第${numLabel}項`, text: rest, path: '', children: [] };
        attach(node, DEPTH.paragraph!);
        continue;
      }
    }

    // 号
    const itm = t.match(RE_ITEM) || t.match(RE_ITEM_PAREN);
    if (itm && stack.some((s) => s.node.kind === 'article' || s.node.kind === 'paragraph')) {
      const num = itm[1];
      const rest = t.slice(itm[0].length).replace(/^[\s　　]+/, '');
      const node: GovNode = { id: nid(), kind: 'item', num, label: num, text: rest, path: '', children: [] };
      attach(node, DEPTH.item!);
      continue;
    }

    // イロハ
    const sm = t.match(RE_SUBITEM);
    if (sm && stack.some((s) => s.node.kind === 'item')) {
      const rest = t.slice(sm[0].length).replace(/^[\s　　]+/, '');
      const node: GovNode = { id: nid(), kind: 'subitem', num: sm[1], label: sm[1], text: rest, path: '', children: [] };
      attach(node, DEPTH.subitem!);
      continue;
    }

    // それ以外＝本文行（直近ノードへ追記、無ければ題名/前文/本文）
    appendText(rawLine);
  }

  // パス・目次を計算
  computePaths(roots, '');
  const toc = buildToc(roots);

  const family = decideFamily(articleCount, noticeSignals);
  return { family, title: meta.subject || title, meta, toc, nodes: roots };
}

function circledOrNum(s: string): boolean {
  return CIRCLED.includes(s) || /^[２-９０-９0-9]+$/.test(s);
}

function normalizeParaNum(s: string): string {
  const idx = CIRCLED.indexOf(s);
  if (idx >= 0) return String(idx + 1);
  return s.replace(/[０-９]/g, (d) => String('０１２３４５６７８９'.indexOf(d)));
}

function decideFamily(articleCount: number, noticeSignals: number): GovFamily {
  if (articleCount >= 2 && noticeSignals >= 1) return 'mixed';
  if (articleCount >= 2) return 'law';
  if (noticeSignals >= 1) return 'notice';
  return 'plain';
}

/** ノードに path（パンくず）を再帰付与。 */
function computePaths(nodes: GovNode[], parentPath: string): void {
  for (const n of nodes) {
    const self = n.caption && n.kind === 'chapter' ? `${n.label} ${n.caption}` : n.label;
    n.path = parentPath ? `${parentPath} / ${self}` : self;
    if (n.children.length) computePaths(n.children, n.path);
  }
}

/** 章・節・条レベルの目次を構築。 */
function buildToc(nodes: GovNode[], depth = 0, out: GovTocEntry[] = []): GovTocEntry[] {
  const TOC_KINDS: GovNodeKind[] = ['part', 'chapter', 'section', 'subsection', 'division', 'article', 'supplementary', 'appendix', 'cover', 'note'];
  for (const n of nodes) {
    if (TOC_KINDS.includes(n.kind)) {
      out.push({ id: n.id, kind: n.kind, label: n.label, caption: n.caption, depth });
      buildToc(n.children, depth + 1, out);
    } else {
      buildToc(n.children, depth, out);
    }
  }
  return out;
}

/** 取込テキストが行政文書らしいか（自動判定の補助）。 */
export function detectGovLikely(text: string): boolean {
  const s = text || '';
  const articleHits = (s.match(/第[一二三四五六七八九十百千0-9０-９]+条/g) || []).length;
  if (articleHits >= 2) return true;
  // 条が無くても、行頭に単位なし「第１ 」「第２ 」が並ぶ達・要綱スタイルは行政文書として扱う
  const headnoteHits = (s.match(/(^|\n)[\s　]*第[一二三四五六七八九十百千0-9０-９]+[\s　]+\S/g) || []).length;
  if (headnoteHits >= 3) return true;
  if (/(^|\n)\s*記\s*(\n|$)/.test(s) && RE_DOCNUM.test(s)) return true;
  if (RE_DOCNUM.test(s) && RE_SUBJECT_SUFFIX.test(s)) return true;
  return false;
}
