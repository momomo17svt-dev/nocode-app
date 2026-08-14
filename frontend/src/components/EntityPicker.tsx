import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { api } from '../lib/api';

interface Item {
  id: string;
  label: string;
}

interface Props {
  kind: 'user' | 'group';
  value: string | null;
  /** value に対応する表示名（選択済みの表示用）。 */
  label?: string;
  onChange: (id: string | null, label: string) => void;
  placeholder?: string;
  /** 候補から除外するID（既に選択済みのもの等）。 */
  excludeIds?: string[];
  /** kind='user' のとき 'mygroups' で「自分の所属部署＋配下部署のメンバー」のみに絞る。 */
  scope?: 'mygroups';
  className?: string;
  autoFocus?: boolean;
}

/**
 * ユーザー/グループを「検索」で選ぶピッカー。
 * 15万ユーザー・2万グループを <select> に展開しないための部品。
 * /directory/{kind}s?q=... を叩いて最大20件を表示する（空クエリでは全件取得しない）。
 */
export function EntityPicker({
  kind,
  value,
  label,
  onChange,
  placeholder,
  excludeIds,
  scope,
  className,
  autoFocus,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const placeholderText = placeholder || (kind === 'user' ? 'ユーザーを検索…' : 'グループを検索…');

  // 外側クリックで閉じる
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  // クエリ変更でデバウンス検索（空のときは全件取得を避けて検索しない）
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (!term) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const h = setTimeout(async () => {
      try {
        const scopeParam = kind === 'user' && scope ? `&scope=${scope}` : '';
        const data: any[] = await api.get(`/directory/${kind}s?take=20&q=${encodeURIComponent(term)}${scopeParam}`);
        const items: Item[] = data
          .map((d) => ({ id: d.id, label: kind === 'user' ? (d.name?.trim() || d.loginId) : d.name }))
          .filter((it) => !excludeIds?.includes(it.id));
        setResults(items);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [query, open, kind, excludeIds, scope]);

  const select = (it: Item) => {
    onChange(it.id, it.label);
    setOpen(false);
    setQuery('');
  };
  const clear = () => {
    onChange(null, '');
    setQuery('');
    setResults([]);
  };

  const term = query.trim();

  return (
    <div ref={boxRef} className={`relative ${className || ''}`}>
      <div className="relative">
        <Search className="size-4 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          className="input pl-8 pr-8"
          placeholder={placeholderText}
          autoFocus={autoFocus}
          value={open ? query : value ? label ?? '' : ''}
          onFocus={() => {
            setOpen(true);
            setQuery('');
          }}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && results[0]) {
              e.preventDefault();
              select(results[0]);
            }
          }}
        />
        {value && !open && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-content"
            onClick={clear}
            aria-label="選択を解除"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {open && (
        <div className="absolute z-30 mt-1 w-full card p-1 max-h-60 overflow-auto shadow-lg">
          {loading && <div className="px-3 py-2 text-sm text-muted">検索中…</div>}
          {!loading && term === '' && <div className="px-3 py-2 text-sm text-muted">名前を入力して検索</div>}
          {!loading && term !== '' && results.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted">該当なし</div>
          )}
          {!loading &&
            results.map((it) => (
              <button
                type="button"
                key={it.id}
                className="w-full text-left px-3 py-1.5 rounded-md hover:bg-surface-hover text-sm"
                onClick={() => select(it)}
              >
                {it.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
