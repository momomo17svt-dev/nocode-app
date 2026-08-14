import { useState } from 'react';
import { Sparkles, Loader2, FileText, ListChecks } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Markdown } from '../ui/Markdown';
import { aiApi } from '../../lib/ai';

/** レコード詳細用：AI要約／次アクション提案を呼ぶボタン＋モーダル。 */
export function RecordAiButton({ recordId }: { recordId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'summary' | 'next' | null>(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const run = async (m: 'summary' | 'next') => {
    setMode(m);
    setLoading(true);
    setResult('');
    setError('');
    try {
      const r = await aiApi.analyzeRecord(recordId, m);
      setResult(r.result);
    } catch (e: any) {
      setError(e.message || 'AI処理に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button icon={<Sparkles className="size-4" />} onClick={() => setOpen(true)}>AI</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="AIアシスト" size="md">
        <div className="flex gap-2 mb-4">
          <button className={`btn btn-sm gap-1.5 ${mode === 'summary' ? 'btn-primary' : ''}`} onClick={() => run('summary')} disabled={loading}>
            <FileText className="size-4" />要約する
          </button>
          <button className={`btn btn-sm gap-1.5 ${mode === 'next' ? 'btn-primary' : ''}`} onClick={() => run('next')} disabled={loading}>
            <ListChecks className="size-4" />次のアクション提案
          </button>
        </div>

        {loading && <p className="text-sm text-muted flex items-center gap-2 py-6 justify-center"><Loader2 className="size-4 animate-spin" />AIが処理しています…</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
        {!loading && result && <div className="rounded-lg bg-surface-2 p-4"><Markdown content={result} /></div>}
        {!loading && !result && !error && <p className="text-sm text-muted py-6 text-center">操作を選ぶと、このレコードの内容をAIが処理します。</p>}
      </Modal>
    </>
  );
}
