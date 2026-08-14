import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, Paperclip, Trash2, Send, History, MessageSquare, Upload, Link2, ChevronRight, Copy, Printer, ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import { Layout } from '../components/Layout';
import { getUser, userDisplay } from '../lib/auth';
import { type FieldDef, formatValue, fieldTypeLabel } from '../lib/fields';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { Avatar } from '../components/ui/Avatar';
import { StatusPill } from '../components/ui/StatusPill';
import { useToast } from '../components/ui/Toast';
import { useConfirm } from '../components/ui/ConfirmDialog';
import { MapView } from '../components/MapView';
import { isGeoPoint, mapZoom, mapHeightClass, buildSwitcherBasemaps, getAvailableTileStyles } from '../lib/map';
import { buildOptionColors, NEUTRAL_COLOR } from '../lib/colors';
import { RecordAiButton } from '../components/ai/RecordAiButton';
import { RecordAiActions } from '../components/ai/RecordAiActions';

interface Perm { canView: boolean; canAdd: boolean; canEdit: boolean; canDelete: boolean; canManage: boolean; }

export function RecordDetail() {
  const { appId, recordId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { confirm } = useConfirm();
  const [perm, setPerm] = useState<Perm | null>(null);
  const [ownEdit, setOwnEdit] = useState(false);
  const [proc, setProc] = useState<any>(null);
  const [aiActions, setAiActions] = useState<any[]>([]);
  const [reportTemplates, setReportTemplates] = useState<{ id: string; name: string }[]>([]);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [record, setRecord] = useState<any>(null);
  const [attachments, setAttachments] = useState<any[]>([]);
  const [comment, setComment] = useState('');
  const [dirUsers, setDirUsers] = useState<Record<string, string>>({});
  const [dirGroups, setDirGroups] = useState<Record<string, string>>({});
  const [related, setRelated] = useState<{ appId: string; appName: string; fieldLabel: string; records: { id: string; title: string }[] }[]>([]);
  // 参照項目の参照先レコードが実在するか（null=未確認）。リンク切れの可視化に使う。
  const [refExisting, setRefExisting] = useState<Set<string> | null>(null);
  const [tileStyles, setTileStyles] = useState<string[]>([]);

  useEffect(() => { getAvailableTileStyles().then(setTileStyles); }, []);

  const loadRecord = () => api.get(`/records/${recordId}`).then(setRecord).catch((e) => toast.error(e.message));
  const loadAttachments = () => api.get(`/attachments?recordId=${recordId}`).then(setAttachments).catch(() => {});

  useEffect(() => {
    if (!appId || !recordId) return;
    api.get(`/apps/${appId}`).then((a) => {
      setPerm(a.myPermission);
      setOwnEdit(!!a.creatorEditOwn);
      setProc(a.processConfig);
      setAiActions(a.aiConfig?.actions || []);
      setReportTemplates((a.reportConfig?.templates || []).map((t: any) => ({ id: t.id, name: t.name })));
    }).catch(() => {});
    api.get(`/fields?appId=${appId}`).then(setFields).catch(() => {});
    api.get('/directory/users').then((us: any[]) => setDirUsers(Object.fromEntries(us.map((u) => [u.id, u.name?.trim() || u.loginId])))).catch(() => {});
    api.get('/directory/groups').then((gs: any[]) => setDirGroups(Object.fromEntries(gs.map((g) => [g.id, g.name])))).catch(() => {});
    api.get(`/records/${recordId}/related`).then(setRelated).catch(() => {});
    loadRecord();
    loadAttachments();
  }, [appId, recordId]);

  // 参照項目の参照先が削除されていないか確認（リンク切れ検出）。
  useEffect(() => {
    if (!record || fields.length === 0) return;
    const ids = fields
      .filter((f) => f.fieldType === 'reference')
      .map((f) => record.dataJson?.[f.fieldCode]?.id)
      .filter(Boolean);
    if (ids.length === 0) { setRefExisting(new Set()); return; }
    api.post('/records/exist', { ids }).then((r) => setRefExisting(new Set(r.existing))).catch(() => {});
  }, [record, fields]);

  const display = (f: FieldDef, v: any) => {
    if (f.fieldType === 'user_select') return dirUsers[v] || v || '';
    if (f.fieldType === 'group_select') return dirGroups[v] || v || '';
    return formatValue(f, v);
  };

  const addComment = async () => {
    if (!comment.trim()) return;
    try {
      await api.post(`/records/${recordId}/comments`, { comment });
      setComment('');
      loadRecord();
    } catch (e: any) { toast.error(e.message); }
  };

  const uploadFile = async (fieldCode: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.upload(`/attachments?recordId=${recordId}&fieldCode=${encodeURIComponent(fieldCode)}`, fd);
      toast.success('アップロードしました');
      loadAttachments();
    } catch (e: any) { toast.error(e.message); }
  };

  const download = async (att: any) => {
    try {
      const blob = await api.getBlob(`/attachments/${att.id}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = att.originalName; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast.error(e.message); }
  };

  const deleteAttachment = async (id: string) => {
    if (!(await confirm({ message: 'この添付ファイルを削除しますか？', danger: true, confirmText: '削除' }))) return;
    try { await api.delete(`/attachments/${id}`); loadAttachments(); } catch (e: any) { toast.error(e.message); }
  };

  const me = getUser();
  // 編集権限、または「作成者は自分のレコードを編集できる」設定 + 本人作成レコード
  const canEditThis = !!perm?.canEdit || (!!perm?.canAdd && ownEdit && record?.createdBy === me?.id);
  // プロセス管理: 現在のステータスから可能なアクション（承認者が設定された遷移は本人/管理者のみ）
  const current = record?.dataJson?.[proc?.statusField];
  const outgoing: any[] = proc?.enabled && proc?.statusField ? (proc.actions || []).filter((a: any) => a.from === current) : [];
  const procActions: { to: string; label: string }[] = !canEditThis ? [] : outgoing
    .filter((a: any) => !a.approver || perm?.canManage || String(record?.dataJson?.[a.approver] ?? '') === me?.id)
    .map((a: any) => ({ to: a.to, label: a.label }));
  // 自分が実行できない（他者承認待ちの）アクション
  const pendingApprover: string | null = (() => {
    const a = outgoing.find((x: any) => x.approver && record?.dataJson?.[x.approver] && String(record.dataJson[x.approver]) !== me?.id);
    if (!a) return null;
    const uid = record.dataJson[a.approver];
    return dirUsers[uid] || String(uid).slice(0, 8);
  })();

  const runAction = async (to: string) => {
    try {
      await api.put(`/records/${recordId}`, { data: { ...record.dataJson, [proc.statusField]: to } });
      toast.success('ステータスを更新しました');
      loadRecord();
    } catch (e: any) { toast.error(e.message); }
  };

  const duplicate = async () => {
    if (!(await confirm({ title: 'レコードを複製', message: 'このレコードを複製して新しいレコードを作成しますか？', confirmText: '複製' }))) return;
    try {
      const rec = await api.post(`/records/${recordId}/duplicate`, {});
      toast.success('複製しました');
      navigate(`/apps/${appId}/records/${rec.id}`);
    } catch (e: any) { toast.error(e.message); }
  };

  if (!record) {
    return (
      <Layout>
        <Skeleton className="h-8 w-48 mb-6" />
        <div className="grid gap-5 lg:[grid-template-columns:1fr_320px]">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </Layout>
    );
  }

  const fileFields = fields.filter((f) => f.fieldType === 'file');

  return (
    <Layout>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" icon={<ArrowLeft className="size-4" />} onClick={() => navigate(`/apps/${appId}`)} aria-label="一覧へ" />
          <h1 className="text-xl font-bold tracking-tight">レコード詳細</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {procActions.map((a) => (
            <Button key={a.to} variant="primary" onClick={() => runAction(a.to)}>{a.label}</Button>
          ))}
          {appId && recordId && reportTemplates.length > 0 && (
            <PrintMenu appId={appId} recordId={recordId} templates={reportTemplates} />
          )}
          {recordId && <RecordAiButton recordId={recordId} />}
          {appId && recordId && record && aiActions.length > 0 && (
            <RecordAiActions
              appId={appId}
              recordId={recordId}
              actions={aiActions}
              data={record.dataJson || {}}
              canEdit={canEditThis}
              fields={fields}
              onWritten={loadRecord}
            />
          )}
          {perm?.canAdd && (
            <Button icon={<Copy className="size-4" />} onClick={duplicate}>複製</Button>
          )}
          {canEditThis && (
            <Button icon={<Pencil className="size-4" />} onClick={() => navigate(`/apps/${appId}/records/${recordId}/edit`)}>
              編集
            </Button>
          )}
        </div>
      </div>

      {proc?.enabled && proc?.statusField && (() => {
        const stVal = String(record.dataJson?.[proc.statusField] ?? '');
        const stField = fields.find((f) => f.fieldCode === proc.statusField);
        const stColors = buildOptionColors(stField?.settings?.options || []);
        return (
          <div className="card flex items-center gap-2 px-4 py-3 mb-5 flex-wrap">
            <span className="text-sm text-muted">現在のステータス</span>
            {stVal ? <StatusPill value={stVal} color={stColors[stVal] || NEUTRAL_COLOR} /> : <span className="badge badge-muted">（未設定）</span>}
            {pendingApprover && (
              <span className="badge badge-muted ml-auto">承認待ち: {pendingApprover}</span>
            )}
          </div>
        );
      })()}

      <div className="grid gap-5 items-start lg:[grid-template-columns:1fr_320px]">
        <div className="flex flex-col gap-5 min-w-0">
          {/* 値 */}
          <div className="card overflow-hidden">
            <dl className="divide-y divide-border">
              {fields.map((f) => (
                f.fieldType === 'section' ? (
                  <div key={f.fieldCode} className="px-5 py-2.5 bg-surface-2">
                    <h4 className="font-semibold text-sm">{f.label}</h4>
                    {f.settings?.description && <p className="text-xs text-muted mt-0.5">{f.settings.description}</p>}
                  </div>
                ) : (
                <div key={f.fieldCode} className="grid sm:grid-cols-[200px_1fr] gap-1 sm:gap-4 px-5 py-3">
                  <dt className="text-sm font-medium text-muted">
                    {f.label} <span className="font-normal text-xs">({fieldTypeLabel(f.fieldType)})</span>
                  </dt>
                  <dd className="text-sm min-w-0 break-words">
                    {f.fieldType === 'file' ? (
                      attachments.filter((a) => a.fieldCode === f.fieldCode).map((a) => (
                        <button key={a.id} className="flex items-center gap-1.5 text-primary hover:underline" onClick={() => download(a)}>
                          <Paperclip className="size-3.5" /> {a.originalName}
                        </button>
                      ))
                    ) : f.fieldType === 'reference' && record.dataJson?.[f.fieldCode]?.id ? (
                      refExisting !== null && !refExisting.has(record.dataJson[f.fieldCode].id) ? (
                        <span className="inline-flex items-center gap-1.5 text-muted" title="参照先のレコードは削除されています">
                          <Link2 className="size-3.5 shrink-0" />
                          <span className="line-through">{record.dataJson[f.fieldCode].label || '(関連レコード)'}</span>
                          <span className="badge badge-muted">削除済み</span>
                        </span>
                      ) : (
                        <button
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                          onClick={() => navigate(`/apps/${f.settings?.refAppId}/records/${record.dataJson[f.fieldCode].id}`)}
                        >
                          <Link2 className="size-3.5" />{record.dataJson[f.fieldCode].label || '(関連レコード)'}
                        </button>
                      )
                    ) : f.fieldType === 'subtable' ? (
                      <SubtableView field={f} rows={record.dataJson?.[f.fieldCode]} />
                    ) : f.fieldType === 'location' && isGeoPoint(record.dataJson?.[f.fieldCode]) ? (
                      (() => {
                        const gp = record.dataJson[f.fieldCode];
                        const sw = buildSwitcherBasemaps(f.settings, tileStyles);
                        return (
                          <div className="space-y-1.5">
                            <div className="text-xs text-muted">
                              {gp.label && <span className="font-medium text-content mr-2">{gp.label}</span>}
                              {gp.lat.toFixed(5)}, {gp.lng.toFixed(5)}
                            </div>
                            <MapView
                              className={mapHeightClass(f.settings)}
                              center={{ lat: gp.lat, lng: gp.lng }}
                              zoom={mapZoom(f.settings)}
                              basemaps={sw.list}
                              activeBasemapId={sw.activeId}
                              markers={[{ id: record.id, lat: gp.lat, lng: gp.lng, label: gp.label }]}
                            />
                          </div>
                        );
                      })()
                    ) : f.fieldType === 'link' && record.dataJson?.[f.fieldCode] ? (
                      <a href={String(record.dataJson[f.fieldCode])} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{record.dataJson[f.fieldCode]}</a>
                    ) : f.fieldType === 'email' && record.dataJson?.[f.fieldCode] ? (
                      <a href={`mailto:${record.dataJson[f.fieldCode]}`} className="text-primary hover:underline">{record.dataJson[f.fieldCode]}</a>
                    ) : f.fieldType === 'phone' && record.dataJson?.[f.fieldCode] ? (
                      <a href={`tel:${record.dataJson[f.fieldCode]}`} className="text-primary hover:underline">{record.dataJson[f.fieldCode]}</a>
                    ) : f.fieldType === 'user_select' && record.dataJson?.[f.fieldCode] ? (
                      <span className="inline-flex items-center gap-1.5"><Avatar name={display(f, record.dataJson[f.fieldCode])} />{display(f, record.dataJson[f.fieldCode])}</span>
                    ) : (f.fieldType === 'status' || f.fieldType === 'select') && record.dataJson?.[f.fieldCode] ? (
                      <StatusPill value={String(record.dataJson[f.fieldCode])} color={buildOptionColors(f.settings?.options || [])[String(record.dataJson[f.fieldCode])] || NEUTRAL_COLOR} />
                    ) : (
                      display(f, record.dataJson?.[f.fieldCode]) || <span className="text-muted">—</span>
                    )}
                  </dd>
                </div>
                )
              ))}
            </dl>
            <div className="px-5 py-3 border-t border-border text-xs text-muted">
              作成: {userDisplay(record.creator)} / {new Date(record.createdAt).toLocaleString('ja-JP')}
              <span className="mx-2">·</span>
              更新: {userDisplay(record.updater)} / {new Date(record.updatedAt).toLocaleString('ja-JP')}
            </div>
          </div>

          {/* 添付ファイル */}
          {fileFields.length > 0 && canEditThis && (
            <div className="card p-5">
              <h4 className="font-semibold mb-3 flex items-center gap-2"><Upload className="size-4 text-muted" />添付ファイルのアップロード</h4>
              {fileFields.map((f) => (
                <div key={f.fieldCode} className="mb-3">
                  <label className="label">{f.label}</label>
                  <input
                    type="file"
                    className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-primary-soft file:px-3 file:py-2 file:text-sm file:font-semibold file:text-primary-soft-fg hover:file:opacity-90"
                    onChange={(e) => e.target.files?.[0] && uploadFile(f.fieldCode, e.target.files[0])}
                  />
                </div>
              ))}
              {attachments.length > 0 && (
                <div className="mt-2 divide-y divide-border">
                  {attachments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-2 py-2">
                      <button className="flex items-center gap-1.5 text-sm text-primary hover:underline min-w-0" onClick={() => download(a)}>
                        <Paperclip className="size-3.5 shrink-0" /> <span className="truncate">{a.originalName}</span>
                      </button>
                      <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} onClick={() => deleteAttachment(a.id)} aria-label="削除" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* コメント */}
          <div className="card p-5">
            <h4 className="font-semibold mb-3 flex items-center gap-2"><MessageSquare className="size-4 text-muted" />コメント</h4>
            {record.comments?.length === 0 && <p className="text-sm text-muted">コメントはありません。</p>}
            <div className="space-y-3">
              {record.comments?.map((c: any) => (
                <div key={c.id} className="rounded-lg bg-surface-2 px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <strong className="text-sm">{c.loginId}</strong>
                    <span className="text-xs text-muted">{new Date(c.createdAt).toLocaleString('ja-JP')}</span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap break-words">{c.comment}</div>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-3">
              <input
                className="input"
                placeholder="コメントを入力..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addComment()}
              />
              <Button variant="primary" icon={<Send className="size-4" />} onClick={addComment} aria-label="投稿" />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5 min-w-0">
        {/* 関連レコード（このレコードを参照している他アプリのレコード） */}
        {related.length > 0 && (
          <div className="card p-5">
            <h4 className="font-semibold mb-3 flex items-center gap-2"><Link2 className="size-4 text-muted" />関連レコード</h4>
            <div className="space-y-4">
              {related.map((g, gi) => (
                <div key={gi}>
                  <div className="text-xs font-semibold text-muted mb-1.5">{g.appName}<span className="font-normal">（{g.fieldLabel}）</span></div>
                  <div className="space-y-1">
                    {g.records.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => navigate(`/apps/${g.appId}/records/${r.id}`)}
                        className="w-full text-left flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-surface-2 transition-colors"
                      >
                        <ChevronRight className="size-3.5 text-muted shrink-0" />
                        <span className="truncate">{r.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 変更履歴 */}
        <div className="card p-5">
          <h4 className="font-semibold mb-3 flex items-center gap-2"><History className="size-4 text-muted" />変更履歴</h4>
          {record.histories?.length === 0 && <p className="text-sm text-muted">変更履歴はありません。</p>}
          <div className="space-y-3">
            {record.histories?.map((h: any) => (
              <div key={h.id} className="text-sm border-l-2 border-border pl-3">
                <div className="flex items-center justify-between gap-2">
                  <strong className="text-[13px]">{h.loginId}</strong>
                  <span className="text-xs text-muted">{new Date(h.createdAt).toLocaleString('ja-JP')}</span>
                </div>
                <Diff fields={fields} oldData={h.oldData} newData={h.newData} />
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    </Layout>
  );
}

/** 帳票の印刷ボタン。テンプレが1つなら直接、複数ならメニューで選んで別タブを開く。 */
function PrintMenu({ appId, recordId, templates }: { appId: string; recordId: string; templates: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const openPrint = (templateId: string) => {
    window.open(`/apps/${appId}/records/${recordId}/print/${templateId}`, '_blank', 'noopener');
    setOpen(false);
  };

  if (templates.length === 1) {
    return <Button icon={<Printer className="size-4" />} onClick={() => openPrint(templates[0].id)}>印刷</Button>;
  }

  return (
    <div className="relative">
      <Button icon={<Printer className="size-4" />} onClick={() => setOpen((v) => !v)}>
        印刷 <ChevronDown className="size-3.5 -mr-1" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 min-w-48 rounded-lg border border-border bg-surface py-1 shadow-lg">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => openPrint(t.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-surface-2"
              >
                <Printer className="size-3.5 text-muted shrink-0" />
                <span className="truncate">{t.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** サブテーブル（明細行）の読み取り表示。数値・計算列は合計を表示。 */
function SubtableView({ field, rows }: { field: FieldDef; rows: any }) {
  const columns: any[] = field.settings?.columns || [];
  const list: Record<string, any>[] = Array.isArray(rows) ? rows : [];
  if (columns.length === 0 || list.length === 0) return <span className="text-muted">—</span>;
  const numericCols = columns.filter((c) => c.fieldType === 'number' || c.fieldType === 'calc');
  const fmt = (c: any, v: any) => {
    if ((c.fieldType === 'number' || c.fieldType === 'calc') && v !== '' && v !== null && v !== undefined && !isNaN(Number(v))) {
      let s = c.settings?.thousandSeparator ? Number(v).toLocaleString('ja-JP') : String(v);
      if (c.settings?.unit) s = `${s} ${c.settings.unit}`;
      return s;
    }
    return v ?? '';
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2">
            {columns.map((c) => <th key={c.fieldCode} className="px-2.5 py-1.5 text-left font-semibold text-muted whitespace-nowrap">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {list.map((row, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {columns.map((c) => (
                <td key={c.fieldCode} className={`px-2.5 py-1.5 ${c.fieldType === 'number' || c.fieldType === 'calc' ? 'text-right tabular-nums' : ''}`}>{fmt(c, row[c.fieldCode])}</td>
              ))}
            </tr>
          ))}
        </tbody>
        {numericCols.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-border bg-surface-2 font-semibold">
              {columns.map((c, idx) => {
                const isNum = c.fieldType === 'number' || c.fieldType === 'calc';
                const total = isNum ? list.reduce((s, r) => s + (Number(r[c.fieldCode]) || 0), 0) : 0;
                return <td key={c.fieldCode} className={`px-2.5 py-1.5 ${isNum ? 'text-right tabular-nums' : ''}`}>{idx === 0 ? <span className="text-muted font-normal">合計</span> : isNum ? fmt(c, total) : ''}</td>;
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function Diff({ fields, oldData, newData }: { fields: FieldDef[]; oldData: any; newData: any }) {
  const changed = fields.filter((f) => JSON.stringify(oldData?.[f.fieldCode]) !== JSON.stringify(newData?.[f.fieldCode]));
  if (changed.length === 0) return <span className="text-muted text-xs">変更なし</span>;
  return (
    <ul className="mt-1 space-y-0.5 text-xs">
      {changed.map((f) => (
        <li key={f.fieldCode}>
          <span className="text-muted">{f.label}:</span> <span className="text-muted line-through">{String(oldData?.[f.fieldCode] ?? '空')}</span>
          {' → '}
          <span className="text-content">{String(newData?.[f.fieldCode] ?? '空')}</span>
        </li>
      ))}
    </ul>
  );
}
