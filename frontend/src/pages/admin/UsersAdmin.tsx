import { useEffect, useState } from 'react';
import { Plus, Trash2, KeyRound, UserCheck, UserX, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api';
import { Layout } from '../../components/Layout';
import { roleLabel, ROLE_LABELS, getUser, userDisplay } from '../../lib/auth';
import { EntityPicker } from '../../components/EntityPicker';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Field } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { CsvImportModal, CsvFormatHelp, type CsvColumn } from '../../components/CsvImportModal';

const ROLES = Object.keys(ROLE_LABELS);

const USER_CSV_COLUMNS: CsvColumn[] = [
  { key: 'loginId', label: 'ID', required: true, aliases: ['loginId', 'ID', 'ログインID', 'ユーザーID'] },
  { key: 'name', label: 'ユーザー名', aliases: ['name', 'ユーザー名', '氏名', '名前'], hint: '任意（未指定はIDで表示）' },
  { key: 'group', label: '所属部署', aliases: ['group', '所属部署', '部署', '部署名'], hint: '部署名で指定（任意・未指定は未所属）。先に部署を取り込んでおくこと' },
  { key: 'password', label: 'パスワード', required: true, aliases: ['password'], hint: '8文字以上' },
  {
    key: 'role',
    label: 'ロール',
    aliases: ['role', '権限'],
    hint: 'システム管理者 / アプリ作成者 / 一般ユーザー / 閲覧ユーザー（未指定は一般ユーザー）',
  },
];
const temporaryPassword = () => `Temp-${crypto.randomUUID().slice(0, 12)}!`;
const USER_CSV_SAMPLE = [
  ['tanaka', '田中 太郎', '営業部', temporaryPassword(), '一般ユーザー'],
  ['suzuki', '鈴木 花子', '国内営業課', temporaryPassword(), 'アプリ作成者'],
];

const PAGE_SIZE = 50;

