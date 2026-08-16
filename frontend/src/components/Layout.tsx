import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Gauge,
  LayoutGrid,
  Sparkles,
  Library,
  Users,
  UsersRound,
  ScrollText,
  BrainCircuit,
  Sun,
  Moon,
  LogOut,
  KeyRound,
  Menu,
  X,
  ChevronDown,
  Zap,
  Search,
  Settings,
} from 'lucide-react';
import { getUser, logout, roleLabel, isAdmin, canManageDirectory, userDisplay } from '../lib/auth';
import { api } from '../lib/api';
import { getTheme, toggleTheme, type Theme } from '../lib/theme';
import { cn } from '../lib/cn';
import { NotificationBell } from './NotificationBell';
import { CommandPalette } from './CommandPalette';
import { APP_NAME } from '../config/branding';
import { LanguageSwitcher } from './LanguageSwitcher';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** アクティブ判定（前方一致）。 */
  match: (path: string) => boolean;
}

export function Layout({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const [palette, setPalette] = useState(false);
  const [theme, setTheme] = useState<Theme>(getTheme());

  // 画面遷移でドロワー/メニューを閉じる
  useEffect(() => {
    setDrawer(false);
    setMenu(false);
  }, [location.pathname]);

  // Ctrl/⌘ + K でコマンドパレットを開く
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout', {});
    } catch {
      /* ログアウトの監査記録に失敗しても続行 */
    }
    logout();
    navigate('/login');
  };

  const onToggleTheme = () => setTheme(toggleTheme());

  const items: NavItem[] = [
    {
      to: '/',
      label: 'ホーム',
      icon: <LayoutDashboard className="size-[18px]" />,
      match: (p) => p === '/',
    },
    {
      to: '/dashboards',
      label: 'ダッシュボード',
      icon: <Gauge className="size-[18px]" />,
      match: (p) => p.startsWith('/dashboards'),
    },
    {
      to: '/apps',
      label: 'アプリ',
      icon: <LayoutGrid className="size-[18px]" />,
      match: (p) => p.startsWith('/apps'),
    },
    {
      to: '/ai',
      label: 'AIアシスタント',
      icon: <Sparkles className="size-[18px]" />,
      match: (p) => p === '/ai',
    },
    {
      to: '/knowledge',
      label: 'ナレッジ',
      icon: <Library className="size-[18px]" />,
      match: (p) => p === '/knowledge' || p.startsWith('/ai/documents'),
    },
  ];
  // ユーザー/グループ管理は管理者(GroupAdmin)も利用可。AI設定・監査ログはシステム管理者のみ。
  if (canManageDirectory(user)) {
    items.push(
      { to: '/admin/users', label: 'ユーザー', icon: <Users className="size-[18px]" />, match: (p) => p.startsWith('/admin/users') },
      { to: '/admin/groups', label: 'グループ', icon: <UsersRound className="size-[18px]" />, match: (p) => p.startsWith('/admin/groups') },
    );
  }
  if (isAdmin(user)) {
    items.push(
      { to: '/admin/ai', label: 'AI設定', icon: <BrainCircuit className="size-[18px]" />, match: (p) => p.startsWith('/admin/ai') },
      { to: '/admin/audit', label: '監査ログ', icon: <ScrollText className="size-[18px]" />, match: (p) => p.startsWith('/admin/audit') },
      { to: '/admin/system', label: 'システム設定', icon: <Settings className="size-[18px]" />, match: (p) => p.startsWith('/admin/system') },
    );
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <Link to="/" className="flex items-center gap-2.5 px-5 h-16 shrink-0">
        <span className="grid place-items-center size-8 rounded-lg bg-primary text-primary-fg shadow-[0_2px_8px_-2px_var(--primary)]">
          <Zap className="size-[18px]" />
        </span>
        <span className="font-bold tracking-tight leading-tight">{APP_NAME}</span>
      </Link>
      <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
        {items.map((it) => {
          const active = it.match(location.pathname);
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary-soft text-primary-soft-fg'
                  : 'text-muted hover:bg-surface-2 hover:text-content',
              )}
            >
              {it.icon}
              {it.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-4 py-3 text-[11px] text-muted border-t border-border">
        オフライン業務アプリ基盤
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-canvas text-content">
      {/* デスクトップ サイドバー */}
      <aside className="hidden md:block w-60 shrink-0 border-r border-border bg-surface">
        <div className="sticky top-0 h-screen">{sidebar}</div>
      </aside>

      {/* モバイル ドロワー */}
      {drawer && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50 animate-fade-in" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-surface border-r border-border animate-fade-in">
            <button
              className="btn btn-ghost btn-icon btn-sm absolute top-4 right-3"
              onClick={() => setDrawer(false)}
              aria-label="閉じる"
            >
              <X className="size-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      {/* メイン */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-2 h-16 px-4 sm:px-6 border-b border-border bg-surface/85 backdrop-blur">
          <button
            className="btn btn-ghost btn-icon md:hidden"
            onClick={() => setDrawer(true)}
            aria-label="メニュー"
          >
            <Menu className="size-5" />
          </button>
          <button
            className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 h-9 text-sm text-muted hover:border-border-strong transition-colors max-w-xs"
            onClick={() => setPalette(true)}
            title="検索 (Ctrl+K)"
          >
            <Search className="size-4" />
            <span className="hidden sm:inline">検索</span>
            <kbd className="hidden sm:inline text-[10px] border border-border rounded px-1 ml-1">Ctrl K</kbd>
          </button>
          <div className="flex-1" />

          <LanguageSwitcher compact className="hidden sm:inline-flex" />

          <NotificationBell />

          <button className="btn btn-ghost btn-icon" onClick={onToggleTheme} aria-label="テーマ切替" title="テーマ切替">
            {theme === 'dark' ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>

          <div className="relative shrink-0">
            <button className="btn btn-ghost gap-2 min-w-0 max-w-[13rem]" onClick={() => setMenu((m) => !m)}>
              <span
                className="grid place-items-center size-7 shrink-0 overflow-hidden rounded-full bg-primary-soft text-primary-soft-fg text-xs font-bold"
                data-i18n-ignore
              >
                {(userDisplay(user) || '?').slice(0, 2).toUpperCase()}
              </span>
              <span className="hidden lg:flex min-w-0 max-w-40 flex-col items-start leading-tight">
                <span className="w-full truncate text-[13px] font-semibold">{userDisplay(user)}</span>
                <span className="w-full truncate text-[11px] text-muted font-normal">{roleLabel(user?.role || '')}</span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted" />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
                <div className="absolute right-0 mt-2 w-52 card p-1.5 z-50 animate-pop-in shadow-[var(--shadow-pop)]">
                  <div className="px-3 py-2 lg:hidden">
                    <div className="truncate text-sm font-semibold">{userDisplay(user)}</div>
                    <div className="truncate text-xs text-muted">{roleLabel(user?.role || '')}</div>
                  </div>
                  <div className="px-3 py-2 sm:hidden border-t border-border">
                    <LanguageSwitcher compact />
                  </div>
                  <Link
                    to="/account/password"
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm hover:bg-surface-2"
                  >
                    <KeyRound className="size-4 text-muted" />
                    パスワード変更
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-danger hover:bg-danger-soft"
                  >
                    <LogOut className="size-4" />
                    ログアウト
                  </button>
                </div>
              </>
            )}
          </div>
        </header>

        <main className="flex-1 w-full px-3 sm:px-4 py-4">{children}</main>
      </div>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
