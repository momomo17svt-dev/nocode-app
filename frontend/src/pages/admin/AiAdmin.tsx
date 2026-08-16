import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Loader2, Database, Save, Library, ArrowRight, DownloadCloud, ListOrdered } from 'lucide-react';
import { api } from '../../lib/api';
import { Layout } from '../../components/Layout';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import {
  aiApi,
  type LlmConfig,
  type LlmProvider,
  type IndexStatus,
  type LlmHealth,
  type ModelInfo,
} from '../../lib/ai';
import { LlmStatusBadge } from '../../components/ai/LlmStatusBadge';

interface AppLite { id: string; name: string }

const PROVIDERS: { value: LlmProvider; label: string }[] = [
  { value: 'lmstudio', label: 'LM Studio' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'groq', label: 'Groq' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'custom', label: 'その他（OpenAI互換）' },
];

const CLOUD_BASE_URLS: Partial<Record<LlmProvider, string>> = {
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  mistral: 'https://api.mistral.ai/v1',
};

function providerBaseUrl(provider: LlmProvider, current: string): string {
  if (CLOUD_BASE_URLS[provider]) return CLOUD_BASE_URLS[provider] as string;
  if (provider === 'custom') return current;
  let host = 'localhost';
  try {
    const parsed = new URL(current);
    if (['localhost', '127.0.0.1', 'host.docker.internal'].includes(parsed.hostname)) host = parsed.hostname;
  } catch {
    // 現在値がURLでない場合はlocalhostを使う。
  }
  return `http://${host}:${provider === 'ollama' ? '11434' : '1234'}/v1`;
}

