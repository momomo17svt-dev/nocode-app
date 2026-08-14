import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, FileQuestion } from 'lucide-react';
import { publicApi } from '../lib/publicApi';
import { FieldInput } from '../components/FieldInput';
import { type FieldDef } from '../lib/fields';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';

interface PublicFormDef {
  title: string;
  description: string;
  thankYouMessage: string;
  fields: FieldDef[];
}

/** 値が未入力か（必須チェック用）。 */
function isEmpty(v: any): boolean {
  if (v === null || v === undefined || v === '') return true;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/**
 * ログイン不要の匿名公開フォーム。トークン付きURL（/f/:token）でアクセスする。
 * Layout を使わないスタンドアロンページ。
 */
export function PublicForm() {
  const { token } = useParams();
  const toast = useToast();
  const [form, setForm] = useState<PublicFormDef | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const data = await publicApi.get(`/public/forms/${token}`);
        setForm(data);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  // 入力対象のフィールド（自動採番・計算・見出しは入力欄を持たない）。
  const inputFields = (form?.fields || []).filter(
    (f) => !['auto_number', 'calc', 'section'].includes(f.fieldType),
  );

  const submit = async () => {
    const missing = inputFields.filter((f) => f.required && isEmpty(formData[f.fieldCode]));
    if (missing.length > 0) {
      toast.error(`必須項目を入力してください: ${missing.map((f) => f.label).join('、')}`);
      const el = document.getElementById(`pf-${missing[0].fieldCode}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSubmitting(true);
    try {
      await publicApi.post(`/public/forms/${token}`, { data: formData });
      setSubmitted(true);
    } catch (e: any) {
      toast.error(e.message || '送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setFormData({});
    setSubmitted(false);
  };

  return (
    <div className="min-h-screen bg-canvas text-content flex justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        {loading && <div className="card p-8"><div className="skeleton h-8 w-1/2 mb-4" /><div className="skeleton h-24 w-full" /></div>}

        {!loading && notFound && (
          <div className="card p-10 text-center">
            <FileQuestion className="size-12 mx-auto text-muted mb-4" />
            <h1 className="text-xl font-semibold mb-2">フォームが見つかりません</h1>
            <p className="text-muted text-sm">URLが正しいかご確認ください。受付を終了している場合もあります。</p>
          </div>
        )}

        {!loading && form && submitted && (
          <div className="card p-10 text-center">
            <CheckCircle2 className="size-12 mx-auto text-success mb-4" />
            <h1 className="text-xl font-semibold mb-2">送信が完了しました</h1>
            <p className="text-muted text-sm mb-6 whitespace-pre-wrap">
              {form.thankYouMessage || 'ご回答ありがとうございました。'}
            </p>
            <Button onClick={reset}>もう一度回答する</Button>
          </div>
        )}

        {!loading && form && !submitted && (
          <div className="card p-6 sm:p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-semibold">{form.title}</h1>
              {form.description && <p className="text-muted text-sm mt-2 whitespace-pre-wrap">{form.description}</p>}
            </div>

            <div className="flex flex-col gap-5">
              {form.fields.map((f) => {
                if (f.fieldType === 'section') {
                  return (
                    <h2 key={f.fieldCode} className="text-base font-semibold border-b border-border pb-1 mt-2">
                      {f.label}
                    </h2>
                  );
                }
                if (['auto_number', 'calc'].includes(f.fieldType)) return null;
                return (
                  <div key={f.fieldCode} id={`pf-${f.fieldCode}`}>
                    <label className="label mb-1.5 block">
                      {f.label}
                      {f.required && <span className="text-danger ml-1">*</span>}
                    </label>
                    <FieldInput
                      field={f}
                      value={formData[f.fieldCode]}
                      onChange={(v) => setFormData((prev) => ({ ...prev, [f.fieldCode]: v }))}
                      users={[]}
                      groups={[]}
                    />
                  </div>
                );
              })}
            </div>

            <div className="mt-8 pt-5 border-t border-border">
              <Button variant="primary" onClick={submit} loading={submitting} className="w-full sm:w-auto">
                送信する
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
