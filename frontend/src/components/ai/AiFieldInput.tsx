import { useRef, useState } from 'react';
import { Sparkles, Loader2, Square } from 'lucide-react';
import { generateStream, type QueuedInfo } from '../../lib/ai';
import { QueueHint } from './QueueHint';
import type { FieldDef } from '../../lib/fields';

/** AI生成フィールドの入力UI。プロンプト（アプリ設定）から値をストリーミング生成しつつ、手動編集も可能。 */
export function AiFieldInput({ field, value, onChange, appId, record }: {
  field: FieldDef;
  value: any;
  onChange: (v: any) => void;
  appId?: string;
  record?: Record<string, any>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [queued, setQueued] = useState<QueuedInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasPrompt = !!field.settings?.prompt;

  const run = async () => {
    if (!appId || !hasPrompt || busy) return;
    setErr('');
    setBusy(true);
    setQueued(null);
    let acc = '';
    onChange('');
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    await generateStream(
      { appId, fieldCode: field.fieldCode, data: record || {} },
      {
        signal: ctrl.signal,
        onQueued: (info) => setQueued(info),
        onToken: (t) => { setQueued(null); acc += t; onChange(acc); },
        onError: (m) => { setQueued(null); setErr(m); },
        onDone: () => { setQueued(null); setBusy(false); abortRef.current = null; },
      },
    );
  };

  const stop = () => abortRef.current?.abort();

  return (
    <div>
      <textarea
        className="input"
        rows={4}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={hasPrompt ? 'AIで生成、または直接入力できます' : 'AI生成プロンプトが未設定です（アプリ設定の項目で設定してください）'}
      />
      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
        {busy ? (
          <button type="button" className="btn btn-sm btn-danger gap-1" onClick={stop}><Square className="size-3.5" />停止</button>
        ) : (
          <button type="button" className="btn btn-sm gap-1" onClick={run} disabled={!appId || !hasPrompt} title={hasPrompt ? 'プロンプトから生成' : 'プロンプト未設定'}>
            <Sparkles className="size-3.5" />AIで生成
          </button>
        )}
        {busy && <QueueHint active={busy} queued={queued} fallback={<span className="text-xs text-muted flex items-center gap-1"><Loader2 className="size-3 animate-spin" />生成中…</span>} />}
        {err && <span className="text-xs text-danger break-words">{err}</span>}
      </div>
    </div>
  );
}
