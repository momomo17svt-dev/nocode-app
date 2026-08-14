/** RFC4180準拠の簡易CSVパーサ（ダブルクオート・改行を含むセルに対応）。 */
export function parseCsv(text: string): string[][] {
  // 先頭のBOMを除去
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c === '\r') { /* skip */ }
      else cell += c;
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ''));
}

/**
 * Fileをテキストとして読む。UTF-8で文字化け(置換文字)が出る場合はShift_JISで再デコード。
 */
export async function readCsvFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (utf8.includes('�')) {
    try {
      return new TextDecoder('shift_jis').decode(buf);
    } catch {
      return utf8;
    }
  }
  return utf8;
}
