import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { spawn } from 'child_process';
import { PrismaService } from '../prisma/prisma.service';
import { LlmQueue } from './llm-queue';
import {
  ChatMessage,
  DEFAULT_LLM_CONFIG,
  LlmConfig,
  LlmHealth,
  LLM_PROVIDER_BASE_URLS,
  LLM_CONFIG_KEY,
  ModelInfo,
  ModelKind,
  normalizeProvider,
  PublicLlmConfig,
  QueueStatus,
} from './llm.types';

/** キュー優先度（大きいほど先に処理）。対話を最優先、背景インデックスは最後尾。 */
export const LLM_PRIORITY = { interactive: 10, search: 8, warmup: 5, index: 1 };

interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  model?: string;
  priority?: number; // キュー優先度
  onQueued?: (info: { position: number; waiting: number }) => void; // 順番待ちに入った時
}

interface EmbedOptions {
  priority?: number;
}

/**
 * LM Studio などの OpenAI 互換ローカルLLMサーバへの薄いクライアント。
 * 追加依存を避けるため Node 標準の fetch を使用し、AbortController でタイムアウト制御する。
 * すべての重い呼び出し（chat/embed）は LlmQueue で直列化し、混雑時は順番待ちにする。
 */
@Injectable()
export class LlmService {
  private queue = new LlmQueue({
    maxConcurrency: DEFAULT_LLM_CONFIG.maxConcurrency,
    maxQueue: DEFAULT_LLM_CONFIG.maxQueue,
    queueTimeoutMs: DEFAULT_LLM_CONFIG.queueTimeoutMs,
  });
  // 現在ロード中のモデルID（用途別）。状態表示用。
  private loadingState: { chat?: string; embed?: string } = {};

  constructor(private prisma: PrismaService) {}

  // ===== 設定 =====
  async getConfig(): Promise<LlmConfig> {
    const row = await this.prisma.setting.findUnique({ where: { key: LLM_CONFIG_KEY } });
    const saved = (row?.value as Partial<LlmConfig>) || {};
    const cfg: LlmConfig = {
      ...DEFAULT_LLM_CONFIG,
      ...saved,
      provider: normalizeProvider(saved.provider, saved.baseUrl || DEFAULT_LLM_CONFIG.baseUrl),
      apiKey: typeof saved.apiKey === 'string' ? saved.apiKey : DEFAULT_LLM_CONFIG.apiKey,
    };
    // キュー設定を最新化（同時実行数を増やした場合は待機中を起こす）
    this.queue.setConfig({
      maxConcurrency: cfg.maxConcurrency,
      maxQueue: cfg.maxQueue,
      queueTimeoutMs: cfg.queueTimeoutMs,
    });
    return cfg;
  }

  async getPublicConfig(): Promise<PublicLlmConfig> {
    return this.toPublicConfig(await this.getConfig());
  }

  toPublicConfig(cfg: LlmConfig): PublicLlmConfig {
    const { apiKey, ...visible } = cfg;
    return { ...visible, apiKey: '', apiKeyConfigured: Boolean(apiKey) };
  }

