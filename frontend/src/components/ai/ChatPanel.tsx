import { useRef, useState } from 'react';
import { Send, Square, Bot, User as UserIcon, Loader2, Sparkles } from 'lucide-react';
import { askStream, type ChatMsg, type SearchHit, type QueuedInfo } from '../../lib/ai';
import { SourceCard } from './SourceCard';
import { QueueHint } from './QueueHint';
import { Markdown } from '../ui/Markdown';

interface Turn {
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchHit[];
  streaming?: boolean;
}

const SUGGESTIONS = ['今週の未対応案件をまとめて', '進捗が遅れている項目は？', '最近登録されたレコードの傾向は？'];

/** RAGチャット。質問→出典付きストリーミング回答。docId 指定でその文書内のみを対象にする。 */
export function ChatPanel({ disabled, docId, fill }: { disabled?: boolean; docId?: string; fill?: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState<QueuedInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const scrollToEnd = () => requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));

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
      { question, history, docId },
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-4 pr-1">
        {turns.length === 0 && (
          <div className="h-full grid place-items-center text-center px-4">
            <div>
              <div className="mx-auto grid place-items-center size-12 rounded-2xl bg-primary-soft text-primary-soft-fg mb-3">
                <Sparkles className="size-6" />
              </div>
              <p className="font-medium">蓄積されたデータに質問できます</p>
              <p className="text-sm text-muted mt-1">レコードと登録文書を横断し、根拠を示して回答します。</p>
              <div className="mt-4 flex flex-wrap gap-2 justify-center">
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="btn btn-sm" onClick={() => send(s)} disabled={disabled}>{s}</button>
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
          placeholder={disabled ? 'ローカルLLMに接続できません' : '質問を入力…（Enterで送信 / Shift+Enterで改行）'}
          value={input}
          disabled={disabled}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
        />
        {busy ? (
          <button type="button" className="btn btn-danger gap-1.5 shrink-0" onClick={stop}><Square className="size-4" />停止</button>
        ) : (
          <button type="submit" className="btn btn-primary gap-1.5 shrink-0" disabled={disabled || !input.trim()}><Send className="size-4" />送信</button>
        )}
      </form>
    </div>
  );
}
