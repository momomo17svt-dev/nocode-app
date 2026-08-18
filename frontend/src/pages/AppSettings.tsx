import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Copy, Trash2, Plus, ChevronUp, ChevronDown, Save, ArrowRight,
  FormInput, Globe, Workflow, X, Bookmark, GripVertical, Sparkles, Printer, FileText, Eye,
} from 'lucide-react';
import { api } from '../lib/api';
import { getUser } from '../lib/auth';
import { Layout } from '../components/Layout';
import { FIELD_TYPES, type FieldDef, fieldTypeMeta } from '../lib/fields';
import {
  type ReportTemplate, type ReportBlock, type ReportBlockType, type PaperSize, type Orientation,
  BLOCK_LABELS, PAPER_LABELS, defaultTemplate, selectableFieldsForBlock,
} from '../lib/report';
import { MapView } from '../components/MapView';
import { BASEMAPS, DEFAULT_CENTER, DEFAULT_ZOOM, MAP_HEIGHT_LABELS, SYSTEM_BASEMAP, getBasemap, mapCenter, mapHeightClass, mapZoom, resolveBasemapId, resolveBasemapRuntime, useMapManifest, type MapHeight } from '../lib/map';
import { Button } from '../components/ui/Button';
import { Field } from '../components/ui/Field';
import { Modal } from '../components/ui/Modal';
import { EntityPicker } from '../components/EntityPicker';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { cn } from '../lib/cn';

type Tab = 'form' | 'publish' | 'process' | 'ai' | 'report';

