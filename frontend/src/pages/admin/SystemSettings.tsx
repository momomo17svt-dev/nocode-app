import { useEffect, useState } from 'react';
import {
  ArchiveRestore,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  DatabaseBackup,
  Download,
  KeyRound,
  Loader2,
  MapPin,
  Play,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { Layout } from '../../components/Layout';
import { EntityPicker } from '../../components/EntityPicker';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Modal } from '../../components/ui/Modal';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import { api } from '../../lib/api';
import { formatDateTime, formatNumber } from '../../lib/i18n';
import { BASEMAPS, getBasemap, loadMapManifest, mapManifest } from '../../lib/map';

interface AuthPolicy {
  maxFailedAttempts: number;
  lockoutMinutes: number;
  attemptWindowMinutes: number;
  sessionHours: number;
  passwordMinLength: number;
}

interface MapPolicy {
  defaultBasemap: string;
  tileUrl: string;
}

interface BackupState {
  policy: { enabled: boolean; hour: number; retentionDays: number };
  status: { running?: boolean; lastSuccessAt?: string; lastFailureAt?: string; lastFile?: string; lastError?: string | null };
  files: { name: string; size: number; createdAt: string }[];
}

interface ApiToken {
  id: string;
  name: string;
  tokenPrefix: string;
  ownerId: string;
  ownerName: string;
  readOnly: boolean;
  expiresAt?: string;
  revokedAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}

interface TrashRecord {
  id: string;
  originalId: string;
  appId: string;
  appName: string;
  deletedAt: string;
  expiresAt: string;
}

interface TrashPage {
  items: TrashRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const dateTime = (value?: string) => value ? formatDateTime(value) : '—';
const fileSize = (bytes: number) => bytes < 1_048_576 ? `${formatNumber(Math.ceil(bytes / 1_024))} KB` : `${(bytes / 1_048_576).toFixed(1)} MB`;

export function SystemSettings() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState<AuthPolicy | null>(null);
  const [backup, setBackup] = useState<BackupState | null>(null);
  const [map, setMap] = useState<MapPolicy | null>(null);
  const [savingMap, setSavingMap] = useState(false);
  const [tileStyles, setTileStyles] = useState<string[]>(mapManifest().styles);
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [trash, setTrash] = useState<TrashRecord[]>([]);
  const [trashPage, setTrashPage] = useState(1);
  const [trashTotal, setTrashTotal] = useState(0);
  const [trashTotalPages, setTrashTotalPages] = useState(1);
  const [savingAuth, setSavingAuth] = useState(false);
  const [savingBackup, setSavingBackup] = useState(false);
  const [runningBackup, setRunningBackup] = useState(false);
  const [tokenForm, setTokenForm] = useState({ name: '', ownerId: '', ownerName: '', readOnly: true, expiresInDays: 90 });
  const [creatingToken, setCreatingToken] = useState(false);
  const [createdToken, setCreatedToken] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [authPolicy, backupState, mapPolicy, apiTokens, trashRows] = await Promise.all([
        api.get<AuthPolicy>('/system/auth-policy', { cacheMs: 0 }),
        api.get<BackupState>('/system/backup', { cacheMs: 0 }),
        api.get<MapPolicy>('/system/map', { cacheMs: 0 }),
        api.get<ApiToken[]>('/system/api-tokens', { cacheMs: 0 }),
        api.get<TrashPage>('/records/trash?page=1&pageSize=50', { cacheMs: 0 }),
      ]);
      setAuth(authPolicy);
      setBackup(backupState);
      setMap(mapPolicy);
      setTileStyles((await loadMapManifest(true)).styles);
      setTokens(apiTokens);
      setTrash(trashRows.items);
      setTrashPage(trashRows.page);
      setTrashTotal(trashRows.total);
      setTrashTotalPages(trashRows.totalPages);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadTrash = async (page: number) => {
    try {
      const result = await api.get<TrashPage>(`/records/trash?page=${page}&pageSize=50`, { cacheMs: 0 });
      setTrash(result.items);
      setTrashPage(result.page);
      setTrashTotal(result.total);
      setTrashTotalPages(result.totalPages);
    } catch (e: any) { toast.error(e.message); }
  };

