import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'default' | 'danger' | 'ghost';
type Size = 'md' | 'sm';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  loading?: boolean;
}

const variantClass: Record<Variant, string> = {
  primary: 'btn-primary',
  default: '',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
};

export function Button({
  variant = 'default',
  size = 'md',
  icon,
  loading,
  className,
  children,
  disabled,
  ...rest
}: Props) {
  return (
    <button
      className={cn('btn', variantClass[variant], size === 'sm' && 'btn-sm', !children && 'btn-icon', className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
