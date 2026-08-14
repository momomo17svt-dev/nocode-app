import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { aiApi, type KnowledgeItem, type SearchHit, type SearchSourceMode } from '../../lib/ai';
import { useToast } from '../ui/Toast';
import { SourceCard } from './SourceCard';

/** 自然文によるセマンティック検索（ベクトル近傍）。docId 指定でその文書内のみ検索。 */
export function SearchPanel({
  disabled,
  docId,
  allowSourceSelection = false,
  sourceMode,
  apps = [],
  knowledge = [],
}: {
  disabled?: boolean;
  docId?: string;
  allowSourceSelection?: boolean;
  sourceMode?: SearchSourceMode;
  apps?: { id: string; name: string }[];
  knowledge?: KnowledgeItem[];
}) {
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedMode, setSelectedMode] = useState<SearchSourceMode>('both');
  const [selectedAppId, setSelectedAppId] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const activeMode = allowSourceSelection ? selectedMode : sourceMode || (docId ? 'knowledge' : 'both');

  const run = async () => {
    const q = query.trim();
    if (!q || loading) return;
    setLoading(true);
    try {
      const res = await aiApi.search(q, 15, {
        sourceMode: activeMode,
        appId: activeMode === 'records' ? selectedAppId || undefined : undefined,
        docId: activeMode === 'knowledge' ? (allowSourceSelection ? selectedDocId || undefined : docId) : undefined,
      });
      setHits(res.hits);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {allowSourceSelection && (
        <div className="mb-3 rounded-xl border border-border bg-surface-2/60 p-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="min-w-56 flex-1">
              <label className="label" htmlFor="semantic-search-source">検索対象</label>
              <select
                id="semantic-search-source"
                aria-label="検索対象"
                className="input"
                value={selectedMode}
                disabled={loading}
                onChange={(e) => { setSelectedMode(e.target.value as SearchSourceMode); setHits(null); }}
              >
                <option value="records">アプリデータのみ</option>
                <option value="knowledge">ナレッジのみ</option>
                <option value="both">アプリデータ＋ナレッジ</option>
              </select>
            </div>
            {activeMode === 'records' && (
              <div className="min-w-56 flex-1">
                <label className="label" htmlFor="semantic-search-app">対象アプリ</label>
                <select
                  id="semantic-search-app"
                  aria-label="検索するアプリ"
                  className="input"
                  value={selectedAppId}
                  disabled={loading}
                  onChange={(e) => { setSelectedAppId(e.target.value); setHits(null); }}
                >
                  <option value="">すべてのアプリ</option>
                  {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
            {activeMode === 'knowledge' && (
              <div className="min-w-56 flex-1">
                <label className="label" htmlFor="semantic-search-knowledge">対象ナレッジ</label>
                <select
                  id="semantic-search-knowledge"
                  aria-label="検索するナレッジ"
                  className="input"
                  value={selectedDocId}
                  disabled={loading}
                  onChange={(e) => { setSelectedDocId(e.target.value); setHits(null); }}
                >
                  <option value="">すべてのナレッジ</option>
                  {knowledge.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted" />
          <input
            className="input pl-9"
            placeholder={disabled ? 'AIと埋め込みモデルに接続できません' : '意味で探す（例: 納期が遅れそうな案件）'}
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
          <p className="text-sm text-muted py-8 text-center">キーワードの一致だけでなく、選択した範囲から文章の意味が近い情報を探します。</p>
        )}
      </div>
    </div>
  );
}
