import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, UserPlus, AtSign, AlarmClock, RefreshCw, type LucideIcon } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { getLocale } from '../lib/i18n';

interface Notif {
  id: string;
  type: string;
  title: string;
  body?: string | null;
  appId?: string | null;
  recordId?: string | null;
  isRead: boolean;
  createdAt: string;
}

const ICONS: Record<string, LucideIcon> = {
  assignment: UserPlus,
  mention: AtSign,
  reminder: AlarmClock,
  status_change: RefreshCw,
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const navigate = useNavigate();

  const loadCount = () => api.get('/notifications/unread-count').then((r) => setUnread(r.count)).catch(() => {});
  const loadList = () => api.get('/notifications').then((r) => { setItems(r.items); setUnread(r.unread); }).catch(() => {});

  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 30000); // LAN想定: 30秒ごとに未読数をポーリング
    return () => clearInterval(t);
  }, []);

  const openPanel = () => { setOpen(true); loadList(); };

  const onClickItem = async (n: Notif) => {
    if (!n.isRead) { try { await api.post(`/notifications/${n.id}/read`, {}); } catch { /* noop */ } }
    setOpen(false);
    if (n.recordId && n.appId) navigate(`/apps/${n.appId}/records/${n.recordId}`);
    else if (n.appId) navigate(`/apps/${n.appId}`);
    loadCount();
  };

  const markAll = async () => { try { await api.post('/notifications/read-all', {}); } catch { /* noop */ } loadList(); loadCount(); };

  return (
    <div className="relative">
      <button className="btn btn-ghost btn-icon relative" onClick={() => (open ? setOpen(false) : openPanel())} aria-label="通知" title="通知">
        <Bell className="size-[18px]" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 grid place-items-center rounded-full bg-danger text-white text-[10px] font-bold leading-none">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-[22rem] max-w-[90vw] card p-0 z-50 animate-pop-in shadow-[var(--shadow-pop)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <span className="font-semibold text-sm">通知</span>
              {items.some((i) => !i.isRead) && (
                <button className="text-xs text-primary inline-flex items-center gap-1 hover:underline" onClick={markAll}>
                  <CheckCheck className="size-3.5" />すべて既読
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-auto">
              {items.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-muted">通知はありません</div>
              ) : (
                items.map((n) => {
                  const Ic = ICONS[n.type] ?? Bell;
                  return (
                    <button
                      key={n.id}
                      onClick={() => onClickItem(n)}
                      className={cn(
                        'w-full text-left flex gap-3 px-4 py-3 border-b border-border last:border-0 hover:bg-surface-2 transition-colors',
                        !n.isRead && 'bg-primary-soft/30',
                      )}
                    >
                      <span className="grid place-items-center size-8 rounded-full bg-surface-2 text-muted shrink-0">
                        <Ic className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className={cn('text-sm leading-snug', !n.isRead && 'font-semibold')}>{n.title}</div>
                        {n.body && <div className="text-xs text-muted truncate mt-0.5">{n.body}</div>}
                        <div className="text-[11px] text-muted mt-0.5">{new Date(n.createdAt).toLocaleString(getLocale())}</div>
                      </div>
                      {!n.isRead && <span className="size-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
