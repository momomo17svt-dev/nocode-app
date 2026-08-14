import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, FileWarning } from 'lucide-react';
import { api } from '../lib/api';
import { Layout } from '../components/Layout';
import { FieldInput } from '../components/FieldInput';
import { type FieldDef, fieldTypeMeta } from '../lib/fields';
import { computeCalcFields } from '../lib/calc';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { RecordDraftButton } from '../components/ai/RecordDraftButton';

export function RecordEditor() {
  const { appId, recordId } = useParams();
  const navigate = useNavigate();
  const isEdit = !!recordId;
  const toast = useToast();
  const { confirm } = useConfirm();

  const [fields, setFields] = useState<FieldDef[]>([]);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [users, setUsers] = useState<{ id: string; loginId: string }[]>([]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!appId) return;
    (async () => {
      try {
        const fieldData = await api.get(`/fields?appId=${appId}`);
        setFields(fieldData);

        let data: Record<string, any>;
        if (isEdit) {
          const rec = await api.get(`/records/${recordId}`);
          data = rec.dataJson || {};
        } else {
          const initial: Record<string, any> = {};
          fieldData.forEach((f: FieldDef) => {
            if (f.fieldType === 'checkbox') initial[f.fieldCode] = [];
            else if (f.fieldType === 'subtable') initial[f.fieldCode] = [];
            else if (f.settings?.defaultValue !== undefined && f.settings?.defaultValue !== '') {
              initial[f.fieldCode] = f.fieldType === 'number' ? Number(f.settings.defaultValue) : f.settings.defaultValue;
            }
          });
          data = initial;
        }
        setFormData(data);

        // 15万〜の規模を全件取得しないよう、選択済みのIDだけ表示名を解決する（検索は各ピッカーが都度実行）。
        const idsFor = (type: string) =>
          fieldData.filter((f: FieldDef) => f.fieldType === type).map((f: FieldDef) => data[f.fieldCode]).filter(Boolean);
        const userIds = idsFor('user_select');
        const groupIds = idsFor('group_select');
        if (userIds.length) api.get(`/directory/users?ids=${userIds.join(',')}`).then(setUsers).catch(() => {});
        if (groupIds.length) api.get(`/directory/groups?ids=${groupIds.join(',')}`).then(setGroups).catch(() => {});
      } catch (e: any) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [appId, recordId, isEdit]);

  const setValue = (code: string, value: any) => {
    setFormData((d) => ({ ...d, [code]: value }));
    setErrors((er) => (er[code] ? { ...er, [code]: false } : er));
    setDirty(true);
  };

  // 未保存のまま離脱しようとしたら警告（ブラウザの再読込/閉じる）
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  /** 関連レコード参照のルックアップ: 参照先の値を sibling フィールドへ転記する。 */
  const applyLookups = (field: FieldDef, refData: Record<string, any>) => {
    const lookups: { from: string; to: string }[] = field.settings?.lookups || [];
    if (lookups.length === 0) return;
    setDirty(true);
    setFormData((d) => {
      const next = { ...d };
      for (const lk of lookups) {
        if (lk.from && lk.to) next[lk.to] = refData?.[lk.from];
      }
      return next;
    });
  };

  const save = async () => {
    const nextErrors: Record<string, boolean> = {};
    for (const f of fields) {
      const meta = fieldTypeMeta(f.fieldType);
      if (meta?.auto || f.fieldType === 'file') continue;
      if (f.required) {
        const v = formData[f.fieldCode];
        const empty = v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
        if (empty) nextErrors[f.fieldCode] = true;
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error(`必須項目が入力されていません（${Object.keys(nextErrors).length}件）`);
      const first = fields.find((f) => nextErrors[f.fieldCode]);
      if (first) document.getElementById(`field-${first.fieldCode}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.put(`/records/${recordId}`, { data: formData });
        setDirty(false);
        toast.success('レコードを更新しました');
        navigate(`/apps/${appId}/records/${recordId}`);
      } else {
        const rec = await api.post('/records', { appId, data: formData });
        setDirty(false);
        toast.success('レコードを作成しました');
        navigate(`/apps/${appId}/records/${rec.id}`);
      }
    } catch (e: any) {
      toast.error(e.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // 計算フィールドを入力中にリアルタイム算出（保存時はサーバ側で再計算・確定）
  const calcValues = useMemo(() => computeCalcFields(fields, formData), [fields, formData]);

  // Ctrl/Cmd + S で保存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { e.preventDefault(); if (!saving) save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // 毎レンダ登録: 最新の formData を参照

  const cancel = async () => {
    if (dirty && !(await confirm({ title: '編集を破棄しますか？', message: '保存していない変更があります。破棄して移動しますか？', danger: true, confirmText: '破棄する', cancelText: '編集を続ける' }))) return;
    navigate(isEdit ? `/apps/${appId}/records/${recordId}` : `/apps/${appId}`);
  };

  if (loading) {
    return (
      <Layout>
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="card w-full p-6 space-y-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={cancel} aria-label="キャンセル" />
          <h1 className="text-xl font-bold tracking-tight">{isEdit ? 'レコードの編集' : 'レコードの追加'}</h1>
        </div>
        <div className="flex items-center gap-2">
          {appId && fields.length > 0 && (
            <RecordDraftButton appId={appId} onApply={(values) => { setFormData((d) => ({ ...d, ...values })); setDirty(true); }} />
          )}
          <Button variant="primary" icon={<Save className="size-4" />} onClick={save} loading={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      <div className="card w-full p-6">
        {fields.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <FileWarning className="size-4" />
            このアプリにはまだ項目がありません。先にアプリ設定でフォームを作成してください。
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {fields.map((f) => {
              // サブテーブル・位置情報は横幅をフルに使う。それ以外は読みやすい幅に抑える。
              const wide = f.fieldType === 'subtable' || f.fieldType === 'location';
              return f.fieldType === 'section' ? (
                <div key={f.fieldCode} className="pt-2 first:pt-0 border-t first:border-0 border-border">
                  <h3 className="font-semibold text-sm">{f.label}</h3>
                  {f.settings?.description && <p className="text-xs text-muted mt-0.5">{f.settings.description}</p>}
                </div>
              ) : (
                <div key={f.fieldCode} id={`field-${f.fieldCode}`} className={errors[f.fieldCode] ? 'rounded-lg ring-2 ring-danger/40 -m-1.5 p-1.5' : ''}>
                  <label className="label">
                    {f.label} {f.required && <span className="text-danger">*</span>}
                  </label>
                  <div className={wide ? '' : 'max-w-2xl'}>
                    <FieldInput
                      field={f}
                      value={f.fieldType === 'calc' ? calcValues[f.fieldCode] : formData[f.fieldCode]}
                      onChange={(v) => setValue(f.fieldCode, v)}
                      users={users}
                      groups={groups}
                      appId={appId}
                      record={formData}
                      onLookup={(refData) => applyLookups(f, refData)}
                    />
                  </div>
                  {errors[f.fieldCode] && <p className="mt-1 text-xs text-danger">この項目は必須です。</p>}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