  const saveAuth = async () => {
    if (!auth) return;
    setSavingAuth(true);
    try {
      setAuth(await api.put('/system/auth-policy', auth));
      toast.success('ログイン・パスワード設定を保存しました');
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingAuth(false); }
  };

  const saveMap = async () => {
    if (!map) return;
    setSavingMap(true);
    try {
      setMap(await api.put('/system/map', map));
      // 開いている画面の地図が新しい既定で描かれるよう、取得済みの情報を捨てて読み直す。
      await loadMapManifest(true);
      toast.success('地図の設定を保存しました');
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingMap(false); }
  };

  const saveBackup = async () => {
    if (!backup) return;
    setSavingBackup(true);
    try {
      const policy = await api.put('/system/backup', backup.policy);
      setBackup({ ...backup, policy });
      toast.success('自動バックアップ設定を保存しました');
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingBackup(false); }
  };

  const runBackup = async () => {
    setRunningBackup(true);
    try {
      const result: any = await api.post('/system/backup/run', {});
      if (!result.success) throw new Error(result.message || 'バックアップに失敗しました');
      toast.success('バックアップを作成しました');
      await load();
    } catch (e: any) { toast.error(e.message); }
    finally { setRunningBackup(false); }
  };

  const downloadBackup = async (name: string) => {
    try {
      const blob = await api.getBlob(`/system/backup/files/${encodeURIComponent(name)}`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = name; link.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e.message); }
  };

  const createToken = async () => {
    if (!tokenForm.name.trim() || !tokenForm.ownerId) { toast.error('用途名と利用ユーザーを指定してください'); return; }
    setCreatingToken(true);
    try {
      const result: any = await api.post('/system/api-tokens', {
        name: tokenForm.name,
        ownerId: tokenForm.ownerId,
        readOnly: tokenForm.readOnly,
        expiresInDays: tokenForm.expiresInDays,
      });
      setCreatedToken(result.token);
      setTokenForm({ name: '', ownerId: '', ownerName: '', readOnly: true, expiresInDays: 90 });
      setTokens(await api.get('/system/api-tokens', { cacheMs: 0 }));
    } catch (e: any) { toast.error(e.message); }
    finally { setCreatingToken(false); }
  };

  const revokeToken = async (token: ApiToken) => {
    if (!(await confirm({ message: `APIトークン「${token.name}」を無効にしますか？`, danger: true, confirmText: '無効にする' }))) return;
    try {
      await api.delete(`/system/api-tokens/${token.id}`);
      setTokens(await api.get('/system/api-tokens', { cacheMs: 0 }));
      toast.success('APIトークンを無効にしました');
    } catch (e: any) { toast.error(e.message); }
  };

  const restore = async (row: TrashRecord) => {
    if (!(await confirm({ message: `「${row.appName}」のレコードを復元しますか？`, confirmText: '復元' }))) return;
    try {
      await api.post(`/records/trash/${row.id}/restore`, {});
      await loadTrash(trashPage);
      toast.success('レコードを復元しました');
    } catch (e: any) { toast.error(e.message); }
  };

