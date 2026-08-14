import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ChevronLeft, ChevronRight, Search, ScrollText, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { SkeletonRows } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { getLocale, translate } from '../../lib/i18n';

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

function matchingActionTypes(query: string): string[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  return Object.entries(ACTION_LABELS)
    .filter(([code, label]) => [code, label, translate(label)].some((value) => value.toLocaleLowerCase().includes(needle)))
    .map(([code]) => code);
}

export function AuditLogs() {
  const toast = useToast();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [users, setUsers] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');

  const load = useCallback((targetPage: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(targetPage), pageSize: String(PAGE_SIZE) });
    if (appliedQuery) {
      params.set('q', appliedQuery);
      const actionTypes = matchingActionTypes(appliedQuery);
      if (actionTypes.length) params.set('actionTypes', actionTypes.join(','));
    }
    return api.get<AuditLogPage>(`/audit-logs?${params.toString()}`)
      .then((result) => {
        setLogs(result.items);
        setPage(result.page);
        setTotal(result.total);
        setTotalPages(result.totalPages);
      })
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [appliedQuery, toast]);

  useEffect(() => {
    void load(1);
  }, [load]);

  useEffect(() => {
    void api.get<DirectoryUser[]>('/directory/users')
      .then((rows) => setUsers(Object.fromEntries(rows.map((user) => [user.id, user.name?.trim() || user.loginId]))))
      .catch(() => {});
  }, []);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const nextQuery = query.trim();
    if (nextQuery === appliedQuery) void load(1);
    else setAppliedQuery(nextQuery);
  };

  const clearSearch = () => {
    setQuery('');
    if (appliedQuery) setAppliedQuery('');
  };

  return (
    <Layout>
      <h1 className="text-xl font-bold tracking-tight mb-5">監査ログ</h1>
      <form className="mb-4 flex max-w-3xl items-center gap-2" onSubmit={submitSearch} role="search">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
          <input
            className="input w-full pl-9 pr-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ユーザー・操作・対象・IP・詳細を検索"
            aria-label="監査ログを検索"
          />
          {query && (
            <button
              type="button"
              className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted hover:bg-surface-hover hover:text-foreground"
              onClick={clearSearch}
              aria-label="検索をクリア"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <Button type="submit" variant="primary" loading={loading && !!appliedQuery}>検索</Button>
      </form>
      {loading ? (
        <SkeletonRows rows={8} cols={6} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="size-6" />}
          title={appliedQuery ? '一致するログがありません' : 'ログがありません'}
          description={appliedQuery ? '検索条件を変更するか、クリアしてください。' : undefined}
          action={appliedQuery ? <Button size="sm" onClick={clearSearch}>検索をクリア</Button> : undefined}
        />
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
                  <td className="px-4 py-2.5 text-muted whitespace-nowrap">{new Date(l.createdAt).toLocaleString(getLocale())}</td>
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
