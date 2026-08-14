import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { aiApi, type SearchHit } from '../../lib/ai';
import { useToast } from '../ui/Toast';
import { SourceCard } from './SourceCard';

/** 自然文によるセマンティック検索（ベクトル近傍）。docId 指定でその文書内のみ検索。 */
export function SearchPanel({ disabled, docId }: { disabled?: boolean; docId?: string }) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    try {
      const res = await aiApi.search(q, 15, docId);
      setHits(res.hits);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
          <input
            className="input pl-9"
            placeholder={disabled ? 'ローカルLLMに接続できません' : '意味で探す（例: 納期が遅れそうな案件）'}
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary gap-1.5 shrink-0" disabled={disabled || !query.trim() || loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}検索
        </button>
      </form>

      <div className="mt-4 space-y-2">
        {loading && <p className="text-sm text-muted">検索中…</p>}
        {!loading && hits && hits.length === 0 && <p className="text-sm text-muted py-8 text-center">該当する情報が見つかりませんでした。</p>}
        {!loading && hits && hits.length > 0 && (
          <>
            <p className="text-xs text-muted">{hits.length} 件の関連情報</p>
            {hits.map((h, i) => <SourceCard key={i} hit={h} />)}
          </>
        )}
        {!loading && !hits && (
          <p className="text-sm text-muted py-8 text-center">キーワードの一致だけでなく、文章の意味が近いレコード・文書を探します。</p>
        )}
      </div>
    </div>
  );
}
