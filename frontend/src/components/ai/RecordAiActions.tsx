import { useRef, useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Markdown } from '../ui/Markdown';
import { api } from '../../lib/api';
import { generateStream, type QueuedInfo } from '../../lib/ai';
import { QueueHint } from './QueueHint';
import { useToast } from '../ui/Toast';
import type { FieldDef } from '../../lib/fields';

interface AiAction { id: string; name: string; prompt: string; output: 'show' | 'field'; targetField?: string }

/** レコード詳細のアプリ定義AIアクションボタン群（結果表示 / 指定項目へ書込）。 */
export function RecordAiActions({ appId, recordId, actions, data, canEdit, fields, onWritten }: {
  appId: string;
  recordId: string;
  actions: AiAction[];
  data: Record<string, any>;
  canEdit: boolean;
  fields: FieldDef[];
  onWritten: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<AiAction | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [queued, setQueued] = useState<QueuedInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 項目書込アクションは編集権限がある場合のみ表示
  const visible = (actions || []).filter((a) => a.output !== 'field' || canEdit);
  if (visible.length === 0) return null;

  const labelOf = (code?: string) => fields.find((f) => f.fieldCode === code)?.label || code || '項目';

  const run = async (a: AiAction) => {
    setActive(a);
    setText('');
    setErr('');
    setBusy(true);
    setQueued(null);
    setOpen(true);
    let acc = '';
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    await generateStream(
      { appId, actionId: a.id, data },
      {
        signal: ctrl.signal,
        onQueued: (info) => setQueued(info),
        onToken: (t) => { setQueued(null); acc += t; setText(acc); },
        onError: (m) => { setQueued(null); setErr(m); },
        onDone: () => { setQueued(null); setBusy(false); abortRef.current = null; },
      },
    );
  };

  const close = () => { abortRef.current?.abort(); setOpen(false); };

  const writeToField = async () => {
    if (!active?.targetField || !text.trim()) return;
    try {
      await api.put(`/records/${recordId}`, { data: { [active.targetField]: text } });
      toast.success(`「${labelOf(active.targetField)}」に書き込みました`);
      setOpen(false);
      onWritten();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <>
      {visible.map((a) => (
        <Button key={a.id} icon={<Sparkles className="size-4" />} onClick={() => run(a)}>{a.name}</Button>
      ))}
      <Modal
        open={open}
        onClose={close}
        title={active?.name || 'AI'}
        size="md"
        footer={
          active?.output === 'field' ? (
            <>
              <Button onClick={close}>閉じる</Button>
              <Button variant="primary" disabled={busy || !text.trim() || !active.targetField} onClick={writeToField}>
                「{labelOf(active?.targetField)}」に書き込む
              </Button>
            </>
          ) : (
            <Button onClick={close}>閉じる</Button>
          )
        }
      >
        {busy && !text && (
          <p className="text-sm text-muted flex items-center gap-2 py-4">
            <QueueHint active={busy} queued={queued} fallback={<><Loader2 className="size-4 animate-spin" />生成中…</>} />
          </p>
        )}
        {err && <p className="text-sm text-danger break-words">{err}</p>}
        {text && <div className="rounded-lg bg-surface-2 p-4"><Markdown content={text} /></div>}
      </Modal>
    </>
  );
}
