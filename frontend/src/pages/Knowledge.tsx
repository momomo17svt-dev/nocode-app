import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Library, Scale, FileText, Search, MessageSquare, Loader2, Paperclip, Layers, BookOpen, X, Upload, Plus, Pencil, Trash2 } from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';
import { getUser, isAdmin } from '../lib/auth';
import { aiApi, DOC_UPLOAD_ACCEPT, type KnowledgeItem, type LlmHealth } from '../lib/ai';
import { LlmStatusBadge } from '../components/ai/LlmStatusBadge';
import { ChatPanel } from '../components/ai/ChatPanel';
import { SearchPanel } from '../components/ai/SearchPanel';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Field } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { cn } from '../lib/cn';

type RightTab = 'chat' | 'search';
interface AppLite { id: string; name: string }

/**
 * ナレッジ画面（一般ユーザー向け）。
 * 左＝自分が検索できる文書一覧（クリックで検索対象に選択 / 本を開くアイコンで構造ビューア）、
 * 右＝RAGチャット/セマンティック検索。検索対象は「すべて（横断）」か「選択した1文書内」を切替。
 * 管理者には、この画面から文書の登録（ファイル取込・直接入力）・編集・削除ができる管理機能を表示する。
 */
export function Knowledge() {
  const [docs, setDocs] = useState<KnowledgeItem[] | null>(null);
  const [filter, setFilter] = useState('');
  const [rightTab, setRightTab] = useState<RightTab>('chat');
  const [health, setHealth] = useState<LlmHealth | null>(null);
  const [scopeId, setScopeId] = useState<string | null>(null); // null=横断, それ以外=文書スコープ

  // 管理者向け（登録・管理）
  const admin = isAdmin(getUser());
  const toast = useToast();
  const { confirm } = useConfirm();
  const [apps, setApps] = useState<AppLite[]>([]);
  const [docModal, setDocModal] = useState<{ id?: string; title: string; content: string; appId: string; docKind: 'plain' | 'gov' } | null>(null);
  const [uploadAppId, setUploadAppId] = useState('');
  const [govMode, setGovMode] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = () => aiApi.listKnowledge().then(setDocs).catch(() => {});

  useEffect(() => {
    aiApi.listKnowledge().then(setDocs).catch(() => setDocs([]));
    if (admin) {
      api.get('/apps').then((rows) => setApps((rows || []).map((a: any) => ({ id: a.id, name: a.name })))).catch(() => {});
    }
    // eslint-disable-next-line
  }, []);

  const ragReady = !!health?.ok && !!(health?.embedModel || health?.resolvedEmbedModel);

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

  const scopedDoc = scopeId ? (docs || []).find((d) => d.id === scopeId) : null;
  // スコープが消えた文書を指していたら横断へ戻す
  useEffect(() => {
    if (scopeId && docs && !docs.some((d) => d.id === scopeId)) setScopeId(null);
  }, [docs, scopeId]);

  // --- 管理者: 登録・編集・削除 ---
  const saveDoc = async () => {
    if (!docModal) return;
    if (!docModal.title.trim() || !docModal.content.trim()) { toast.error('タイトルと本文を入力してください'); return; }
    try {
      const body = { title: docModal.title, content: docModal.content, appId: docModal.appId || null, docKind: docModal.docKind };
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
      setDocModal({ id: d.id, title: d.title, content: d.content, appId: d.appId || '', docKind: d.docKind === 'gov' ? 'gov' : 'plain' });
    } catch (e: any) { toast.error(e.message); }
  };
  const removeDoc = async (id: string) => {
    if (!(await confirm({ message: 'この文書とそのインデックスを削除しますか？', danger: true, confirmText: '削除' }))) return;
    try { await aiApi.deleteDoc(id); toast.success('削除しました'); reload(); } catch (e: any) { toast.error(e.message); }
  };
  const onUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0, truncatedAny = false, govAny = false;
    try {
      for (const f of Array.from(files)) {
        try {
          const r: any = await aiApi.uploadDoc(f, uploadAppId || null, govMode ? 'gov' : undefined);
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

  return (
    <Layout>
      {/* lg以上はビューポート残り高さにフィットさせ、チャット下部（入力欄）がページ外へ
          はみ出さないようにする（100vh − ヘッダ4rem − main上下パディング2rem）。 */}
      <div className="flex flex-col lg:h-[calc(100vh-6rem)]">
      <div className="flex items-center gap-2.5 mb-3 shrink-0">
        <span className="grid place-items-center size-9 rounded-xl bg-primary-soft text-primary-soft-fg">
          <Library className="size-5" />
        </span>
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-tight">ナレッジ</h1>
          <p className="text-xs text-muted">自分が参照できる文書を一覧・検索し、根拠付きで質問できます</p>
        </div>
      </div>

      <div className="mb-3 shrink-0">
        <LlmStatusBadge onHealth={setHealth} />
      </div>

      {/* 管理者: ナレッジ文書の登録・管理 */}
      {admin && (
        <section className="card p-3 mb-4 shrink-0">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h4 className="text-sm font-semibold flex items-center gap-2"><FileText className="size-4 text-muted" />ナレッジ文書の登録・管理</h4>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                className="input py-1.5 text-xs max-w-[12rem]"
                value={uploadAppId}
                onChange={(e) => setUploadAppId(e.target.value)}
                title="アップロード時の公開範囲"
              >
                <option value="">公開範囲: 全ユーザー</option>
                {apps.map((a) => <option key={a.id} value={a.id}>{a.name} の閲覧者のみ</option>)}
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
              <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setDocModal({ title: '', content: '', appId: '', docKind: govMode ? 'gov' : 'plain' })}>文書を追加</Button>
            </div>
          </div>
          <p className="text-[11px] text-muted mt-2">テキスト(.txt/.md/.csv/.json/.html)・PDF・Word(.docx) を取り込めます（最大20MB／本文を自動抽出。公開範囲は後から編集で変更可）。「行政文書として構造解析」ONで条単位インデックス＋条番号引用に対応（OFFでも自動判定）。登録した文書は下の一覧から編集・削除できます。</p>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[20rem_1fr] lg:flex-1 lg:min-h-0">
        {/* 左: ナレッジ一覧（検索対象の選択） */}
        <aside className="card p-3 flex flex-col lg:h-full lg:min-h-0 lg:overflow-hidden">
          <div className="flex items-center justify-between px-1 mb-2 shrink-0">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><FileText className="size-4 text-muted" />ナレッジ一覧</h4>
            <span className="text-[11px] text-muted">{docs ? `${filtered.length}件` : ''}</span>
          </div>
          <div className="relative mb-2 shrink-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted" />
            <input
              className="input pl-8 py-1.5 text-sm"
              placeholder="タイトル・発番号で絞り込み"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>

          <div className="overflow-y-auto max-h-[40vh] lg:max-h-none lg:flex-1 lg:min-h-0 -mx-1 px-1">
            {/* 横断（すべて） */}
            <button
              onClick={() => setScopeId(null)}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 mb-1 text-left transition-colors',
                scopeId === null ? 'border-primary bg-primary-soft text-primary-soft-fg' : 'border-border hover:bg-surface-2',
              )}
            >
              <Layers className="size-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">すべて（横断検索）</p>
                <p className="text-[11px] opacity-80">可視文書・レコードをまたいで検索</p>
              </div>
            </button>

            {docs === null ? (
              <div className="py-10 grid place-items-center text-muted"><Loader2 className="size-5 animate-spin" /></div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted py-8 text-center">{docs.length === 0 ? '参照できる文書がありません。' : '一致する文書がありません。'}</p>
            ) : (
              <ul className="space-y-1">
                {filtered.map((d) => {
                  const isGov = d.docKind === 'gov';
                  const selected = scopeId === d.id;
                  return (
                    <li key={d.id}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setScopeId(d.id)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setScopeId(d.id); } }}
                        className={cn(
                          'group flex items-start gap-2.5 rounded-lg border px-2.5 py-2 cursor-pointer transition-colors',
                          selected ? 'border-primary bg-primary-soft' : 'border-transparent hover:bg-surface-2 hover:border-border',
                        )}
                      >
                        {isGov ? <Scale className="size-4 mt-0.5 shrink-0 text-primary" /> : <FileText className="size-4 mt-0.5 shrink-0 text-muted" />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">{d.title}</span>
                            {isGov && <span className="badge badge-muted text-[10px] shrink-0">行政文書</span>}
                          </div>
                          <p className="text-[11px] text-muted truncate flex items-center gap-1">
                            {isGov && d.meta?.docNumber ? <span>{d.meta.docNumber} ・ </span> : d.sourceFileName ? <span className="inline-flex items-center gap-0.5"><Paperclip className="size-2.5" />{d.sourceFileName} ・ </span> : null}
                            <span>{d.chunks} チャンク{d.appName ? ` ・ ${d.appName}` : ''}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <Link
                            to={`/ai/documents/${d.id}`}
                            className="rounded-md p-1 text-muted opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-content transition"
                            title="文書を開く"
                            aria-label="文書を開く"
                          >
                            <BookOpen className="size-4" />
                          </Link>
                          {admin && (
                            <>
                              <button
                                onClick={() => editDoc(d.id)}
                                className="rounded-md p-1 text-muted opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-content transition"
                                title="編集"
                                aria-label="編集"
                              >
                                <Pencil className="size-4" />
                              </button>
                              <button
                                onClick={() => removeDoc(d.id)}
                                className="rounded-md p-1 text-muted opacity-0 group-hover:opacity-100 hover:bg-surface hover:text-danger transition"
                                title="削除"
                                aria-label="削除"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* 右: チャット / 検索 */}
        <section className="card p-4 flex flex-col min-h-0 h-[70vh] lg:h-full">
          {/* 検索対象バー */}
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3 shrink-0">
            <div className="inline-flex items-center gap-1 rounded-lg bg-surface-2 p-0.5">
              {([['chat', 'チャット', <MessageSquare className="size-4" />], ['search', '検索', <Search className="size-4" />]] as const).map(([k, label, icon]) => (
                <button
                  key={k}
                  onClick={() => setRightTab(k)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    rightTab === k ? 'bg-surface text-content shadow-sm' : 'text-muted hover:text-content',
                  )}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
            {scopedDoc ? (
              <span className="inline-flex items-center gap-1.5 text-xs rounded-full bg-primary-soft text-primary-soft-fg px-2.5 py-1 max-w-full">
                <BookOpen className="size-3.5 shrink-0" />
                <span className="truncate">「{scopedDoc.title}」内で検索</span>
                <button onClick={() => setScopeId(null)} className="shrink-0 hover:opacity-70" title="横断検索に戻す" aria-label="横断検索に戻す"><X className="size-3.5" /></button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted">
                <Layers className="size-3.5" />すべてのナレッジを横断検索
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0">
            {rightTab === 'chat' ? (
              <ChatPanel key={scopeId || 'all'} disabled={!ragReady} docId={scopeId || undefined} fill />
            ) : (
              <div className="h-full overflow-y-auto pr-1">
                <SearchPanel key={scopeId || 'all'} disabled={!ragReady} docId={scopeId || undefined} />
              </div>
            )}
          </div>
        </section>
      </div>
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
            <Field label="公開範囲（アプリ）" hint="特定アプリの閲覧権限に紐付けます。未選択なら全ユーザーが参照可能。">
              <select className="input" value={docModal.appId} onChange={(e) => setDocModal({ ...docModal, appId: e.target.value })}>
                <option value="">全ユーザーに公開</option>
                {apps.map((a) => <option key={a.id} value={a.id}>{a.name} の閲覧者のみ</option>)}
              </select>
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