export function AiAdmin() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const [cfg, setCfg] = useState<LlmConfig | null>(null);
  const [health, setHealth] = useState<LlmHealth | null>(null);
  const [apps, setApps] = useState<AppLite[]>([]);
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [loadingKind, setLoadingKind] = useState<'chat' | 'embed' | null>(null);
  const [clearApiKey, setClearApiKey] = useState(false);

  const loadStatus = () => aiApi.status().then(setStatus).catch(() => setStatus(null));

  // 選択中のモデルをLM Studio側へ即ロード（旧モデル解放込み）
  const loadNow = async (kind: 'chat' | 'embed') => {
    const model = kind === 'chat' ? cfg?.chatModel : cfg?.embedModel;
    setLoadingKind(kind);
    try {
      const h = await aiApi.loadModel(kind, model || undefined);
      setHealth(h);
      toast.success(kind === 'chat' ? 'チャットモデルを読み込みました' : '埋め込みモデルを読み込みました');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingKind(null);
    }
  };

  useEffect(() => {
    aiApi.getConfig().then(setCfg).catch((e) => toast.error(e.message));
    aiApi.health().then(setHealth).catch(() => {});
    api.get('/apps').then((rows) => setApps((rows || []).map((a: any) => ({ id: a.id, name: a.name })))).catch(() => {});
    loadStatus();
    // eslint-disable-next-line
  }, []);

  const patch = (p: Partial<LlmConfig>) => setCfg((c) => (c ? { ...c, ...p } : c));

  // 用途別のモデル候補（接続先の /models から取得した種別で振り分け）
  const list: ModelInfo[] = health?.modelList || [];
  const isEmbed = (m: ModelInfo) => m.type === 'embeddings' || (m.type === 'unknown' && /embed/i.test(m.id));
  const chatModels = list.filter((m) => !isEmbed(m));
  const embedModels = list.filter((m) => isEmbed(m));

  const changeProvider = (provider: LlmProvider) => {
    if (!cfg) return;
    const providerChanged = provider !== cfg.provider;
    patch({
      provider,
      baseUrl: providerBaseUrl(provider, cfg.baseUrl),
      apiKey: '',
      apiKeyConfigured: providerChanged ? false : cfg.apiKeyConfigured,
      chatModel: '',
      embedModel: '',
      autoLoadModel: provider === 'lmstudio',
      unloadPrevious: provider === 'lmstudio',
      apiKeyHeader: 'authorization',
    });
    setClearApiKey(providerChanged && cfg.apiKeyConfigured);
  };

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    try {
      const saved = await aiApi.saveConfig({ ...cfg, clearApiKey });
      setCfg(saved);
      setClearApiKey(false);
      toast.success('AI設定を保存しました');
      aiApi.health().then(setHealth).catch(() => {});
      loadStatus();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleApp = (id: string) => {
    if (!cfg) return;
    const set = new Set(cfg.indexedAppIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    patch({ indexedAppIds: Array.from(set) });
  };

  const reindex = async () => {
    if (!(await confirm({ message: '対象アプリと全文書を再インデックスします。データ量により時間がかかる場合があります。実行しますか？', confirmText: '再インデックス' }))) return;
    setReindexing(true);
    try {
      const r: any = await aiApi.reindex();
      toast.success(`再インデックス完了：レコード${r.recordChunks}件 / 文書${r.docChunks}件のチャンク`);
      loadStatus();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setReindexing(false);
    }
  };

  if (!cfg) {
    return <Layout><div className="py-20 grid place-items-center text-muted"><Loader2 className="size-6 animate-spin" /></div></Layout>;
  }

  return (
    <Layout>
      <h1 className="text-xl font-bold tracking-tight mb-5">AI設定</h1>

      <div className="mb-5"><LlmStatusBadge /></div>

      {/* 接続設定 */}
      <section className="card p-5 mb-5">
        <h4 className="font-semibold text-sm mb-4">LLM接続設定</h4>

        <label className="flex items-center gap-2.5 mb-4 cursor-pointer">
          <input type="checkbox" className="size-4" checked={cfg.enabled} onChange={(e) => patch({ enabled: e.target.checked })} />
          <span className="text-sm font-medium">AI機能を有効にする</span>
          <span className="text-xs text-muted">（保存時のレコード自動インデックスを含む）</span>
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="プロバイダー">
            <select className="input" value={cfg.provider} onChange={(e) => changeProvider(e.target.value as LlmProvider)}>
              {PROVIDERS.map((provider) => <option key={provider.value} value={provider.value}>{provider.label}</option>)}
            </select>
          </Field>
          <Field label="APIキー" hint={cfg.apiKeyConfigured && !clearApiKey ? '保存済み（値は再表示しません）' : 'ローカル接続では空欄で利用できます'}>
            <div className="flex items-center gap-2">
              <input
                type="password"
                autoComplete="new-password"
                className="input flex-1"
                value={cfg.apiKey}
                onChange={(e) => { patch({ apiKey: e.target.value }); setClearApiKey(false); }}
                placeholder={cfg.apiKeyConfigured && !clearApiKey ? '保存済みのキーを変更する場合のみ入力' : 'APIキー（任意）'}
              />
              {cfg.apiKeyConfigured && !clearApiKey && (
                <Button size="sm" variant="ghost" onClick={() => { patch({ apiKey: '' }); setClearApiKey(true); }}>削除</Button>
              )}
            </div>
          </Field>
          <Field label="ベースURL" className="sm:col-span-2">
            <input className="input" value={cfg.baseUrl} onChange={(e) => patch({ baseUrl: e.target.value })} placeholder="http://localhost:1234/v1" />
          </Field>
          {cfg.provider === 'custom' && (
            <Field label="APIキーの送信方法" hint="通常はAuthorization: Bearerを使用します">
              <select className="input" value={cfg.apiKeyHeader} onChange={(e) => patch({ apiKeyHeader: e.target.value as LlmConfig['apiKeyHeader'] })}>
                <option value="authorization">Authorization: Bearer</option>
                <option value="api-key">api-key ヘッダー</option>
                <option value="x-api-key">x-api-key ヘッダー</option>
              </select>
            </Field>
          )}
          <Field label="チャットモデル" hint={cfg.chatModel ? '固定指定中' : `自動：${health?.resolvedChatModel || 'モデル名を入力または候補から選択'}`}>
            <div className="flex items-center gap-2">
              <input list="chat-model-options" className="input flex-1" value={cfg.chatModel} onChange={(e) => patch({ chatModel: e.target.value })} placeholder="モデルID（空欄は自動）" />
              <datalist id="chat-model-options">{chatModels.map((model) => <option key={model.id} value={model.id} />)}</datalist>
              {cfg.provider === 'lmstudio' && (
                <Button size="sm" icon={loadingKind === 'chat' ? <Loader2 className="size-4 animate-spin" /> : <DownloadCloud className="size-4" />}
                  loading={loadingKind === 'chat'} disabled={!cfg.chatModel} onClick={() => loadNow('chat')} title="選択モデルをLM Studioへ読み込む">読込</Button>
              )}
            </div>
          </Field>
          <Field label="埋め込みモデル" hint={cfg.embedModel ? 'RAG・検索に使用（固定指定中）' : `自動：${health?.resolvedEmbedModel || '埋め込みモデルが必要です'}`}>
            <div className="flex items-center gap-2">
              <input list="embed-model-options" className="input flex-1" value={cfg.embedModel} onChange={(e) => patch({ embedModel: e.target.value })} placeholder="埋め込みモデルID（空欄は自動）" />
              <datalist id="embed-model-options">{embedModels.map((model) => <option key={model.id} value={model.id} />)}</datalist>
              {cfg.provider === 'lmstudio' && (
                <Button size="sm" icon={loadingKind === 'embed' ? <Loader2 className="size-4 animate-spin" /> : <DownloadCloud className="size-4" />}
                  loading={loadingKind === 'embed'} disabled={!cfg.embedModel} onClick={() => loadNow('embed')} title="選択モデルをLM Studioへ読み込む">読込</Button>
              )}
            </div>
          </Field>

          <Field label={`温度 (${cfg.temperature})`}>
            <input type="range" min={0} max={1} step={0.1} className="w-full" value={cfg.temperature} onChange={(e) => patch({ temperature: Number(e.target.value) })} />
          </Field>
          <Field label="最大トークン数">
            <input type="number" className="input" value={cfg.maxTokens} onChange={(e) => patch({ maxTokens: Number(e.target.value) })} />
          </Field>
          <Field label="タイムアウト(ms)">
            <input type="number" className="input" value={cfg.timeoutMs} onChange={(e) => patch({ timeoutMs: Number(e.target.value) })} />
          </Field>
          <Field label="チャンク文字数 / 重なり">
            <div className="flex items-center gap-2">
              <input type="number" className="input" value={cfg.chunkSize} onChange={(e) => patch({ chunkSize: Number(e.target.value) })} />
              <span className="text-muted">/</span>
              <input type="number" className="input" value={cfg.chunkOverlap} onChange={(e) => patch({ chunkOverlap: Number(e.target.value) })} />
            </div>
          </Field>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="primary" icon={<Save className="size-4" />} loading={saving} onClick={save}>設定を保存</Button>
        </div>
      </section>

      {/* キュー・モデル管理 */}
      <section className="card p-5 mb-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h4 className="font-semibold text-sm flex items-center gap-2"><ListOrdered className="size-4 text-muted" />キュー・モデル管理</h4>
          {health?.queue && (
            <span className="text-xs text-muted tabular-nums">処理中 {health.queue.running} / 順番待ち {health.queue.waiting}</span>
          )}
        </div>
        <p className="text-xs text-muted mb-4">接続先への同時リクエスト数を制御します。混雑時は順番待ちにし、上限を超えた分のみ「混雑」エラーにします。</p>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="同時実行数" hint={cfg.provider === 'lmstudio' ? 'LM Studioでは通常1' : '接続先のレート制限に合わせて設定'}>
            <input type="number" min={1} max={8} className="input" value={cfg.maxConcurrency} onChange={(e) => patch({ maxConcurrency: Number(e.target.value) })} />
          </Field>
          <Field label="順番待ちの上限" hint="超過で混雑エラー">
            <input type="number" min={1} max={500} className="input" value={cfg.maxQueue} onChange={(e) => patch({ maxQueue: Number(e.target.value) })} />
          </Field>
          <Field label="順番待ちタイムアウト(ms)">
            <input type="number" min={1000} max={600000} className="input" value={cfg.queueTimeoutMs} onChange={(e) => patch({ queueTimeoutMs: Number(e.target.value) })} />
          </Field>
        </div>

        {cfg.provider === 'lmstudio' && (
          <div className="mt-4 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" className="size-4" checked={cfg.autoLoadModel} onChange={(e) => patch({ autoLoadModel: e.target.checked })} />
              <span className="text-sm font-medium">モデル変更時にLM Studioへ自動で読み込む</span>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" className="size-4" checked={cfg.unloadPrevious} onChange={(e) => patch({ unloadPrevious: e.target.checked })} />
              <span className="text-sm font-medium">新モデル読込時に直前のモデルを解放する</span>
            </label>
            <Field label="lms CLI のパス（任意）" hint="旧モデル解放に使用（例: C:\\Users\\…\\.lmstudio\\bin\\lms.exe）。空のときはLM Studio側の設定に委ねます。">
              <input className="input" value={cfg.lmsPath} onChange={(e) => patch({ lmsPath: e.target.value })} placeholder="（空＝CLIアンロード無効）" />
            </Field>
          </div>
        )}

        <div className="mt-4 flex justify-end">
          <Button variant="primary" icon={<Save className="size-4" />} loading={saving} onClick={save}>設定を保存</Button>
        </div>
      </section>

      {/* インデックス対象 */}
      <section className="card p-5 mb-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h4 className="font-semibold text-sm flex items-center gap-2"><Database className="size-4 text-muted" />インデックス対象アプリ</h4>
          <Button size="sm" icon={reindexing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} loading={reindexing} onClick={reindex}>全体を再インデックス</Button>
        </div>

        {status && (
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted mb-4">
            <span>インデックス済みチャンク: <b className="text-content tabular-nums">{status.total}</b>（レコード {status.recordChunks} / 文書 {status.docChunks}）</span>
            <span>埋め込みモデル: <b className="text-content">{status.embedModel || '未設定'}</b></span>
            {status.modelMismatch && <span className="text-warning">⚠ 既存ベクトルと現在の埋め込みモデルが異なります。再インデックスを推奨します。</span>}
          </div>
        )}

        <p className="text-xs text-muted mb-2">チェックしたアプリのレコードを検索・RAGの対象にします（保存後、レコード更新時に自動でインデックスされます）。</p>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((a) => (
            <label key={a.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm cursor-pointer hover:bg-surface-2">
              <input type="checkbox" className="size-4" checked={cfg.indexedAppIds.includes(a.id)} onChange={() => toggleApp(a.id)} />
              <span className="truncate">{a.name}</span>
            </label>
          ))}
          {apps.length === 0 && <p className="text-sm text-muted">アプリがありません。</p>}
        </div>
        <p className="text-[11px] text-muted mt-2">※ 対象アプリの変更は「設定を保存」で反映され、その後に「全体を再インデックス」で既存レコードを取り込みます。</p>
      </section>

      {/* ナレッジ文書の登録は「ナレッジ」画面へ移動 */}
      <section className="card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2">
            <Library className="size-4 text-muted mt-0.5 shrink-0" />
            <div>
              <h4 className="font-semibold text-sm">ナレッジ文書の登録・管理</h4>
              <p className="text-xs text-muted mt-0.5">マニュアル・FAQ・行政文書などの登録／編集／削除は「ナレッジ」画面で行えます（管理者のみ操作可能）。</p>
            </div>
          </div>
          <Link to="/knowledge" className="btn btn-primary btn-sm gap-1.5 shrink-0">ナレッジ画面を開く<ArrowRight className="size-4" /></Link>
        </div>
      </section>
    </Layout>
  );
}