export function AppSettings() {
  const { appId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [tab, setTab] = useState<Tab>('form');
  const [app, setApp] = useState<any>(null);
  const [tplModal, setTplModal] = useState(false);

  useEffect(() => {
    if (!appId) return;
    api.get(`/apps/${appId}`).then(setApp).catch((e) => toast.error(e.message));
  }, [appId, toast]);

  const duplicateApp = async () => {
    if (!(await confirm({ title: 'アプリを複製', message: 'このアプリをフォーム定義・公開設定ごと複製しますか？（レコードは複製されません）', confirmText: '複製' }))) return;
    try {
      const copy = await api.post(`/apps/${appId}/duplicate`, {});
      toast.success('複製しました。');
      navigate(`/apps/${copy.id}/settings`);
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const deleteApp = async () => {
    if (!(await confirm({
      title: 'アプリを削除',
      message: `アプリ「${app.name}」を削除します。\nレコード・フィールド・公開設定もすべて削除され、元に戻せません。`,
      danger: true,
      confirmText: '削除する',
    }))) return;
    try {
      await api.delete(`/apps/${appId}`);
      toast.success('アプリを削除しました。');
      navigate('/');
    } catch (e: any) {
      // 他アプリから参照されている場合は 409。追加確認のうえ強制削除できる。
      if (e?.status === 409) {
        const ok = await confirm({
          title: '他のアプリから参照されています',
          message: `${e.message}\n\nそれでも削除しますか？参照元アプリのリンクは切れたまま残ります。`,
          danger: true,
          confirmText: '強制的に削除する',
        });
        if (!ok) return;
        try {
          await api.delete(`/apps/${appId}?force=true`);
          toast.success('アプリを削除しました。');
          navigate('/');
        } catch (e2: any) {
          toast.error(e2.message);
        }
        return;
      }
      toast.error(e.message);
    }
  };

  if (!app) {
    return (
      <Layout>
        <Skeleton className="h-8 w-64 mb-6" />
        <Skeleton className="h-96 w-full" />
      </Layout>
    );
  }

  const canManage = app.myPermission?.canManage;

  return (
    <Layout>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-5">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => navigate(`/apps/${appId}`)} aria-label="戻る" />
          <h1 className="text-xl font-bold tracking-tight truncate">アプリ設定: {app.name}</h1>
        </div>
        {canManage && (
          <div className="flex items-center gap-2 flex-wrap">
            <Button icon={<Bookmark className="size-4" />} onClick={() => setTplModal(true)}>テンプレ保存</Button>
            <Button icon={<Copy className="size-4" />} onClick={duplicateApp}>複製</Button>
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={deleteApp}>削除</Button>
          </div>
        )}
      </div>

      {tplModal && <SaveTemplateModal appId={appId!} defaultName={app.name} defaultSummary={app.description || ''} onClose={() => setTplModal(false)} />}

      <div className="flex gap-1 border-b border-border mb-5">
        <TabButton active={tab === 'form'} onClick={() => setTab('form')} icon={<FormInput className="size-4" />}>フォーム</TabButton>
        <TabButton active={tab === 'publish'} onClick={() => setTab('publish')} icon={<Globe className="size-4" />}>公開・権限設定</TabButton>
        <TabButton active={tab === 'process'} onClick={() => setTab('process')} icon={<Workflow className="size-4" />}>プロセス管理</TabButton>
        <TabButton active={tab === 'ai'} onClick={() => setTab('ai')} icon={<Sparkles className="size-4" />}>AIアクション</TabButton>
        <TabButton active={tab === 'report'} onClick={() => setTab('report')} icon={<Printer className="size-4" />}>帳票</TabButton>
      </div>

      {tab === 'form' && <FormBuilder appId={appId!} />}
      {tab === 'publish' && <PublishSettings appId={appId!} app={app} onAppChange={setApp} />}
      {tab === 'process' && <ProcessSettings appId={appId!} app={app} onAppChange={setApp} />}
      {tab === 'ai' && <AiActionsSettings appId={appId!} app={app} onAppChange={setApp} />}
      {tab === 'report' && <ReportSettings appId={appId!} app={app} onAppChange={setApp} />}
    </Layout>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors',
        active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-content',
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* ============ テンプレートとして保存 ============ */
const TPL_ICONS = [
  { v: 'LayoutGrid', label: '汎用' }, { v: 'ClipboardList', label: 'チェック/調査' }, { v: 'ListChecks', label: 'タスク' },
  { v: 'FileText', label: '書類' }, { v: 'Calculator', label: '計算/経理' }, { v: 'Award', label: '評価' },
  { v: 'Boxes', label: '在庫/物品' }, { v: 'Building', label: '組織/物件' }, { v: 'Contact', label: '連絡先' },
  { v: 'Factory', label: '製造' }, { v: 'HeartPulse', label: '健康' }, { v: 'ShieldAlert', label: '安全' },
];

function SaveTemplateModal({ appId, defaultName, defaultSummary, onClose }: {
  appId: string; defaultName: string; defaultSummary: string; onClose: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({ name: defaultName, category: 'マイテンプレート', icon: 'LayoutGrid', summary: defaultSummary });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.post(`/apps/${appId}/save-as-template`, form);
      toast.success('テンプレートとして保存しました（「アプリを新規作成」のギャラリーに表示されます）');
      onClose();
    } catch (e: any) {
      toast.error(e.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="テンプレートとして保存"
      footer={
        <>
          <Button onClick={onClose}>キャンセル</Button>
          <Button variant="primary" onClick={submit} loading={saving} disabled={!form.name.trim()}>保存</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-muted">このアプリのフォーム定義・プロセス・公開範囲をテンプレート化します（レコードは含まれません）。</p>
        <Field label="テンプレート名" required>
          <input className="input" autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <div className="flex gap-3 flex-wrap">
          <Field label="カテゴリ" className="flex-1 min-w-40">
            <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </Field>
          <Field label="アイコン" className="flex-1 min-w-40">
            <select className="input" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}>
              {TPL_ICONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </Field>
        </div>
        <Field label="説明（任意）">
          <textarea className="input" rows={2} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

/* ============ フォームビルダー(3カラム) ============ */
function FormBuilder({ appId }: { appId: string }) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    api.get(`/fields?appId=${appId}`).then((data) => setFields(data)).catch((e) => toast.error(e.message));
  }, [appId, toast]);

  const addField = (type: string) => {
    const seq = fields.length + 1;
    const nf: FieldDef = {
      fieldCode: `${type}_${Date.now().toString().slice(-6)}`,
      fieldType: type,
      label: `${fieldTypeMeta(type)?.label ?? type}${seq}`,
      required: false,
      settings: fieldTypeMeta(type)?.hasOptions ? { options: ['選択肢1', '選択肢2'] } : {},
    };
    setFields([...fields, nf]);
    setSelected(fields.length);
  };

  const update = (i: number, patch: Partial<FieldDef>) => {
    const next = [...fields];
    next[i] = { ...next[i], ...patch };
    setFields(next);
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    setFields(next);
    setSelected(j);
  };
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...fields];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    setFields(next);
    setSelected(to);
  };
  const remove = async (i: number) => {
    if (!(await confirm({ message: 'この項目を削除しますか？（保存すると確定します）', danger: true, confirmText: '削除' }))) return;
    setFields(fields.filter((_, idx) => idx !== i));
    setSelected(null);
  };

  const save = async () => {
    const codes = fields.map((f) => f.fieldCode);
    if (new Set(codes).size !== codes.length) {
      toast.error('フィールドコードが重複しています');
      return;
    }
    setSaving(true);
    try {
      const saved = await api.put('/fields', { appId, fields });
      setFields(saved);
      toast.success('フォームを保存しました');
    } catch (e: any) {
      toast.error(e.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const sel = selected !== null ? fields[selected] : null;

  return (
    <>
      <div className="flex justify-end mb-3">
        <Button variant="primary" icon={<Save className="size-4" />} onClick={save} loading={saving}>
          {saving ? '保存中...' : 'フォームを保存'}
        </Button>
      </div>
      <div className="grid gap-4 items-start lg:[grid-template-columns:200px_1fr_300px]">
        {/* 左: 部品パレット */}
        <div className="card p-4">
          <h4 className="font-semibold mb-3 text-sm">フィールド部品</h4>
          <div className="space-y-1.5">
            {FIELD_TYPES.map((ft) => (
              <button key={ft.type} className="btn btn-sm w-full justify-start" onClick={() => addField(ft.type)}>
                <Plus className="size-3.5" /> {ft.label}
              </button>
            ))}
          </div>
        </div>

        {/* 中央: プレビュー */}
        <div className="card p-4">
          <h4 className="font-semibold mb-3 text-sm">フォームプレビュー</h4>
          {fields.length === 0 && <p className="text-sm text-muted">左の部品から項目を追加してください。</p>}
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div
                key={i}
                draggable
                onDragStart={(e) => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { e.preventDefault(); if (dragOver !== i) setDragOver(i); }}
                onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) reorder(dragIndex, i); setDragIndex(null); setDragOver(null); }}
                onDragEnd={() => { setDragIndex(null); setDragOver(null); }}
                className={cn(
                  'rounded-lg border px-3.5 py-2.5 cursor-pointer transition-all',
                  selected === i ? 'border-primary ring-2 ring-[var(--ring)] bg-primary-soft/30' : 'border-border hover:border-border-strong',
                  dragOver === i && dragIndex !== null && dragIndex !== i ? 'border-primary border-dashed' : '',
                  dragIndex === i ? 'opacity-40' : '',
                )}
                onClick={() => setSelected(i)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <GripVertical className="size-4 text-muted shrink-0 cursor-grab" />
                    <strong className="text-sm truncate">{f.label}</strong>
                    {f.required && <span className="text-danger">*</span>}
                    <span className="badge badge-muted">{fieldTypeMeta(f.fieldType)?.label ?? f.fieldType}</span>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="sm" icon={<ChevronUp className="size-4" />} onClick={(e) => { e.stopPropagation(); move(i, -1); }} aria-label="上へ" />
                    <Button variant="ghost" size="sm" icon={<ChevronDown className="size-4" />} onClick={(e) => { e.stopPropagation(); move(i, 1); }} aria-label="下へ" />
                    <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={(e) => { e.stopPropagation(); remove(i); }} aria-label="削除" />
                  </div>
                </div>
                <div className="mt-2">
                  <FieldPreview field={f} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右: 設定 */}
        <div className="card p-4">
          <h4 className="font-semibold mb-3 text-sm">項目の設定</h4>
          {!sel ? (
            <p className="text-sm text-muted">項目を選択してください。</p>
          ) : (
            <div className="flex flex-col gap-3">
              <Field label="項目名">
                <input className="input" value={sel.label} onChange={(e) => update(selected!, { label: e.target.value })} />
              </Field>
              <Field label="フィールドコード（英数字・_）">
                <input className="input" value={sel.fieldCode} onChange={(e) => update(selected!, { fieldCode: e.target.value })} />
              </Field>
              <Field label="種類">
                <select className="input" value={sel.fieldType} onChange={(e) => update(selected!, { fieldType: e.target.value })}>
                  {FIELD_TYPES.map((ft) => <option key={ft.type} value={ft.type}>{ft.label}</option>)}
                </select>
              </Field>
              {sel.fieldType !== 'section' && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-[var(--primary)]" checked={sel.required} onChange={(e) => update(selected!, { required: e.target.checked })} />
                  必須項目にする
                </label>
              )}
              {sel.fieldType === 'section' && (
                <Field label="補足説明（任意）">
                  <textarea className="input" rows={2} value={sel.settings?.description || ''} onChange={(e) => update(selected!, { settings: { ...sel.settings, description: e.target.value } })} />
                </Field>
              )}
              {fieldTypeMeta(sel.fieldType)?.hasOptions && (
                <Field label="選択肢（改行区切り）">
                  <textarea className="input" rows={4}
                    value={(sel.settings?.options || []).join('\n')}
                    onChange={(e) => update(selected!, { settings: { ...sel.settings, options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) } })} />
                </Field>
              )}
              {sel.fieldType === 'calc' && (
                <CalcSettings
                  value={sel.settings}
                  condFields={fields.filter((f) => f.fieldCode !== sel.fieldCode && !['file', 'subtable', 'reference'].includes(f.fieldType)).map((f) => ({ fieldCode: f.fieldCode, label: f.label }))}
                  onChange={(s) => update(selected!, { settings: s })}
                />
              )}
              {sel.fieldType === 'ai' && (
                <AiFieldSettings
                  value={sel.settings}
                  fields={fields}
                  currentCode={sel.fieldCode}
                  onChange={(s) => update(selected!, { settings: s })}
                />
              )}
              {sel.fieldType === 'reference' && (
                <ReferenceSettings
                  value={sel.settings}
                  builderFields={fields}
                  currentCode={sel.fieldCode}
                  onChange={(s) => update(selected!, { settings: s })}
                />
              )}
              {sel.fieldType === 'subtable' && (
                <SubtableColumns value={sel.settings} onChange={(s) => update(selected!, { settings: s })} />
              )}
              {sel.fieldType === 'location' && (
                <LocationSettings value={sel.settings} onChange={(s) => update(selected!, { settings: s })} />
              )}
              {sel.fieldType === 'user_select' && (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="accent-[var(--primary)] mt-0.5"
                    checked={sel.settings?.userScope === 'mygroups'}
                    onChange={(e) => update(selected!, { settings: { ...sel.settings, userScope: e.target.checked ? 'mygroups' : '' } })} />
                  <span>候補を「自分の所属部署＋配下部署のメンバー」のみに限定する<br /><span className="text-xs text-muted">※システム管理者は全社員から選べます。部署と所属はユーザー/グループ管理で設定します。</span></span>
                </label>
              )}
              {sel.fieldType === 'auto_number' && (
                <div className="flex gap-2">
                  <Field label="接頭辞" className="flex-1">
                    <input className="input" placeholder="例: INQ-" value={sel.settings?.prefix || ''}
                      onChange={(e) => update(selected!, { settings: { ...sel.settings, prefix: e.target.value } })} />
                  </Field>
                  <Field label="桁数(0埋め)" className="w-24">
                    <input className="input" type="number" value={sel.settings?.padding ?? 0}
                      onChange={(e) => update(selected!, { settings: { ...sel.settings, padding: Number(e.target.value) } })} />
                  </Field>
                </div>
              )}
              {sel.fieldType === 'number' && (
                <div className="flex gap-3 items-end">
                  <Field label="単位" className="flex-1">
                    <input className="input" placeholder="例: 円 / 個" value={sel.settings?.unit || ''}
                      onChange={(e) => update(selected!, { settings: { ...sel.settings, unit: e.target.value } })} />
                  </Field>
                  <label className="flex items-center gap-1.5 text-sm pb-2.5">
                    <input type="checkbox" className="accent-[var(--primary)]" checked={!!sel.settings?.thousandSeparator}
                      onChange={(e) => update(selected!, { settings: { ...sel.settings, thousandSeparator: e.target.checked } })} />
                    桁区切り
                  </label>
                </div>
              )}
              {(sel.fieldType === 'text' || sel.fieldType === 'textarea') && (
                <Field label="最大文字数（0で無制限）">
                  <input className="input" type="number" value={sel.settings?.maxLength ?? 0}
                    onChange={(e) => update(selected!, { settings: { ...sel.settings, maxLength: Number(e.target.value) } })} />
                </Field>
              )}
              {['text', 'textarea', 'email', 'phone', 'link'].includes(sel.fieldType) && (
                <Field label="プレースホルダー（入力例。未入力なら既定の例を表示）">
                  <input className="input"
                    placeholder={sel.fieldType === 'email' ? 'name@example.com' : sel.fieldType === 'phone' ? '03-1234-5678' : sel.fieldType === 'link' ? 'https://...' : '例: 山田 太郎'}
                    value={sel.settings?.placeholder ?? ''}
                    onChange={(e) => update(selected!, { settings: { ...sel.settings, placeholder: e.target.value } })} />
                </Field>
              )}
              {!fieldTypeMeta(sel.fieldType)?.auto && !['file', 'reference', 'subtable'].includes(sel.fieldType) && (
                <Field label="初期値">
                  <input className="input" value={sel.settings?.defaultValue ?? ''}
                    onChange={(e) => update(selected!, { settings: { ...sel.settings, defaultValue: e.target.value } })} />
                </Field>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function FieldPreview({ field }: { field: FieldDef }) {
  const opts: string[] = field.settings?.options || [];
  switch (field.fieldType) {
    case 'textarea':
      return <textarea className="input" rows={2} disabled placeholder="（複数行テキスト）" />;
    case 'number':
      return <input className="input" disabled placeholder="0" />;
    case 'date':
      return <input className="input" type="date" disabled />;
    case 'datetime':
      return <input className="input" type="datetime-local" disabled />;
    case 'checkbox':
      return <div className="flex flex-wrap gap-3 text-sm text-muted">{opts.map((o) => <label key={o} className="flex items-center gap-1"><input type="checkbox" disabled />{o}</label>)}</div>;
    case 'radio':
      return <div className="flex flex-wrap gap-3 text-sm text-muted">{opts.map((o) => <label key={o} className="flex items-center gap-1"><input type="radio" disabled />{o}</label>)}</div>;
    case 'select':
    case 'status':
      return <select className="input" disabled><option>{opts[0] || '選択'}</option></select>;
    case 'user_select':
      return <select className="input" disabled><option>（ユーザーを選択）</option></select>;
    case 'group_select':
      return <select className="input" disabled><option>（グループを選択）</option></select>;
    case 'file':
      return <input className="input" type="file" disabled />;
    case 'auto_number':
      return <input className="input" disabled placeholder="（自動採番）" />;
    case 'calc':
      return <input className="input" disabled placeholder="（自動計算）" />;
    case 'reference':
      return <input className="input" disabled placeholder="（関連レコードを選択）" />;
    case 'link':
      return <input className="input" disabled placeholder="https://..." />;
    case 'email':
      return <input className="input" disabled placeholder="name@example.com" />;
    case 'phone':
      return <input className="input" disabled placeholder="03-1234-5678" />;
    case 'location':
      return <div className="text-xs text-muted">（地図で位置を選択）</div>;
    case 'subtable': {
      const cols: any[] = field.settings?.columns || [];
      return <div className="text-xs text-muted">テーブル: {cols.length ? cols.map((c) => c.label).join(' / ') : '（列未設定）'}</div>;
    }
    case 'section':
      return <div className="text-xs text-muted">（フォームの見出しとして表示）</div>;
    default:
      return <input className="input" disabled />;
  }
}

/* ============ 位置（地図）フィールドの設定 ============ */
function LocationSettings({ value, onChange }: { value: any; onChange: (s: any) => void }) {
  const s = value || {};
  const savedCenter = mapCenter(s);
  const savedZoom = mapZoom(s);
  const manifest = useMapManifest();
  // 選択欄は保存値をそのまま出す（未指定＝システム設定に従う）。地図の描画は解決後のIDを使う。
  const selectedId = String(s.basemap || (s.tileUrl ? 'custom' : SYSTEM_BASEMAP));
  const basemapId = resolveBasemapId(s);
  const base = resolveBasemapRuntime(s);
  const systemLabel = getBasemap(manifest.defaultBasemap).label;

  // プレビュー地図の「いま見えている表示」。確定ボタンを押すまで設定値には反映しない。
  const [view, setView] = useState({ lat: savedCenter.lat, lng: savedCenter.lng, zoom: savedZoom });
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 保存済みの中心/ズームが外部から変わったら（既定に戻す・数値入力）プレビューの基準も合わせる。
  useEffect(() => {
    setView({ lat: savedCenter.lat, lng: savedCenter.lng, zoom: savedZoom });
  }, [savedCenter.lat, savedCenter.lng, savedZoom]);

  // いま見えている表示が、保存済みの初期表示と違う（＝未確定の変更がある）か。
  const dirty =
    Math.abs(view.lat - savedCenter.lat) > 1e-6 ||
    Math.abs(view.lng - savedCenter.lng) > 1e-6 ||
    view.zoom !== savedZoom;

  const applyView = () =>
    onChange({ ...s, center: { lat: Number(view.lat.toFixed(6)), lng: Number(view.lng.toFixed(6)) }, zoom: view.zoom });

  return (
    <div className="space-y-3 rounded-lg border border-border p-3 bg-surface-2">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="背景地図" hint="オフラインで使えるのはDL済みの種別（淡色/標準/航空写真）。オンライン版・カスタムはネット接続時のみ。閲覧画面では利用者が右上で切り替えられます。">
          <select className="input" value={selectedId} onChange={(e) => onChange({ ...s, basemap: e.target.value })}>
            <option value={SYSTEM_BASEMAP}>システム設定に従う（{systemLabel}）</option>
            {BASEMAPS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.kind === 'builtin' && !manifest.styles.includes(b.id) ? `${b.label}（タイル未取得）` : b.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="地図の高さ" hint="レコード入力・詳細・一覧の地図タブの表示高さ。「自動」は各画面の既定（一覧は画面に合わせて最大）。">
          <select
            className="input"
            value={s.height || ''}
            onChange={(e) => onChange({ ...s, height: e.target.value || undefined })}
          >
            <option value="">自動</option>
            {(Object.keys(MAP_HEIGHT_LABELS) as MapHeight[]).map((h) => <option key={h} value={h}>{MAP_HEIGHT_LABELS[h]}</option>)}
          </select>
        </Field>
      </div>
      {basemapId === 'custom' && (
        <Field label="カスタムタイルURL" hint="例: https://example/{z}/{x}/{y}.png">
          <input
            className="input"
            placeholder="https://.../{z}/{x}/{y}.png"
            value={s.tileUrl || ''}
            onChange={(e) => onChange({ ...s, tileUrl: e.target.value })}
          />
        </Field>
      )}
      <Field
        label="初期表示"
        hint="利用者がこのフィールドを開いたとき最初に見える範囲です。下の地図を動かして見せたい場所・拡大率に合わせ、「この表示を初期位置にする」を押してください。"
      >
        <MapView
          className={mapHeightClass(s)}
          center={savedCenter}
          zoom={savedZoom}
          controlledCenter
          centerCrosshair
          onViewChange={(c, z) => setView({ lat: c.lat, lng: c.lng, zoom: Math.round(z) })}
          tileUrl={base.url}
          tileBg={base.bg}
          attribution={base.attribution}
        />
      </Field>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          className={cn('btn btn-sm', dirty && 'btn-primary')}
          disabled={!dirty}
          onClick={applyView}
        >
          この表示を初期位置にする
        </button>
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange({ ...s, center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM })}
        >
          既定に戻す
        </button>
        {dirty
          ? <span className="text-xs text-warning">未確定の変更があります</span>
          : <span className="text-xs text-success">初期位置に設定済み</span>}
      </div>
      <p className="text-xs text-muted">
        中心 {view.lat.toFixed(4)}, {view.lng.toFixed(4)} ／ ズーム {view.zoom}
      </p>
      <div>
        <button
          type="button"
          className="text-xs text-muted hover:text-primary inline-flex items-center gap-1"
          onClick={() => setShowAdvanced((v) => !v)}
        >
          {showAdvanced ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          数値で細かく指定
        </button>
        {showAdvanced && (
          <div className="mt-2 flex gap-2 items-end flex-wrap">
            <Field label="中心 緯度" className="w-32">
              <input className="input" type="number" step="any" value={savedCenter.lat}
                onChange={(e) => onChange({ ...s, center: { lat: Number(e.target.value), lng: savedCenter.lng } })} />
            </Field>
            <Field label="中心 経度" className="w-32">
              <input className="input" type="number" step="any" value={savedCenter.lng}
                onChange={(e) => onChange({ ...s, center: { lat: savedCenter.lat, lng: Number(e.target.value) } })} />
            </Field>
            <Field label="初期ズーム" className="w-28">
              <input className="input" type="number" min={1} max={19} value={s.zoom ?? DEFAULT_ZOOM}
                onChange={(e) => onChange({ ...s, zoom: Number(e.target.value) })} />
            </Field>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ 関連レコード参照の設定 ============ */
function ReferenceSettings({ value, builderFields, currentCode, onChange }: {
  value: any;
  builderFields: FieldDef[];
  currentCode: string;
  onChange: (s: any) => void;
}) {
  const [apps, setApps] = useState<{ id: string; name: string }[]>([]);
  const [refFields, setRefFields] = useState<FieldDef[]>([]);
  const refAppId: string = value?.refAppId || '';
  const lookups: { from: string; to: string }[] = value?.lookups || [];

  useEffect(() => { api.get('/apps').then(setApps).catch(() => {}); }, []);
  useEffect(() => {
    if (refAppId) api.get(`/fields?appId=${refAppId}`).then(setRefFields).catch(() => setRefFields([]));
    else setRefFields([]);
  }, [refAppId]);

  const set = (patch: any) => onChange({ ...value, ...patch });
  const targetFields = builderFields.filter(
    (f) => f.fieldCode !== currentCode && !['auto_number', 'calc', 'file', 'reference'].includes(f.fieldType),
  );

  const addLookup = () => set({ lookups: [...lookups, { from: refFields[0]?.fieldCode || '', to: targetFields[0]?.fieldCode || '' }] });
  const updLookup = (i: number, patch: Partial<{ from: string; to: string }>) => { const l = [...lookups]; l[i] = { ...l[i], ...patch }; set({ lookups: l }); };
  const delLookup = (i: number) => set({ lookups: lookups.filter((_, idx) => idx !== i) });

  return (
    <>
      <Field label="参照先アプリ">
        <select className="input" value={refAppId} onChange={(e) => set({ refAppId: e.target.value, refDisplayField: '', lookups: [] })}>
          <option value="">選択してください</option>
          {apps.filter((a) => a.id).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>
      {refAppId && (
        <Field label="表示する項目（ラベル）" hint="一覧やカードに表示される値です。">
          <select className="input" value={value?.refDisplayField || ''} onChange={(e) => set({ refDisplayField: e.target.value })}>
            <option value="">レコードID</option>
            {refFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
          </select>
        </Field>
      )}
      {refAppId && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="label mb-0">ルックアップ（自動転記）</span>
            <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={addLookup} disabled={refFields.length === 0 || targetFields.length === 0}>追加</Button>
          </div>
          <div className="space-y-2">
            {lookups.map((lk, i) => (
              <div key={i} className="flex items-center gap-1.5 flex-wrap">
                <select className="input w-auto flex-1 min-w-28" value={lk.from} onChange={(e) => updLookup(i, { from: e.target.value })}>
                  {refFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
                </select>
                <ArrowRight className="size-4 text-muted shrink-0" />
                <select className="input w-auto flex-1 min-w-28" value={lk.to} onChange={(e) => updLookup(i, { to: e.target.value })}>
                  {targetFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
                </select>
                <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => delLookup(i)} aria-label="削除" />
              </div>
            ))}
            {lookups.length === 0 && <p className="text-xs text-muted">選択時に参照先の値をこのアプリの項目へコピーします（任意）。</p>}
          </div>
        </div>
      )}
    </>
  );
}

/* ============ サブテーブル（明細行）の列設定 ============ */
const SUB_TYPES = [
  { type: 'text', label: '文字列' },
  { type: 'number', label: '数値' },
  { type: 'date', label: '日付' },
  { type: 'select', label: 'セレクト' },
  { type: 'calc', label: '計算' },
];

function SubtableColumns({ value, onChange }: { value: any; onChange: (s: any) => void }) {
  const columns: any[] = value?.columns || [];
  const set = (cols: any[]) => onChange({ ...value, columns: cols });
  const add = () => set([...columns, { fieldCode: `col_${Date.now().toString().slice(-5)}`, fieldType: 'text', label: `列${columns.length + 1}`, settings: {} }]);
  const upd = (i: number, patch: any) => set(columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const updSettings = (i: number, patch: any) => set(columns.map((c, idx) => (idx === i ? { ...c, settings: { ...c.settings, ...patch } } : c)));
  const del = (i: number) => set(columns.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= columns.length) return; const a = [...columns]; [a[i], a[j]] = [a[j], a[i]]; set(a); };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="label mb-0">テーブルの列</span>
        <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={add}>列を追加</Button>
      </div>
      <div className="space-y-3">
        {columns.map((c, i) => (
          <div key={i} className="rounded-lg border border-border p-2.5 space-y-2">
            <div className="flex items-center gap-1.5">
              <input className="input flex-1" placeholder="列名" value={c.label} onChange={(e) => upd(i, { label: e.target.value })} />
              <Button variant="ghost" size="sm" icon={<ChevronUp className="size-4" />} onClick={() => move(i, -1)} aria-label="上へ" />
              <Button variant="ghost" size="sm" icon={<ChevronDown className="size-4" />} onClick={() => move(i, 1)} aria-label="下へ" />
              <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => del(i)} aria-label="削除" />
            </div>
            <div className="flex gap-1.5">
              <input className="input flex-1" placeholder="コード(英数字_)" value={c.fieldCode} onChange={(e) => upd(i, { fieldCode: e.target.value })} />
              <select className="input w-auto" value={c.fieldType} onChange={(e) => upd(i, { fieldType: e.target.value })}>
                {SUB_TYPES.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
              </select>
            </div>
            {c.fieldType === 'select' && (
              <textarea className="input" rows={2} placeholder="選択肢（改行区切り）"
                value={(c.settings?.options || []).join('\n')}
                onChange={(e) => updSettings(i, { options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })} />
            )}
            {c.fieldType === 'calc' && (
              <CalcSettings
                value={c.settings || {}}
                condFields={columns.filter((x) => x.fieldCode !== c.fieldCode && x.fieldType !== 'calc').map((x) => ({ fieldCode: x.fieldCode, label: x.label }))}
                onChange={(s) => upd(i, { settings: s })}
              />
            )}
            {(c.fieldType === 'number' || c.fieldType === 'calc') && (
              <div className="flex gap-2 items-center">
                <input className="input flex-1" placeholder="単位" value={c.settings?.unit || ''} onChange={(e) => updSettings(i, { unit: e.target.value })} />
                <label className="flex items-center gap-1.5 text-sm whitespace-nowrap">
                  <input type="checkbox" className="accent-[var(--primary)]" checked={!!c.settings?.thousandSeparator} onChange={(e) => updSettings(i, { thousandSeparator: e.target.checked })} />桁区切り
                </label>
              </div>
            )}
          </div>
        ))}
        {columns.length === 0 && <p className="text-xs text-muted">「列を追加」で明細テーブルの列を定義します（例: 品名・数量・単価・金額(計算)）。</p>}
      </div>
    </div>
  );
}

/* ============ 計算フィールドの設定（計算式 / ルール表） ============ */
const RULE_OPS = [
  { v: '>=', label: '以上' }, { v: '>', label: 'より大きい' }, { v: '<=', label: '以下' }, { v: '<', label: '未満' },
  { v: '==', label: 'と等しい' }, { v: '!=', label: 'と異なる' }, { v: 'between', label: '範囲(〜)' },
  { v: 'empty', label: 'が空' }, { v: 'notempty', label: 'が空でない' },
];

function CalcSettings({ value, condFields, onChange }: {
  value: any; condFields: { fieldCode: string; label: string }[]; onChange: (s: any) => void;
}) {
  const mode: 'formula' | 'rules' = value?.mode === 'rules' ? 'rules' : 'formula';
  const set = (patch: any) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3">
      <Field label="計算方法">
        <div className="flex gap-1.5">
          <button className={cn('btn btn-sm', mode === 'formula' && 'btn-primary')} onClick={() => set({ mode: 'formula' })}>計算式</button>
          <button className={cn('btn btn-sm', mode === 'rules' && 'btn-primary')} onClick={() => set({ mode: 'rules' })}>ルール表（条件分岐）</button>
        </div>
      </Field>
      {mode === 'formula' ? (
        <Field label="計算式（例: price * qty）" hint="フィールドコードで参照。+ - * / ( ) ・比較( > < >= <= == != )・if(条件,真,偽)・min/max・明細の集計 sum(明細.列) avg(明細.列) count(明細) が使えます。">
          <input className="input" value={value?.formula || ''} onChange={(e) => set({ formula: e.target.value })} />
        </Field>
      ) : (
        <RuleTable value={value} condFields={condFields} onChange={onChange} />
      )}
    </div>
  );
}

function RuleTable({ value, condFields, onChange }: {
  value: any; condFields: { fieldCode: string; label: string }[]; onChange: (s: any) => void;
}) {
  const rules: any[] = value?.rules || [];
  const set = (patch: any) => onChange({ ...value, ...patch });
  const setRules = (r: any[]) => set({ rules: r });
  const updRule = (i: number, patch: any) => setRules(rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRule = () => setRules([...rules, { when: [{ field: condFields[0]?.fieldCode || '', op: '>=', value: '' }], result: '' }]);
  const delRule = (i: number) => setRules(rules.filter((_, idx) => idx !== i));
  const moveRule = (i: number, dir: -1 | 1) => { const j = i + dir; if (j < 0 || j >= rules.length) return; const a = [...rules]; [a[i], a[j]] = [a[j], a[i]]; setRules(a); };
  const addCond = (i: number) => updRule(i, { when: [...(rules[i].when || []), { field: condFields[0]?.fieldCode || '', op: '>=', value: '' }] });
  const updCond = (i: number, ci: number, patch: any) => updRule(i, { when: rules[i].when.map((c: any, idx: number) => (idx === ci ? { ...c, ...patch } : c)) });
  const delCond = (i: number, ci: number) => updRule(i, { when: rules[i].when.filter((_: any, idx: number) => idx !== ci) });

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">上から順に、最初に条件を満たしたルールの値を返します（該当なしは「それ以外」）。</p>
      {rules.map((r, i) => (
        <div key={i} className="rounded-lg border border-border p-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">ルール{i + 1}</span>
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="sm" icon={<ChevronUp className="size-4" />} onClick={() => moveRule(i, -1)} aria-label="上へ" />
              <Button variant="ghost" size="sm" icon={<ChevronDown className="size-4" />} onClick={() => moveRule(i, 1)} aria-label="下へ" />
              <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => delRule(i)} aria-label="削除" />
            </div>
          </div>
          {(r.when || []).map((c: any, ci: number) => (
            <div key={ci} className="flex items-center gap-1 flex-wrap">
              <span className="text-xs text-muted w-7">{ci === 0 ? 'もし' : 'かつ'}</span>
              <select className="input w-auto" value={c.field} onChange={(e) => updCond(i, ci, { field: e.target.value })}>
                {condFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
              </select>
              <select className="input w-auto" value={c.op} onChange={(e) => updCond(i, ci, { op: e.target.value })}>
                {RULE_OPS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
              {!['empty', 'notempty'].includes(c.op) && (
                <>
                  {/* 比較の右辺は固定値か別項目。項目を選ぶと valueField として保存し、その時々の値と比べる。 */}
                  <select
                    className="input w-auto"
                    value={c.valueField ? 'field' : 'value'}
                    onChange={(e) => updCond(i, ci, e.target.value === 'field'
                      ? { valueField: condFields[0]?.fieldCode || '', value: undefined }
                      : { valueField: undefined, value: '' })}
                  >
                    <option value="value">固定値</option>
                    <option value="field">項目</option>
                  </select>
                  {c.valueField ? (
                    <select className="input w-auto" value={c.valueField} onChange={(e) => updCond(i, ci, { valueField: e.target.value })}>
                      {condFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
                    </select>
                  ) : (
                    <input className="input w-20" value={c.value ?? ''} onChange={(e) => updCond(i, ci, { value: e.target.value })} />
                  )}
                </>
              )}
              {c.op === 'between' && (
                <>
                  <span className="text-xs text-muted">〜</span>
                  {c.value2Field ? (
                    <select className="input w-auto" value={c.value2Field} onChange={(e) => updCond(i, ci, { value2Field: e.target.value })}>
                      {condFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
                    </select>
                  ) : (
                    <input className="input w-20" value={c.value2 ?? ''} onChange={(e) => updCond(i, ci, { value2: e.target.value })} />
                  )}
                </>
              )}
              {(r.when?.length || 0) > 1 && (
                <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => delCond(i, ci)} aria-label="条件を削除"><X className="size-3.5" /></button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            <button type="button" className="btn btn-sm" onClick={() => addCond(i)}><Plus className="size-3.5" />条件（かつ）</button>
            <span className="text-xs text-muted ml-auto">→ 値</span>
            <input className="input w-28" placeholder="結果" value={r.result ?? ''} onChange={(e) => updRule(i, { result: e.target.value })} />
          </div>
        </div>
      ))}
      <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={addRule}>ルールを追加</Button>
      <Field label="それ以外（既定値）">
        <input className="input w-40" value={value?.fallback ?? ''} onChange={(e) => set({ fallback: e.target.value })} />
      </Field>
    </div>
  );
}

/* ============ 公開・権限設定 ============ */
interface Perm {
  targetType: 'All' | 'User' | 'Group';
  targetId: string | null;
  canView: boolean; canAdd: boolean; canEdit: boolean; canDelete: boolean; canManage: boolean;
}

function PublishSettings({ appId, app, onAppChange }: { appId: string; app: any; onAppChange: (a: any) => void }) {
  const toast = useToast();
  const [name, setName] = useState(app.name);
  const [description, setDescription] = useState(app.description || '');
  const [recordViewScope, setRecordViewScope] = useState(app.recordViewScope || 'all');
  const [recordEditScope, setRecordEditScope] = useState(app.recordEditScope || 'all');
  const [recordScopeField, setRecordScopeField] = useState(app.recordScopeField || '');
  const [creatorEditOwn, setCreatorEditOwn] = useState(!!app.creatorEditOwn);
  const [creatorDeleteOwn, setCreatorDeleteOwn] = useState(!!app.creatorDeleteOwn);
  const [perms, setPerms] = useState<Perm[]>([]);
  // 15万/2万件を <select> に展開しないため、表示名は対象IDのみ解決してキャッシュする。
  const [userLabels, setUserLabels] = useState<Record<string, string>>({});
  const [groupLabels, setGroupLabels] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [reminder, setReminder] = useState<any>(app.reminderConfig || { enabled: false, dueDateField: '', assigneeField: '', daysBefore: 3 });
  const [pubEnabled, setPubEnabled] = useState<boolean>(!!app.publicFormEnabled);
  const [pubToken, setPubToken] = useState<string>(app.publicFormToken || '');
  const [pubSaving, setPubSaving] = useState(false);

  useEffect(() => {
    api.get(`/app-permissions?appId=${appId}`).then(async (ps: Perm[]) => {
      setPerms(ps);
      // 既存の公開先(ユーザー/グループ)の表示名だけをID指定で解決する。
      const userIds = ps.filter((p) => p.targetType === 'User' && p.targetId).map((p) => p.targetId);
      const groupIds = ps.filter((p) => p.targetType === 'Group' && p.targetId).map((p) => p.targetId);
      if (userIds.length) {
        api.get(`/directory/users?ids=${userIds.join(',')}`)
          .then((us: any[]) => setUserLabels((m) => ({ ...m, ...Object.fromEntries(us.map((u) => [u.id, u.name?.trim() || u.loginId])) })))
          .catch(() => {});
      }
      if (groupIds.length) {
        api.get(`/directory/groups?ids=${groupIds.join(',')}`)
          .then((gs: any[]) => setGroupLabels((m) => ({ ...m, ...Object.fromEntries(gs.map((g) => [g.id, g.name])) })))
          .catch(() => {});
      }
    }).catch((e) => toast.error(e.message));
    api.get(`/fields?appId=${appId}`).then(setFields).catch(() => {});
  }, [appId, toast]);

  const dateFields = fields.filter((f) => f.fieldType === 'date' || f.fieldType === 'datetime');
  const reminderUserFields = fields.filter((f) => f.fieldType === 'user_select');

  const saveReminder = async () => {
    try {
      const updated = await api.put(`/apps/${appId}`, { reminderConfig: reminder });
      onAppChange({ ...app, reminderConfig: updated.reminderConfig });
      toast.success('リマインド設定を保存しました');
    } catch (e: any) {
      toast.error(e.message || '保存に失敗しました');
    }
  };

  const savePublicForm = async (enabled: boolean, regenerate?: boolean) => {
    setPubSaving(true);
    try {
      const res = await api.put(`/apps/${appId}/public-form`, { enabled, regenerate });
      setPubEnabled(res.publicFormEnabled);
      setPubToken(res.publicFormToken || '');
      onAppChange({ ...app, publicFormEnabled: res.publicFormEnabled, publicFormToken: res.publicFormToken });
      toast.success(enabled ? (regenerate ? 'URLを再発行しました' : '公開フォームを有効にしました') : '公開フォームを無効にしました');
    } catch (e: any) {
      toast.error(e.message || '保存に失敗しました');
    } finally {
      setPubSaving(false);
    }
  };

  const publicUrl = pubToken ? `${window.location.origin}/f/${pubToken}` : '';
  const copyPublicUrl = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast.success('URLをコピーしました');
    } catch {
      toast.error('コピーに失敗しました');
    }
  };
  const unsupportedFields = fields.filter((f) =>
    ['user_select', 'group_select', 'reference', 'file', 'ai'].includes(f.fieldType),
  );

  const addPerm = () => setPerms([...perms, { targetType: 'All', targetId: null, canView: true, canAdd: false, canEdit: false, canDelete: false, canManage: false }]);
  const updatePerm = (i: number, patch: Partial<Perm>) => {
    const next = [...perms]; next[i] = { ...next[i], ...patch }; setPerms(next);
  };
  const removePerm = (i: number) => setPerms(perms.filter((_, idx) => idx !== i));

  const saveAppInfo = async () => {
    const updated = await api.put(`/apps/${appId}`, { name, description, recordViewScope, recordEditScope, recordScopeField, creatorEditOwn, creatorDeleteOwn });
    onAppChange({ ...app, ...updated });
    toast.success('アプリ情報を保存しました');
  };

  const togglePublish = async () => {
    const status = app.status === 'published' ? 'draft' : 'published';
    const updated = await api.put(`/apps/${appId}/status`, { status });
    onAppChange({ ...app, status: updated.status });
  };

  const savePerms = async () => {
    setSaving(true);
    try {
      const clean = perms.filter((p) => p.targetType === 'All' || !!p.targetId);
      await api.post('/app-permissions', { appId, permissions: clean });
      toast.success('公開範囲を保存しました');
    } catch (e: any) {
      toast.error(e.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="card p-5">
        <h4 className="font-semibold mb-4">アプリ情報</h4>
        <div className="space-y-4">
          <Field label="アプリ名">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="説明">
            <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>

          <div className="flex gap-4 flex-wrap">
            <Field label="レコードの閲覧範囲" className="flex-1 min-w-60">
              <select className="input" value={recordViewScope} onChange={(e) => setRecordViewScope(e.target.value)}>
                <option value="all">全レコード（閲覧権限を持つ人は全件）</option>
                <option value="owner">本人が作成したレコードのみ</option>
                <option value="org">所属組織とその配下が作成したレコード</option>
              </select>
            </Field>
            <Field label="レコードの編集範囲" className="flex-1 min-w-60">
              <select className="input" value={recordEditScope} onChange={(e) => setRecordEditScope(e.target.value)}>
                <option value="all">全レコード（編集権限を持つ人は全件）</option>
                <option value="owner">本人が作成したレコードのみ</option>
                <option value="org">所属組織とその配下が作成したレコード</option>
              </select>
            </Field>
          </div>
          <p className="text-xs text-muted">
            ※「本人のみ」にすると、管理権限を持つ人（所有者・システム管理者）以外は自分が作成したレコードしか閲覧／編集できません。<br />
            ※「所属組織とその配下」にすると、自分が所属する部署と、その配下部署のメンバーが作成したレコードを閲覧／編集できます（部署のツリー構造は「グループ管理」で設定）。
          </p>

          <div className="mt-4 pt-4 border-t border-border">
            <Field label="対象社員フィールドで絞り込む（任意）" className="max-w-md" hint="設定すると、管理権限を持たない人は「対象社員」が自分の所属部署＋配下部署のメンバーであるレコードだけを閲覧／編集できます。">
              <select className="input" value={recordScopeField} onChange={(e) => setRecordScopeField(e.target.value)}>
                <option value="">絞り込まない</option>
                {reminderUserFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
              </select>
            </Field>
            {reminderUserFields.length === 0 && <p className="text-xs text-danger mt-1">※ ユーザー選択（user_select）項目が必要です。</p>}
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <p className="label mb-1">追加権限のみのユーザーの自分のレコード</p>
            <p className="text-xs text-muted mb-3">
              「追加」権限だけを持つユーザーは通常レコードを編集・削除できません。下をONにすると、<strong>自分が追加したレコードに限り</strong>編集・削除できるようになります（他人のレコードには影響しません）。
            </p>
            <label className="flex items-center gap-2 text-sm mb-2">
              <input
                type="checkbox"
                className="accent-[var(--primary)]"
                checked={creatorEditOwn}
                onChange={(e) => setCreatorEditOwn(e.target.checked)}
              />
              作成者は自分が追加したレコードを編集できる
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="accent-[var(--primary)]"
                checked={creatorDeleteOwn}
                onChange={(e) => setCreatorDeleteOwn(e.target.checked)}
              />
              作成者は自分が追加したレコードを削除できる
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap mt-4 pt-4 border-t border-border">
          <Button variant="primary" icon={<Save className="size-4" />} onClick={saveAppInfo}>アプリ情報を保存</Button>
          <Button onClick={togglePublish}>
            現在: <strong>{app.status === 'published' ? '公開中' : '下書き'}</strong> → {app.status === 'published' ? '非公開にする' : '公開する'}
          </Button>
        </div>
      </div>

      <div className="card p-5">
        <h4 className="font-semibold mb-1">匿名公開フォーム（ログイン不要）</h4>
        <p className="text-sm text-muted mb-4">
          有効にすると、発行されたURLからログイン不要で誰でもこのアプリへ入力できます。送信内容は通常レコードとして保存され、集計・閲覧は管理者（所有者）のみが行えます。
        </p>
        <label className="flex items-center gap-2 text-sm mb-4">
          <input
            type="checkbox"
            className="accent-[var(--primary)]"
            checked={pubEnabled}
            disabled={pubSaving}
            onChange={(e) => savePublicForm(e.target.checked)}
          />
          匿名公開フォームを有効にする
        </label>

        {pubEnabled && publicUrl && (
          <div className="space-y-3">
            <Field label="公開URL（このリンクを配布）">
              <div className="flex gap-2">
                <input className="input font-mono text-sm" value={publicUrl} readOnly onFocus={(e) => e.target.select()} />
                <Button icon={<Copy className="size-4" />} onClick={copyPublicUrl}>コピー</Button>
              </div>
            </Field>
            <Button size="sm" loading={pubSaving} onClick={() => savePublicForm(true, true)}>URLを再発行（旧URLは無効化）</Button>
          </div>
        )}

        {pubEnabled && unsupportedFields.length > 0 && (
          <p className="text-xs text-danger mt-3">
            ※ 次の項目は匿名フォームでは表示・送信されません（認証が必要なため）:{' '}
            {unsupportedFields.map((f) => f.label).join('、')}
          </p>
        )}
      </div>

      <div className="card p-5">
        <h4 className="font-semibold mb-1">期限リマインド（自動通知）</h4>
        <p className="text-sm text-muted mb-4">期限が近い／超過した未完了レコードの担当者へ、サーバが自動でリマインド通知します（同じレコードは1日1回）。</p>
        <label className="flex items-center gap-2 text-sm mb-4">
          <input type="checkbox" className="accent-[var(--primary)]" checked={!!reminder.enabled} onChange={(e) => setReminder({ ...reminder, enabled: e.target.checked })} />
          リマインドを有効にする
        </label>
        <div className="flex gap-4 flex-wrap">
          <Field label="期限の日付項目" className="flex-1 min-w-48">
            <select className="input" value={reminder.dueDateField || ''} onChange={(e) => setReminder({ ...reminder, dueDateField: e.target.value })}>
              <option value="">選択してください</option>
              {dateFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="担当者項目" className="flex-1 min-w-48">
            <select className="input" value={reminder.assigneeField || ''} onChange={(e) => setReminder({ ...reminder, assigneeField: e.target.value })}>
              <option value="">選択してください</option>
              {reminderUserFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
            </select>
          </Field>
          <Field label="何日前から" className="w-32">
            <input className="input" type="number" value={reminder.daysBefore ?? 3} onChange={(e) => setReminder({ ...reminder, daysBefore: Number(e.target.value) })} />
          </Field>
        </div>
        {dateFields.length === 0 && <p className="text-xs text-danger mt-2">※ 日付／日時の項目が必要です。</p>}
        <div className="mt-4">
          <Button variant="primary" icon={<Save className="size-4" />} onClick={saveReminder}>リマインド設定を保存</Button>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
          <h4 className="font-semibold">公開範囲と権限</h4>
          <div className="flex items-center gap-2">
            <Button icon={<Plus className="size-4" />} onClick={addPerm}>公開先を追加</Button>
            <Button variant="primary" icon={<Save className="size-4" />} onClick={savePerms} loading={saving}>公開範囲を保存</Button>
          </div>
        </div>
        {perms.length === 0 && <p className="text-sm text-muted mb-3">公開先が未設定です（所有者と管理者のみアクセス可）。</p>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-muted">
                <th className="px-2 py-2 text-left font-semibold">対象</th>
                <th className="px-2 py-2 text-left font-semibold">指定先</th>
                <th className="px-2 py-2 font-semibold">閲覧</th><th className="px-2 py-2 font-semibold">追加</th>
                <th className="px-2 py-2 font-semibold">編集</th><th className="px-2 py-2 font-semibold">削除</th>
                <th className="px-2 py-2 font-semibold">管理</th><th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {perms.map((p, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-2 py-2">
                    <select className="input w-auto" value={p.targetType} onChange={(e) => updatePerm(i, { targetType: e.target.value as any, targetId: null })}>
                      {/* 管理者(GroupAdmin)は管轄外に広がる「全ユーザー」を選べない */}
                      {getUser()?.role !== 'GroupAdmin' && <option value="All">全ユーザー</option>}
                      <option value="User">指定ユーザー</option>
                      <option value="Group">指定グループ</option>
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    {p.targetType === 'All' ? <span className="text-muted">—</span> :
                      p.targetType === 'User' ? (
                        <EntityPicker
                          kind="user"
                          className="min-w-48"
                          scope={getUser()?.role === 'GroupAdmin' ? 'mygroups' : undefined}
                          value={p.targetId}
                          label={p.targetId ? userLabels[p.targetId] : ''}
                          onChange={(id, label) => { if (id) setUserLabels((m) => ({ ...m, [id]: label })); updatePerm(i, { targetId: id }); }}
                          placeholder="ユーザーを検索"
                        />
                      ) : (
                        <EntityPicker
                          kind="group"
                          className="min-w-48"
                          value={p.targetId}
                          label={p.targetId ? groupLabels[p.targetId] : ''}
                          onChange={(id, label) => { if (id) setGroupLabels((m) => ({ ...m, [id]: label })); updatePerm(i, { targetId: id }); }}
                          placeholder="グループを検索"
                        />
                      )}
                  </td>
                  {(['canView', 'canAdd', 'canEdit', 'canDelete', 'canManage'] as const).map((k) => (
                    <td key={k} className="px-2 py-2 text-center">
                      <input type="checkbox" className="accent-[var(--primary)]" checked={(p as any)[k]} onChange={(e) => updatePerm(i, { [k]: e.target.checked } as any)} />
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right">
                    <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => removePerm(i)} aria-label="削除" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ============ プロセス管理（ワークフロー） ============ */
interface ProcAction { from: string; to: string; label: string; approver?: string; }
function ProcessSettings({ appId, app, onAppChange }: { appId: string; app: any; onAppChange: (a: any) => void }) {
  const toast = useToast();
  const [fields, setFields] = useState<FieldDef[]>([]);
  const cfg = app.processConfig || {};
  const [enabled, setEnabled] = useState<boolean>(!!cfg.enabled);
  const [statusField, setStatusField] = useState<string>(cfg.statusField || '');
  const [actions, setActions] = useState<ProcAction[]>(cfg.actions || []);

  useEffect(() => {
    api.get(`/fields?appId=${appId}`).then(setFields).catch(() => {});
  }, [appId]);

  const statusFields = fields.filter((f) => f.fieldType === 'status' || f.fieldType === 'select');
  const userFields = fields.filter((f) => f.fieldType === 'user_select');
  const statuses: string[] = fields.find((f) => f.fieldCode === statusField)?.settings?.options || [];

  const addAction = () => setActions([...actions, { from: statuses[0] || '', to: statuses[1] || statuses[0] || '', label: '次へ進める' }]);
  const updAction = (i: number, patch: Partial<ProcAction>) => { const a = [...actions]; a[i] = { ...a[i], ...patch }; setActions(a); };
  const delAction = (i: number) => setActions(actions.filter((_, idx) => idx !== i));

  const save = async () => {
    const processConfig = { enabled, statusField, statuses, actions };
    try {
      const updated = await api.put(`/apps/${appId}`, { processConfig });
      onAppChange({ ...app, processConfig: updated.processConfig });
      toast.success('プロセス設定を保存しました');
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="card p-5 max-w-3xl">
      <h4 className="font-semibold mb-1">プロセス管理（ワークフロー）</h4>
      <p className="text-sm text-muted mb-4">
        ステータス項目の値を、ボタン操作で次の状態へ進められるようにします（例: 未対応 → 対応中 → 完了）。
      </p>
      <label className="flex items-center gap-2 text-sm mb-4">
        <input type="checkbox" className="accent-[var(--primary)]" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        プロセス管理を有効にする
      </label>

      <Field label="ステータス項目" className="mb-4"
        hint={statusField ? `状態: ${statuses.join(' / ') || '（この項目に選択肢を設定してください）'}` : undefined}
      >
        <select className="input" value={statusField} onChange={(e) => setStatusField(e.target.value)}>
          <option value="">選択してください</option>
          {statusFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
        </select>
      </Field>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="label mb-0">アクション（状態の遷移）</span>
          <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={addAction} disabled={statuses.length < 1}>アクション追加</Button>
        </div>
        <div className="space-y-2">
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-2 flex-wrap">
              <select className="input w-auto" value={a.from} onChange={(e) => updAction(i, { from: e.target.value })}>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <ArrowRight className="size-4 text-muted shrink-0" />
              <select className="input w-auto" value={a.to} onChange={(e) => updAction(i, { to: e.target.value })}>
                {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <input className="input flex-1 min-w-32" placeholder="ボタン名" value={a.label} onChange={(e) => updAction(i, { label: e.target.value })} />
              <select className="input w-auto" value={a.approver || ''} onChange={(e) => updAction(i, { approver: e.target.value })} title="このアクションを実行できる承認者の項目（任意）">
                <option value="">承認者なし</option>
                {userFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>承認者: {f.label}</option>)}
              </select>
              <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => delAction(i)} aria-label="削除" />
            </div>
          ))}
          {actions.length === 0 && <p className="text-sm text-muted">アクションがありません。</p>}
        </div>
      </div>

      <Button variant="primary" icon={<Save className="size-4" />} onClick={save}>プロセス設定を保存</Button>
    </div>
  );
}

/** プロンプト入力＋項目コードのワンクリック挿入チップ。 */
function PromptEditor({ value, onChange, fields, rows = 4, placeholder }: {
  value: string; onChange: (v: string) => void; fields: { fieldCode: string; label: string }[]; rows?: number; placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const insert = (token: string) => {
    const el = ref.current;
    const cur = value || '';
    if (!el) { onChange(cur + token); return; }
    const s = el.selectionStart ?? cur.length;
    const e = el.selectionEnd ?? cur.length;
    onChange(cur.slice(0, s) + token + cur.slice(e));
    requestAnimationFrame(() => { el.focus(); const p = s + token.length; el.setSelectionRange(p, p); });
  };
  return (
    <div>
      <textarea ref={ref} className="input font-mono text-xs leading-relaxed" rows={rows} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || '例: {title} と {detail} を3行で要約して'} />
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="text-[11px] text-muted">項目を挿入:</span>
        {fields.map((f) => (
          <button key={f.fieldCode} type="button" className="badge badge-muted hover:bg-surface-2" onClick={() => insert(`{${f.fieldCode}}`)}>{f.label}</button>
        ))}
        <button type="button" className="badge badge-muted hover:bg-surface-2" onClick={() => insert('{_record}')}>レコード全体</button>
      </div>
    </div>
  );
}

/** AI生成フィールドの設定（プロンプト＋最大トークン）。 */
function AiFieldSettings({ value, fields, currentCode, onChange }: {
  value: any; fields: FieldDef[]; currentCode: string; onChange: (s: any) => void;
}) {
  const set = (patch: any) => onChange({ ...value, ...patch });
  const refFields = fields
    .filter((f) => f.fieldCode !== currentCode && !['file', 'subtable', 'section', 'ai'].includes(f.fieldType))
    .map((f) => ({ fieldCode: f.fieldCode, label: f.label }));
  return (
    <div className="space-y-3">
      <Field label="生成プロンプト" hint="{項目コード} で値を差し込み、{_record} で全項目を展開。レコード編集の「AIで生成」ボタンで実行します。">
        <PromptEditor value={value?.prompt || ''} onChange={(v) => set({ prompt: v })} fields={refFields} />
      </Field>
      <Field label="最大トークン数（任意）" hint="未指定は1024。長文を生成する場合は増やします。">
        <input type="number" className="input w-40" value={value?.maxTokens ?? ''} onChange={(e) => set({ maxTokens: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="1024" />
      </Field>
    </div>
  );
}

/** アプリ単位のAIアクション（カスタムAIボタン）設定。 */
function AiActionsSettings({ appId, app, onAppChange }: { appId: string; app: any; onAppChange: (a: any) => void }) {
  const toast = useToast();
  const [actions, setActions] = useState<any[]>(app.aiConfig?.actions || []);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get(`/fields?appId=${appId}`).then(setFields).catch(() => {}); }, [appId]);

  const promptFields = fields.filter((f) => !['file', 'subtable', 'section'].includes(f.fieldType)).map((f) => ({ fieldCode: f.fieldCode, label: f.label }));
  const targetFields = fields.filter((f) => ['text', 'textarea', 'ai'].includes(f.fieldType)).map((f) => ({ fieldCode: f.fieldCode, label: f.label }));

  const upd = (i: number, patch: any) => setActions(actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const add = () => setActions([...actions, { id: `act_${Date.now().toString(36)}`, name: '新しいAIアクション', prompt: '', output: 'show', targetField: '' }]);
  const del = (i: number) => setActions(actions.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    try {
      const aiConfig = { actions: actions.map((a) => ({ id: a.id, name: a.name, prompt: a.prompt, output: a.output, ...(a.output === 'field' ? { targetField: a.targetField } : {}) })) };
      const updated = await api.put(`/apps/${appId}`, { aiConfig });
      onAppChange({ ...app, aiConfig: updated.aiConfig });
      toast.success('AIアクションを保存しました');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-sm text-muted">レコード詳細画面に表示する「AIボタン」を自由に設計できます。プロンプトに項目を差し込み、結果を表示するか、指定した項目へ書き込みます。</p>

      {actions.map((a, i) => (
        <div key={a.id} className="card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary-soft-fg shrink-0" />
            <input className="input flex-1" placeholder="ボタン名（例: 返信文を作成）" value={a.name} onChange={(e) => upd(i, { name: e.target.value })} />
            <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => del(i)} aria-label="削除" />
          </div>
          <Field label="プロンプト">
            <PromptEditor value={a.prompt || ''} onChange={(v) => upd(i, { prompt: v })} fields={promptFields} placeholder="例: {customer} 宛に、{inquiry} への丁寧な返信メール文面を作成して" />
          </Field>
          <div className="flex items-end gap-2 flex-wrap">
            <Field label="出力先">
              <select className="input w-auto" value={a.output} onChange={(e) => upd(i, { output: e.target.value })}>
                <option value="show">結果を表示するだけ</option>
                <option value="field">指定した項目へ書き込む</option>
              </select>
            </Field>
            {a.output === 'field' && (
              <Field label="書き込む項目">
                <select className="input w-auto" value={a.targetField || ''} onChange={(e) => upd(i, { targetField: e.target.value })}>
                  <option value="">選択…</option>
                  {targetFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
                </select>
              </Field>
            )}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Button icon={<Plus className="size-4" />} onClick={add}>AIアクションを追加</Button>
        <Button variant="primary" icon={<Save className="size-4" />} loading={saving} onClick={save}>保存</Button>
      </div>
    </div>
  );
}

/** 帳票（印刷/PDF）テンプレートの設計UI。 */
function ReportSettings({ appId, app, onAppChange }: { appId: string; app: any; onAppChange: (a: any) => void }) {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [templates, setTemplates] = useState<ReportTemplate[]>(app.reportConfig?.templates || []);
  const [selId, setSelId] = useState<string | null>(app.reportConfig?.templates?.[0]?.id || null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get(`/fields?appId=${appId}`).then(setFields).catch(() => {}); }, [appId]);

  const selected = templates.find((t) => t.id === selId) || null;
  const tokenFields = selectableFieldsForBlock(fields).map((f) => ({ fieldCode: f.fieldCode, label: f.label }));

  const updTemplate = (id: string, patch: Partial<ReportTemplate>) =>
    setTemplates((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const addTemplate = () => {
    const t = defaultTemplate(fields);
    setTemplates((ts) => [...ts, t]);
    setSelId(t.id);
  };

  const delTemplate = async (id: string) => {
    if (!(await confirm({ message: 'この帳票テンプレートを削除しますか？', danger: true, confirmText: '削除' }))) return;
    setTemplates((ts) => {
      const next = ts.filter((t) => t.id !== id);
      if (selId === id) setSelId(next[0]?.id || null);
      return next;
    });
  };

  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const updated = await api.put(`/apps/${appId}`, { reportConfig: { templates } });
      onAppChange({ ...app, reportConfig: updated.reportConfig });
      toast.success('帳票テンプレートを保存しました');
      return true;
    } catch (e: any) {
      toast.error(e.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const preview = async () => {
    if (!selected) return;
    if (!(await save())) return; // 印刷ページはサーバの reportConfig を読むので先に保存
    try {
      const recs = await api.get(`/records?appId=${appId}`);
      const first = Array.isArray(recs) ? recs[0] : null;
      if (!first) { toast.info('プレビューにはレコードが1件以上必要です'); return; }
      window.open(`/apps/${appId}/records/${first.id}/print/${selected.id}`, '_blank', 'noopener');
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted max-w-2xl">
          レコードを請求書・見積書・報告書などの帳票として印刷／PDF出力できます。テンプレートを作成すると、レコード詳細画面に「印刷」ボタンが表示されます。
          自由テキストには <code className="text-xs bg-surface-2 px-1 rounded">{'{項目コード}'}</code> で値を差し込めます。
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {selected && <Button icon={<Eye className="size-4" />} onClick={preview}>プレビュー</Button>}
          <Button variant="primary" icon={<Save className="size-4" />} loading={saving} onClick={save}>保存</Button>
        </div>
      </div>

      {templates.length === 0 ? (
        <div className="card p-8 text-center">
          <FileText className="size-8 text-muted mx-auto mb-3" />
          <p className="text-sm text-muted mb-4">帳票テンプレートがありません。フォームの項目から既定のテンプレートを作成できます。</p>
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={addTemplate}>帳票テンプレートを作成</Button>
        </div>
      ) : (
        <div className="grid gap-5 items-start lg:[grid-template-columns:240px_1fr]">
          {/* テンプレ一覧 */}
          <div className="flex flex-col gap-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelId(t.id)}
                className={cn(
                  'flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                  selId === t.id ? 'border-primary bg-primary-soft' : 'border-border hover:bg-surface-2',
                )}
              >
                <Printer className="size-4 shrink-0 text-muted" />
                <span className="truncate flex-1">{t.name || '(無題)'}</span>
                <span className="badge badge-muted shrink-0">{t.paper}</span>
              </button>
            ))}
            <Button variant="ghost" size="sm" icon={<Plus className="size-4" />} onClick={addTemplate}>テンプレート追加</Button>
          </div>

          {/* エディタ */}
          {selected && (
            <TemplateEditor
              key={selected.id}
              template={selected}
              fields={fields}
              tokenFields={tokenFields}
              onChange={(patch) => updTemplate(selected.id, patch)}
              onDelete={() => delTemplate(selected.id)}
            />
          )}
        </div>
      )}
    </div>
  );
}

function TemplateEditor({ template, fields, tokenFields, onChange, onDelete }: {
  template: ReportTemplate;
  fields: FieldDef[];
  tokenFields: { fieldCode: string; label: string }[];
  onChange: (patch: Partial<ReportTemplate>) => void;
  onDelete: () => void;
}) {
  const setBlocks = (blocks: ReportBlock[]) => onChange({ blocks });
  const updBlock = (i: number, block: ReportBlock) => setBlocks(template.blocks.map((b, idx) => (idx === i ? block : b)));
  const delBlock = (i: number) => setBlocks(template.blocks.filter((_, idx) => idx !== i));
  const moveBlock = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= template.blocks.length) return;
    const next = [...template.blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  };
  const addBlock = (type: ReportBlockType) => {
    const subtable = fields.find((f) => f.fieldType === 'subtable');
    const nb: ReportBlock =
      type === 'fields' ? { type: 'fields', columns: 2, fieldCodes: [] }
      : type === 'subtable' ? { type: 'subtable', fieldCode: subtable?.fieldCode || '' }
      : type === 'text' ? { type: 'text', content: '' }
      : type === 'heading' ? { type: 'heading', content: '見出し' }
      : { type: 'spacer' };
    setBlocks([...template.blocks, nb]);
  };

  return (
    <div className="card p-5 space-y-5">
      {/* 基本設定 */}
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold flex items-center gap-2"><Printer className="size-4 text-muted" />帳票の設定</h3>
        <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={onDelete} aria-label="このテンプレートを削除">削除</Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="テンプレート名" hint="印刷ボタンのメニューに表示されます">
          <input className="input" value={template.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="例: 請求書" />
        </Field>
        <Field label="文書タイトル" hint="用紙の中央上部に大きく表示">
          <input className="input" value={template.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="例: 請求書" />
        </Field>
        <Field label="用紙サイズ">
          <select className="input" value={template.paper} onChange={(e) => onChange({ paper: e.target.value as PaperSize })}>
            {(Object.keys(PAPER_LABELS) as PaperSize[]).map((p) => <option key={p} value={p}>{PAPER_LABELS[p]}</option>)}
          </select>
        </Field>
        <Field label="向き">
          <select className="input" value={template.orientation} onChange={(e) => onChange({ orientation: e.target.value as Orientation })}>
            <option value="portrait">縦</option>
            <option value="landscape">横</option>
          </select>
        </Field>
      </div>

      <Field label="サブタイトル（任意）" hint="タイトル下の小見出し。{項目コード} 差込可">
        <PromptEditor value={template.subtitle || ''} onChange={(v) => onChange({ subtitle: v })} fields={tokenFields} rows={2} placeholder="例: 請求番号 {invoice_no}" />
      </Field>

      <label className="flex items-center gap-2 text-sm cursor-pointer w-fit">
        <input type="checkbox" className="size-4" checked={template.showDate ?? false} onChange={(e) => onChange({ showDate: e.target.checked })} />
        右上に発行日（本日の日付）を表示する
      </label>

      {/* ブロック */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="label mb-0">本文ブロック</span>
        </div>
        <div className="space-y-3">
          {template.blocks.map((b, i) => (
            <BlockEditor
              key={i}
              block={b}
              index={i}
              total={template.blocks.length}
              fields={fields}
              tokenFields={tokenFields}
              onChange={(nb) => updBlock(i, nb)}
              onDelete={() => delBlock(i)}
              onMove={(dir) => moveBlock(i, dir)}
            />
          ))}
          {template.blocks.length === 0 && <p className="text-sm text-muted">ブロックがありません。下のボタンで追加してください。</p>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted mr-1">ブロック追加:</span>
          {(Object.keys(BLOCK_LABELS) as ReportBlockType[]).map((t) => (
            <button key={t} type="button" className="btn btn-sm" onClick={() => addBlock(t)}>
              <Plus className="size-3.5" />{BLOCK_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <Field label="フッター（任意）" hint="ページ下部の注記。{項目コード} 差込可">
        <PromptEditor value={template.footer || ''} onChange={(v) => onChange({ footer: v })} fields={tokenFields} rows={2} placeholder="例: 本書は {company} が発行しました。" />
      </Field>
    </div>
  );
}

function BlockEditor({ block, index, total, fields, tokenFields, onChange, onDelete, onMove }: {
  block: ReportBlock;
  index: number;
  total: number;
  fields: FieldDef[];
  tokenFields: { fieldCode: string; label: string }[];
  onChange: (b: ReportBlock) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const selectable = selectableFieldsForBlock(fields);
  const subtableFields = fields.filter((f) => f.fieldType === 'subtable');

  return (
    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <GripVertical className="size-4 text-muted shrink-0" />
        <span className="badge badge-muted">{BLOCK_LABELS[block.type]}</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" icon={<ChevronUp className="size-4" />} onClick={() => onMove(-1)} disabled={index === 0} aria-label="上へ" />
          <Button variant="ghost" size="sm" icon={<ChevronDown className="size-4" />} onClick={() => onMove(1)} disabled={index === total - 1} aria-label="下へ" />
          <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={onDelete} aria-label="削除" />
        </div>
      </div>

      {block.type === 'fields' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted">列数</span>
            <select className="input w-auto" value={block.columns ?? 2} onChange={(e) => onChange({ ...block, columns: Number(e.target.value) as 1 | 2 })}>
              <option value={1}>1列</option>
              <option value={2}>2列</option>
            </select>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 max-h-56 overflow-y-auto rounded-md border border-border p-2">
            {selectable.map((f) => {
              const checked = block.fieldCodes.includes(f.fieldCode);
              return (
                <label key={f.fieldCode} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={checked}
                    onChange={(e) => {
                      const set = new Set(block.fieldCodes);
                      if (e.target.checked) set.add(f.fieldCode); else set.delete(f.fieldCode);
                      // フォームの項目順を維持して格納
                      const ordered = selectable.filter((x) => set.has(x.fieldCode)).map((x) => x.fieldCode);
                      onChange({ ...block, fieldCodes: ordered });
                    }}
                  />
                  <span className="truncate">{f.label}</span>
                </label>
              );
            })}
            {selectable.length === 0 && <p className="text-xs text-muted">表示できる項目がありません。</p>}
          </div>
        </div>
      )}

      {block.type === 'subtable' && (
        <Field label="明細テーブルの項目">
          <select className="input" value={block.fieldCode} onChange={(e) => onChange({ ...block, fieldCode: e.target.value })}>
            <option value="">選択してください</option>
            {subtableFields.map((f) => <option key={f.fieldCode} value={f.fieldCode}>{f.label}</option>)}
          </select>
          {subtableFields.length === 0 && <p className="text-xs text-muted mt-1">このアプリにはテーブル（明細行）項目がありません。</p>}
        </Field>
      )}

      {block.type === 'text' && (
        <PromptEditor value={block.content} onChange={(v) => onChange({ ...block, content: v })} fields={tokenFields} rows={3} placeholder="自由なテキスト。{項目コード} で値を差し込めます。" />
      )}

      {block.type === 'heading' && (
        <input className="input" value={block.content} onChange={(e) => onChange({ ...block, content: e.target.value })} placeholder="小見出し（例: ご請求内容）" />
      )}

      {block.type === 'spacer' && (
        <p className="text-xs text-muted">空白の余白を挿入します。</p>
      )}
    </div>
  );
}
