import { useCallback, useEffect, useState } from 'react';
import {
  Plus, Trash2, Users, UserMinus, CornerDownRight, ChevronUp, ChevronDown,
  ChevronRight, ChevronLeft, Search, FolderTree, Move, X,
} from 'lucide-react';
import { api } from '../../lib/api';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Field } from '../../components/ui/Field';
import { EmptyState } from '../../components/ui/EmptyState';
import { EntityPicker } from '../../components/EntityPicker';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { CsvImportModal, CsvFormatHelp, type CsvColumn } from '../../components/CsvImportModal';

const GROUP_CSV_COLUMNS: CsvColumn[] = [
  { key: 'name', label: '部署名', required: true, aliases: ['name', 'グループ名'] },
  {
    key: 'parent',
    label: '親部署',
    aliases: ['parent', '親グループ', '親部署名'],
    hint: '親部署の部署名で指定（未指定＝最上位）。同じCSV内の部署も親に指定可',
  },
  {
    key: 'sortOrder',
    label: '表示順',
    aliases: ['sortOrder', '並び順', '順番'],
    hint: '同じ親の中での表示順。小さいほど上（任意・既定0）',
  },
  { key: 'description', label: '説明', aliases: ['description'] },
];
const GROUP_CSV_SAMPLE = [
  ['営業部', '', '1', '国内営業を担当'],
  ['国内営業課', '営業部', '1', ''],
  ['総務部', '', '2', ''],
];

interface GNode {
  id: string;
  name: string;
  description?: string | null;
  parentId: string | null;
  sortOrder?: number;
  memberCount: number;
  childCount: number;
  path?: string; // 検索結果のときの祖先パス
}

const MEMBER_PAGE_SIZE = 50;