export function UsersAdmin() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  // 絞り込み
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [form, setForm] = useState({ loginId: '', name: '', password: '', role: 'StandardUser', groupId: '', groupLabel: '' });
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  // 管理者(GroupAdmin)は SystemAdmin を付与できず、新規作成時は所属部署が必須。
  const isGroupAdmin = getUser()?.role === 'GroupAdmin';
  const roleOptions = isGroupAdmin ? ROLES.filter((r) => r !== 'SystemAdmin') : ROLES;
  const [resetPw, setResetPw] = useState('');

  const load = (p = page) => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('page', String(p));
    params.set('pageSize', String(PAGE_SIZE));
    if (q.trim()) params.set('q', q.trim());
    if (roleFilter) params.set('role', roleFilter);
    if (activeFilter) params.set('active', activeFilter);
    return api
      .get(`/users?${params.toString()}`)
      .then((res) => {
        setUsers(res.items);
        setTotal(res.total);
        setPage(res.page);
      })
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  };

  // 絞り込み変更（検索はデバウンス）→ 1ページ目から取得
  useEffect(() => {
    const h = setTimeout(() => load(1), 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, roleFilter, activeFilter]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const create = async () => {
    if (!form.loginId || form.password.length < 8) { toast.error('ログインIDとパスワード(8文字以上)を入力してください'); return; }
    if (isGroupAdmin && !form.groupId) { toast.error('所属部署を選択してください'); return; }
    try {
      await api.post('/users', {
        loginId: form.loginId, password: form.password, role: form.role,
        ...(form.name.trim() ? { name: form.name.trim() } : {}),
        ...(form.groupId ? { groupId: form.groupId } : {}),
      });
      setForm({ loginId: '', name: '', password: '', role: 'StandardUser', groupId: '', groupLabel: '' });
      toast.success('ユーザーを作成しました');
      load(1);
    } catch (e: any) { toast.error(e.message); }
  };

  const changeRole = async (id: string, role: string) => {
    try { await api.put(`/users/${id}`, { role }); load(); } catch (e: any) { toast.error(e.message); }
  };
  // 氏名のインライン編集（変更時のみ保存）。
  const saveName = async (u: any, name: string) => {
    const next = name.trim();
    if (next === (u.name ?? '').trim()) return;
    try {
      await api.put(`/users/${u.id}`, { name: next });
      setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, name: next } : x)));
      toast.success('ユーザー名を更新しました');
    } catch (e: any) { toast.error(e.message); load(); }
  };
  // 所属部署（単一）の設定・変更・解除。
  const setDepartment = async (u: any, groupId: string | null, label: string) => {
    try {
      await api.put(`/users/${u.id}`, { groupId: groupId ?? '' });
      setUsers((us) => us.map((x) => (x.id === u.id ? { ...x, group: groupId ? { id: groupId, name: label } : null } : x)));
    } catch (e: any) { toast.error(e.message); }
  };
  const toggleActive = async (u: any) => {
    try { await api.put(`/users/${u.id}`, { isActive: !u.isActive }); load(); } catch (e: any) { toast.error(e.message); }
  };
  const submitReset = async () => {
    if (resetPw.length < 8) { toast.error('パスワードは8文字以上にしてください'); return; }
    try {
      await api.put(`/users/${resetTarget.id}`, { password: resetPw });
      toast.success('パスワードを更新しました');
      setResetTarget(null); setResetPw('');
    } catch (e: any) { toast.error(e.message); }
  };
  const remove = async (id: string) => {
    if (!(await confirm({ message: 'このユーザーを削除しますか？', danger: true, confirmText: '削除' }))) return;
    try { await api.delete(`/users/${id}`); toast.success('削除しました'); load(); } catch (e: any) { toast.error(e.message); }
  };

  return (
    <Layout>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <h1 className="text-xl font-bold tracking-tight">ユーザー管理</h1>
        <CsvImportModal endpoint="/users/import" columns={USER_CSV_COLUMNS} buttonLabel="CSVで一括登録" onDone={load} />
      </div>

      <div className="mb-5">
        <CsvFormatHelp columns={USER_CSV_COLUMNS} sampleRows={USER_CSV_SAMPLE} templateFileName="users_template.csv" />
      </div>

      <div className="card p-5 mb-5">
        <h4 className="font-semibold mb-3 text-sm">新規ユーザー作成</h4>
        <div className="flex items-end gap-2 flex-wrap">
          <Field label="ID" className="flex-1 min-w-40">
            <input className="input" placeholder="ログインID" value={form.loginId} onChange={(e) => setForm({ ...form, loginId: e.target.value })} />
          </Field>
          <Field label="ユーザー名（任意）" className="flex-1 min-w-40">
            <input className="input" placeholder="ユーザー名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="パスワード" className="flex-1 min-w-40">
            <input className="input" type="password" placeholder="8文字以上" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label="ロール">
            <select className="input w-auto" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {roleOptions.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
            </select>
          </Field>
          <Field label={`所属部署${isGroupAdmin ? '' : '（任意）'}`} className="min-w-52">
            <EntityPicker
              kind="group"
              value={form.groupId || null}
              label={form.groupLabel}
              onChange={(gid, label) => setForm({ ...form, groupId: gid ?? '', groupLabel: label })}
              placeholder="部署を検索"
            />
          </Field>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={create}>作成</Button>
        </div>
      </div>

      <div className="flex items-end gap-2 flex-wrap mb-3">
        <Field label="検索（ID・ユーザー名）" className="flex-1 min-w-52">
          <div className="relative">
            <Search className="size-4 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input className="input pl-8" placeholder="ID・ユーザー名で検索" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </Field>
        <Field label="ロール">
          <select className="input w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="">すべて</option>
            {ROLES.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
          </select>
        </Field>
        <Field label="状態">
          <select className="input w-auto" value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
            <option value="">すべて</option>
            <option value="active">有効</option>
            <option value="inactive">無効</option>
          </select>
        </Field>
        <div className="text-sm text-muted pb-2 ml-auto">{total.toLocaleString()} 件</div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-muted">
              <th className="px-4 py-2.5 text-left font-semibold">ID</th>
              <th className="px-4 py-2.5 text-left font-semibold">ユーザー名</th>
              <th className="px-4 py-2.5 text-left font-semibold">ロール</th>
              <th className="px-4 py-2.5 text-left font-semibold">所属部署</th>
              <th className="px-4 py-2.5 text-left font-semibold">状態</th>
              <th className="px-4 py-2.5 text-right font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {!loading && users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted">該当するユーザーがいません</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
                <td className="px-4 py-2.5 font-medium">{u.loginId}</td>
                <td className="px-4 py-2.5">
                  <input
                    className="input w-40"
                    placeholder="ユーザー名（未設定）"
                    defaultValue={u.name ?? ''}
                    key={u.id + (u.name ?? '')}
                    onBlur={(e) => saveName(u, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  />
                </td>
                <td className="px-4 py-2.5">
                  <select className="input w-auto" value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}>
                    {roleOptions.map((r) => <option key={r} value={r}>{roleLabel(r)}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <div className="min-w-44">
                    <EntityPicker
                      kind="group"
                      value={u.group?.id ?? null}
                      label={u.group?.name ?? ''}
                      onChange={(gid, label) => setDepartment(u, gid, label)}
                      placeholder="部署を設定"
                    />
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`badge ${u.isActive ? 'badge-success' : 'badge-danger'}`}>{u.isActive ? '有効' : '無効'}</span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="sm" icon={u.isActive ? <UserX className="size-4" /> : <UserCheck className="size-4" />} onClick={() => toggleActive(u)}>
                      {u.isActive ? '無効化' : '有効化'}
                    </Button>
                    <Button variant="ghost" size="sm" icon={<KeyRound className="size-4" />} onClick={() => { setResetTarget(u); setResetPw(''); }}>PW再設定</Button>
                    <Button variant="ghost" size="sm" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => remove(u.id)}>削除</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2 mt-3">
        <span className="text-sm text-muted">{lastPage} ページ中 {page} ページ目</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="btn-icon" disabled={page <= 1 || loading} onClick={() => load(page - 1)} aria-label="前へ"><ChevronLeft className="size-4" /></Button>
          <Button variant="ghost" size="sm" className="btn-icon" disabled={page >= lastPage || loading} onClick={() => load(page + 1)} aria-label="次へ"><ChevronRight className="size-4" /></Button>
        </div>
      </div>

      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title={`パスワード再設定: ${resetTarget ? userDisplay(resetTarget) : ''}`}
        size="sm"
        footer={
          <>
            <Button onClick={() => setResetTarget(null)}>キャンセル</Button>
            <Button variant="primary" onClick={submitReset} disabled={resetPw.length < 8}>更新</Button>
          </>
        }
      >
        <Field label="新しいパスワード（8文字以上）">
          <input
            className="input"
            type="password"
            autoFocus
            value={resetPw}
            onChange={(e) => setResetPw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitReset()}
          />
        </Field>
      </Modal>
    </Layout>
  );
}
