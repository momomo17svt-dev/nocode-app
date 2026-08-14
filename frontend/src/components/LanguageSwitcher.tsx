import { Globe2 } from 'lucide-react';
import { useLanguage, type Language } from '../lib/i18n';
import { cn } from '../lib/cn';

export function LanguageSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { language, setLanguage } = useLanguage();
  return (
    <label
      className={cn('inline-flex items-center gap-1.5 text-sm text-muted', className)}
      title={language === 'ja' ? '表示言語' : 'Display language'}
      data-i18n-ignore
    >
      <Globe2 className="size-4 shrink-0" />
      <select
        className={cn('input h-8 py-0', compact ? 'w-24 px-2' : 'w-28')}
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
        aria-label={language === 'ja' ? '表示言語' : 'Display language'}
      >
        <option value="ja">日本語</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
