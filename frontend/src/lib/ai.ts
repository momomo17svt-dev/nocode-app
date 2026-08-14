import { api, csrfHeaders } from './api';
import type { GovMeta, GovStructure } from './govdoc';

// ===== 型 =====
export type ModelKind = 'llm' | 'embeddings' | 'vlm' | 'unknown';
export type LlmProvider = 'lmstudio' | 'ollama' | 'openai' | 'openrouter' | 'groq' | 'gemini' | 'mistral' | 'custom';
export type LlmApiKeyHeader = 'authorization' | 'api-key' | 'x-api-key';
export interface ModelInfo {
  id: string;
  type: ModelKind;
  loaded: boolean;
}

/** キュー稼働状況＋モデル読込状態（LM Studio非接触で軽量）。 */
export interface QueueStatus {
  running: number;
  waiting: number;
  maxConcurrency: number;
  maxQueue: number;
  loading: { chat?: string; embed?: string };
}

export interface LlmHealth {
  ok: boolean;
  enabled: boolean;
  provider: LlmProvider;
  baseUrl: string;
  models: string[];
  modelList: ModelInfo[];
  chatModel: string; // 設定値（空＝自動）
  embedModel: string; // 設定値（空＝自動）
  resolvedChatModel: string; // 実際に使われるモデル
  resolvedEmbedModel: string;
  queue?: QueueStatus;
  error?: string;
}

export interface LlmConfig {
  enabled: boolean;
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string;
  apiKeyConfigured: boolean;
  apiKeyHeader: LlmApiKeyHeader;
  chatModel: string;
  embedModel: string;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  indexedAppIds: string[];
  chunkSize: number;
  chunkOverlap: number;
  maxConcurrency: number;
  maxQueue: number;
  queueTimeoutMs: number;
  autoLoadModel: boolean;
  unloadPrevious: boolean;
  lmsPath: string;
}

export interface SearchHit {
  source: 'record' | 'document';
  appId: string | null;
  appName?: string;
  recordId?: string | null;
  docId?: string | null;
  title: string;
  snippet: string;
  score: number;
  // 構造チャンクの見出し情報。path/label は行政文書＋見出し検出された一般文書、
  // anchor（閲覧ジャンプ用）は行政文書のみ
  structPath?: string | null;
  structLabel?: string | null;
  structAnchor?: string | null;
}

