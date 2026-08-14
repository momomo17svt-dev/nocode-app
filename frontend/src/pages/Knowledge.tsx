import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, Scale, FileText, Search, Loader2, Paperclip, BookOpen, Upload, Plus, Pencil, Trash2, Sparkles, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { getUser, isAdmin } from '../lib/auth';
import {
  aiApi,
  DOC_UPLOAD_ACCEPT,
  type KnowledgeGroup,
  type KnowledgeItem,
  type KnowledgeVisibilityMode,
} from '../lib/ai';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Field } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { EntityPicker } from '../components/EntityPicker';

interface DocModalState {
  id?: string;
  title: string;
  content: string;
  visibilityMode: KnowledgeVisibilityMode;
  groups: KnowledgeGroup[];
  includeDescendants: boolean;
  legacyAppId?: string | null;
  legacyAppName?: string | null;
  docKind: 'plain' | 'gov';
}

/**
 * ナレッジ画面（一般ユーザー向け）。
 * 自分が参照できる文書を一覧・閲覧し、質問は対象を引き継いでAIアシスタントへ集約する。
 * 管理者には、この画面から文書の登録（ファイル取込・直接入力）・編集・削除ができる管理機能を表示する。
 */
export function Knowledge() {
  const [docs, setDocs] = useState<KnowledgeItem[] | null>(null);
  const [filter, setFilter] = useState('');

  // 管理者向け（登録・管理）
  const admin = isAdmin(getUser());
  const toast = useToast();
  const { confirm } = useConfirm();
  const [docModal, setDocModal] = useState<DocModalState | null>(null);
  const [uploadVisibilityMode, setUploadVisibilityMode] = useState<'all' | 'groups'>('all');
  const [uploadGroups, setUploadGroups] = useState<KnowledgeGroup[]>([]);
  const [uploadIncludeDescendants, setUploadIncludeDescendants] = useState(true);
  const [govMode, setGovMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => aiApi.listKnowledge().then(setDocs).catch(() => {});

  useEffect(() => {
    aiApi.listKnowledge().then(setDocs).catch(() => setDocs([]));
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = docs || [];
    if (!q) return list;
    return list.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.sourceFileName || '').toLowerCase().includes(q) ||
        (d.meta?.docNumber || '').toLowerCase().includes(q),
    );
  }, [docs, filter]);

  // --- 管理者: 登録・編集・削除 ---
  const saveDoc = async () => {
    if (!docModal) return;
    if (!docModal.title.trim() || !docModal.content.trim()) { toast.error('タイトルと本文を入力してください'); return; }
    if (docModal.visibilityMode === 'groups' && docModal.groups.length === 0) { toast.error('公開する部署を1つ以上選択してください'); return; }
    try {
      const body = {
        title: docModal.title,
        content: docModal.content,
        visibilityMode: docModal.visibilityMode,
        groupIds: docModal.groups.map((g) => g.id),
        includeDescendants: docModal.includeDescendants,
        appId: docModal.visibilityMode === 'legacy' ? docModal.legacyAppId : null,
        docKind: docModal.docKind,
      };
      if (docModal.id) await aiApi.updateDoc(docModal.id, body);
      else await aiApi.createDoc(body);
      toast.success('文書を保存しました');
      setDocModal(null);
      reload();
    } catch (e: any) { toast.error(e.message); }
  };
  const editDoc = async (id: string) => {
    try {
      const d = await aiApi.getDoc(id);
      const listItem = docs?.find((item) => item.id === id);
      setDocModal({
        id: d.id,
        title: d.title,
        content: d.content,
        visibilityMode: d.visibilityMode || (d.appId ? 'legacy' : 'all'),
        groups: d.groups || [],
        includeDescendants: d.includeDescendants !== false,
        legacyAppId: d.appId,
        legacyAppName: listItem?.appName,
        docKind: d.docKind === 'gov' ? 'gov' : 'plain',
      });
    } catch (e: any) { toast.error(e.message); }
  };
  const removeDoc = async (id: string) => {
    if (!(await confirm({ message: 'この文書とそのインデックスを削除しますか？', danger: true, confirmText: '削除' }))) return;
    try { await aiApi.deleteDoc(id); toast.success('削除しました'); reload(); } catch (e: any) { toast.error(e.message); }
  };
  const onUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (uploadVisibilityMode === 'groups' && uploadGroups.length === 0) {
      toast.error('公開する部署を1つ以上選択してください');
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    setUploading(true);
    let ok = 0, truncatedAny = false, govAny = false;
    try {
      for (const f of Array.from(files)) {
        try {
          const r: any = await aiApi.uploadDoc(f, {
            visibilityMode: uploadVisibilityMode,
            groupIds: uploadGroups.map((g) => g.id),
            includeDescendants: uploadIncludeDescendants,
            kind: govMode ? 'gov' : undefined,
          });
          ok++;
          if (r?.truncated) truncatedAny = true;
          if (r?.docKind === 'gov') govAny = true;
        } catch (e: any) { toast.error(`${f.name}: ${e.message}`); }
      }
      if (ok > 0) {
        toast.success(`${ok}件のファイルを取り込みました${govAny ? '（行政文書として構造解析）' : ''}${truncatedAny ? '（長文は20万字で打ち切り）' : ''}`);
        reload();
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const addUploadGroup = (id: string | null, name: string) => {
    if (!id || uploadGroups.some((g) => g.id === id)) return;
    setUploadGroups((current) => [...current, { id, name }]);
  };

  const addModalGroup = (id: string | null, name: string) => {
    if (!docModal || !id || docModal.groups.some((g) => g.id === id)) return;
    setDocModal({ ...docModal, groups: [...docModal.groups, { id, name }] });
  };

  return (
    <Layout>
      <div>
      <div className="flex items-center gap-2.5 mb-3 shrink-0">
        <span className="grid place-items-center size-9 rounded-xl bg-primary-soft text-primary-soft-fg">
          <Library className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-tight">ナレッジ</h1>
          <p className="text-xs text-muted">参照できる文書の閲覧・管理を行います。質問はAIアシスタントに集約されています</p>
        </div>
      </div>

      {/* 管理者: ナレッジ文書の登録・管理 */}
      {admin && (
        <section className="card p-3 mb-4 shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h4 className="text-sm font-semibold flex items-center gap-2"><FileText className="size-4 text-muted" />ナレッジ文書の登録・管理</h4>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="input py-1.5 text-xs max-w-[12rem]"
                value={uploadVisibilityMode}
                onChange={(e) => setUploadVisibilityMode(e.target.value as 'all' | 'groups')}
                title="アップロード時の公開範囲"
              >
                <option value="all">公開範囲: 全社</option>
                <option value="groups">公開範囲: 部署を指定</option>
              </select>
              <input
                ref={fileRef}
                type="file"
                accept={DOC_UPLOAD_ACCEPT}
                multiple
                className="hidden"
                onChange={(e) => onUploadFiles(e.target.files)}
              />
              <label className="flex items-center gap-1.5 text-xs cursor-pointer rounded-lg border border-border px-2.5 py-1.5 hover:bg-surface-2" title="ONで取込時に章/条/項/号や鑑文・記書きを構造解析し、条単位でインデックスします">
                <input type="checkbox" className="size-3.5" checked={govMode} onChange={(e) => setGovMode(e.target.checked)} />
                <Scale className="size-3.5 text-muted" />行政文書として構造解析
              </label>
              <Button
                size="sm"
                variant="ghost"
                icon={uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                loading={uploading}
                onClick={() => fileRef.current?.click()}
              >
                ファイルから追加
              </Button>
              <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setDocModal({
                title: '',
                content: '',
                visibilityMode: uploadVisibilityMode,
                groups: uploadGroups,
                includeDescendants: uploadIncludeDescendants,
                docKind: govMode ? 'gov' : 'plain',
              })}>文書を追加</Button>
            </div>
          </div>
          {uploadVisibilityMode === 'groups' && (
            <div className="mt-3 rounded-lg border border-border bg-surface-2 p-3">
              <div className="grid gap-2 sm:grid-cols-[minmax(14rem,24rem)_1fr] sm:items-start">
                <EntityPicker
                  kind="group"
                  value={null}
                  onChange={addUploadGroup}
                  excludeIds={uploadGroups.map((g) => g.id)}
                  placeholder="公開する部署を検索して追加"
                />
                <div className="flex flex-wrap gap-1.5 min-h-9 items-center">
                  {uploadGroups.length === 0 && <span className="text-xs text-muted">部署を1つ以上追加してください</span>}
                  {uploadGroups.map((group) => (
                    <span key={group.id} className="badge badge-muted gap-1">
                      {group.name}
                      <button type="button" onClick={() => setUploadGroups((current) => current.filter((g) => g.id !== group.id))} aria-label={`${group.name}を解除`}>
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
              <label className="mt-2 flex items-center gap-2 text-xs cursor-pointer w-fit">
                <input type="checkbox" className="size-3.5" checked={uploadIncludeDescendants} onChange={(e) => setUploadIncludeDescendants(e.target.checked)} />
                選択した部署の配下部署にも公開する
              </label>
            </div>
          )}
          <p className="text-[11px] text-muted mt-2">テキスト(.txt/.md/.csv/.json/.html)・PDF・Word(.docx) を取り込めます（最大20MB／本文を自動抽出。公開範囲は全社または複数部署から選択でき、後から変更可能）。「行政文書として構造解析」ONで条単位インデックス＋条番号引用に対応（OFFでも自動判定）。</p>
        </section>
      )}

      <section className="card p-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><FileText className="size-4 text-muted" />ナレッジ一覧</h4>
            <p className="text-xs text-muted mt-1">文書を開いて内容を確認するか、対象を引き継いでAIアシスタントに質問できます。</p>
          </div>
          <Link to="/ai?tab=chat&source=knowledge" className="btn btn-primary btn-sm gap-1.5" aria-label="すべてのナレッジをAIに質問">
            <Sparkles className="size-4" />すべてのナレッジをAIに質問
          </Link>
        </div>

        <div className="flex items-center gap-3 mt-4 mb-3 flex-wrap">
          <div className="relative flex-1 min-w-64 max-w-xl">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
            <input
              className="input pl-8 py-1.5 text-sm"
              placeholder="タイトル・ファイル名・発番号で絞り込み"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <span className="text-xs text-muted">{docs ? `${filtered.length}件` : '読込中…'}</span>
        </div>

        {docs === null ? (
          <div className="py-12 grid place-items-center text-muted"><Loader2 className="size-5 animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted py-12 text-center">{docs.length === 0 ? '参照できる文書がありません。' : '一致する文書がありません。'}</p>
        ) : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {filtered.map((d) => {
              const isGov = d.docKind === 'gov';
              const visibilityMode = d.visibilityMode || (d.appId ? 'legacy' : 'all');
              const scopeLabel = visibilityMode === 'groups'
                ? `${(d.groups || []).map((g) => g.name).join('、') || '部署未設定'}${d.includeDescendants !== false ? '（配下含む）' : ''}`
                : visibilityMode === 'legacy'
                  ? `従来のアプリ権限${d.appName ? `: ${d.appName}` : ''}`
                  : '全社公開';
              return (
                <li key={d.id} className="group rounded-xl border border-border bg-surface p-3 hover:border-primary/40 transition-colors">
                  <div className="flex items-start gap-2.5">
                    {isGov ? <Scale className="size-5 mt-0.5 shrink-0 text-primary" /> : <FileText className="size-5 mt-0.5 shrink-0 text-muted" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">{d.title}</span>
                        {isGov && <span className="badge badge-muted text-[10px] shrink-0">行政文書</span>}
                      </div>
                      <p className="text-[11px] text-muted mt-0.5 truncate flex items-center gap-1">
                        {isGov && d.meta?.docNumber ? <span>{d.meta.docNumber} ・ </span> : d.sourceFileName ? <span className="inline-flex items-center gap-0.5"><Paperclip className="size-2.5" />{d.sourceFileName} ・ </span> : null}
                        <span>{d.chunks} チャンク ・ {scopeLabel}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-1.5 mt-3 pt-2.5 border-t border-border flex-wrap">
                    {admin && (
                      <>
                        <button onClick={() => editDoc(d.id)} className="btn btn-sm btn-ghost gap-1" aria-label={`${d.title}を編集`}>
                          <Pencil className="size-3.5" />編集
                        </button>
                        <button onClick={() => removeDoc(d.id)} className="btn btn-sm btn-ghost gap-1 text-danger" aria-label={`${d.title}を削除`}>
                          <Trash2 className="size-3.5" />削除
                        </button>
                      </>
                    )}
                    <Link to={`/ai/documents/${d.id}`} className="btn btn-sm btn-ghost gap-1" aria-label={`${d.title}を開く`}>
                      <BookOpen className="size-3.5" />開く
                    </Link>
                    <Link
                      to={`/ai?tab=chat&source=knowledge&doc=${encodeURIComponent(d.id)}`}
                      className="btn btn-primary btn-sm gap-1"
                      aria-label={`${d.title}をAIに質問`}
                    >
                      <Sparkles className="size-3.5" />AIに質問
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </div>

      {/* 管理者: 文書の追加・編集モーダル */}
      <Modal
        open={!!docModal}
        onClose={() => setDocModal(null)}
        title={docModal?.id ? '文書を編集' : '文書を追加'}
        size="lg"
        footer={<>
          <Button onClick={() => setDocModal(null)}>キャンセル</Button>
          <Button variant="primary" onClick={saveDoc}>保存</Button>
        </>}
      >
        {docModal && (
          <div className="space-y-3">
            <Field label="タイトル" required>
              <input className="input" value={docModal.title} onChange={(e) => setDocModal({ ...docModal, title: e.target.value })} placeholder="例: 経費精算マニュアル" />
            </Field>
            <Field label="公開範囲" hint="全社、または複数の部署を指定できます。部署指定では配下部署を含めるか選択できます。">
              <select
                className="input"
                value={docModal.visibilityMode}
                onChange={(e) => setDocModal({ ...docModal, visibilityMode: e.target.value as KnowledgeVisibilityMode })}
              >
                <option value="all">全社に公開</option>
                <option value="groups">部署を指定</option>
                {docModal.legacyAppId && (
                  <option value="legacy">従来のアプリ権限{docModal.legacyAppName ? `（${docModal.legacyAppName}）` : ''}</option>
                )}
              </select>
              {docModal.visibilityMode === 'legacy' && (
                <p className="mt-2 text-xs text-warning">この文書は従来のアプリ権限を維持しています。全社または部署を選んで保存すると、新しい公開範囲へ移行します。</p>
              )}
              {docModal.visibilityMode === 'groups' && (
                <div className="mt-2 space-y-2 rounded-lg border border-border bg-surface-2 p-3">
                  <EntityPicker
                    kind="group"
                    value={null}
                    onChange={addModalGroup}
                    excludeIds={docModal.groups.map((g) => g.id)}
                    placeholder="公開する部署を検索して追加"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {docModal.groups.length === 0 && <span className="text-xs text-muted">部署を1つ以上追加してください</span>}
                    {docModal.groups.map((group) => (
                      <span key={group.id} className="badge badge-muted gap-1">
                        {group.name}
                        <button
                          type="button"
                          onClick={() => setDocModal({ ...docModal, groups: docModal.groups.filter((g) => g.id !== group.id) })}
                          aria-label={`${group.name}を解除`}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer w-fit">
                    <input
                      type="checkbox"
                      className="size-3.5"
                      checked={docModal.includeDescendants}
                      onChange={(e) => setDocModal({ ...docModal, includeDescendants: e.target.checked })}
                    />
                    選択した部署の配下部署にも公開する
                  </label>
                </div>
              )}
            </Field>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="size-4"
                checked={docModal.docKind === 'gov'}
                onChange={(e) => setDocModal({ ...docModal, docKind: e.target.checked ? 'gov' : 'plain' })}
              />
              <Scale className="size-4 text-muted" />
              <span>行政文書として構造解析（章/条/項/号・鑑文・記書きを条単位でインデックス）</span>
            </label>
            <Field label="本文" required>
              <textarea className="input min-h-64 font-mono text-xs leading-relaxed" value={docModal.content} onChange={(e) => setDocModal({ ...docModal, content: e.target.value })} placeholder="マニュアルやFAQの本文を貼り付け…" />
            </Field>
          </div>
        )}
      </Modal>
    </Layout>
  );
}
