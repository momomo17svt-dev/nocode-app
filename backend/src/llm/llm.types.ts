// ローカルLLM（LM Studio 等の OpenAI 互換サーバ）接続設定。Setting キー 'llm.config' に保存する。
export interface LlmConfig {
  enabled: boolean;
  baseUrl: string; // OpenAI互換のベースURL（例: http://localhost:1234/v1）
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

export const DEFAULT_LLM_CONFIG: LlmConfig = {
  enabled: false,
  baseUrl: process.env.LLM_BASE_URL || 'http://localhost:1234/v1',
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
