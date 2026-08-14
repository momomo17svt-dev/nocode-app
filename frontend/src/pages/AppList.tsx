import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, LayoutGrid, User, ChevronRight, ArrowLeft, FilePlus2, Workflow, Trash2, Star,
  Sparkles, Loader2,
  Headset, ClipboardList, NotebookPen, Receipt, Package, CalendarClock,
  Building2, ListChecks, FileText, ShoppingCart, Briefcase, CalendarDays,
  FolderKanban, FileSignature, StickyNote, Contact,
  Stamp, FileSearch, MessagesSquare, Gavel, HandCoins, ClipboardCheck, Boxes, Truck, ShieldAlert,
  DoorOpen, HeartPulse, GraduationCap,
  Factory, Store, Stethoscope, BookOpen, HardHat, Building, Server, GitBranch,
  PackageCheck, Warehouse, Calculator, Banknote, TrendingUp, Rocket, Scale, Dumbbell, Award,
  Siren, ShieldCheck, Binoculars, Route, Wrench, MessageSquareWarning,
  Blocks, Radar,
  type LucideIcon,
} from 'lucide-react';
import { api } from '../lib/api';
import { Layout } from '../components/Layout';
import { getUser, canCreateApp, userDisplay } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Field } from '../components/ui/Field';
import { EmptyState } from '../components/ui/EmptyState';
import { SkeletonCards } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { getFavorites, toggleFavorite } from '../lib/prefs';
import { fieldTypeLabel } from '../lib/fields';
import { generateTemplateStream, type AppDefinition, type QueuedInfo } from '../lib/ai';
import { QueueHint } from '../components/ai/QueueHint';
import { cn } from '../lib/cn';

interface AppRow {
  id: string;
  name: string;
  description?: string;
  status: string;
  creator?: { loginId: string; name?: string | null };
}

interface TemplateMeta {
  id: string;
  name: string;
  category: string;
  icon: string;
  summary: string;
  description: string;
  fields: { label: string; fieldType: string; required: boolean }[];
  hasProcess: boolean;
  isUser?: boolean;
}

interface SuiteMeta {
  id: string;
  name: string;
  category: string;
  icon: string;
  summary: string;
  description: string;
  apps: { name: string; icon: string }[];
}

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  Headset, ClipboardList, NotebookPen, Receipt, Package, CalendarClock, Building2, ListChecks,
  FileText, ShoppingCart, Briefcase, CalendarDays, FolderKanban, FileSignature, StickyNote, Contact,
  Stamp, FileSearch, MessagesSquare, Gavel, HandCoins, ClipboardCheck, Boxes, Truck, ShieldAlert,
  DoorOpen, HeartPulse, GraduationCap,
  Factory, Store, Stethoscope, BookOpen, HardHat, Building, Server, GitBranch,
  PackageCheck, Warehouse, Calculator, Banknote, TrendingUp, Rocket, Scale, Dumbbell, Award,
  Siren, ShieldCheck, Binoculars, Route, Wrench, MessageSquareWarning,
  Sparkles, Blocks, Radar,
};

function TemplateGlyph({ name, className }: { name: string; className?: string }) {
  const Ic = TEMPLATE_ICONS[name] ?? LayoutGrid;
  return <Ic className={className} />;
}

/** カテゴリの表示順とアイコン（ギャラリーの絞り込みチップ／見出しで使用）。 */
const CATEGORY_ORDER: { name: string; icon: LucideIcon }[] = [
  { name: '顧客対応', icon: Headset },
  { name: '営業', icon: Briefcase },
  { name: 'マーケティング', icon: TrendingUp },
  { name: '申請・承認', icon: Stamp },
  { name: '管理業務', icon: ListChecks },
  { name: '社内業務', icon: Building2 },
  { name: '人事', icon: Contact },
  { name: '経理・財務', icon: Calculator },
  { name: '法務・コンプライアンス', icon: Scale },
  { name: '調査・回収', icon: FileSearch },
  { name: '製造', icon: Factory },
  { name: '小売・店舗', icon: Store },
  { name: '物流・運送', icon: Truck },
  { name: '建設・不動産', icon: HardHat },
  { name: 'IT・情報システム', icon: Server },
  { name: '医療・介護', icon: Stethoscope },
  { name: '教育', icon: GraduationCap },
  { name: '官公庁', icon: Building },
  { name: '自衛隊・防衛', icon: ShieldCheck },
];
const CATEGORY_ICONS: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ORDER.map((c) => [c.name, c.icon]),
);

