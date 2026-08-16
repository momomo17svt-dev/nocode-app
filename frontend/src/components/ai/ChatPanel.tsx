import { useRef, useState } from 'react';
import { Send, Square, Bot, User as UserIcon, Loader2, Sparkles } from 'lucide-react';
import {
  askStream,
  type ChatMsg,
  type ChatSourceMode,
  type KnowledgeItem,
  type SearchHit,
  type QueuedInfo,
} from '../../lib/ai';
import { SourceCard } from './SourceCard';
import { QueueHint } from './QueueHint';
import { Markdown } from '../ui/Markdown';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchHit[];
  streaming?: boolean;
}

const SUGGESTIONS: Record<ChatSourceMode, string[]> = {
  plain: ['依頼メールの文章を整えて', 'アイデアを箇条書きで整理して', '次の文章を分かりやすく要約して'],
  records: ['今週の未対応案件をまとめて', '進捗が遅れている項目は？', '最近登録されたレコードの傾向は？'],
  knowledge: ['登録資料の要点をまとめて', '関連する規程を教えて', '手順と注意点を整理して'],
  both: ['社内データから関連情報を探して', '案件と資料を横断してまとめて', '根拠と一緒に回答して'],
};

interface AppLite {
  id: string;
  name: string;
}

interface ChatPanelProps {
  disabled?: boolean;
  ragDisabled?: boolean;
  docId?: string;
  fill?: boolean;
  allowSourceSelection?: boolean;
  sourceMode?: ChatSourceMode;
  apps?: AppLite[];
  knowledge?: KnowledgeItem[];
}

