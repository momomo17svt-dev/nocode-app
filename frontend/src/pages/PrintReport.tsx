import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Printer, X, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { type FieldDef } from '../lib/fields';
import { type ReportTemplate, pageSizeCss } from '../lib/report';
import { ReportSheet, makeResolver } from '../components/report/ReportSheet';

/**
 * 帳票の印刷/PDF出力ページ（1レコード・スタンドアロン・Layout 不使用）。
 * テーマに依存せず白地・黒文字で描画し、ブラウザの印刷（PDFとして保存）で出力する。
 */
export function PrintReport() {
  const { appId, recordId, templateId } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState<any>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [record, setRecord] = useState<any>(null);
  const [dirUsers, setDirUsers] = useState<Record<string, string>>({});
  const [dirGroups, setDirGroups] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appId || !recordId) return;
    Promise.all([
      api.get(`/apps/${appId}`),
      api.get(`/fields?appId=${appId}`),
      api.get(`/records/${recordId}`),
      api.get('/directory/users').catch(() => []),
      api.get('/directory/groups').catch(() => []),
    ])
      .then(([a, fs, r, us, gs]) => {
        setApp(a);
        setFields(fs);
        setRecord(r);
        setDirUsers(Object.fromEntries((us || []).map((u: any) => [u.id, u.name?.trim() || u.loginId])));
        setDirGroups(Object.fromEntries((gs || []).map((g: any) => [g.id, g.name])));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [appId, recordId]);

  const template: ReportTemplate | undefined = useMemo(
    () => (app?.reportConfig?.templates || []).find((t: ReportTemplate) => t.id === templateId),
    [app, templateId],
  );

  useEffect(() => {
    if (template) document.title = template.title || template.name;
  }, [template]);

  const resolve = useMemo(() => makeResolver(dirUsers, dirGroups), [dirUsers, dirGroups]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-neutral-200 text-neutral-500">読み込み中…</div>;
  }
  if (error || !record) {
    return (
      <CenterCard>
        <AlertCircle className="size-8 text-red-500" />
        <p className="font-semibold">レコードを表示できません</p>
        <p className="text-sm text-neutral-500">{error || 'データが見つかりませんでした。'}</p>
        <button className="text-sm text-indigo-600 hover:underline" onClick={() => navigate(-1)}>戻る</button>
      </CenterCard>
    );
  }
  if (!template) {
    return (
      <CenterCard>
        <AlertCircle className="size-8 text-amber-500" />
        <p className="font-semibold">帳票テンプレートが見つかりません</p>
        <p className="text-sm text-neutral-500">アプリ設定の「帳票」タブでテンプレートを作成してください。</p>
        <button className="text-sm text-indigo-600 hover:underline" onClick={() => navigate(`/apps/${appId}/records/${recordId}`)}>レコードへ戻る</button>
      </CenterCard>
    );
  }

  return (
    <div className="print-root min-h-screen bg-neutral-200">
      <PrintStyle template={template} />
      <PrintToolbar
        name={template.name}
        paper={template.paper}
        orientation={template.orientation}
        onClose={() => navigate(`/apps/${appId}/records/${recordId}`)}
      />
      <div className="report-stage py-6 px-4 flex justify-center">
        <ReportSheet template={template} fields={fields} data={record.dataJson || {}} resolve={resolve} />
      </div>
    </div>
  );
}

/** 用紙サイズに合わせた印刷スタイル（@page margin:0 で sheet の padding を余白に使う）。 */
export function PrintStyle({ template }: { template: ReportTemplate }) {
  return (
    <style>{`
      @page { size: ${pageSizeCss(template.paper, template.orientation)}; margin: 0; }
      @media print {
        .no-print { display: none !important; }
        html, body, .print-root { background: #fff !important; }
        .report-stage { padding: 0 !important; gap: 0 !important; display: block !important; }
        .report-sheet { box-shadow: none !important; margin: 0 auto !important; }
      }
    `}</style>
  );
}

/** 印刷されない操作バー（印刷/PDF保存・閉じる）。 */
export function PrintToolbar({ name, paper, orientation, count, onClose }: {
  name: string; paper: string; orientation: string; count?: number; onClose: () => void;
}) {
  return (
    <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-neutral-300 bg-white px-4 py-2.5 shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        <Printer className="size-4 text-neutral-500 shrink-0" />
        <span className="text-sm font-medium text-neutral-700 truncate">{name}</span>
        <span className="text-xs text-neutral-400 shrink-0">{paper} / {orientation === 'portrait' ? '縦' : '横'}{count != null ? ` / ${count}件` : ''}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Printer className="size-4" /> 印刷 / PDF保存
        </button>
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <X className="size-4" /> 閉じる
        </button>
      </div>
    </div>
  );
}

export function CenterCard({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen grid place-items-center bg-neutral-200 p-6">
      <div className="flex flex-col items-center gap-2 text-center rounded-xl bg-white px-8 py-10 shadow">{children}</div>
    </div>
  );
}
