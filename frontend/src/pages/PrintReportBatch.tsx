import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { type FieldDef } from '../lib/fields';
import { type ReportTemplate } from '../lib/report';
import { ReportSheet, makeResolver } from '../components/report/ReportSheet';
import { PrintStyle, PrintToolbar, CenterCard } from './PrintReport';

/**
 * 複数レコードをまとめて帳票印刷/PDF出力するページ（スタンドアロン）。
 * 一覧で選択したレコードIDを `?ids=a,b,c` で受け取り、レコードごとに改ページして並べる。
 */
export function PrintReportBatch() {
  const { appId, templateId } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const ids = useMemo(
    () => (sp.get('ids') || '').split(',').map((s) => s.trim()).filter(Boolean),
    [sp],
  );

  const [app, setApp] = useState<any>(null);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [dirUsers, setDirUsers] = useState<Record<string, string>>({});
  const [dirGroups, setDirGroups] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!appId || ids.length === 0) { setLoading(false); return; }
    (async () => {
      try {
        const [a, fs, us, gs] = await Promise.all([
          api.get(`/apps/${appId}`),
          api.get(`/fields?appId=${appId}`),
          api.get('/directory/users').catch(() => []),
          api.get('/directory/groups').catch(() => []),
        ]);
        // 選択順を保ってレコードを取得（取得できないものはスキップ）
        const recs = await Promise.all(ids.map((id) => api.get(`/records/${id}`).catch(() => null)));
        setApp(a);
        setFields(fs);
        setRecords(recs.filter(Boolean));
        setDirUsers(Object.fromEntries((us || []).map((u: any) => [u.id, u.name?.trim() || u.loginId])));
        setDirGroups(Object.fromEntries((gs || []).map((g: any) => [g.id, g.name])));
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [appId, ids]);

  const template: ReportTemplate | undefined = useMemo(
    () => (app?.reportConfig?.templates || []).find((t: ReportTemplate) => t.id === templateId),
    [app, templateId],
  );
  const resolve = useMemo(() => makeResolver(dirUsers, dirGroups), [dirUsers, dirGroups]);

  useEffect(() => {
    if (template) document.title = `${template.title || template.name}（${records.length}件）`;
  }, [template, records.length]);

  if (loading) {
    return <div className="min-h-screen grid place-items-center bg-neutral-200 text-neutral-500">読み込み中…</div>;
  }
  if (error || ids.length === 0) {
    return (
      <CenterCard>
        <AlertCircle className="size-8 text-amber-500" />
        <p className="font-semibold">印刷対象のレコードがありません</p>
        <p className="text-sm text-neutral-500">{error || '一覧でレコードを選択してから印刷してください。'}</p>
        <button className="text-sm text-indigo-600 hover:underline" onClick={() => navigate(`/apps/${appId}`)}>一覧へ戻る</button>
      </CenterCard>
    );
  }
  if (!template) {
    return (
      <CenterCard>
        <AlertCircle className="size-8 text-amber-500" />
        <p className="font-semibold">帳票テンプレートが見つかりません</p>
        <p className="text-sm text-neutral-500">アプリ設定の「帳票」タブでテンプレートを作成してください。</p>
        <button className="text-sm text-indigo-600 hover:underline" onClick={() => navigate(`/apps/${appId}`)}>一覧へ戻る</button>
      </CenterCard>
    );
  }
  if (records.length === 0) {
    return (
      <CenterCard>
        <AlertCircle className="size-8 text-red-500" />
        <p className="font-semibold">レコードを取得できませんでした</p>
        <button className="text-sm text-indigo-600 hover:underline" onClick={() => navigate(`/apps/${appId}`)}>一覧へ戻る</button>
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
        count={records.length}
        onClose={() => navigate(`/apps/${appId}`)}
      />
      <div className="report-stage py-6 px-4 flex flex-col items-center gap-6">
        {records.map((r, i) => (
          <ReportSheet
            key={r.id}
            template={template}
            fields={fields}
            data={r.dataJson || {}}
            resolve={resolve}
            pageBreakAfter={i < records.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
