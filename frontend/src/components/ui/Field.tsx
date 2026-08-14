import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface Props {
  label?: ReactNode;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** ラベル＋入力＋補足のラッパ。 */
export function Field({ label, required, hint, children, className }: Props) {
  return (
    <div className={cn(className)}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
