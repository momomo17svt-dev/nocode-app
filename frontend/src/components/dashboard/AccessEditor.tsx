import { useMemo, useState } from 'react';
import { Lock, Plus, Share2, Trash2, Users, Globe, User as UserIcon } from 'lucide-react';
import { ACCESS_MODE_LABELS, type AccessConfig, type AccessMode, type ShareEntry } from '../../lib/dashboard';

interface DirUser { id: string; loginId: string; name?: string | null }
interface DirGroup { id: string; name: string }

const userLabel = (u: DirUser) => u.name?.trim() || u.loginId;

interface Props {
  value: AccessConfig;
  onChange: (v: AccessConfig) => void;
  users: DirUser[];
  groups: DirGroup[];
  /** 全員公開を選べるか（システム管理者・アプリ作成者のみ）。 */
  canPublic: boolean;
}

const MODE_ICON: Record<AccessMode, React.ReactNode> = {
  private: <Lock className="size-4" />,
  shared: <Share2 className="size-4" />,
  public: <Globe className="size-4" />,
};

export function AccessEditor({ value, onChange, users, groups, canPublic }: Props) {
  const [pick, setPick] = useState('');

  const modes: AccessMode[] = canPublic ? ['private', 'shared', 'public'] : ['private', 'shared'];
  const shares = useMemo(() => value.shares || [], [value.shares]);

  // 追加候補（未追加のユーザー/グループ）
  const candidates = useMemo(() => {
    const taken = new Set(shares.map((s) => `${s.targetType}:${s.targetId}`));
    const list: { key: string; label: string; entry: ShareEntry }[] = [];
    for (const u of users) {
      const key = `User:${u.id}`;
      if (!taken.has(key)) list.push({ key, label: `👤 ${userLabel(u)}`, entry: { targetType: 'User', targetId: u.id, canEdit: false } });
    }
    for (const g of groups) {
      const key = `Group:${g.id}`;
      if (!taken.has(key)) list.push({ key, label: `👥 ${g.name}`, entry: { targetType: 'Group', targetId: g.id, canEdit: false } });
    }
    return list;
  }, [users, groups, shares]);

  const labelFor = (s: ShareEntry) => {
    if (s.targetType === 'User') { const u = users.find((u) => u.id === s.targetId); return u ? userLabel(u) : '(不明なユーザー)'; }
    return groups.find((g) => g.id === s.targetId)?.name || '(不明なグループ)';
  };

  const setMode = (mode: AccessMode) => onChange({ ...value, mode });
  const add = () => {
    const c = candidates.find((x) => x.key === pick) || candidates[0];
    if (!c) return;
    onChange({ ...value, mode: 'shared', shares: [...shares, c.entry] });
    setPick('');
  };
  const upd = (i: number, patch: Partial<ShareEntry>) => onChange({ ...value, shares: shares.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const del = (i: number) => onChange({ ...value, shares: shares.filter((_, idx) => idx !== i) });

  return (
    <div>
      <label className="label">公開範囲</label>
      <div className="grid grid-cols-3 gap-2">
        {modes.map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs transition-colors ${
              value.mode === m ? 'border-primary bg-primary-soft text-primary-soft-fg font-medium' : 'border-border hover:bg-surface-2'
            }`}
          >
            {MODE_ICON[m]}
            {ACCESS_MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {value.mode === 'public' && (
        <p className="mt-2 text-xs text-muted flex items-center gap-1.5"><Globe className="size-3.5" />すべてのユーザーが閲覧できます。</p>
      )}
      {value.mode === 'private' && (
        <p className="mt-2 text-xs text-muted flex items-center gap-1.5"><Lock className="size-3.5" />あなたとシステム管理者のみが閲覧できます。</p>
      )}

      {value.mode === 'shared' && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <select className="input flex-1 min-w-0" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">ユーザー / グループを選択…</option>
              {candidates.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <button className="btn btn-sm gap-1 shrink-0" onClick={add} disabled={candidates.length === 0}><Plus className="size-4" />追加</button>
          </div>

          {shares.length === 0 ? (
            <p className="text-xs text-muted">共有先が未設定です。あなたとシステム管理者のみ閲覧できます。</p>
          ) : (
            <ul className="rounded-lg border border-border divide-y divide-border">
              {shares.map((s, i) => (
                <li key={`${s.targetType}:${s.targetId}`} className="flex items-center gap-2 px-3 py-2">
                  <span className="grid place-items-center size-6 rounded-full bg-surface-2 text-muted shrink-0">
                    {s.targetType === 'User' ? <UserIcon className="size-3.5" /> : <Users className="size-3.5" />}
                  </span>
                  <span className="text-sm truncate flex-1">{labelFor(s)}</span>
                  <select className="input input-sm w-28 shrink-0 py-1 text-xs" value={s.canEdit ? 'edit' : 'view'} onChange={(e) => upd(i, { canEdit: e.target.value === 'edit' })}>
                    <option value="view">閲覧のみ</option>
                    <option value="edit">編集も可</option>
                  </select>
                  <button className="btn btn-ghost btn-icon btn-sm text-danger shrink-0" onClick={() => del(i)} aria-label="削除"><Trash2 className="size-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
