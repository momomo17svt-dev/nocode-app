import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import { api } from '../../lib/api';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'ログイン', LOGOUT: 'ログアウト', CHANGE_PASSWORD: 'パスワード変更',
  APP_CREATE: 'アプリ作成', APP_UPDATE: 'アプリ編集', APP_DELETE: 'アプリ削除',
  APP_DUPLICATE: 'アプリ複製', APP_STATUS_CHANGE: 'アプリ公開設定変更', APP_PERMISSION_CHANGE: 'アプリ権限変更',
  RECORD_CREATE: 'レコード作成', RECORD_UPDATE: 'レコード編集', RECORD_DELETE: 'レコード削除',
  CSV_EXPORT: 'CSVエクスポート', CSV_IMPORT: 'CSVインポート', FORM_DEFINITION_CHANGE: 'フォーム定義変更',
  USER_CREATE: 'ユーザー作成', USER_UPDATE: 'ユーザー変更', USER_DELETE: 'ユーザー削除',
  GROUP_CREATE: 'グループ作成', GROUP_UPDATE: 'グループ編集', GROUP_DELETE: 'グループ削除',
  GROUP_MEMBER_ADD: 'グループ追加', GROUP_MEMBER_REMOVE: 'グループ除外',
  ATTACHMENT_UPLOAD: '添付追加', ATTACHMENT_DELETE: '添付削除',
};

interface AuditLogItem {
  id: string;
  userId: string | null;
  actionType: string;
  targetResource: string;
  targetId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogPage {
  items: AuditLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface DirectoryUser {
  id: string;
  loginId: string;
  name?: string | null;
}

const PAGE_SIZE = 50;

export function AuditLogs() {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const load = useCallback((targetPage: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(targetPage), pageSize: String(PAGE_SIZE) });
    return api.get<AuditLogPage>(`/audit-logs?${params.toString()}`)
      .then((result) => {
        setLogs(result.items);
        setPage(result.page);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    void load(1);
    void api.get<DirectoryUser[]>('/directory/users')
      .then((rows) => setUsers(Object.fromEntries(rows.map((user) => [user.id, user.name?.trim() || user.loginId]))))
      .catch(() => {});
  }, [load]);

  return (
    <Layout>
      <h1 className="text-xl font-bold tracking-tight mb-5">監査ログ</h1>
      {loading ? (
        <SkeletonRows rows={8} cols={6} />
      ) : logs.length === 0 ? (
        <EmptyState icon={<ScrollText className="size-6" />} title="ログがありません" />
      ) : (
        <>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="px-4 py-2.5 text-left font-semibold">日時</th>
                <th className="px-4 py-2.5 text-left font-semibold">ユーザー</th>
                <th className="px-4 py-2.5 text-left font-semibold">操作</th>
                <th className="px-4 py-2.5 text-left font-semibold">対象</th>
                <th className="px-4 py-2.5 text-left font-semibold">IP</th>
                <th className="px-4 py-2.5 text-left font-semibold">詳細</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                  <td className="px-4 py-2.5 text-muted whitespace-nowrap">{new Date(l.createdAt).toLocaleString('ja-JP')}</td>
                  <td className="px-4 py-2.5">{l.userId ? (users[l.userId] || l.userId.slice(0, 8)) : '—'}</td>
                  <td className="px-4 py-2.5"><span className="badge">{ACTION_LABELS[l.actionType] || l.actionType}</span></td>
                  <td className="px-4 py-2.5 text-muted">{l.targetResource}{l.targetId ? `:${String(l.targetId).slice(0, 8)}` : ''}</td>
                  <td className="px-4 py-2.5 text-muted">{l.ipAddress || '—'}</td>
                  <td className="px-4 py-2.5 text-muted text-xs max-w-xs truncate">{l.details && Object.keys(l.details).length ? JSON.stringify(l.details) : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 mt-3">
          <span className="text-sm text-muted tabular-nums">全 {total} 件・{totalPages} ページ中 {page} ページ目</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="btn-icon" disabled={page <= 1 || loading} onClick={() => void load(page - 1)} aria-label="前へ">
              <ChevronLeft className="size-4" />
            </Button>
            <Button variant="ghost" size="sm" className="btn-icon" disabled={page >= totalPages || loading} onClick={() => void load(page + 1)} aria-label="次へ">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        </>
      )}
    </Layout>
  );
}
