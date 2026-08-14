import { useState } from 'react';
import { Search, Link2, X } from 'lucide-react';
import { api } from '../lib/api';
import { Modal } from './ui/Modal';
import type { FieldDef } from '../lib/fields';

/** 関連レコード参照フィールドの入力。別アプリのレコードを検索して選択し、{ id, label } を保存する。 */
export function ReferenceInput({ field, value, onChange, onLookup }: {
  field: FieldDef;
  value: any;
  onChange: (v: any) => void;
  /** 選択された参照先レコードの dataJson を親に渡す（ルックアップ転記用）。 */
  onLookup?: (refData: Record<string, any>) => void;
}) {
  const refAppId: string | undefined = field.settings?.refAppId;
  const displayCode: string | undefined = field.settings?.refDisplayField;
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState('');

  const labelOf = (r: any) => String(r.dataJson?.[displayCode ?? ''] ?? '') || r.id.slice(0, 8);

  const openPicker = () => {
    if (!refAppId) return;
    setQ('');
    setOpen(true);
    if (!loaded) {
      api.get(`/records?appId=${refAppId}`).then((rs) => { setRecords(rs); setLoaded(true); }).catch(() => {});
    }
  };

  const pick = (r: any) => {
    onChange({ id: r.id, label: labelOf(r) });
    onLookup?.(r.dataJson || {});
    setOpen(false);
  };

  if (!refAppId) {
    return <p className="text-sm text-muted">参照先アプリが未設定です（アプリ設定の項目設定で指定してください）。</p>;
  }

  const current = value && typeof value === 'object' ? value.label : '';
  const filtered = q ? records.filter((r) => labelOf(r).toLowerCase().includes(q.toLowerCase())) : records;

  return (
    <>
      <div className="flex items-center gap-2">
        <button type="button" className="input flex items-center justify-between text-left" onClick={openPicker}>
          <span className={current ? 'truncate' : 'text-muted'}>{current || 'レコードを選択...'}</span>
          <Link2 className="size-4 text-muted shrink-0" />
        </button>
        {current && (
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => onChange(null)} aria-label="クリア">
            <X className="size-4" />
          </button>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="関連レコードを選択" size="md">
        <div className="relative mb-3">
          <Search className="size-4 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input className="input pl-8" autoFocus placeholder="検索..." value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-80 overflow-auto">
          {!loaded ? (
            <p className="text-sm text-muted py-8 text-center">読み込み中...</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted py-8 text-center">該当するレコードがありません</p>
          ) : (
            filtered.map((r) => (
              <button key={r.id} type="button" onClick={() => pick(r)} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-surface-2 text-sm transition-colors">
                {labelOf(r)}
              </button>
            ))
          )}
        </div>
      </Modal>
    </>
  );
}
