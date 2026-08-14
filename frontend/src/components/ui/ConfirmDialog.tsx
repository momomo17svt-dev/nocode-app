import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const Ctx = createContext<ConfirmApi | null>(null);

export function useConfirm(): ConfirmApi {
  const c = useContext(Ctx);
  if (!c) throw new Error('useConfirm must be used within a ConfirmProvider');
  return c;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setOpts(null);
  };

  return (
    <Ctx.Provider value={{ confirm }}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => settle(false)}
        size="sm"
        title={opts?.title ?? '確認'}
        footer={
          <>
            <Button onClick={() => settle(false)}>{opts?.cancelText ?? 'キャンセル'}</Button>
            <Button variant={opts?.danger ? 'danger' : 'primary'} onClick={() => settle(true)} autoFocus>
              {opts?.confirmText ?? 'OK'}
            </Button>
          </>
        }
      >
        <div className="flex gap-3">
          {opts?.danger && <AlertTriangle className="size-5 text-danger shrink-0 mt-0.5" />}
          <div className="text-sm leading-relaxed whitespace-pre-wrap">{opts?.message}</div>
        </div>
      </Modal>
    </Ctx.Provider>
  );
}