export function GroupsAdmin() {
  const toast = useToast();
  const { confirm } = useConfirm();

  // 遅延展開ツリー
  const [roots, setRoots] = useState<GNode[]>([]);
  const [childrenMap, setChildrenMap] = useState<Record<string, GNode[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loadingNode, setLoadingNode] = useState<Set<string>>(new Set());

  // 検索
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<GNode[] | null>(null);

  // 作成フォーム
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [parent, setParent] = useState<{ id: string; label: string } | null>(null);

  // メンバー管理モーダル
  const [editing, setEditing] = useState<GNode | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [memberTotal, setMemberTotal] = useState(0);
  const [memberPage, setMemberPage] = useState(1);
  const [memberQ, setMemberQ] = useState('');
  const [addUser, setAddUser] = useState<{ id: string; label: string } | null>(null);

  // 移動モーダル
  const [moveTarget, setMoveTarget] = useState<GNode | null>(null);
  const [moveToRoot, setMoveToRoot] = useState(false);
  const [moveParent, setMoveParent] = useState<{ id: string; label: string } | null>(null);

  const loadRoots = useCallback(
    () => api.get('/groups/children').then(setRoots).catch((e) => toast.error(e.message)),
    [toast],
  );

  useEffect(() => { loadRoots(); }, [loadRoots]);

  // 表示中（最上位＋展開済み）をまとめて再取得する。構造変更後の同期に使う。
  const reloadVisible = async () => {
    try {
      const r: GNode[] = await api.get('/groups/children');
      setRoots(r);
      const ids = [...expanded];
      const entries = await Promise.all(
        ids.map(async (id) => [id, await api.get(`/groups/children?parentId=${id}`)] as const),
      );
      setChildrenMap(Object.fromEntries(entries));
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const loadChildren = async (id: string) => {
    setLoadingNode((s) => new Set(s).add(id));
    try {
      const kids: GNode[] = await api.get(`/groups/children?parentId=${id}`);
      setChildrenMap((m) => ({ ...m, [id]: kids }));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingNode((s) => { const n = new Set(s); n.delete(id); return n; });
    }
  };

  const toggle = (g: GNode) => {
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(g.id)) { n.delete(g.id); }
      else { n.add(g.id); if (!childrenMap[g.id]) loadChildren(g.id); }
      return n;
    });
  };

  // 検索（デバウンス）
  useEffect(() => {
    const term = search.trim();
    if (!term) { setSearchResults(null); return; }
    const h = setTimeout(() => {
      api.get(`/groups/search?q=${encodeURIComponent(term)}&take=100`)
        .then(setSearchResults)
        .catch((e) => toast.error(e.message));
    }, 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const create = async () => {
    if (!name.trim()) return;
    try {
      await api.post('/groups', { name, description: desc, parentId: parent?.id ?? '' });
      setName(''); setDesc(''); setParent(null);
      toast.success('部署を作成しました');
      reloadVisible();
    } catch (e: any) { toast.error(e.message); }
  };

  const reorder = async (id: string, direction: 'up' | 'down') => {
    try { await api.post(`/groups/${id}/reorder`, { direction }); reloadVisible(); } catch (e: any) { toast.error(e.message); }
  };

  const remove = async (g: GNode) => {
    const msg = g.childCount > 0
      ? `この部署には配下部署が${g.childCount}件あります。削除すると配下の部署もすべて削除されます。よろしいですか？`
      : 'この部署を削除しますか？';
    if (!(await confirm({ message: msg, danger: true, confirmText: '削除' }))) return;
    try { await api.delete(`/groups/${g.id}`); toast.success('削除しました'); reloadVisible(); } catch (e: any) { toast.error(e.message); }
  };

  // 移動
  const openMove = (g: GNode) => { setMoveTarget(g); setMoveToRoot(!g.parentId); setMoveParent(null); };
  const submitMove = async () => {
    if (!moveTarget) return;
    if (!moveToRoot && !moveParent) { toast.error('移動先の親部署を選択してください'); return; }
    try {
      await api.put(`/groups/${moveTarget.id}`, { parentId: moveToRoot ? '' : moveParent!.id });
      toast.success('移動しました');
      setMoveTarget(null);
      reloadVisible();
    } catch (e: any) { toast.error(e.message); }
  };

  // メンバー管理
  const openGroup = async (g: GNode) => {
    setEditing(g);
    setMemberQ(''); setMemberPage(1); setAddUser(null);
    loadMembers(g.id, 1, '');
  };
  const loadMembers = async (groupId: string, page: number, q: string) => {
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(MEMBER_PAGE_SIZE) });
      if (q.trim()) params.set('q', q.trim());
      const res = await api.get(`/groups/${groupId}/members?${params.toString()}`);
      setMembers(res.items); setMemberTotal(res.total); setMemberPage(res.page);
    } catch (e: any) { toast.error(e.message); }
  };
  // メンバー検索のデバウンス
  useEffect(() => {
    if (!editing) return;
    const h = setTimeout(() => loadMembers(editing.id, 1, memberQ), 300);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberQ]);

  const addMember = async () => {
    if (!editing || !addUser) return;
    try {
      await api.post(`/groups/${editing.id}/members`, { userId: addUser.id });
      setAddUser(null);
      loadMembers(editing.id, memberPage, memberQ);
      setEditing((g) => g ? { ...g, memberCount: g.memberCount + 1 } : g);
      reloadVisible();
    } catch (e: any) { toast.error(e.message); }
  };
  const removeMember = async (userId: string) => {
    if (!editing) return;
    try {
      await api.delete(`/groups/${editing.id}/members/${userId}`);
      loadMembers(editing.id, memberPage, memberQ);
      setEditing((g) => g ? { ...g, memberCount: Math.max(0, g.memberCount - 1) } : g);
      reloadVisible();
    } catch (e: any) { toast.error(e.message); }
  };
  const memberLastPage = Math.max(1, Math.ceil(memberTotal / MEMBER_PAGE_SIZE));

  // ツリー行の描画（再帰）。siblings はリオーダーの端判定に使う。
  const renderRows = (nodes: GNode[], depth: number): React.ReactNode[] =>
    nodes.flatMap((g, idx) => {
      const isFirst = idx <= 0;
      const isLast = idx === nodes.length - 1;
      const isOpen = expanded.has(g.id);
      const rows: React.ReactNode[] = [
        <tr key={g.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
          <td className="px-4 py-2.5 font-medium">
            <span className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
              {g.childCount > 0 ? (
                <button className="btn-icon size-6 shrink-0 text-muted hover:text-content" onClick={() => toggle(g)} aria-label={isOpen ? '閉じる' : '展開'}>
                  {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                </button>
              ) : (
                <span className="inline-flex size-6 shrink-0 items-center justify-center text-muted">
                  {depth > 0 ? <CornerDownRight className="size-3.5" /> : <span className="size-1.5 rounded-full bg-[var(--border-strong)]" />}
                </span>
              )}
              {g.name}
              {g.childCount > 0 && <span className="badge badge-muted ml-1 text-[11px]">{g.childCount}</span>}
            </span>
          </td>
          <td className="px-4 py-2.5"><span className="badge badge-muted">{g.memberCount}</span></td>
          <td className="px-4 py-2.5">
            <div className="flex items-center gap-1 justify-end">
              <Button variant="ghost" size="sm" className="btn-icon" disabled={isFirst} onClick={() => reorder(g.id, 'up')} aria-label="上へ" title="上へ"><ChevronUp className="size-4" /></Button>
              <Button variant="ghost" size="sm" className="btn-icon" disabled={isLast} onClick={() => reorder(g.id, 'down')} aria-label="下へ" title="下へ"><ChevronDown className="size-4" /></Button>
              <Button variant="ghost" size="sm" icon={<Move className="size-4" />} onClick={() => openMove(g)}>移動</Button>
              <Button variant="ghost" size="sm" icon={<Users className="size-4" />} onClick={() => openGroup(g)}>メンバー管理</Button>
              <Button variant="ghost" size="sm" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => remove(g)}>削除</Button>
            </div>
          </td>
        </tr>,
      ];
      if (isOpen) {
        const kids = childrenMap[g.id];
        if (loadingNode.has(g.id) && !kids) {
          rows.push(
            <tr key={`${g.id}-loading`} className="border-b border-border">
              <td colSpan={3} className="px-4 py-2 text-sm text-muted" style={{ paddingLeft: (depth + 1) * 20 + 16 }}>読み込み中…</td>
            </tr>,
          );
        } else if (kids) {
          rows.push(...renderRows(kids, depth + 1));
        }
      }
      return rows;
    });

  // 検索結果行（フラット）
  const renderSearchRow = (g: GNode) => (
    <tr key={g.id} className="border-b border-border last:border-0 hover:bg-surface-hover">
      <td className="px-4 py-2.5 font-medium">
        <div className="flex flex-col">
          <span>{g.name}</span>
          {g.path && <span className="text-xs text-muted">{g.path}</span>}
        </div>
      </td>
      <td className="px-4 py-2.5"><span className="badge badge-muted">{g.memberCount}</span></td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-1 justify-end">
          <Button variant="ghost" size="sm" icon={<Move className="size-4" />} onClick={() => openMove(g)}>移動</Button>
          <Button variant="ghost" size="sm" icon={<Users className="size-4" />} onClick={() => openGroup(g)}>メンバー管理</Button>
          <Button variant="ghost" size="sm" className="text-danger" icon={<Trash2 className="size-4" />} onClick={() => remove(g)}>削除</Button>
        </div>
      </td>
    </tr>
  );

  return (
    <Layout>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <h1 className="text-xl font-bold tracking-tight">グループ管理</h1>
        <CsvImportModal endpoint="/groups/import" columns={GROUP_CSV_COLUMNS} buttonLabel="CSVで一括登録" onDone={reloadVisible} />
      </div>

      <div className="mb-5">
        <CsvFormatHelp columns={GROUP_CSV_COLUMNS} sampleRows={GROUP_CSV_SAMPLE} templateFileName="groups_template.csv" />
      </div>

      <div className="card p-4 mb-5">
        <div className="flex items-end gap-2 flex-wrap">
          <Field label="部署名" className="flex-1 min-w-44">
            <input className="input" placeholder="例: 営業部" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          </Field>
          <Field label="説明" className="flex-1 min-w-44">
            <input className="input" placeholder="任意" value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} />
          </Field>
          <Field label="親部署（未指定＝最上位）" className="min-w-52">
            <EntityPicker kind="group" value={parent?.id ?? null} label={parent?.label} onChange={(id, label) => setParent(id ? { id, label } : null)} placeholder="親部署を検索（任意）" />
          </Field>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={create}>部署を作成</Button>
        </div>
      </div>

      <div className="flex items-end gap-2 flex-wrap mb-3">
        <Field label="部署を検索" className="flex-1 min-w-52">
          <div className="relative">
            <Search className="size-4 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input className="input pl-8" placeholder="部署名で検索（組織ツリーを横断）" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </Field>
        {searchResults !== null && (
          <Button variant="ghost" size="sm" icon={<X className="size-4" />} onClick={() => setSearch('')}>検索を解除</Button>
        )}
      </div>

      {roots.length === 0 && searchResults === null ? (
        <EmptyState icon={<Users className="size-6" />} title="部署がありません" description="上のフォームから作成できます。親部署を指定すると組織ツリーになります。" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="px-4 py-2.5 text-left font-semibold">
                  {searchResults !== null ? '検索結果' : <span className="inline-flex items-center gap-1.5"><FolderTree className="size-4" />部署名（組織ツリー）</span>}
                </th>
                <th className="px-4 py-2.5 text-left font-semibold">メンバー数</th>
                <th className="px-4 py-2.5 text-right font-semibold">操作</th>
              </tr>
            </thead>
            <tbody>
              {searchResults !== null
                ? (searchResults.length === 0
                    ? <tr><td colSpan={3} className="px-4 py-8 text-center text-muted">該当する部署がありません</td></tr>
                    : searchResults.map(renderSearchRow))
                : renderRows(roots, 0)}
            </tbody>
          </table>
        </div>
      )}

      {/* メンバー管理 */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `「${editing.name}」のメンバー（${editing.memberCount}名）` : ''}
        footer={<Button onClick={() => setEditing(null)}>閉じる</Button>}
      >
        {editing && (
          <>
            <div className="flex items-end gap-2 mb-4">
              <Field label="メンバーを追加" className="flex-1">
                <EntityPicker kind="user" value={addUser?.id ?? null} label={addUser?.label} onChange={(id, label) => setAddUser(id ? { id, label } : null)} placeholder="ユーザーを検索して追加" />
              </Field>
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={addMember} disabled={!addUser}>追加</Button>
            </div>

            <div className="relative mb-3">
              <Search className="size-4 text-muted absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input className="input pl-8" placeholder="メンバーを絞り込み" value={memberQ} onChange={(e) => setMemberQ(e.target.value)} />
            </div>

            {members.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">メンバーがいません</p>
            ) : (
              <div className="divide-y divide-border">
                {members.map((m: any) => (
                  <div key={m.memberId} className="flex items-center justify-between py-2">
                    <span className="text-sm">{m.name?.trim() || m.loginId}{m.name?.trim() && <span className="text-xs text-muted ml-1.5">({m.loginId})</span>}{!m.isActive && <span className="badge badge-danger ml-2 text-[11px]">無効</span>}</span>
                    <Button variant="ghost" size="sm" icon={<UserMinus className="size-4" />} onClick={() => removeMember(m.id)}>外す</Button>
                  </div>
                ))}
              </div>
            )}

            {memberTotal > MEMBER_PAGE_SIZE && (
              <div className="flex items-center justify-between gap-2 mt-3">
                <span className="text-sm text-muted">{memberLastPage} ページ中 {memberPage} ページ目（{memberTotal}名）</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="btn-icon" disabled={memberPage <= 1} onClick={() => loadMembers(editing.id, memberPage - 1, memberQ)} aria-label="前へ"><ChevronLeft className="size-4" /></Button>
                  <Button variant="ghost" size="sm" className="btn-icon" disabled={memberPage >= memberLastPage} onClick={() => loadMembers(editing.id, memberPage + 1, memberQ)} aria-label="次へ"><ChevronRight className="size-4" /></Button>
                </div>
              </div>
            )}
          </>
        )}
      </Modal>

      {/* 移動（親部署の変更） */}
      <Modal
        open={!!moveTarget}
        onClose={() => setMoveTarget(null)}
        title={moveTarget ? `「${moveTarget.name}」の移動先` : ''}
        size="sm"
        footer={
          <>
            <Button onClick={() => setMoveTarget(null)}>キャンセル</Button>
            <Button variant="primary" onClick={submitMove}>移動する</Button>
          </>
        }
      >
        <label className="flex items-center gap-2 mb-3 text-sm">
          <input type="checkbox" className="accent-[var(--primary)]" checked={moveToRoot} onChange={(e) => setMoveToRoot(e.target.checked)} />
          最上位（親なし）にする
        </label>
        <Field label="移動先の親部署">
          <EntityPicker
            kind="group"
            value={moveParent?.id ?? null}
            label={moveParent?.label}
            onChange={(id, label) => setMoveParent(id ? { id, label } : null)}
            placeholder="親部署を検索"
            excludeIds={moveTarget ? [moveTarget.id] : []}
          />
        </Field>
        {moveToRoot && <p className="text-xs text-muted mt-2">最上位に設定するため、親部署の選択は無視されます。</p>}
      </Modal>
    </Layout>
  );
}
