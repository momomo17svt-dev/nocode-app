// OpenAI互換LLM接続設定。Setting キー 'llm.config' に保存する。
export type LlmProvider = 'lmstudio' | 'ollama' | 'openai' | 'openrouter' | 'groq' | 'gemini' | 'mistral' | 'custom';
export type LlmApiKeyHeader = 'authorization' | 'api-key' | 'x-api-key';

export interface LlmConfig {
  enabled: boolean;
  provider: LlmProvider;
  baseUrl: string; // OpenAI互換のベースURL（例: http://localhost:1234/v1）
  apiKey: string; // 外部API認証用。管理画面へは値を返さない。
  apiKeyHeader: LlmApiKeyHeader;
  chatModel: string; // 空ならロード済みの先頭モデルを使用
  embedModel: string; // 埋め込み用モデル（RAG/検索に必須・チャットとは別物）
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
  indexedAppIds: string[]; // 自動インデックス対象のアプリID
  chunkSize: number; // 文書チャンクの文字数
  chunkOverlap: number; // チャンク間のオーバーラップ文字数
  // ===== リクエストキュー =====
  maxConcurrency: number; // 同時にLM Studioへ流すリクエスト数（既定1=直列）
  maxQueue: number; // 順番待ちの上限（超過で混雑エラー）
  queueTimeoutMs: number; // 順番待ちの最大時間
  // ===== モデル自動ロード/解放 =====
  autoLoadModel: boolean; // モデル変更時にLM Studio側へ自動ロードする
  unloadPrevious: boolean; // 新モデルロード時に直前のモデルを解放する
  lmsPath: string; // lms CLI のパス（空＝CLIアンロード無効）
}

export type PublicLlmConfig = Omit<LlmConfig, 'apiKey'> & {
  apiKey: '';
  apiKeyConfigured: boolean;
};

/** OpenAI互換のマルチモーダルメッセージ部品（VLMへの画像入力用）。 */
export interface ChatContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  // 文字列のほか、VLM入力時は text/image_url パートの配列を指定できる。
  content: string | ChatContentPart[];
}

export type ModelKind = 'llm' | 'embeddings' | 'vlm' | 'unknown';

export interface ModelInfo {
  id: string;
  type: ModelKind;
  loaded: boolean; // LM Studio で現在ロード済みか（不明な場合は true 扱い）
}

/** リクエストキューの稼働統計とモデル読込状態（軽量・LM Studio非接触）。 */
export interface QueueStatus {
  running: number;
  waiting: number;
  maxConcurrency: number;
  maxQueue: number;
  loading: { chat?: string; embed?: string }; // 現在ロード中のモデルID（用途別）
}

export interface LlmHealth {
  ok: boolean;
  enabled: boolean;
  provider: LlmProvider;
  baseUrl: string;
  models: string[]; // 後方互換: モデルID一覧
  modelList: ModelInfo[]; // 種別・ロード状態つき
  chatModel: string; // 設定値（空＝自動）
  embedModel: string; // 設定値（空＝自動）
  resolvedChatModel: string; // 実際に使用されるチャットモデル（自動選択の結果）
  resolvedEmbedModel: string; // 実際に使用される埋め込みモデル
  queue?: QueueStatus; // キュー稼働状況
  error?: string;
}

export const LLM_CONFIG_KEY = 'llm.config';

export const LLM_PROVIDER_BASE_URLS: Record<Exclude<LlmProvider, 'custom'>, string> = {
  lmstudio: 'http://localhost:1234/v1',
  ollama: 'http://localhost:11434/v1',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  mistral: 'https://api.mistral.ai/v1',
};

const PROVIDERS = new Set<LlmProvider>([
  'lmstudio', 'ollama', 'openai', 'openrouter', 'groq', 'gemini', 'mistral', 'custom',
]);

/** ベースURLのホストからプロバイダーを推測するための対応表。 */
const PROVIDER_HOSTS: readonly [string, LlmProvider][] = [
  ['api.openai.com', 'openai'],
  ['openrouter.ai', 'openrouter'],
  ['api.groq.com', 'groq'],
  ['generativelanguage.googleapis.com', 'gemini'],
  ['api.mistral.ai', 'mistral'],
];

/** ローカルLLMの既定ポート。 */
const PROVIDER_PORTS: readonly [string, LlmProvider][] = [
  ['11434', 'ollama'],
  ['1234', 'lmstudio'],
];

/**
 * プロバイダー名を決める。明示指定が有効ならそれを使い、無ければベースURLから推測する。
 *
 * 推測はホストとポートの完全一致で行う。部分一致だと
 * `https://api.openai.com.example.net/` のような別ホストや、パスに `1234` を
 * 含むだけのURLまで拾ってしまうため。
 */
export function normalizeProvider(value: unknown, baseUrl = ''): LlmProvider {
  if (typeof value === 'string' && PROVIDERS.has(value as LlmProvider)) return value as LlmProvider;
  if (!baseUrl) return 'lmstudio';

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return 'custom';
  }
  const host = parsed.hostname.toLowerCase();

  const byPort = PROVIDER_PORTS.find(([port]) => parsed.port === port);
  if (byPort && (host === 'localhost' || host === '127.0.0.1' || host === 'host.docker.internal')) {
    return byPort[1];
  }
  const byHost = PROVIDER_HOSTS.find(([known]) => host === known || host.endsWith(`.${known}`));
  if (byHost) return byHost[1];
  if (byPort) return byPort[1];
  return 'custom';
}

const envProvider = normalizeProvider(process.env.LLM_PROVIDER, process.env.LLM_BASE_URL || '');
const envApiKeyHeader: LlmApiKeyHeader = ['api-key', 'x-api-key'].includes(process.env.LLM_API_KEY_HEADER || '')
  ? process.env.LLM_API_KEY_HEADER as LlmApiKeyHeader
  : 'authorization';

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  enabled: false,
  provider: envProvider,
  baseUrl: process.env.LLM_BASE_URL || LLM_PROVIDER_BASE_URLS[envProvider === 'custom' ? 'lmstudio' : envProvider],
  apiKey: process.env.LLM_API_KEY || '',
  apiKeyHeader: envApiKeyHeader,
  chatModel: '',
  embedModel: '',
  temperature: 0.3,
  maxTokens: 2048, // 思考(<think>)出力に消費されても回答が残るよう余裕をもたせる
  timeoutMs: 120000, // ローカル8B級＋初回ロードを考慮しやや長め
  indexedAppIds: [],
  chunkSize: 800,
  chunkOverlap: 100,
  maxConcurrency: 1, // LM Studioは実質直列なので既定1
  maxQueue: 32,
  queueTimeoutMs: 120000,
  autoLoadModel: true,
  unloadPrevious: true,
  lmsPath: '',
};
