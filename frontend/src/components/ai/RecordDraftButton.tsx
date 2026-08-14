import { useRef, useState, type ReactNode } from 'react';
import { Sparkles, FileText, Camera, ImageUp, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { aiApi } from '../../lib/ai';
import { useToast } from '../ui/Toast';

type Mode = 'text' | 'photo';

/** 画像を長辺 max px へ縮小し JPEG 化（base64 肥大化と送信時間を抑える）。失敗時は元ファイルを返す。 */
async function compressImage(file: File, max = 1600, quality = 0.8): Promise<File> {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    URL.revokeObjectURL(url);
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    if (scale >= 1 && file.size < 1_500_000) return file; // 既に十分小さい
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], 'capture.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** 文章 or 写真からレコードのフィールド値をAIで下書きするボタン＋モーダル。 */
export function RecordDraftButton({ appId, onApply }: { appId: string; onApply: (values: Record<string, any>) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const setImage = (f: File | null) => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : '';
    });
    setFile(f);
  };

  const close = () => {
    setOpen(false);
    setText('');
    setImage(null);
  };

  const apply = (r: { values: Record<string, any>; filled: string[] }) => {
    const n = r.filled?.length || 0;
    if (n === 0) {
      toast.info('該当する項目を抽出できませんでした。もう少し鮮明な画像／具体的な文章でお試しください。');
      return;
    }
    onApply(r.values);
    toast.success(`${n}個の項目を入力しました（保存前にご確認ください）`);
    close();
  };

  const run = async () => {
    if (loading) return;
    try {
      setLoading(true);
      if (mode === 'text') {
        if (!text.trim()) return;
        apply(await aiApi.draftRecord(appId, text));
      } else {
        if (!file) return;
        const img = await compressImage(file);
        apply(await aiApi.draftRecordImage(appId, img));
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const canRun = mode === 'text' ? !!text.trim() : !!file;
  const tab = (m: Mode, icon: ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`btn-sm rounded-md gap-1.5 ${mode === m ? 'bg-surface shadow-sm text-content' : 'text-muted hover:text-content'}`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <>
      <Button icon={<Sparkles className="size-4" />} onClick={() => setOpen(true)}>AIで下書き</Button>
      <Modal
        open={open}
        onClose={close}
        title="AIで下書き"
        size="md"
        footer={<>
          <Button onClick={close}>キャンセル</Button>
          <Button variant="primary" icon={<Sparkles className="size-4" />} loading={loading} disabled={!canRun} onClick={run}>
            {mode === 'text' ? '抽出して入力' : '読み取って入力'}
          </Button>
        </>}
      >
        <div className="inline-flex rounded-lg border border-border bg-surface-2 p-0.5 mb-3">
          {tab('text', <FileText className="size-4" />, '文章から')}
          {tab('photo', <Camera className="size-4" />, '写真から')}
        </div>

        {mode === 'text' ? (
          <>
            <p className="text-sm text-muted mb-2">内容を自然な文章で書くと、AIが各項目に振り分けて入力します。選択肢や日付も判定します（保存前に確認・修正できます）。</p>
            <textarea
              className="input min-h-40"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="例: 4月10日に新宿のA社を訪問。山田部長と商談し、見積書を今週中に送付予定。優先度は高。"
              autoFocus
            />
          </>
        ) : (
          <>
            <p className="text-sm text-muted mb-2">書類・伝票・名刺・手書きメモなどを撮影またはアップロードすると、AIが文字を読み取って各項目に入力します（保存前に確認・修正できます）。</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => setImage(e.target.files?.[0] || null)}
            />
            {preview ? (
              <div className="relative">
                <img src={preview} alt="読み取り対象のプレビュー" className="w-full max-h-64 rounded-lg border border-border bg-surface-2 object-contain" />
                <button
                  type="button"
                  className="btn btn-icon btn-sm absolute right-2 top-2 bg-surface/90"
                  onClick={() => setImage(null)}
                  aria-label="画像を削除"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border py-10 text-muted hover:border-border-strong hover:text-content"
                onClick={() => fileRef.current?.click()}
              >
                <ImageUp className="size-7" />
                <span className="text-sm">画像を選択 / 撮影</span>
              </button>
            )}
            {loading && <p className="mt-2 text-xs text-muted">画像を読み取っています… モデルによっては数十秒かかることがあります。</p>}
          </>
        )}
      </Modal>
    </>
  );
}
