import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, Search, BarChart3, Sparkles } from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import type { LlmHealth } from '../lib/ai';
import { LlmStatusBadge } from '../components/ai/LlmStatusBadge';
import { ChatPanel } from '../components/ai/ChatPanel';
import { SearchPanel } from '../components/ai/SearchPanel';
import { AnalysisPanel } from '../components/ai/AnalysisPanel';
import { cn } from '../lib/cn';

type Tab = 'chat' | 'search' | 'analyze';
const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'chat', label: 'チャット', icon: <MessageSquare className="size-4" /> },
  { key: 'search', label: 'セマンティック検索', icon: <Search className="size-4" /> },
  { key: 'analyze', label: 'AI分析', icon: <BarChart3 className="size-4" /> },
];

export function AiAssistant() {
  const [params, setParams] = useSearchParams();
  const initialApp = params.get('app') || '';
  const initialTab = (params.get('tab') as Tab) || (initialApp ? 'analyze' : 'chat');
  const [tab, setTab] = useState<Tab>(TABS.some((t) => t.key === initialTab) ? initialTab : 'chat');
  const [apps, setApps] = useState<{ id: string; name: string }[]>([]);
  const [health, setHealth] = useState<LlmHealth | null>(null);

  useEffect(() => {
    api.get('/apps').then((rows) => setApps((rows || []).map((a: any) => ({ id: a.id, name: a.name })))).catch(() => setApps([]));
  }, []);

  const selectTab = (t: Tab) => {
    setTab(t);
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next, { replace: true });
  };

  const connected = !!health?.ok;
  const ragReady = connected && !!(health?.embedModel || health?.resolvedEmbedModel); // RAG/検索は埋め込みモデル必須（自動解決含む）
  const chatReady = connected; // 分析・チャット生成はチャットモデル（自動解決）で可

  return (
    <Layout>
      <div className="flex flex-col h-[calc(100vh-7rem)] min-h-[480px]">
        <div className="flex items-center gap-2.5 mb-4 shrink-0">
          <span className="grid place-items-center size-9 rounded-xl bg-primary-soft text-primary-soft-fg">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight leading-tight">AIアシスタント</h1>
            <p className="text-xs text-muted">ローカルLLMで社内データを検索・分析します</p>
          </div>
        </div>

        <div className="mb-4 shrink-0">
          <LlmStatusBadge onHealth={setHealth} />
        </div>

        {/* タブ */}
        <div className="flex items-center gap-1 border-b border-border mb-5 shrink-0">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => selectTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.key ? 'border-primary text-content' : 'border-transparent text-muted hover:text-content',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0">
          {tab === 'chat' && <ChatPanel disabled={!ragReady} fill />}
          {tab === 'search' && (
            <div className="h-full overflow-y-auto pr-1">
              <SearchPanel disabled={!ragReady} />
            </div>
          )}
          {tab === 'analyze' && (
            <div className="h-full overflow-y-auto pr-1">
              <AnalysisPanel apps={apps} disabled={!chatReady} initialAppId={initialApp} />
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