  const purge = async (row: TrashRecord) => {
    if (!(await confirm({ message: '完全に削除すると元に戻せません。添付ファイルも削除されます。実行しますか？', danger: true, confirmText: '完全に削除' }))) return;
    try {
      await api.delete(`/records/trash/${row.id}`);
      await loadTrash(trashPage);
      toast.success('完全に削除しました');
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading && !auth) return <Layout><div className="py-24 grid place-items-center text-muted"><Loader2 className="size-6 animate-spin" /></div></Layout>;

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-xl font-bold tracking-tight">システム設定</h1>
        <p className="text-sm text-muted mt-1">セキュリティ、バックアップ、外部連携、削除データを一元管理します。</p>
      </div>

      {auth && (
        <section className="card p-5 mb-5">
          <h2 className="font-semibold flex items-center gap-2 mb-1"><ShieldCheck className="size-5 text-primary" />ログイン・パスワード</h2>
          <p className="text-xs text-muted mb-4">変更後のログインから適用されます。ユーザーの無効化・権限変更・パスワード変更は、既存セッションにも即時反映されます。</p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Field label="ロックまでの失敗回数"><input type="number" min={3} max={20} className="input" value={auth.maxFailedAttempts} onChange={(e) => setAuth({ ...auth, maxFailedAttempts: Number(e.target.value) })} /></Field>
            <Field label="失敗回数の集計時間（分）"><input type="number" min={1} max={1440} className="input" value={auth.attemptWindowMinutes} onChange={(e) => setAuth({ ...auth, attemptWindowMinutes: Number(e.target.value) })} /></Field>
            <Field label="ロック時間（分）"><input type="number" min={1} max={1440} className="input" value={auth.lockoutMinutes} onChange={(e) => setAuth({ ...auth, lockoutMinutes: Number(e.target.value) })} /></Field>
            <Field label="ログイン保持時間（時間）"><input type="number" min={1} max={168} className="input" value={auth.sessionHours} onChange={(e) => setAuth({ ...auth, sessionHours: Number(e.target.value) })} /></Field>
            <Field label="パスワード最低文字数"><input type="number" min={8} max={64} className="input" value={auth.passwordMinLength} onChange={(e) => setAuth({ ...auth, passwordMinLength: Number(e.target.value) })} /></Field>
          </div>
          <div className="mt-4 flex justify-end"><Button variant="primary" icon={<Save className="size-4" />} loading={savingAuth} onClick={saveAuth}>保存</Button></div>
        </section>
      )}

      {map && (
        <section className="card p-5 mb-5">
          <h2 className="font-semibold flex items-center gap-2 mb-1"><MapPin className="size-5 text-primary" />地図</h2>
          <p className="text-xs text-muted mb-4">
            位置フィールドの背景地図の既定です。アプリ側で個別に指定していない地図に適用されます。閲覧画面では利用者が右上の切替で変更できます。
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="既定の背景地図" hint="内蔵タイルはオフラインで使えます。オンライン版は配信元へ通信します。">
              <select className="input" value={map.defaultBasemap} onChange={(e) => setMap({ ...map, defaultBasemap: e.target.value })}>
                {BASEMAPS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.kind === 'builtin' && !tileStyles.includes(b.id) ? `${b.label}（タイル未取得）` : b.label}
                  </option>
                ))}
              </select>
            </Field>
            {map.defaultBasemap === 'custom' && (
              <Field label="カスタムタイルURL" hint="例: https://example/{z}/{x}/{y}.png">
                <input className="input" placeholder="https://.../{z}/{x}/{y}.png" value={map.tileUrl} onChange={(e) => setMap({ ...map, tileUrl: e.target.value })} />
              </Field>
            )}
          </div>
          <p className="text-xs text-muted mt-3">
            取得済みの内蔵タイル: {tileStyles.length ? tileStyles.map((id) => getBasemap(id).label).join('・') : 'なし'}
          </p>
          {tileStyles.length === 0 && (
            <p className="text-xs text-muted mt-1">
              オフラインで使うには、インターネットに繋がる端末でタイルを取得して`storage/tiles`へ置きます（Windowsは get_tiles.bat、Docker版は docker compose exec backend npm run tiles -- --japan --zoom 0-12）。取得前に配信元の利用規約を確認してください。
            </p>
          )}
          <div className="mt-4 flex justify-end"><Button variant="primary" icon={<Save className="size-4" />} loading={savingMap} onClick={saveMap}>保存</Button></div>
        </section>
      )}

      {backup && (
        <section className="card p-5 mb-5">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
            <div><h2 className="font-semibold flex items-center gap-2"><DatabaseBackup className="size-5 text-primary" />自動バックアップ</h2><p className="text-xs text-muted mt-1">データベースをstorage/backupsに保存します。添付ファイルはstorageフォルダーの保全対象です。</p></div>
            <Button icon={<Play className="size-4" />} loading={runningBackup || backup.status.running} onClick={runBackup}>今すぐ実行</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3 items-end">
            <label className="flex items-center gap-2.5 h-10 cursor-pointer"><input type="checkbox" className="size-4" checked={backup.policy.enabled} onChange={(e) => setBackup({ ...backup, policy: { ...backup.policy, enabled: e.target.checked } })} /><span className="text-sm font-medium">毎日自動で実行する</span></label>
            <Field label="実行時刻"><select className="input" value={backup.policy.hour} onChange={(e) => setBackup({ ...backup, policy: { ...backup.policy, hour: Number(e.target.value) } })}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}</select></Field>
            <Field label="保存日数"><input type="number" min={1} max={365} className="input" value={backup.policy.retentionDays} onChange={(e) => setBackup({ ...backup, policy: { ...backup.policy, retentionDays: Number(e.target.value) } })} /></Field>
          </div>
          <div className="mt-4 flex justify-end"><Button variant="primary" icon={<Save className="size-4" />} loading={savingBackup} onClick={saveBackup}>設定を保存</Button></div>
          <div className="mt-4 rounded-lg bg-surface-2 p-3 text-sm flex gap-4 flex-wrap">
            <span className="flex items-center gap-1.5"><Clock3 className="size-4 text-muted" />最終成功: {dateTime(backup.status.lastSuccessAt)}</span>
            {backup.status.lastError && <span className="text-danger">直近のエラー: {backup.status.lastError}</span>}
          </div>
          {backup.files.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-muted border-b border-border"><th className="text-left py-2 font-semibold">ファイル</th><th className="text-left py-2 font-semibold">作成日時</th><th className="text-right py-2 font-semibold">容量</th><th /></tr></thead><tbody>{backup.files.map((file) => <tr key={file.name} className="border-b border-border last:border-0"><td className="py-2 font-mono text-xs">{file.name}</td><td>{dateTime(file.createdAt)}</td><td className="text-right">{fileSize(file.size)}</td><td className="text-right"><Button variant="ghost" size="sm" icon={<Download className="size-4" />} onClick={() => downloadBackup(file.name)}>取得</Button></td></tr>)}</tbody></table></div>}
        </section>
      )}

      <section className="card p-5 mb-5">
        <h2 className="font-semibold flex items-center gap-2 mb-1"><KeyRound className="size-5 text-primary" />APIトークン</h2>
        <p className="text-xs text-muted mb-4">外部ツールからAPIを利用するための認証情報です。最初は「閲覧のみ」を推奨します。</p>
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_130px_auto_auto] items-end">
          <Field label="用途名"><input className="input" value={tokenForm.name} onChange={(e) => setTokenForm({ ...tokenForm, name: e.target.value })} placeholder="例：集計ツール" /></Field>
          <Field label="利用ユーザー"><EntityPicker kind="user" value={tokenForm.ownerId || null} label={tokenForm.ownerName} onChange={(id, label) => setTokenForm({ ...tokenForm, ownerId: id || '', ownerName: label })} placeholder="ユーザーを検索" /></Field>
          <Field label="有効日数"><input type="number" min={1} max={365} className="input" value={tokenForm.expiresInDays} onChange={(e) => setTokenForm({ ...tokenForm, expiresInDays: Number(e.target.value) })} /></Field>
          <label className="flex items-center gap-2 h-10 text-sm cursor-pointer"><input type="checkbox" checked={tokenForm.readOnly} onChange={(e) => setTokenForm({ ...tokenForm, readOnly: e.target.checked })} />閲覧のみ</label>
          <Button variant="primary" loading={creatingToken} onClick={createToken}>発行</Button>
        </div>
        <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-muted border-b border-border"><th className="text-left py-2 font-semibold">用途</th><th className="text-left py-2 font-semibold">利用ユーザー</th><th className="text-left py-2 font-semibold">権限</th><th className="text-left py-2 font-semibold">期限 / 最終利用</th><th /></tr></thead><tbody>{tokens.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">APIトークンはありません</td></tr>}{tokens.map((token) => <tr key={token.id} className="border-b border-border last:border-0"><td className="py-2"><div className="font-medium">{token.name}</div><div className="text-[11px] text-muted font-mono">{token.tokenPrefix}…</div></td><td>{token.ownerName}</td><td><span className="badge">{token.readOnly ? '閲覧のみ' : '更新可能'}</span></td><td><div>{dateTime(token.expiresAt)}</div><div className="text-xs text-muted">最終利用: {dateTime(token.lastUsedAt)}</div></td><td className="text-right">{token.revokedAt ? <span className="badge badge-danger">無効</span> : <Button variant="ghost" size="sm" className="text-danger" onClick={() => revokeToken(token)}>無効化</Button>}</td></tr>)}</tbody></table></div>
      </section>

      <section className="card p-5 mb-5">
        <h2 className="font-semibold flex items-center gap-2 mb-1"><ArchiveRestore className="size-5 text-primary" />ごみ箱</h2>
        <p className="text-xs text-muted mb-4">削除したレコードは30日間保管され、その後自動で完全削除されます。現在 {formatNumber(trashTotal)} 件あります。</p>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-muted border-b border-border"><th className="text-left py-2 font-semibold">アプリ</th><th className="text-left py-2 font-semibold">レコードID</th><th className="text-left py-2 font-semibold">削除日時</th><th className="text-left py-2 font-semibold">自動削除予定</th><th /></tr></thead><tbody>{trash.length === 0 && <tr><td colSpan={5} className="py-7 text-center text-muted">ごみ箱は空です</td></tr>}{trash.map((row) => <tr key={row.id} className="border-b border-border last:border-0"><td className="py-2 font-medium">{row.appName}</td><td className="font-mono text-xs">{row.originalId}</td><td>{dateTime(row.deletedAt)}</td><td>{dateTime(row.expiresAt)}</td><td><div className="flex justify-end gap-1"><Button size="sm" variant="ghost" icon={<RotateCcw className="size-4" />} onClick={() => restore(row)}>復元</Button><Button size="sm" variant="ghost" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => purge(row)}>完全削除</Button></div></td></tr>)}</tbody></table></div>
        {trashTotalPages > 1 && <div className="flex items-center justify-between mt-3"><span className="text-sm text-muted">{trashTotalPages} ページ中 {trashPage} ページ目</span><div className="flex gap-1"><Button variant="ghost" size="sm" disabled={trashPage <= 1} icon={<ChevronLeft className="size-4" />} onClick={() => loadTrash(trashPage - 1)} aria-label="前へ" /><Button variant="ghost" size="sm" disabled={trashPage >= trashTotalPages} icon={<ChevronRight className="size-4" />} onClick={() => loadTrash(trashPage + 1)} aria-label="次へ" /></div></div>}
      </section>

      <Modal open={!!createdToken} onClose={() => setCreatedToken('')} title="APIトークンを発行しました" size="lg" footer={<Button variant="primary" onClick={() => setCreatedToken('')}>確認しました</Button>}>
        <div className="rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm mb-3">この値は閉じると再表示できません。今すぐ安全な場所へ保存してください。</div>
        <div className="flex gap-2"><textarea className="input min-h-28 font-mono text-xs flex-1" readOnly value={createdToken} onFocus={(e) => e.currentTarget.select()} /><Button icon={<Copy className="size-4" />} onClick={async () => { await navigator.clipboard.writeText(createdToken); toast.success('コピーしました'); }}>コピー</Button></div>
      </Modal>
    </Layout>
  );
}