type Selection = { kind: 'blank' } | { kind: 'template'; tpl: TemplateMeta } | { kind: 'suite'; suite: SuiteMeta } | null;

export function AppList() {
  const [apps, setApps] = useState<AppRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState(false);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [suites, setSuites] = useState<SuiteMeta[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [selected, setSelected] = useState<Selection>(null);
  const [aiMode, setAiMode] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });
  const [withSamples, setWithSamples] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [favs, setFavs] = useState<string[]>(getFavorites());
  const navigate = useNavigate();
  const user = getUser();
  const toast = useToast();
  const { confirm } = useConfirm();

  const sortedApps = [...apps].sort((a, b) => (favs.includes(b.id) ? 1 : 0) - (favs.includes(a.id) ? 1 : 0));

  const load = () => {
    setLoading(true);
    api.get('/apps').then(setApps).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const loadTemplates = () => {
    setTplLoading(true);
    api.get('/apps/templates').then(setTemplates).catch((e) => toast.error(e.message)).finally(() => setTplLoading(false));
    api.get('/apps/suites').then(setSuites).catch(() => {});
  };

  const openCreate = () => {
    setSelected(null);
    setAiMode(false);
    setForm({ name: '', description: '' });
    setWithSamples(true);
    setPicker(true);
    loadTemplates();
  };

  const deleteTemplate = async (t: TemplateMeta) => {
    if (!(await confirm({ title: 'テンプレートを削除', message: `「${t.name}」を削除しますか？`, danger: true, confirmText: '削除' }))) return;
    try {
      await api.delete(`/apps/templates/user/${t.id.slice(5)}`);
      toast.success('削除しました');
      loadTemplates();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const chooseBlank = () => {
    setSelected({ kind: 'blank' });
    setForm({ name: '', description: '' });
  };
  const chooseTemplate = (tpl: TemplateMeta) => {
    setSelected({ kind: 'template', tpl });
    setForm({ name: tpl.name, description: tpl.description });
  };
  const chooseSuite = (suite: SuiteMeta) => {
    setSelected({ kind: 'suite', suite });
    setForm({ name: suite.name, description: suite.description });
  };

  const submitCreate = async () => {
    if (!selected) return;
    // 連携アプリ群（スイート）: 複数アプリを一括生成し、一覧へ戻る。
    if (selected.kind === 'suite') {
      setSubmitting(true);
      try {
        const res = await api.post('/apps/from-suite', { suiteId: selected.suite.id, withSamples });
        setPicker(false);
        toast.success(`${res?.apps?.length ?? selected.suite.apps.length}個の連携アプリを作成しました`);
        load();
      } catch (e: any) {
        toast.error(e.message || 'エラーが発生しました');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (!form.name.trim()) return;
    setSubmitting(true);
    try {
      const app = selected.kind === 'blank'
        ? await api.post('/apps', { name: form.name.trim(), description: form.description.trim() })
        : await api.post('/apps/from-template', { templateId: selected.tpl.id, name: form.name.trim(), description: form.description.trim(), withSamples });
      setPicker(false);
      toast.success(selected.kind === 'template' ? (withSamples ? 'テンプレートとサンプルデータでアプリを作成しました' : 'テンプレートからアプリを作成しました') : 'アプリを作成しました');
      navigate(`/apps/${app.id}/settings`);
    } catch (e: any) {
      toast.error(e.message || 'エラーが発生しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">アプリ</h1>
          <p className="text-sm text-muted mt-0.5">利用可能なアプリの一覧</p>
        </div>
        {canCreateApp(user) && (
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={openCreate}>
            アプリを新規作成
          </Button>
        )}
      </div>

      {loading ? (
        <SkeletonCards />
      ) : apps.length === 0 ? (
        <EmptyState
          icon={<LayoutGrid className="size-6" />}
          title="アプリがありません"
          description={
            canCreateApp(user)
              ? '「アプリを新規作成」から、テンプレートを選んで素早く始められます。'
              : '管理者にアプリの公開を依頼してください。'
          }
          action={
            canCreateApp(user) && (
              <Button variant="primary" icon={<Plus className="size-4" />} onClick={openCreate}>
                アプリを新規作成
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {sortedApps.map((app) => {
            const fav = favs.includes(app.id);
            return (
            <div
              key={app.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/apps/${app.id}`)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/apps/${app.id}`)}
              className="card group relative p-5 text-left cursor-pointer transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-pop)]"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="grid place-items-center size-9 rounded-lg bg-primary-soft text-primary-soft-fg shrink-0">
                  <LayoutGrid className="size-[18px]" />
                </span>
                <div className="flex items-center gap-1">
                  <span className={`badge ${app.status === 'published' ? 'badge-success' : 'badge-muted'}`}>
                    {app.status === 'published' ? '公開中' : '下書き'}
                  </span>
                  <button
                    type="button"
                    className={cn('btn btn-ghost btn-icon btn-sm', fav ? 'text-amber-500' : 'text-muted')}
                    onClick={(e) => { e.stopPropagation(); toggleFavorite(app.id); setFavs(getFavorites()); }}
                    aria-label={fav ? 'お気に入り解除' : 'お気に入りに追加'}
                    title={fav ? 'お気に入り解除' : 'お気に入りに追加'}
                  >
                    <Star className={cn('size-4', fav && 'fill-current')} />
                  </button>
                </div>
              </div>
              <h3 className="font-semibold leading-snug flex items-center gap-1 group-hover:text-primary transition-colors">
                {app.name}
                <ChevronRight className="size-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
              </h3>
              <p className="text-sm text-muted mt-1 min-h-[2.5em] line-clamp-2">
                {app.description || '説明なし'}
              </p>
              <div className="flex items-center gap-1.5 text-xs text-muted mt-3 pt-3 border-t border-border">
                <User className="size-3.5" />
                {app.creator ? userDisplay(app.creator) : '—'}
              </div>
            </div>
            );
          })}
        </div>
      )}

      <Modal
        open={picker}
        onClose={() => setPicker(false)}
        size="lg"
        title={aiMode ? 'AIでアプリを作成' : selected ? 'アプリを作成' : 'アプリを新規作成 — テンプレートを選択'}
        footer={
          aiMode ? undefined : selected ? (
            <>
              <Button icon={<ArrowLeft className="size-4" />} onClick={() => setSelected(null)}>テンプレート選択へ戻る</Button>
              {selected.kind === 'suite' ? (
                <Button variant="primary" onClick={submitCreate} loading={submitting}>
                  連携アプリを作成
                </Button>
              ) : (
                <Button variant="primary" onClick={submitCreate} loading={submitting} disabled={!form.name.trim()}>
                  作成して設定へ
                </Button>
              )}
            </>
          ) : (
            <Button onClick={() => setPicker(false)}>キャンセル</Button>
          )
        }
      >
        {aiMode ? (
          <AiCreatePanel
            onBack={() => setAiMode(false)}
            onCancel={() => setPicker(false)}
            onCreated={(app) => { setPicker(false); toast.success('AIでアプリを作成しました'); navigate(`/apps/${app.id}/settings`); }}
            onSaved={() => { setAiMode(false); loadTemplates(); toast.success('テンプレートとして保存しました'); }}
          />
        ) : !selected ? (
          <TemplateGallery loading={tplLoading} templates={templates} suites={suites} onBlank={chooseBlank} onPick={chooseTemplate} onPickSuite={chooseSuite} onDelete={deleteTemplate} onAi={() => setAiMode(true)} />
        ) : (
          <CreateForm selection={selected} form={form} onForm={setForm} onSubmit={submitCreate} withSamples={withSamples} onWithSamples={setWithSamples} />
        )}
      </Modal>
    </Layout>
  );
}

/* ============ テンプレートギャラリー ============ */
function TemplateGallery({
  loading, templates, suites, onBlank, onPick, onPickSuite, onDelete, onAi,
}: {
  loading: boolean;
  templates: TemplateMeta[];
  suites: SuiteMeta[];
  onBlank: () => void;
  onPick: (t: TemplateMeta) => void;
  onPickSuite: (s: SuiteMeta) => void;
  onDelete: (t: TemplateMeta) => void;
  onAi: () => void;
}) {
  // 'all' = すべて / '__mine' = マイテンプレートのみ / その他 = カテゴリ名
  const [activeCat, setActiveCat] = useState<string>('all');

  // 出現するカテゴリを規定順に並べ、未知カテゴリは末尾へ
  const present = Array.from(new Set(templates.map((t) => t.category)));
  const orderedCats = CATEGORY_ORDER.map((c) => c.name).filter((n) => present.includes(n));
  const extraCats = present.filter((n) => !orderedCats.includes(n)).sort();
  const allCats = [...orderedCats, ...extraCats];
  const userCount = templates.filter((t) => t.isUser).length;

  // 絞り込み適用 → カテゴリ単位にグルーピング（規定順、空カテゴリは除外）
  const filtered = templates.filter((t) =>
    activeCat === 'all' ? true : activeCat === '__mine' ? !!t.isUser : t.category === activeCat,
  );
  const groups = allCats
    .map((cat) => ({ cat, items: filtered.filter((t) => t.category === cat) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-3">
      <button
        onClick={onAi}
        className="card w-full p-4 text-left flex items-center gap-3 border-primary/40 bg-primary-soft/40 transition-all hover:border-primary hover:shadow-[var(--shadow-pop)]"
      >
        <span className="grid place-items-center size-10 rounded-lg bg-primary text-primary-fg shrink-0">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-sm">AIで作成</div>
          <div className="text-xs text-muted">やりたいことを書くだけで、AIが項目・プロセスを設計します。</div>
        </div>
        <ChevronRight className="size-4 text-muted ml-auto shrink-0" />
      </button>

      <button
        onClick={onBlank}
        className="card w-full p-4 text-left flex items-center gap-3 transition-all hover:border-border-strong hover:shadow-[var(--shadow-pop)]"
      >
        <span className="grid place-items-center size-10 rounded-lg bg-surface-2 text-muted shrink-0">
          <FilePlus2 className="size-5" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-sm">空のアプリから作成</div>
          <div className="text-xs text-muted">フォームをゼロから自分で組み立てます。</div>
        </div>
        <ChevronRight className="size-4 text-muted ml-auto shrink-0" />
      </button>

      {suites.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs font-semibold text-muted">連携アプリ群（スイート）</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {suites.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => onPickSuite(s)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPickSuite(s)}
                className="card group relative p-4 text-left cursor-pointer transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-[var(--shadow-pop)] border-primary/30 bg-primary-soft/20"
              >
                <div className="flex items-start gap-3">
                  <span className="grid place-items-center size-10 rounded-lg bg-primary text-primary-fg shrink-0">
                    <TemplateGlyph name={s.icon} className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm group-hover:text-primary transition-colors">{s.name}</div>
                    <p className="text-xs text-muted mt-0.5 line-clamp-2">{s.summary}</p>
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted"><Workflow className="size-3" />{s.apps.length}アプリ連携</span>
                      {s.apps.map((a, i) => (
                        <span key={i} className="badge badge-muted">{a.name}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center gap-2 pt-1">
        <span className="text-xs font-semibold text-muted">テンプレートから作成</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : (
        <>
          {/* カテゴリ絞り込みチップ（スクロールに追従） */}
          <div className="sticky top-0 z-10 -mx-5 px-5 py-2 bg-surface border-b border-border">
            <div className="flex flex-wrap gap-1.5">
              <CatChip label="すべて" count={templates.length} active={activeCat === 'all'} onClick={() => setActiveCat('all')} />
              {userCount > 0 && (
                <CatChip label="マイ" icon={Star} count={userCount} active={activeCat === '__mine'} onClick={() => setActiveCat('__mine')} />
              )}
              {allCats.map((cat) => (
                <CatChip
                  key={cat}
                  label={cat}
                  icon={CATEGORY_ICONS[cat]}
                  count={templates.filter((t) => t.category === cat).length}
                  active={activeCat === cat}
                  onClick={() => setActiveCat(cat)}
                />
              ))}
            </div>
          </div>

          {/* カテゴリ見出し付きのグループ表示 */}
          {groups.length === 0 ? (
            <p className="text-sm text-muted text-center py-8">該当するテンプレートがありません。</p>
          ) : (
            groups.map((g) => {
              const Ic = CATEGORY_ICONS[g.cat];
              return (
                <section key={g.cat} className="space-y-2">
                  <div className="flex items-center gap-1.5 pt-1">
                    {Ic && <Ic className="size-4 text-muted shrink-0" />}
                    <span className="font-semibold text-sm">{g.cat}</span>
                    <span className="badge badge-muted">{g.items.length}</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {g.items.map((t) => (
                      <div
                        key={t.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onPick(t)}
                        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onPick(t)}
                        className="card group relative p-4 text-left cursor-pointer transition-all hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[var(--shadow-pop)]"
                      >
                        {t.isUser && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon btn-sm absolute top-2 right-2 z-10"
                            onClick={(e) => { e.stopPropagation(); onDelete(t); }}
                            aria-label="テンプレートを削除"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                        <div className="flex items-start gap-3">
                          <span className="grid place-items-center size-10 rounded-lg bg-primary-soft text-primary-soft-fg shrink-0">
                            <TemplateGlyph name={t.icon} className="size-5" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap pr-6">
                              <span className="font-semibold text-sm group-hover:text-primary transition-colors">{t.name}</span>
                              {t.isUser && <span className="badge badge-success">マイ</span>}
                            </div>
                            <p className="text-xs text-muted mt-0.5 line-clamp-2">{t.summary}</p>
                            <div className="flex items-center gap-2 text-[11px] text-muted mt-1.5">
                              <span>{t.fields.length}項目</span>
                              {t.hasProcess && (
                                <span className="inline-flex items-center gap-0.5"><Workflow className="size-3" />プロセス付き</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </>
      )}
    </div>
  );
}

/* ============ カテゴリ絞り込みチップ ============ */
function CatChip({
  label, count, active, onClick, icon: Ic,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-fg'
          : 'border-border bg-surface text-content hover:border-border-strong hover:bg-surface-hover',
      )}
    >
      {Ic && <Ic className="size-3.5" />}
      {label}
      <span className={cn('tabular-nums', active ? 'text-primary-fg/70' : 'text-muted')}>{count}</span>
    </button>
  );
}

/* ============ 作成フォーム（名前/説明の確認） ============ */
function CreateForm({
  selection, form, onForm, onSubmit, withSamples, onWithSamples,
}: {
  selection: Exclude<Selection, null>;
  form: { name: string; description: string };
  onForm: (f: { name: string; description: string }) => void;
  onSubmit: () => void;
  withSamples: boolean;
  onWithSamples: (v: boolean) => void;
}) {
  const tpl = selection.kind === 'template' ? selection.tpl : null;
  const suite = selection.kind === 'suite' ? selection.suite : null;

  if (suite) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-primary/30 bg-primary-soft/20 p-4">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center size-10 rounded-lg bg-primary text-primary-fg shrink-0">
              <TemplateGlyph name={suite.icon} className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-sm">{suite.name}</div>
              <p className="text-xs text-muted">{suite.summary}</p>
            </div>
          </div>
          <p className="text-xs text-muted mt-3">{suite.description}</p>
          <div className="mt-3">
            <div className="text-xs font-semibold text-muted mb-1.5">作成されるアプリ（{suite.apps.length}）</div>
            <div className="flex flex-col gap-1.5">
              {suite.apps.map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="grid place-items-center size-7 rounded-md bg-primary-soft text-primary-soft-fg shrink-0">
                    <TemplateGlyph name={a.icon} className="size-4" />
                  </span>
                  <span>{a.name}</span>
                  {i < suite.apps.length - 1 && <ChevronRight className="size-3 text-muted" />}
                </div>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 cursor-pointer">
          <input type="checkbox" className="accent-[var(--primary)] mt-0.5" checked={withSamples} onChange={(e) => onWithSamples(e.target.checked)} />
          <span className="text-sm">
            サンプルデータも作成する
            <span className="block text-xs text-muted">各アプリにリアルなテストレコードを登録し、ビュー・ダッシュボード・帳票をすぐ確認できます（後で削除できます）。</span>
          </span>
        </label>

        <p className="text-xs text-muted">
          上記アプリが関連レコード参照で連携した状態でまとめて作成されます。作成後、各アプリの設定画面で項目の追加・編集ができます。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tpl && (
        <div className="rounded-xl border border-border bg-surface-2 p-4">
          <div className="flex items-center gap-3">
            <span className="grid place-items-center size-10 rounded-lg bg-primary-soft text-primary-soft-fg shrink-0">
              <TemplateGlyph name={tpl.icon} className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-sm">{tpl.name}</div>
              <p className="text-xs text-muted">{tpl.summary}</p>
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xs font-semibold text-muted mb-1.5">含まれる項目（{tpl.fields.length}）</div>
            <div className="flex flex-wrap gap-1.5">
              {tpl.fields.map((f, i) => (
                <span key={i} className={cn('badge', f.required ? 'badge-success' : 'badge-muted')}>
                  {f.label}{f.required && ' *'}
                </span>
              ))}
            </div>
            {tpl.hasProcess && (
              <p className="flex items-center gap-1 text-[11px] text-muted mt-2">
                <Workflow className="size-3" />ステータスの遷移（プロセス管理）が初期設定されます。
              </p>
            )}
          </div>
        </div>
      )}

      <Field label="アプリ名" required>
        <input
          className="input"
          autoFocus
          value={form.name}
          onChange={(e) => onForm({ ...form, name: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
          placeholder="例: 問い合わせ管理"
        />
      </Field>
      <Field label="説明" hint="任意。アプリ一覧に表示されます。">
        <textarea
          className="input"
          rows={3}
          value={form.description}
          onChange={(e) => onForm({ ...form, description: e.target.value })}
        />
      </Field>

      {tpl && (
        <label className="flex items-start gap-2 rounded-lg border border-border bg-surface-2 p-3 cursor-pointer">
          <input type="checkbox" className="accent-[var(--primary)] mt-0.5" checked={withSamples} onChange={(e) => onWithSamples(e.target.checked)} />
          <span className="text-sm">
            サンプルデータも作成する
            <span className="block text-xs text-muted">操作をすぐ試せるよう、リアルなテストレコードを数件登録します（後で削除できます）。</span>
          </span>
        </label>
      )}

      {tpl && (
        <p className="text-xs text-muted">
          作成後、フォーム設定画面で項目の追加・編集ができます。
        </p>
      )}
    </div>
  );
}

/* ============ AIでアプリを作成 ============ */
function AiCreatePanel({ onBack, onCancel, onCreated, onSaved }: {
  onBack: () => void;
  onCancel: () => void;
  onCreated: (app: any) => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [err, setErr] = useState('');
  const [def, setDef] = useState<AppDefinition | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [acting, setActing] = useState(false);
  const [queued, setQueued] = useState<QueuedInfo | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generate = async () => {
    if (!desc.trim() || busy) return;
    setBusy(true); setErr(''); setProgress(''); setDef(null); setQueued(null);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    await generateTemplateStream(desc, {
      signal: ctrl.signal,
      onQueued: (info) => setQueued(info),
      onProgress: (t) => { setQueued(null); setProgress((p) => (p + t).slice(-4000)); },
      onDefinition: (d) => { setDef(d); setName(d.name || 'AIアプリ'); setDescription(d.description || ''); setStep('preview'); },
      onError: (m) => { setQueued(null); setErr(m); },
      onDone: () => { setQueued(null); setBusy(false); abortRef.current = null; },
    });
  };
  const stop = () => abortRef.current?.abort();

  const createApp = async () => {
    if (!def || acting) return;
    setActing(true);
    try {
      const app = await api.post('/apps/from-definition', { name: name.trim(), description: description.trim(), definition: { ...def, name, description } });
      onCreated(app);
    } catch (e: any) { toast.error(e.message); } finally { setActing(false); }
  };
  const saveTpl = async () => {
    if (!def || acting) return;
    setActing(true);
    try {
      await api.post('/apps/templates/from-definition', { name: name.trim(), summary: description.trim(), definition: { ...def, name, description } });
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setActing(false); }
  };

  if (step === 'input') {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">作りたいアプリを自由に説明してください。AIが項目・選択肢・プロセス（必要ならAI機能）を設計します。</p>
        <textarea
          className="input min-h-36"
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          disabled={busy}
          placeholder={'例: 経費精算アプリ。申請者・金額・日付・カテゴリ(交通費/宿泊費/その他)・ステータス(申請中/承認/却下)・領収書添付。承認フローと、申請内容のAI要約項目も。'}
        />
        {busy && (
          <div className="rounded-lg border border-border bg-surface-2 p-3">
            <p className="text-xs text-muted flex items-center gap-1.5">
              <QueueHint active={busy} queued={queued} fallback={<><Loader2 className="size-3.5 animate-spin" />AIが設計しています…（数十秒かかる場合があります）</>} />
            </p>
            {progress && <pre className="mt-2 text-[11px] text-muted whitespace-pre-wrap break-words max-h-32 overflow-auto">{progress}</pre>}
          </div>
        )}
        {err && <p className="text-sm text-danger break-words">{err}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button onClick={busy ? onCancel : onBack} disabled={acting}>{busy ? 'キャンセル' : '戻る'}</Button>
          {busy
            ? <Button variant="danger" onClick={stop}>停止</Button>
            : <Button variant="primary" icon={<Sparkles className="size-4" />} onClick={generate} disabled={!desc.trim()}>AIで設計</Button>}
        </div>
      </div>
    );
  }

  const fields = def?.fields || [];
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="アプリ名"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="説明"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      </div>
      <div>
        <p className="text-xs font-semibold text-muted mb-1.5">生成された項目（{fields.length}）</p>
        <div className="rounded-lg border border-border divide-y divide-border max-h-64 overflow-auto">
          {fields.map((f) => (
            <div key={f.fieldCode} className="flex items-center gap-2 px-3 py-1.5 text-sm">
              {f.fieldType === 'ai' && <Sparkles className="size-3.5 text-primary-soft-fg shrink-0" />}
              <span className="truncate">{f.label}</span>
              {f.required && <span className="text-danger text-xs">*</span>}
              <span className="badge badge-muted ml-auto shrink-0">{fieldTypeLabel(f.fieldType)}</span>
            </div>
          ))}
        </div>
      </div>
      {def?.processConfig && (
        <p className="text-xs text-muted flex items-center gap-1"><Workflow className="size-3.5" />プロセス: {def.processConfig.statuses.join(' → ')}</p>
      )}
      {def?.aiConfig?.actions?.length ? (
        <p className="text-xs text-muted flex items-center gap-1"><Sparkles className="size-3.5 text-primary-soft-fg" />AIアクション: {def.aiConfig.actions.map((a) => a.name).join('、')}</p>
      ) : null}
      <div className="flex items-center justify-end gap-2 flex-wrap pt-1">
        <Button onClick={() => setStep('input')} disabled={acting}>やり直す</Button>
        <Button onClick={saveTpl} loading={acting} disabled={!name.trim()}>テンプレートとして保存</Button>
        <Button variant="primary" onClick={createApp} loading={acting} disabled={!name.trim()}>このアプリを作成</Button>
      </div>
    </div>
  );
}