export interface ChatMsg {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface IndexStatus {
  enabled: boolean;
  embedModel: string;
  indexedAppIds: string[];
  total: number;
  recordChunks: number;
  docChunks: number;
  documents: number;
  models: { model: string; dim: number }[];
  modelMismatch: boolean;
}

export interface DocItem {
  id: string;
  title: string;
  appId: string | null;
  length: number;
  chunks: number;
  sourceFileName?: string | null;
  sourceMime?: string | null;
  docKind?: 'plain' | 'gov';
  meta?: GovMeta | null;
  updatedAt: string;
}

/** ナレッジ一覧（一般ユーザー向け・可視性で絞り込み済み）。 */
export interface KnowledgeItem {
  id: string;
  title: string;
  appId: string | null;
  appName?: string | null;
  docKind?: 'plain' | 'gov';
  meta?: GovMeta | null;
  sourceFileName?: string | null;
  chunks: number;
  length: number;
  updatedAt: string;
}

/** getDoc の戻り（行政文書は structure/meta を含む）。 */
export interface DocDetail {
  id: string;
  title: string;
  content: string;
  appId: string | null;
  sourceFileName?: string | null;
  docKind?: 'plain' | 'gov';
  structure?: GovStructure | null;
  meta?: GovMeta | null;
  updatedAt: string;
}

/** ナレッジ文書アップロードで受け付ける拡張子（input[accept]用・バックエンドと一致）。 */
export const DOC_UPLOAD_ACCEPT =
  '.txt,.md,.markdown,.csv,.tsv,.json,.log,.html,.htm,.xml,.yaml,.yml,.pdf,.docx';

// ===== API ラッパ =====
export const aiApi = {
  health: () => api.get('/llm/health') as Promise<LlmHealth>,
  queue: () => api.get('/llm/queue') as Promise<QueueStatus>,
  loadModel: (kind: 'chat' | 'embed', model?: string) => api.post('/llm/load', { kind, model }) as Promise<LlmHealth>,
  getConfig: () => api.get('/llm/config') as Promise<LlmConfig>,
  saveConfig: (patch: Partial<LlmConfig> & { clearApiKey?: boolean }) => api.put('/llm/config', patch) as Promise<LlmConfig>,

  search: (query: string, k?: number, docId?: string) => api.post('/ai/search', { query, k, docId }) as Promise<{ hits: SearchHit[] }>,
  ask: (question: string, history?: ChatMsg[], docId?: string) =>
    api.post('/ai/ask', { question, history, docId }) as Promise<{ answer: string; sources: SearchHit[] }>,
  analyzeApp: (appId: string) => api.post('/ai/analyze/app', { appId }) as Promise<any>,
  analyzeRecord: (recordId: string, mode: 'summary' | 'next') =>
    api.post('/ai/analyze/record', { recordId, mode }) as Promise<{ recordId: string; appId: string; mode: string; result: string }>,
  draftRecord: (appId: string, text: string) =>
    api.post('/ai/draft-record', { appId, text }) as Promise<{ values: Record<string, any>; filled: string[] }>,
  /** 画像（書類・伝票・名刺等）を読み取ってレコードのフィールド値を下書き（VLM-OCR）。 */
  draftRecordImage: (appId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const q = appId ? `?appId=${encodeURIComponent(appId)}` : '';
    return api.upload(`/ai/draft-record/image${q}`, fd) as Promise<{ values: Record<string, any>; filled: string[] }>;
  },

  status: () => api.get('/ai/index/status') as Promise<IndexStatus>,
  indexApp: (appId: string) => api.post(`/ai/index/app/${appId}`, {}),
  reindex: () => api.post('/ai/index/reindex', {}),

  // 一般ユーザー向け（可視性で絞り込み）
  listKnowledge: () => api.get('/ai/knowledge') as Promise<KnowledgeItem[]>,
  getKnowledge: (id: string) => api.get(`/ai/knowledge/${id}`) as Promise<DocDetail>,

  // 管理者向け（全文書）
  listDocs: () => api.get('/ai/documents') as Promise<DocItem[]>,
  getDoc: (id: string) => api.get(`/ai/documents/${id}`) as Promise<DocDetail>,
  createDoc: (d: { title: string; content: string; appId?: string | null; docKind?: 'plain' | 'gov' }) => api.post('/ai/documents', d),
  /** ファイルをアップロードして本文抽出＋文書作成。kind='gov'で行政文書として構造解析。 */
  uploadDoc: (file: File, appId?: string | null, kind?: 'plain' | 'gov') => {
    const fd = new FormData();
    fd.append('file', file);
    const params = new URLSearchParams();
    if (appId) params.set('appId', appId);
    if (kind) params.set('kind', kind);
    const q = params.toString() ? `?${params.toString()}` : '';
    return api.upload(`/ai/documents/upload${q}`, fd) as Promise<{ id: string; title: string; truncated: boolean; chars: number; docKind?: string }>;
  },
  updateDoc: (id: string, d: { title: string; content: string; appId?: string | null; docKind?: 'plain' | 'gov' }) => api.put(`/ai/documents/${id}`, d),
  deleteDoc: (id: string) => api.delete(`/ai/documents/${id}`),
  /** 保存前の構造プレビュー解析。 */
  parseGov: (content: string) => api.post('/ai/gov/parse', { content }) as Promise<GovStructure>,
};

// ===== ストリーミング（SSE を fetch + ReadableStream で消費） =====
/** SSE を消費し、(event, data) ごとに onEvent を呼ぶ汎用関数。 */
async function consumeSSE(
  endpoint: string,
  body: any,
  onEvent: (event: string, data: any) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${api.base}${endpoint}`, {
    method: 'POST',
    credentials: 'include',
    headers: csrfHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    onEvent('error', `AI処理に失敗しました (${res.status})`);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split('\n\n');
    buf = parts.pop() || '';
    for (const part of parts) {
      let event = 'message';
      let data = '';
      for (const line of part.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        onEvent(event, JSON.parse(data));
      } catch {
        /* 分割断片は無視 */
      }
    }
  }
}

/** 順番待ちに入った時の通知（待ち位置・キュー長）。streamが即時開始した場合は呼ばれない。 */
export type QueuedInfo = { position: number; waiting: number };

interface StreamHandlers {
  onSources?: (s: SearchHit[]) => void;
  onToken?: (t: string) => void;
  onQueued?: (info: QueuedInfo) => void;
  onDone?: () => void;
  onError?: (m: string) => void;
  signal?: AbortSignal;
}

export async function askStream(body: { question: string; history?: ChatMsg[]; docId?: string }, h: StreamHandlers): Promise<void> {
  try {
    await consumeSSE('/ai/ask/stream', body, (event, data) => {
      if (event === 'sources') h.onSources?.(data);
      else if (event === 'queued') h.onQueued?.(data);
      else if (event === 'token') h.onToken?.(data);
      else if (event === 'error') h.onError?.(data);
    }, h.signal);
  } catch (e: any) {
    if (e?.name !== 'AbortError') h.onError?.(e?.message || 'AI応答の取得に失敗しました');
  }
  h.onDone?.();
}

interface AnalysisStreamHandlers {
  onStats?: (s: any) => void;
  onToken?: (t: string) => void;
  onQueued?: (info: QueuedInfo) => void;
  onDone?: () => void;
  onError?: (m: string) => void;
  signal?: AbortSignal;
}

export async function analyzeAppStream(appId: string, h: AnalysisStreamHandlers): Promise<void> {
  try {
    await consumeSSE('/ai/analyze/app/stream', { appId }, (event, data) => {
      if (event === 'stats') h.onStats?.(data);
      else if (event === 'queued') h.onQueued?.(data);
      else if (event === 'token') h.onToken?.(data);
      else if (event === 'error') h.onError?.(data);
    }, h.signal);
  } catch (e: any) {
    if (e?.name !== 'AbortError') h.onError?.(e?.message || 'AI分析の取得に失敗しました');
  }
  h.onDone?.();
}

export interface GenField { fieldCode: string; fieldType: string; label: string; required: boolean; settings: any }
export interface AppDefinition {
  name?: string;
  description?: string;
  recordViewScope: string;
  recordEditScope: string;
  fields: GenField[];
  processConfig?: { enabled: boolean; statusField: string; statuses: string[]; actions: { from: string; to: string; label: string }[] };
  aiConfig?: { actions: { id: string; name: string; prompt: string; output: string; targetField?: string }[] };
}

interface TemplateStreamHandlers {
  onProgress?: (t: string) => void;
  onDefinition?: (d: AppDefinition) => void;
  onQueued?: (info: QueuedInfo) => void;
  onError?: (m: string) => void;
  onDone?: () => void;
  signal?: AbortSignal;
}

/** 自然言語の要望からアプリ定義（テンプレ）を生成。progressは生成中テキスト、definitionで完成定義を受領。 */
export async function generateTemplateStream(description: string, h: TemplateStreamHandlers): Promise<void> {
  try {
    await consumeSSE('/ai/generate-template/stream', { description }, (event, data) => {
      if (event === 'progress') h.onProgress?.(data);
      else if (event === 'definition') h.onDefinition?.(data);
      else if (event === 'queued') h.onQueued?.(data);
      else if (event === 'error') h.onError?.(data);
    }, h.signal);
  } catch (e: any) {
    if (e?.name !== 'AbortError') h.onError?.(e?.message || 'アプリ定義の生成に失敗しました');
  }
  h.onDone?.();
}

interface GenStreamHandlers {
  onToken?: (t: string) => void;
  onQueued?: (info: QueuedInfo) => void;
  onDone?: () => void;
  onError?: (m: string) => void;
  signal?: AbortSignal;
}

/** AI項目/AIアクションのプロンプト実行をストリーミング。data は現在のレコード値（{code}置換用）。 */
export async function generateStream(
  body: { appId: string; fieldCode?: string; actionId?: string; prompt?: string; data?: Record<string, any> },
  h: GenStreamHandlers,
): Promise<void> {
  try {
    await consumeSSE('/ai/generate/stream', body, (event, data) => {
      if (event === 'token') h.onToken?.(data);
      else if (event === 'queued') h.onQueued?.(data);
      else if (event === 'error') h.onError?.(data);
    }, h.signal);
  } catch (e: any) {
    if (e?.name !== 'AbortError') h.onError?.(e?.message || 'AI生成に失敗しました');
  }
  h.onDone?.();
}