  async saveConfig(patch: Partial<LlmConfig>, clearApiKey = false): Promise<LlmConfig> {
    const current = await this.getConfig();
    // DTOインスタンスは未送信の任意プロパティを undefined として持つため、
    // そのまま展開すると既存値を消してしまう。undefined のキーは無視する。
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<LlmConfig>;
    // 空欄は「保存済みキーを維持」。削除はclearApiKeyを明示した場合だけ行う。
    if (!defined.apiKey?.trim()) delete defined.apiKey;
    const next: LlmConfig = { ...current, ...defined };
    // 値域の正規化
    next.provider = normalizeProvider(next.provider, next.baseUrl);
    // 別プロバイダーへ旧キーを誤送信しない。切替時は新しいキーが同時指定された場合だけ引き継ぐ。
    if (clearApiKey || (next.provider !== current.provider && !defined.apiKey)) next.apiKey = '';
    next.temperature = clamp(Number(next.temperature) || 0, 0, 2);
    next.maxTokens = clamp(Math.round(Number(next.maxTokens) || 1024), 16, 32000);
    next.timeoutMs = clamp(Math.round(Number(next.timeoutMs) || 60000), 1000, 600000);
    next.chunkSize = clamp(Math.round(Number(next.chunkSize) || 800), 100, 4000);
    next.chunkOverlap = clamp(Math.round(Number(next.chunkOverlap) || 0), 0, 1000);
    next.maxConcurrency = clamp(Math.round(Number(next.maxConcurrency) || 1), 1, 8);
    next.maxQueue = clamp(Math.round(Number(next.maxQueue) || 32), 1, 500);
    next.queueTimeoutMs = clamp(Math.round(Number(next.queueTimeoutMs) || 120000), 1000, 600000);
    next.lmsPath = (next.lmsPath || '').trim();
    next.apiKey = (next.apiKey || '').trim();
    next.apiKeyHeader = ['authorization', 'api-key', 'x-api-key'].includes(next.apiKeyHeader)
      ? next.apiKeyHeader
      : 'authorization';
    const providerDefault = next.provider === 'custom'
      ? DEFAULT_LLM_CONFIG.baseUrl
      : LLM_PROVIDER_BASE_URLS[next.provider];
    next.baseUrl = (next.baseUrl || providerDefault).replace(/\/+$/, '');
    next.indexedAppIds = Array.isArray(next.indexedAppIds) ? next.indexedAppIds.map(String) : [];
    await this.prisma.setting.upsert({
      where: { key: LLM_CONFIG_KEY },
      update: { value: next as any },
      create: { key: LLM_CONFIG_KEY, value: next as any },
    });
    this.queue.setConfig({ maxConcurrency: next.maxConcurrency, maxQueue: next.maxQueue, queueTimeoutMs: next.queueTimeoutMs });

    // モデルの自動ロードはLM Studio専用。クラウドAPIで意図しない課金リクエストを送らない。
    if (next.provider === 'lmstudio' && next.enabled && next.autoLoadModel) {
      if (next.chatModel && next.chatModel !== current.chatModel) {
        void this.loadModel(next.chatModel, 'chat').catch(() => {});
      }
      if (next.embedModel && next.embedModel !== current.embedModel) {
        void this.loadModel(next.embedModel, 'embed').catch(() => {});
      }
    }
    return next;
  }

  // ===== ヘルスチェック =====
  async health(): Promise<LlmHealth> {
    const cfg = await this.getConfig();
    const base: LlmHealth = {
      ok: false,
      enabled: cfg.enabled,
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      models: [],
      modelList: [],
      chatModel: cfg.chatModel,
      embedModel: cfg.embedModel,
      resolvedChatModel: '',
      resolvedEmbedModel: '',
      queue: this.queueStatus(),
    };
    try {
      const list = await this.listModels(cfg);
      return {
        ...base,
        ok: true,
        models: list.map((m) => m.id),
        modelList: list,
        resolvedChatModel: cfg.chatModel || pickModel(list, 'chat')?.id || '',
        resolvedEmbedModel: cfg.embedModel || pickModel(list, 'embed')?.id || '',
      };
    } catch (e: any) {
      return { ...base, error: friendly(e, cfg) };
    }
  }

  /** キュー稼働状況＋モデル読込状態（LM Studio非接触・軽量）。 */
  queueStatus(): QueueStatus {
    return { ...this.queue.stats(), loading: { ...this.loadingState } };
  }

