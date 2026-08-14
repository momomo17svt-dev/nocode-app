import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be used within a ToastProvider');
  return c;
}

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => setItems((x) => x.filter((t) => t.id !== id)), []);

  const show = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = ++seq;
      setItems((x) => [...x, { id, kind, message }]);
      setTimeout(() => remove(id), 4200);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (message) => show(message, 'success'),
      error: (message) => show(message, 'error'),
      info: (message) => show(message, 'info'),
    }),
    [show],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      {createPortal(
        <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
          {items.map((t) => (
            <ToastView key={t.id} item={t} onClose={() => remove(t.id)} />
          ))}
        </div>,
        document.body,
      )}
    </Ctx.Provider>
  );
}

const ICONS: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="size-5 text-success" />,
  error: <AlertCircle className="size-5 text-danger" />,
  info: <Info className="size-5 text-primary" />,
};

function ToastView({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  return (
    <div className="card animate-toast-in flex items-start gap-3 p-3.5 shadow-[var(--shadow-pop)]">
      <span className="shrink-0 mt-0.5">{ICONS[item.kind]}</span>
      <p className="flex-1 text-sm leading-snug whitespace-pre-wrap break-words">{item.message}</p>
      <button className="btn btn-ghost btn-icon btn-sm shrink-0 -m-1" onClick={onClose} aria-label="閉じる">
        <X className="size-4" />
      </button>
    </div>
  );
}
