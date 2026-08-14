import { useState } from 'react';
import { Upload, Download, FileSpreadsheet } from 'lucide-react';
import { api } from '../lib/api';
import { parseCsv, readCsvFile } from '../lib/csv';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { useToast } from './ui/Toast';

export interface CsvColumn {
  /** バックエンドへ送るキー名。 */
  key: string;
  /** 推奨ヘッダー名（テンプレCSVの見出し）。 */
  label: string;
  /** 必須列か（プレビューの注記用）。 */
  required?: boolean;
  /** 受理する別名ヘッダー（key/label以外）。 */
  aliases?: string[];
  /** 書式の補足説明。 */
  hint?: string;
}

interface ImportResult {
  created: number;
  updated?: number;
  errors: { row: number; message: string }[];
}

interface Props {
  /** 送信先（例: '/users/import'）。 */
  endpoint: string;
  /** 取り込む列の定義（ヘッダー対応・プレビューに使用）。 */
  columns: CsvColumn[];
  /** 取込ボタンの文言。 */
  buttonLabel?: string;
  /** 取込完了後に呼ばれる（一覧の再読込など）。 */
  onDone: () => void;
}

/** CSVをセル値としてエスケープ（RFC4180）。 */
function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

export function CsvImportModal({
  endpoint, columns, buttonLabel = 'CSV取込', onDone,
}: Props) {
  const toast = useToast();
  const [staged, setStaged] = useState<{ rows: Record<string, any>[]; ignored: string[] } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onFile = async (file: File) => {
    try {
      const grid = parseCsv(await readCsvFile(file));
      if (grid.length < 2) { toast.error('データ行がありません'); return; }
      // ヘッダー → 列キーの対応を作る（label / key / aliases で照合）
      const colMap = grid[0].map((h) => {
        const head = h.trim();
        const col = columns.find(
          (c) => c.label === head || c.key === head || c.aliases?.includes(head),
        );
        return col?.key ?? null;
      });
      const ignored = grid[0].filter((_, i) => colMap[i] === null).map((h) => h.trim()).filter(Boolean);
      const rows = grid.slice(1).map((r) => {
        const o: Record<string, any> = {};
        r.forEach((v, i) => { if (colMap[i]) o[colMap[i] as string] = v; });
        return o;
      });
      setStaged({ rows, ignored });
    } catch (e: any) {
      toast.error(e.message || 'CSV読み込みに失敗しました');
    }
  };

  const confirmImport = async () => {
    if (!staged) return;
    setSubmitting(true);
    try {
      const res: ImportResult = await api.post(endpoint, { rows: staged.rows });
      const parts = [`${res.created}件を追加`];
      if (typeof res.updated === 'number' && res.updated > 0) parts.push(`${res.updated}件を更新`);
      const summary = parts.join('・') + 'しました';
      if (res.errors.length) {
        toast.error(
          `${summary}。エラー${res.errors.length}件:\n` +
            res.errors.slice(0, 10).map((e) => `行${e.row}: ${e.message}`).join('\n') +
            (res.errors.length > 10 ? `\n…他${res.errors.length - 10}件` : ''),
        );
      } else {
        toast.success(summary);
      }
      setStaged(null);
      onDone();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <label className="btn cursor-pointer">
        <Upload className="size-4" />{buttonLabel}
        <input
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }}
        />
      </label>

      <Modal
        open={!!staged}
        onClose={() => setStaged(null)}
        title="CSVインポート確認"
        size="lg"
        footer={
          <>
            <Button onClick={() => setStaged(null)}>キャンセル</Button>
            <Button variant="primary" onClick={confirmImport} loading={submitting} disabled={!staged?.rows.length}>
              取り込む
            </Button>
          </>
        }
      >
        {staged && (
          <div className="space-y-3">
            <p className="text-sm">{staged.rows.length}件を取り込みます。先頭5件のプレビュー:</p>
            {staged.ignored.length > 0 && (
              <p className="text-xs text-muted">
                無視された列: {staged.ignored.join(', ')}
              </p>
            )}
            <div className="card overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {columns.map((c) => (
                      <th key={c.key} className="px-3 py-2 text-left font-semibold text-muted whitespace-nowrap">
                        {c.label}{c.required && ' *'}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {staged.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      {columns.map((c) => (
                        <td key={c.key} className="px-3 py-2 whitespace-nowrap">{String(row[c.key] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

/** 取込フォーマットの説明＋テンプレCSVダウンロード（モーダル外に置く補助UI）。 */
export function CsvFormatHelp({
  columns, sampleRows = [], templateFileName = 'template.csv',
}: {
  columns: CsvColumn[];
  sampleRows?: string[][];
  templateFileName?: string;
}) {
  const downloadTemplate = () => {
    const header = columns.map((c) => csvCell(c.label)).join(',');
    const lines = sampleRows.map((r) => r.map((v) => csvCell(v ?? '')).join(','));
    const csv = '﻿' + [header, ...lines].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = templateFileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-border bg-surface-2 p-3 text-xs text-muted space-y-1.5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 font-semibold text-content">
          <FileSpreadsheet className="size-3.5" />CSVの書式
        </span>
        <Button size="sm" variant="ghost" icon={<Download className="size-3.5" />} onClick={downloadTemplate}>
          テンプレCSVをダウンロード
        </Button>
      </div>
      <ul className="list-disc pl-4 space-y-0.5">
        {columns.map((c) => (
          <li key={c.key}>
            <span className="font-medium text-content">{c.label}</span>
            {c.required ? '（必須）' : '（任意）'}
            {c.hint ? ` — ${c.hint}` : ''}
          </li>
        ))}
      </ul>
      <p>1行目はヘッダー行。文字コードはUTF-8またはShift_JISに対応しています。</p>
    </div>
  );
}