/** 通常チャットと、参照範囲を明示したRAGチャット。 */
export function ChatPanel({
  disabled,
  ragDisabled,
  docId,
  fill,
  allowSourceSelection = false,
  sourceMode,
  apps = [],
  knowledge = [],
}: ChatPanelProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<QueuedInfo | null>(null);
  const [selectedMode, setSelectedMode] = useState<ChatSourceMode>(sourceMode || (docId ? 'knowledge' : 'plain'));
  const [selectedAppId, setSelectedAppId] = useState('');
  const [selectedDocId, setSelectedDocId] = useState(docId || '');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const activeMode: ChatSourceMode = allowSourceSelection
    ? selectedMode
    : sourceMode || (docId ? 'knowledge' : 'both');
  const activeDisabled = !!disabled || (activeMode !== 'plain' && !!ragDisabled);

  const scopeLabel = activeMode === 'plain'
    ? '参照なし（通常チャット）'
    : activeMode === 'records'
      ? `アプリデータのみ${selectedAppId ? `：${apps.find((a) => a.id === selectedAppId)?.name || '選択したアプリ'}` : '：すべて'}`
      : activeMode === 'knowledge'
        ? `ナレッジのみ${(allowSourceSelection ? selectedDocId : docId) ? `：${knowledge.find((d) => d.id === (selectedDocId || docId))?.title || '選択した文書'}` : '：すべて'}`
        : 'アプリデータ＋ナレッジ';

  const resetConversation = () => {
    setTurns([]);
    setInput('');
    setQueued(null);
  };

  const scrollToEnd = () => requestAnimationFrame(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (typeof el.scrollTo === 'function') el.scrollTo({ top: el.scrollHeight });
    else el.scrollTop = el.scrollHeight;
  });

  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setInput('');
    const history: ChatMsg[] = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: 'user', content: question }, { role: 'assistant', content: '', streaming: true }]);
    setBusy(true);
    setQueued(null);
    scrollToEnd();

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const patchLast = (patch: Partial<Turn>) =>
      setTurns((prev) => {
        const next = [...prev];
        const i = next.length - 1;
        if (i >= 0) next[i] = { ...next[i], ...patch };
        return next;
      });

    await askStream(
      {
        question,
        history,
        sourceMode: activeMode,
        appId: activeMode === 'records' ? selectedAppId || undefined : undefined,
        docId: activeMode === 'knowledge' ? (allowSourceSelection ? selectedDocId || undefined : docId) : undefined,
      },
      {
        signal: ctrl.signal,
        onSources: (s) => { patchLast({ sources: s }); scrollToEnd(); },
        onQueued: (info) => { setQueued(info); scrollToEnd(); },
        onToken: (t) => { setQueued(null); setTurns((prev) => { const n = [...prev]; const i = n.length - 1; if (i >= 0) n[i] = { ...n[i], content: n[i].content + t }; return n; }); scrollToEnd(); },
        onError: (m) => { setQueued(null); patchLast({ content: `⚠️ ${m}`, streaming: false }); },
        onDone: () => { setQueued(null); patchLast({ streaming: false }); setBusy(false); abortRef.current = null; },
      },
    );
  };

  const stop = () => { abortRef.current?.abort(); setBusy(false); setQueued(null); };

  return (
    <div className={fill ? 'flex flex-col h-full min-h-[360px]' : 'flex flex-col h-[calc(100vh-15rem)] min-h-[420px]'}>
      {allowSourceSelection && (
        <div className="mb-3 shrink-0 rounded-xl border border-border bg-surface-2/60 p-3">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="min-w-56 flex-1">
              <label className="label" htmlFor="ai-chat-source">参照範囲</label>
              <select
                id="ai-chat-source"
                aria-label="参照範囲"
                className="input"
                value={selectedMode}
                disabled={busy}
                onChange={(e) => {
                  setSelectedMode(e.target.value as ChatSourceMode);
                  resetConversation();
                }}
              >
                <option value="plain">参照なし（通常チャット）</option>
                <option value="records">アプリデータのみ</option>
                <option value="knowledge">ナレッジのみ</option>
                <option value="both">アプリデータ＋ナレッジ</option>
              </select>
            </div>

            {activeMode === 'records' && (
              <div className="min-w-56 flex-1">
                <label className="label" htmlFor="ai-chat-app">対象アプリ</label>
                <select
                  id="ai-chat-app"
                  aria-label="対象アプリ"
                  className="input"
                  value={selectedAppId}
                  disabled={busy}
                  onChange={(e) => { setSelectedAppId(e.target.value); resetConversation(); }}
                >
                  <option value="">すべてのアプリ</option>
                  {apps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}

            {activeMode === 'knowledge' && (
              <div className="min-w-56 flex-1">
                <label className="label" htmlFor="ai-chat-knowledge">対象ナレッジ</label>
                <select
                  id="ai-chat-knowledge"
                  aria-label="対象ナレッジ"
                  className="input"
                  value={selectedDocId}
                  disabled={busy}
                  onChange={(e) => { setSelectedDocId(e.target.value); resetConversation(); }}
                >
                  <option value="">すべてのナレッジ</option>
                  {knowledge.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                </select>
              </div>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">
            現在：<span className="font-medium text-content">{scopeLabel}</span>
            {activeMode === 'plain' ? '。社内データはAIへ送りません。' : '。回答後に参照元を表示します。'}
            {' '}参照範囲を変えると新しい会話になります。
          </p>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {turns.length === 0 && (
          <div className="h-full grid place-items-center text-center px-4">
            <div>
              <div className="mx-auto grid place-items-center size-12 rounded-2xl bg-primary-soft text-primary-soft-fg mb-3">
                <Sparkles className="size-6" />
              </div>
              <p className="font-medium">{activeMode === 'plain' ? 'AIに相談できます' : '選択した社内データに質問できます'}</p>
              <p className="text-sm text-muted mt-1">
                {activeMode === 'plain' ? '現在はアプリデータやナレッジを参照しません。' : `${scopeLabel}を検索し、根拠を示して回答します。`}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS[activeMode].map((s) => (
                  <button key={s} className="btn btn-sm" onClick={() => send(s)} disabled={activeDisabled}>{s}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={`flex gap-3 ${t.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <span className={`mt-0.5 grid place-items-center size-8 shrink-0 rounded-full ${t.role === 'user' ? 'bg-surface-2 text-muted' : 'bg-primary-soft text-primary-soft-fg'}`}>
              {t.role === 'user' ? <UserIcon className="size-4" /> : <Bot className="size-4" />}
            </span>
            <div className={`max-w-[80%] ${t.role === 'user' ? 'text-right' : ''}`}>
              <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm break-words text-left ${t.role === 'user' ? 'bg-primary text-primary-fg whitespace-pre-wrap' : 'bg-surface-2'}`}>
                {t.role === 'assistant'
                  ? (t.content
                      ? <Markdown content={t.content} />
                      : (t.streaming
                          ? (i === turns.length - 1
                              ? <QueueHint active queued={queued} fallback={<Loader2 className="size-4 animate-spin" />} />
                              : <Loader2 className="size-4 animate-spin" />)
                          : ''))
                  : t.content}
              </div>
              {t.sources && t.sources.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-[11px] font-medium text-muted">参照した情報</p>
                  {t.sources.map((s, j) => <SourceCard key={j} hit={s} index={j + 1} />)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        className="mt-3 flex items-end gap-2 border-t border-border pt-3"
        onSubmit={(e) => { e.preventDefault(); send(input); }}
      >
        <textarea
          className="input flex-1 resize-none min-h-[44px] max-h-32 py-2.5"
          rows={1}
          placeholder={activeDisabled
            ? (activeMode === 'plain' ? 'AIに接続できません' : 'この参照方法にはAIと埋め込みモデルの接続が必要です')
            : '質問を入力…（Enterで送信 / Shift+Enterで改行）'}
          value={input}
          disabled={activeDisabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
        />
        {busy ? (
          <button type="button" className="btn btn-danger gap-1.5 shrink-0" onClick={stop}><Square className="size-4" />停止</button>
        ) : (
          <button type="submit" className="btn btn-primary gap-1.5 shrink-0" disabled={activeDisabled || !input.trim()}><Send className="size-4" />送信</button>
        )}
      </form>
    </div>
  );
}