  /**
   * 利用可能モデルを種別・ロード状態つきで取得。
   * まず LM Studio ネイティブAPI(/api/v0/models, type/state付き)を試し、
   * 無ければ OpenAI互換(/v1/models, ID のみ)へフォールバックし名前から種別を推測する。
   */
  async listModels(cfg?: LlmConfig): Promise<ModelInfo[]> {
    cfg = cfg || (await this.getConfig());
    if (cfg.provider === 'lmstudio') {
      // LM StudioだけはネイティブAPIからモデル種別とロード状態を取得できる。
      try {
        const res = await this.rawUrl(`${this.lmStudioOrigin(cfg)}/api/v0/models`, { method: 'GET' }, cfg, 8000);
        const json: any = await res.json();
        const data: any[] = Array.isArray(json?.data) ? json.data : [];
        if (data.length) {
          return data
            .filter((m) => m?.id)
            .map((m) => ({ id: String(m.id), type: normalizeKind(m.type, m.id), loaded: m.state ? m.state === 'loaded' : true }));
        }
      } catch {
        /* OpenAI互換へフォールバック */
      }
    }
    // 2) OpenAI互換 /models（ID のみ → 名前で種別推測。ロード状態は不明なので true 扱い）
    const res = await this.raw('/models', { method: 'GET' }, cfg, 8000);
    const json: any = await res.json();
    const data: any[] = Array.isArray(json?.data) ? json.data : [];
    return data.filter((m) => m?.id).map((m) => ({ id: String(m.id), type: normalizeKind(undefined, m.id), loaded: true }));
  }

  // ===== モデルのロード / 解放 =====
  /**
   * 指定モデルを LM Studio 側でロード（必要なら直前の同種モデルを解放）する。
   * ロードは対象モデルへの最小ウォームアップ要求でJIT常駐させ、解放は lms CLI（任意）で行う。
   */
  async loadModel(model: string, kind: 'chat' | 'embed'): Promise<void> {
    if (!model) return;
    const cfg = await this.getConfig();
    if (cfg.provider !== 'lmstudio') {
      throw new BadRequestException('モデルの手動読み込みはLM Studio接続時のみ利用できます。');
    }
    this.loadingState[kind] = model;
    try {
      // 直前の同種ロード済みモデル（対象以外）を解放（lms CLI 設定時のみ）
      if (cfg.unloadPrevious && cfg.lmsPath) {
        const loaded = await this.listModels(cfg).catch(() => [] as ModelInfo[]);
        const sameKind = loaded.filter(
          (m) => m.loaded && m.id !== model && (kind === 'embed' ? isEmbedInfo(m) : !isEmbedInfo(m)),
        );
        for (const m of sameKind) await this.lmsUnload(cfg.lmsPath, m.id);
      }
      // ウォームアップでJITロード（キュー経由・中優先度）
      if (kind === 'embed') {
        await this.queue.enqueue(() => this.rawEmbed(['warmup'], model, cfg), { priority: LLM_PRIORITY.warmup });
      } else {
        await this.queue.enqueue(
          () => this.rawChat([{ role: 'user', content: 'hi' }], model, { maxTokens: 1 }, cfg),
          { priority: LLM_PRIORITY.warmup },
        );
      }
    } finally {
      if (this.loadingState[kind] === model) delete this.loadingState[kind];
    }
  }

  /** lms CLI でモデルを解放（ベストエフォート・失敗は無視）。lmsPath は実行ファイルのフルパス推奨。 */
  private lmsUnload(lmsPath: string, model: string): Promise<void> {
    return new Promise((resolve) => {
      try {
        const child = spawn(lmsPath, ['unload', model], { stdio: 'ignore', shell: false });
        child.on('error', () => resolve());
        child.on('close', () => resolve());
      } catch {
        resolve();
      }
    });
  }

  // ===== チャット =====
  async chat(messages: ChatMessage[], opts: ChatOptions = {}): Promise<string> {
    const cfg = await this.getConfig();
    const model = opts.model || (await this.resolveChatModel(cfg));
    return this.queue.enqueue(() => this.rawChat(messages, model, opts, cfg), {
      priority: opts.priority ?? LLM_PRIORITY.interactive,
      onQueued: opts.onQueued,
    });
  }

