import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, LayoutGrid, FileText, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';

interface Results {
  apps: { id: string; name: string }[];
  records: { appId: string; appName: string; recordId: string; title: string }[];
}

/** 全アプリ横断のコマンドパレット検索（Ctrl/⌘ + K）。 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Results>({ apps: [], records: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (open) { setQ(''); setRes({ apps: [], records: [] }); } }, [open]);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (!term) { setRes({ apps: [], records: [] }); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(() => {
      api.get(`/search?q=${encodeURIComponent(term)}`).then(setRes).catch(() => {}).finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const go = (path: string) => { onClose(); navigate(path); };
  const empty = res.apps.length === 0 && res.records.length === 0;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/50 backdrop-blur-[2px] animate-fade-in" onMouseDown={onClose}>
      <div className="card w-full max-w-xl p-0 overflow-hidden animate-pop-in" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 border-b border-border">
          <Search className="size-4 text-muted shrink-0" />
          <input
            autoFocus
            className="flex-1 bg-transparent py-3 outline-none text-sm"
            placeholder="アプリ・レコードを検索..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <kbd className="text-[10px] text-muted border border-border rounded px-1 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-[60vh] overflow-auto py-1">
          {q.trim() === '' ? (
            <div className="px-4 py-8 text-center text-sm text-muted">キーワードを入力してください</div>
          ) : loading && empty ? (
            <div className="px-4 py-8 text-center text-sm text-muted">検索中...</div>
          ) : empty ? (
            <div className="px-4 py-8 text-center text-sm text-muted">「{q}」に一致する結果がありません</div>
          ) : (
            <>
              {res.apps.length > 0 && (
                <Group title="アプリ">
                  {res.apps.map((a) => (
                    <Item key={a.id} icon={<LayoutGrid className="size-4" />} title={a.name} onClick={() => go(`/apps/${a.id}`)} />
                  ))}
                </Group>
              )}
              {res.records.length > 0 && (
                <Group title="レコード">
                  {res.records.map((r) => (
                    <Item key={r.recordId} icon={<FileText className="size-4" />} title={r.title} sub={r.appName} onClick={() => go(`/apps/${r.appId}/records/${r.recordId}`)} />
                  ))}
                </Group>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="py-1">
      <div className="px-4 py-1 text-[11px] font-semibold text-muted uppercase tracking-wide">{title}</div>
      {children}
    </div>
  );
}

function Item({ icon, title, sub, onClick }: { icon: ReactNode; title: string; sub?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-surface-2 transition-colors">
      <span className="grid place-items-center size-7 rounded-md bg-surface-2 text-muted shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm truncate">{title}</span>
        {sub && <span className="block text-xs text-muted truncate">{sub}</span>}
      </span>
      <ChevronRight className="size-4 text-muted shrink-0" />
    </button>
  );
}
