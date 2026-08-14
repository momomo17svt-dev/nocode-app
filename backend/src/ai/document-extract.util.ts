import { BadRequestException } from '@nestjs/common';
import { extname } from 'path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

/** ナレッジ文書アップロードで本文抽出できる拡張子。 */
export const SUPPORTED_DOC_EXTENSIONS = [
  '.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.log', '.html', '.htm', '.xml', '.yaml', '.yml',
  '.pdf', '.docx',
] as const;

/** input[type=file] の accept 属性用文字列。 */
export const SUPPORTED_DOC_ACCEPT = SUPPORTED_DOC_EXTENSIONS.join(',');

/** 抽出後テキストの最大文字数（UpsertDocDto の content 上限に合わせる）。 */
export const MAX_EXTRACTED_CHARS = 200_000;

// 制御文字（タブ\t・改行\n・復帰\r を除く）を除去する。ソースに生バイトを置かないため文字列から構築。
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]', 'g');

/** 拡張子をMIMEではなく名前から判定（MIMEはブラウザ/OS依存で不安定なため）。 */
function extOf(fileName: string): string {
  return extname((fileName || '').toLowerCase());
}

/** HTML/XMLからタグを除いて読めるテキストにする簡易処理。 */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|li|tr|h[1-6]|br)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');
}

// CJK文字（ひらがな・カタカナ全域(・ー含む U+30A1-30FF)・々・漢字 基本＋拡張A＋互換）。
const CJK = 'ぁ-ゖァ-ヿ々〆〤一-鿿㐀-䶿豈-﫿';
// 隣接する2つのCJK文字の間にある半角スペース/タブ。全角空白(　)は対象外。
const CJK_GAP = new RegExp('(?<=[' + CJK + '])[ \\t]+(?=[' + CJK + '])', 'g');
// 行頭の号(漢数字)・イロハ列挙子＋その区切り（gov-structure の RE_ITEM/RE_SUBITEM が依存）。
const ENUM_LEAD = /^(?:[一二三四五六七八九十]+|[イロハニホヘトチリヌルヲワカヨタレソ])[ \t]/;

/**
 * PDF抽出で CJK が一文字ごとに半角空白で区切られる副作用（"請 求 異 動"）を除去する。
 * - 全角空白(　)は号/イロハ判定の区切りに使われるため絶対に消さない。
 * - 行頭の号・イロハ列挙子の直後の区切りは1個保持し、構造解析(号/イロハ)を壊さない。
 */
export function normalizeCjkSpaces(text: string): string {
  if (!text) return text;
  return text
    .split('\n')
    .map((line) => {
      const m = line.match(ENUM_LEAD);
      if (m) {
        const lead = m[0]; // 列挙子＋区切り（保持）
        return lead + line.slice(lead.length).replace(CJK_GAP, '');
      }
      return line.replace(CJK_GAP, '');
    })
    .join('\n');
}

/** 連続する空白/空行を軽く整える（埋め込みノイズ低減）。 */
function tidy(text: string): string {
  return normalizeCjkSpaces(
    (text || '')
      .replace(/\r\n/g, '\n')
      .replace(CONTROL_CHARS, '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

async function extractPdf(buffer: Buffer): Promise<string> {
  // pdf-parse v2: PDFParse インスタンスで getText()。Buffer は Uint8Array へ変換して渡す。
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  try {
    const res = await parser.getText();
    return res.text || '';
  } finally {
    await parser.destroy();
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const res = await mammoth.extractRawText({ buffer });
  return res.value || '';
}

export interface ExtractResult {
  text: string;
  truncated: boolean;
  ext: string;
}

/**
 * アップロードファイルから本文テキストを抽出する。
 * 対応: テキスト系(UTF-8) / PDF(pdf-parse) / Word .docx(mammoth)。
 * 非対応の拡張子・空ファイルは BadRequestException。
 */
export async function extractDocumentText(
  buffer: Buffer,
  fileName: string,
  _mimeType?: string,
): Promise<ExtractResult> {
  if (!buffer || buffer.length === 0) throw new BadRequestException('ファイルが空です');
  const ext = extOf(fileName);

  let raw: string;
  if (ext === '.pdf') {
    raw = await extractPdf(buffer);
  } else if (ext === '.docx') {
    raw = await extractDocx(buffer);
  } else if (ext === '.doc') {
    throw new BadRequestException('旧形式の .doc は非対応です。.docx で保存し直してアップロードしてください。');
  } else if (['.html', '.htm', '.xml'].includes(ext)) {
    raw = htmlToText(buffer.toString('utf8'));
  } else if (
    ['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.log', '.yaml', '.yml'].includes(ext)
  ) {
    raw = buffer.toString('utf8');
  } else {
    throw new BadRequestException(
      `非対応のファイル形式です（${ext || '拡張子なし'}）。対応形式: ${SUPPORTED_DOC_EXTENSIONS.join(' / ')}`,
    );
  }

  const tidied = tidy(raw);
  if (!tidied) {
    throw new BadRequestException('ファイルから本文テキストを抽出できませんでした（画像のみのPDF等の可能性があります）。');
  }
  const truncated = tidied.length > MAX_EXTRACTED_CHARS;
  return { text: truncated ? tidied.slice(0, MAX_EXTRACTED_CHARS) : tidied, truncated, ext };
}