  /** チャットのHTTP実行（キュー内で動く本体）。 */
  private async rawChat(messages: ChatMessage[], model: string, opts: ChatOptions, cfg: LlmConfig): Promise<string> {
    const res = await this.raw(
      '/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? cfg.temperature,
          max_tokens: opts.maxTokens ?? cfg.maxTokens,
          stream: false,
        }),
      },
      cfg,
    );
    const json: any = await res.json();
    if (json?.error) throw new ServiceUnavailableException(json.error.message || 'LLM APIがエラーを返しました');
    const msg = json?.choices?.[0]?.message || {};
    const content = stripThink(msg.content || '').trim();
    if (content) return content;
    // 推論モデルが content を空にして reasoning_content にだけ出力した場合のフォールバック
    return stripThink(msg.reasoning_content || '').trim();
  }

  /**
   * ストリーミングチャット。delta テキストを onToken に都度渡し、完了時に全文を返す。
   * SSE のパースは本メソッド内で行い、呼び出し側（コントローラ）が出典付きで再配信する。
   * 混雑時はキューで順番待ちし、onQueued に待ち位置を通知する。
   */
  async chatStream(
    messages: ChatMessage[],
    onToken: (t: string) => void,
    opts: ChatOptions = {},
  ): Promise<string> {
    const cfg = await this.getConfig();
    const model = opts.model || (await this.resolveChatModel(cfg));
    return this.queue.enqueue(() => this.rawChatStream(messages, model, onToken, opts, cfg), {
      priority: opts.priority ?? LLM_PRIORITY.interactive,
      onQueued: opts.onQueued,
    });
  }

  /** ストリーミングのHTTP実行（キュー内で動く本体）。スロットはストリーム完走まで保持。 */
  private async rawChatStream(
    messages: ChatMessage[],
    model: string,
    onToken: (t: string) => void,
    opts: ChatOptions,
    cfg: LlmConfig,
  ): Promise<string> {
    const res = await this.raw(
      '/chat/completions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? cfg.temperature,
          max_tokens: opts.maxTokens ?? cfg.maxTokens,
          stream: true,
        }),
      },
      cfg,
      cfg.timeoutMs,
    );
    if (!res.body) {
      // ストリーム非対応時は通常応答へフォールバック
      const text = await this.rawChat(messages, model, opts, cfg);
      if (text) onToken(text);
      return text;
    }

    const reader = (res.body as any).getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let raw = ''; // 思考ブロック込みの生成全文（content）
    let reasoning = ''; // reasoning_content（推論チャネル）
    let emitted = 0; // onToken 済みの可視テキスト長
    const flush = (final: boolean) => {
      let vis = visibleSoFar(raw);
      // 途中では末尾の未完タグらしき部分（<thi 等）を保留し、誤って出力しない
      if (!final) vis = vis.replace(/<[a-z/]{0,9}$/i, '');
      if (vis.length > emitted) {
        onToken(vis.slice(emitted));
        emitted = vis.length;
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || ''; // 未完行は次回へ
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        const payload = t.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta || {};
          if (delta.content) raw += delta.content;
          if (delta.reasoning_content) reasoning += delta.reasoning_content;
        } catch {
          // 分割されたJSON断片は無視（次チャンクで揃う）
        }
      }
      flush(false);
    }
    flush(true);
    const out = visibleSoFar(raw).trim();
    if (out) return out;
    // content が空で reasoning にだけ出力された推論モデルのフォールバック
    const r = stripThink(reasoning).trim();
    if (r) onToken(r);
    return r;
  }

  // ===== 埋め込み =====
  async embed(texts: string[], model?: string, opts: EmbedOptions = {}): Promise<number[][]> {
    if (texts.length === 0) return [];
    const cfg = await this.getConfig();
    const useModel = model || (await this.resolveEmbedModel(cfg));
    return this.queue.enqueue(() => this.rawEmbed(texts, useModel, cfg), {
      priority: opts.priority ?? LLM_PRIORITY.search,
    });
  }

  /** 埋め込みのHTTP実行（キュー内で動く本体）。 */
  private async rawEmbed(texts: string[], model: string, cfg: LlmConfig): Promise<number[][]> {
    const res = await this.raw(
      '/embeddings',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, input: texts }),
      },
      cfg,
    );
    const json: any = await res.json();
    if (json?.error) throw new ServiceUnavailableException(json.error.message || '埋め込みの生成に失敗しました');
    const data: any[] = Array.isArray(json?.data) ? json.data : [];
    // index 順に整列して返す
    return data
      .slice()
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((d) => d.embedding as number[]);
  }

  // ===== モデル自動解決 =====
  /** 使用するチャットモデルを決定（設定値優先、空ならロード済みのチャット系を自動選択）。 */
  private async resolveChatModel(cfg: LlmConfig): Promise<string> {
    if (cfg.chatModel) return cfg.chatModel;
    const picked = pickModel(await this.listModels(cfg), 'chat');
    if (!picked) {
      throw new ServiceUnavailableException(
        `チャット用モデルが見つかりません。${providerLabel(cfg.provider)}のモデル名を設定してください。`,
      );
    }
    return picked.id;
  }

  /** 使用する埋め込みモデルを決定（設定値優先、空ならロード済みの埋め込み系を自動選択）。 */
  async resolveEmbedModel(cfg?: LlmConfig): Promise<string> {
    cfg = cfg || (await this.getConfig());
    if (cfg.embedModel) return cfg.embedModel;
    const picked = pickModel(await this.listModels(cfg), 'embed');
    if (!picked) {
      throw new ServiceUnavailableException(
        `埋め込み用モデルが見つかりません。${providerLabel(cfg.provider)}の埋め込みモデル名を設定してください。`,
      );
    }
    return picked.id;
  }

  /**
   * 画像入力（OCR/VLM）に使うモデルを決定。設定のチャットモデルが視覚対応とは限らないため、
   * 常にロード済みの vlm を優先して自動選択する（無ければ llm 等にフォールバック）。
   */
  async resolveVisionModel(cfg?: LlmConfig): Promise<string> {
    cfg = cfg || (await this.getConfig());
    const picked = pickModel(await this.listModels(cfg), 'vision');
    if (!picked) {
      throw new ServiceUnavailableException(
        `画像読み取りに使えるモデルが見つかりません。${providerLabel(cfg.provider)}の視覚対応モデル名を設定してください。`,
      );
    }
    return picked.id;
  }

  // ===== 内部 =====
  /** baseUrl(...:1234/v1) から LM Studio ネイティブAPIのオリジン(...:1234)を得る。 */
  private lmStudioOrigin(cfg: LlmConfig): string {
    return cfg.baseUrl.replace(/\/v\d+$/, '');
  }

  private raw(path: string, init: RequestInit, cfg: LlmConfig, timeoutMs?: number): Promise<Response> {
    const queryAt = cfg.baseUrl.indexOf('?');
    const basePath = queryAt >= 0 ? cfg.baseUrl.slice(0, queryAt) : cfg.baseUrl;
    const query = queryAt >= 0 ? cfg.baseUrl.slice(queryAt) : '';
    return this.rawUrl(`${basePath.replace(/\/+$/, '')}${path}${query}`, init, cfg, timeoutMs);
  }

  private async rawUrl(url: string, init: RequestInit, cfg: LlmConfig, timeoutMs?: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs ?? cfg.timeoutMs);
    try {
      const headers = new Headers(init.headers);
      if (cfg.apiKey) {
        if (cfg.apiKeyHeader === 'authorization') headers.set('Authorization', `Bearer ${cfg.apiKey}`);
        else headers.set(cfg.apiKeyHeader, cfg.apiKey);
      }
      const res = await fetch(url, { ...init, headers, signal: controller.signal });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        let detail = body.slice(0, 300);
        try {
          const pj = JSON.parse(body);
          detail = pj?.error?.message || pj?.message || detail;
        } catch {
          /* テキストのまま使う */
        }
        if (/load model|model_not_found|no model/i.test(detail)) {
          throw new ServiceUnavailableException(
            `モデルを利用できませんでした。${providerLabel(cfg.provider)}のモデル名と利用状態をご確認ください（${detail.slice(0, 160)}）`,
          );
        }
        throw new ServiceUnavailableException(`LLM APIがエラーを返しました (${res.status}): ${detail.slice(0, 200)}`);
      }
      return res;
    } catch (e: any) {
      if (e?.status) throw e; // 既に HttpException
      throw new ServiceUnavailableException(friendly(e, cfg));
    } finally {
      clearTimeout(timer);
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

// ローカルモデルが出す思考ブロック（<think>等）を除去。回答テキストだけを残す。
const THINK_TAGS = ['think', 'thinking', 'reasoning'];
function stripThink(text: string): string {
  if (!text) return text || '';
  let t = text;
  for (const tag of THINK_TAGS) {
    t = t.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi'), '');
  }
  return t;
}
/** ストリーミング途中で安全に表示できる可視テキスト（未クローズの思考ブロック以降は保留）。 */
function visibleSoFar(raw: string): string {
  let t = stripThink(raw);
  const open = t.match(/<(think|thinking|reasoning)>/i);
  if (open) t = t.slice(0, open.index); // 閉じていない思考は出さない
  return t;
}

/** LM Studio の type 文字列、または ID 名から種別を正規化する。 */
function normalizeKind(type: string | undefined, id: string): ModelKind {
  const t = (type || '').toLowerCase();
  if (t === 'embeddings' || t === 'embedding') return 'embeddings';
  if (t === 'vlm') return 'vlm';
  if (t === 'llm') return 'llm';
  // type 不明時は ID 名から推測
  return /embed/i.test(id) ? 'embeddings' : 'unknown';
}

/** モデルが埋め込み用か（種別 or 名前から判定）。 */
function isEmbedInfo(m: ModelInfo): boolean {
  return m.type === 'embeddings' || (m.type === 'unknown' && /embed/i.test(m.id));
}

/**
 * 用途に合うモデルを選ぶ（ロード済みを優先）。
 *   chat  … llm / vlm / unknown(埋め込み名でない) から
 *   embed … embeddings / unknown(埋め込み名) から
 */
function pickModel(list: ModelInfo[], kind: 'chat' | 'embed' | 'vision'): ModelInfo | undefined {
  let candidates: ModelInfo[];
  if (kind === 'embed') {
    candidates = list.filter((m) => m.type === 'embeddings' || (m.type === 'unknown' && /embed/i.test(m.id)));
  } else if (kind === 'vision') {
    // まず vlm。無ければ画像対応かもしれない llm/unknown もフォールバック候補に。
    candidates = list.filter((m) => m.type === 'vlm');
    if (candidates.length === 0) {
      candidates = list.filter((m) => m.type === 'llm' || (m.type === 'unknown' && !/embed/i.test(m.id)));
    }
  } else {
    candidates = list.filter((m) => m.type === 'llm' || m.type === 'vlm' || (m.type === 'unknown' && !/embed/i.test(m.id)));
  }
  return candidates.find((m) => m.loaded) || candidates[0];
}

function providerLabel(provider: LlmConfig['provider']): string {
  return {
    lmstudio: 'LM Studio',
    ollama: 'Ollama',
    openai: 'OpenAI',
    openrouter: 'OpenRouter',
    groq: 'Groq',
    gemini: 'Gemini',
    mistral: 'Mistral',
    custom: 'OpenAI互換API',
  }[provider];
}

function friendly(e: any, cfg: LlmConfig): string {
  const msg = String(e?.message || e || '');
  if (e?.name === 'AbortError' || /aborted/i.test(msg)) {
    return `${providerLabel(cfg.provider)}の応答がタイムアウトしました。接続先とモデルの状態をご確認ください。`;
  }
  if (/ECONNREFUSED|fetch failed|Failed to fetch|ENOTFOUND/i.test(msg)) {
    return `${providerLabel(cfg.provider)}に接続できません。ベースURL、APIキー、サーバーの起動状態をご確認ください。`;
  }
  return msg || `${providerLabel(cfg.provider)}との通信に失敗しました。`;
}
