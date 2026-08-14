import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../permissions/permission.service';
import { LlmService } from '../llm/llm.service';
import { EmbeddingService } from './embedding.service';
import { formatValue, recordToText, type FieldLite } from '../common/record-text.util';
import { sanitizeDefinition } from '../common/app-definition.util';
import { ChatMessage } from '../llm/llm.types';
import { DocumentsService } from './documents.service';

/** 順番待ちに入った時の通知（待ち位置とキュー長）。 */
export type QueuedCb = (info: { position: number; waiting: number }) => void;

export interface SearchHit {
  source: 'record' | 'document';
  appId: string | null;
  appName?: string;
  recordId?: string | null;
  docId?: string | null;
  title: string;
  snippet: string;
  score: number;
  // 行政文書（docKind=gov）のチャンクのみ。条番号引用・閲覧ジャンプ用。
  structPath?: string | null;
  structLabel?: string | null;
  structAnchor?: string | null;
}

export type SearchSourceMode = 'records' | 'knowledge' | 'both';
export type ChatSourceMode = 'plain' | SearchSourceMode;

interface SearchOptions {
  k?: number;
  docId?: string;
  appId?: string;
  sourceMode?: SearchSourceMode;
}

interface AskOptions extends Omit<SearchOptions, 'sourceMode'> {
  sourceMode?: ChatSourceMode;
}

const RAG_SYSTEM_PROMPT = `あなたは社内データに基づいて回答する日本語アシスタントです。
以下のルールを厳守してください。
- 与えられた「参考コンテキスト」に書かれている情報だけを根拠に、簡潔な日本語で回答する。
- コンテキストに該当情報が無い場合は「資料に該当する情報が見つかりませんでした」と述べ、推測で答えない。
- 回答の最後に、根拠にした参考番号（例: [1][3]）を示す。
- 参考に条番号（第○条第○項など）が示されている場合は、本文中でも該当する条番号を明示して引用する。`;

const PLAIN_CHAT_SYSTEM_PROMPT = `あなたは日本語で応答するAIアシスタントです。
ユーザーの依頼に、簡潔で分かりやすく回答してください。
この会話では社内のアプリデータやナレッジを参照していません。社内情報を求められた場合は、推測せず「参照範囲をアプリデータまたはナレッジに切り替えてください」と案内してください。`;

// モデルが空応答（思考のみ・トークン超過など）を返したときに表示する案内。
const EMPTY_ANSWER =
  'AIから回答テキストを取得できませんでした。モデルが思考(<think>)のみを返したか、最大トークン数に達した可能性があります。AI設定で「最大トークン数」を増やすか、別のモデルでお試しください。';

// RAG回答で文脈に採用する最小コサイン関連度。bge-m3 の関連一致は概ね 0.5+ で、
// これ未満は弱い一致＝無関係への強制回答を生むため文脈から除外する（必要なら調整可）。
const MIN_RAG_SCORE = 0.45;

// 無関係な資料を根拠に回答させないための固定応答。
const NO_RAG_MATCH =
  '選択した参照範囲に関連情報が見つかりませんでした。対象のアプリ・ナレッジを選び直すか、条件を加えて質問してください。';

function smallTalkReply(sourceMode: SearchSourceMode): string {
  if (sourceMode === 'records') return 'こんにちは。アプリデータについて、知りたいことを質問してください。';
  if (sourceMode === 'knowledge') return 'こんにちは。ナレッジに登録された資料について、知りたいことを質問してください。';
  return 'こんにちは。アプリデータやナレッジについて、知りたいことを質問してください。';
}

// 挨拶・謝辞などの雑談トークン（句読点・絵文字・空白を除いた全文がこれだけなら短絡）。
const SMALL_TALK_TOKENS = new Set([
  'こんにちは', 'こんにちわ', 'こんばんは', 'こんばんわ', 'おはよう', 'おはようございます',
  'はじめまして', 'よろしく', 'よろしくお願いします', 'やあ', 'どうも',
  'ありがとう', 'ありがとうございます', 'あざす', 'お疲れ様', 'お疲れ', 'おつかれ', 'おつかれさま',
  'テスト', 'てすと', 'hello', 'hi', 'hey', 'yo', 'test', 'thanks', 'thankyou',
]);

/** 入力が挨拶・雑談だけ（知識クエリでない）かどうか。 */
function isSmallTalk(q: string): boolean {
  // 記号・空白・絵文字を除去して素のトークンにする（「こんにちは！」「hi :)」等を吸収）。
  const bare = (q || '')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .trim();
  if (!bare) return false;
  return SMALL_TALK_TOKENS.has(bare);
}

const ANALYSIS_SYSTEM =
  'あなたは日本語のデータアナリストです。与えられた集計データとサンプルに基づき、傾向・特徴・注意すべき点・改善提案を簡潔な箇条書きでまとめてください。数値に基づき、与えられていない事実は推測しないこと。長い前置きや思考の説明は省き、結論だけを出力してください。';

const TEMPLATE_SYSTEM = `あなたはノーコード業務アプリ基盤の設計者です。ユーザーの要望から、アプリ定義をJSONのみで出力します（前置き・説明・コードフェンスは禁止）。

# 出力スキーマ
{
  "name": "アプリ名(日本語)",
  "description": "用途の説明",
  "recordViewScope": "all",
  "recordEditScope": "all",
  "fields": [ { "fieldCode": "snake_case英字", "fieldType": "種別", "label": "日本語ラベル", "required": false, "settings": {} } ],
  "processConfig": { "enabled": true, "statusField": "ステータス項目のfieldCode", "statuses": ["申請中","承認","却下"], "actions": [ {"from":"申請中","to":"承認","label":"承認する"} ] },
  "aiConfig": { "actions": [ {"id":"act1","name":"返信文を作成","prompt":"{customer} 宛に {inquiry} への丁寧な返信を作成","output":"field","targetField":"reply"} ] }
}

# フィールド種別(fieldType)
text(1行) / textarea(複数行) / number(数値) / date / datetime / select,radio,checkbox(選択肢: settings.options:["A","B"] 必須) / status(ステータス: options必須) / user_select(担当者) / file(添付) / link / email / phone / location(位置・地図: settingsは不要。値は{lat,lng,label}形式で保存される) / calc(settings.formula 例 "price * qty") / ai(AI生成項目: settings.prompt に {他項目コード} を差し込む) / section(見出し) / subtable(明細・1対多の繰り返し行: settings.columns:[{"fieldCode","fieldType","label","settings"}] 形式で列を定義。列のfieldTypeは text/textarea/number/date/datetime/select,radio,checkbox(列でも settings.options 必須)/calc/phone/email/link が使える。続柄や区分など選択肢が決まる列は text ではなく select+options にする。例 {"fieldCode":"items","fieldType":"subtable","label":"明細","settings":{"columns":[{"fieldCode":"name","fieldType":"text","label":"品目","settings":{}},{"fieldCode":"qty","fieldType":"number","label":"数量","settings":{}}]}}) / reference(他アプリのレコード参照: settingsは基本不要、参照先はアプリ設定で指定)

# ルール
- fieldCode は英小文字・数字・アンダースコアのみ（例: customer_name）。日本語にしない。重複させない。labelは日本語。
- 選択系・status には settings.options を必ず付ける。
- ステータスで進捗管理するなら status 項目を作り processConfig を設定（statusField=その項目, statuses は options と一致, actions の from/to は statuses 内）。
- 要望に合えば ai 項目（例: 要約・分類）や aiConfig.actions（例: 返信文作成・次アクション提案）を1〜2個提案。prompt には関連項目を {fieldCode} で差し込む。
- 訪問先・店舗・物件・現場・設備・配送先・施設など「場所」を扱う要望なら location 項目を使う（住所をtextで持つだけで済ませない）。
- 「1人の社員に複数の家族」「1伝票に複数明細」「1案件に複数ToDo」のような1対多・繰り返し行は subtable を使う（同じ親項目を持つ複数レコードに分けない）。子項目は subtable の settings.columns 内に定義する。
- 項目は5〜12個程度（subtable の columns はこの個数に数えない）。JSONオブジェクトだけを出力する。`;

@Injectable()
export class AiService {
  constructor(
    private prisma: PrismaService,
    private permission: PermissionService,
    private llm: LlmService,
    private emb: EmbeddingService,
    private docs: DocumentsService,
  ) {}

  // ===== セマンティック検索 =====
  async search(userId: string, role: string, query: string, opts: SearchOptions = {}): Promise<{ hits: SearchHit[] }> {
    const q = (query || '').trim();
    if (!q) return { hits: [] };
    const k = Math.min(Math.max(opts.k ?? 8, 1), 20);

    const [qvec] = await this.llm.embed([q]);
    if (!qvec || qvec.length === 0) return { hits: [] };

    const sourceMode = opts.sourceMode || 'both';
    const [visibleApps, visibleDocs] = await Promise.all([
      this.permission.visibleAppIds(userId, role),
      sourceMode === 'records' && !opts.docId ? Promise.resolve([] as string[]) : this.docs.visibleIds(userId, role),
    ]);
    const rows = await this.candidateRows(visibleApps, visibleDocs, opts);
    if (rows.length === 0) return { hits: [] };

    const scored = rows
      .map((r) => ({ r, score: this.emb.cosine(qvec, (r.vector as any) || []) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);

    // owner/org公開範囲アプリの最終フィルタ（アクセス可能な作成者のレコードのみ）
    const restricted = await this.restrictedAppCreators(userId, role, visibleApps);
    const recordOk = await this.recordOkSet(scored, restricted);
    // 対象社員フィールド基準アプリの最終フィルタ（対象社員が管轄外のレコードを除外）
    const fieldBlocked = await this.fieldScopeBlockedRecordIds(scored, userId, role);

    const appNames = await this.appNameMap(scored.map((s) => s.r.appId).filter(Boolean) as string[]);

    const seen = new Set<string>();
    const hits: SearchHit[] = [];
    for (const s of scored) {
      const r = s.r;
      const key = r.source === 'record' ? `r:${r.recordId}` : `d:${r.docId}`;
      if (seen.has(key)) continue;
      if (r.source === 'record' && r.appId && restricted.has(r.appId) && !(r.recordId && recordOk.has(r.recordId))) continue;
      if (r.source === 'record' && r.recordId && fieldBlocked.has(r.recordId)) continue;
      seen.add(key);
      const { title, snippet } = this.titleAndSnippet(r.content, r.source, r.structLabel);
      hits.push({
        source: r.source as any,
        appId: r.appId,
        appName: r.appId ? appNames[r.appId] : undefined,
        recordId: r.recordId,
        docId: r.docId,
        title,
        snippet,
        score: Math.round(s.score * 1000) / 1000,
        structPath: r.structPath ?? undefined,
        structLabel: r.structLabel ?? undefined,
        structAnchor: r.structAnchor ?? undefined,
      });
      if (hits.length >= k) break;
    }
    return { hits };
  }

  // ===== RAG Q&A =====
  async ask(userId: string, role: string, question: string, history?: ChatMessage[], opts: AskOptions = {}) {
    const sourceMode = this.resolveChatSourceMode(opts);
    if (sourceMode === 'plain') {
      const answer = await this.llm.chat(this.buildPlainMessages(question, history));
      return { answer: answer || EMPTY_ANSWER, sources: [] as SearchHit[] };
    }
    if (isSmallTalk(question)) return { answer: smallTalkReply(sourceMode), sources: [] as SearchHit[] };
    const { hits } = await this.search(userId, role, question, { ...opts, k: 6, sourceMode });
    // 弱い一致（関連度 < MIN_RAG_SCORE）は無関係への強制回答を生むため文脈・出典から除外。
    const strong = hits.filter((h) => h.score >= MIN_RAG_SCORE);
    if (strong.length === 0) return { answer: NO_RAG_MATCH, sources: [] as SearchHit[] };
    const messages = this.buildRagMessages(question, strong, history);
    const answer = await this.llm.chat(messages);
    return { answer: answer || EMPTY_ANSWER, sources: strong };
  }

  /** ストリーミング版。出典を先に通知し、その後トークンを逐次配信する。 */
  async askStream(
    userId: string,
    role: string,
    question: string,
    history: ChatMessage[] | undefined,
    cb: { onSources: (s: SearchHit[]) => void; onToken: (t: string) => void; onQueued?: QueuedCb },
    opts: AskOptions = {},
  ): Promise<void> {
    const sourceMode = this.resolveChatSourceMode(opts);
    if (sourceMode === 'plain') {
      cb.onSources([]);
      let emitted = 0;
      await this.llm.chatStream(
        this.buildPlainMessages(question, history),
        (t) => { emitted += t.length; cb.onToken(t); },
        { onQueued: cb.onQueued },
      );
      if (emitted === 0) cb.onToken(EMPTY_ANSWER);
      return;
    }
    if (isSmallTalk(question)) {
      cb.onSources([]);
      cb.onToken(smallTalkReply(sourceMode));
      return;
    }
    const { hits } = await this.search(userId, role, question, { ...opts, k: 6, sourceMode });
    const strong = hits.filter((h) => h.score >= MIN_RAG_SCORE);
    cb.onSources(strong);
    if (strong.length === 0) {
      cb.onToken(NO_RAG_MATCH);
      return;
    }
    const messages = this.buildRagMessages(question, strong, history);
    let emitted = 0;
    await this.llm.chatStream(messages, (t) => { emitted += t.length; cb.onToken(t); }, { onQueued: cb.onQueued });
    if (emitted === 0) cb.onToken(EMPTY_ANSWER); // 何も返らなかった場合の案内
  }

  private buildRagMessages(question: string, hits: SearchHit[], history?: ChatMessage[]): ChatMessage[] {
    const context = hits.length
      ? hits.map((h, i) => {
          // 行政文書は「題名 第○条」を見出しに（条番号引用を促す）。
          const label = h.structLabel ? h.title : h.appName || h.title;
          return `[${i + 1}] ${label}\n${h.snippet}`;
        }).join('\n\n')
      : '(該当する資料は見つかりませんでした)';
    const recent = (history || []).filter((m) => m.role !== 'system').slice(-6);
    return [
      { role: 'system', content: RAG_SYSTEM_PROMPT },
      ...recent,
      { role: 'user', content: `# 質問\n${question}\n\n# 参考コンテキスト\n${context}` },
    ];
  }

  private buildPlainMessages(question: string, history?: ChatMessage[]): ChatMessage[] {
    const recent = (history || []).filter((m) => m.role !== 'system').slice(-10);
    return [
      { role: 'system', content: PLAIN_CHAT_SYSTEM_PROMPT },
      ...recent,
      { role: 'user', content: question },
    ];
  }

  private resolveChatSourceMode(opts: AskOptions): ChatSourceMode {
    if (opts.docId) return 'knowledge';
    return opts.sourceMode || 'both';
  }

  // ===== AI分析（アプリ単位） =====
  /** 集計と分析用プロンプトを用意（非ストリーミング/ストリーミング共通）。 */
  private async prepareAnalysis(userId: string, role: string, appId: string) {
    await this.permission.assert(userId, role, appId, 'canView');
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException('アプリが見つかりません');
    const records = await this.scopedRecords(appId, userId, role);
    const fields = await this.prisma.field.findMany({ where: { appId } });
    const userMap = await this.userMap();
    const stats = this.aggregate(app, records, fields);
    const dataBlock = this.buildAnalysisBlock(app, records, fields, userMap, stats);
    return { app, records, stats, dataBlock };
  }

  async analyzeApp(userId: string, role: string, appId: string) {
    const { app, records, stats, dataBlock } = await this.prepareAnalysis(userId, role, appId);
    const insight = await this.llm.chat([
      { role: 'system', content: ANALYSIS_SYSTEM },
      { role: 'user', content: dataBlock },
    ]);
    return { appId, appName: app.name, recordCount: records.length, stats, insight: insight || EMPTY_ANSWER };
  }

  /** ストリーミング版。集計を先に通知し、AIインサイトを逐次配信する（遅い推論モデルでも結果が見える）。 */
  async analyzeAppStream(
    userId: string,
    role: string,
    appId: string,
    cb: { onStats: (s: any) => void; onToken: (t: string) => void; onQueued?: QueuedCb },
  ): Promise<void> {
    const { app, records, stats, dataBlock } = await this.prepareAnalysis(userId, role, appId);
    cb.onStats({ appId, appName: app.name, recordCount: records.length, stats });
    let emitted = 0;
    await this.llm.chatStream(
      [
        { role: 'system', content: ANALYSIS_SYSTEM },
        { role: 'user', content: dataBlock },
      ],
      (t) => { emitted += t.length; cb.onToken(t); },
      { maxTokens: 3072, onQueued: cb.onQueued }, // 推論モデルが思考に消費しても結論が残るよう余裕をもたせる
    );
    if (emitted === 0) cb.onToken(EMPTY_ANSWER);
  }

  // ===== AI分析（レコード単位） =====
  async analyzeRecord(userId: string, role: string, recordId: string, mode: 'summary' | 'next') {
    const rec = await this.prisma.record.findUnique({ where: { id: recordId } });
    if (!rec) throw new NotFoundException('レコードが見つかりません');
    await this.permission.assert(userId, role, rec.appId, 'canView');
    // owner/org公開範囲: アクセス可能な作成者のレコードのみ
    const allowed = await this.permission.allowedCreatorIds(rec.appId, userId, role, 'view');
    if (allowed && !allowed.includes(rec.createdBy)) {
      throw new ForbiddenException('このレコードを参照する権限がありません');
    }
    // 対象社員フィールド基準: 対象社員が管轄外なら参照不可
    const fieldScope = await this.permission.recordFieldScope(rec.appId, userId, role);
    if (fieldScope && !fieldScope.userIds.includes(String((rec.dataJson as any)?.[fieldScope.field] ?? ''))) {
      throw new ForbiddenException('このレコードを参照する権限がありません');
    }
    const app = await this.prisma.app.findUnique({ where: { id: rec.appId } });
    const fields = await this.prisma.field.findMany({ where: { appId: rec.appId } });
    const userMap = await this.userMap();
    const text = recordToText(
      fields.map((f) => ({ fieldCode: f.fieldCode, fieldType: f.fieldType, label: f.label, settings: f.settings as any })),
      (rec.dataJson as any) || {},
      userMap,
    );

    const instruction =
      mode === 'next'
        ? 'このレコードの内容を踏まえ、担当者が次に取るべき具体的なアクションを3点以内で日本語の箇条書きで提案してください。'
        : 'このレコードの内容を、要点を押さえて日本語で簡潔に要約してください。';
    const result = await this.llm.chat([
      { role: 'system', content: 'あなたは日本語の業務アシスタントです。与えられた情報のみに基づいて回答し、推測は避けてください。' },
      { role: 'user', content: `# アプリ\n${app?.name ?? ''}\n\n# レコード内容\n${text}\n\n# 指示\n${instruction}` },
    ]);
    return { recordId, appId: rec.appId, mode, result: result || EMPTY_ANSWER };
  }

  // ===== アプリ作成者が設計したプロンプト実行（AI項目 / AIアクション） =====
  /** プロンプトテンプレートの {code}/{_record} をレコード値へ置換する。 */
  private runTemplate(template: string, fields: any[], data: Record<string, any>, userMap: Record<string, string>): string {
    const lite = (f: any): FieldLite => ({ fieldCode: f.fieldCode, fieldType: f.fieldType, label: f.label, settings: f.settings });
    const fieldMap: Record<string, any> = {};
    for (const f of fields) fieldMap[f.fieldCode] = f;
    let out = template.replace(/\{_record\}/g, () => recordToText(fields.map(lite), data || {}, userMap));
    out = out.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, code) => {
      const f = fieldMap[code];
      if (!f) return m; // 未知コードはそのまま残す
      return formatValue(lite(f), (data || {})[code], userMap) || '';
    });
    return out;
  }

  /** AI項目/AIアクション/テスト用プロンプトを解決し、結果をストリーミング生成する。 */
  async generateStream(
    userId: string,
    role: string,
    appId: string,
    src: { fieldCode?: string; actionId?: string; prompt?: string },
    data: Record<string, any>,
    cb: { onToken: (t: string) => void; onQueued?: QueuedCb },
  ): Promise<void> {
    await this.permission.assert(userId, role, appId, 'canView');
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException('アプリが見つかりません');
    const fields = await this.prisma.field.findMany({ where: { appId } });
    const userMap = await this.userMap();

    let template = '';
    let maxTokens: number | undefined;
    if (src.fieldCode) {
      const f = fields.find((x) => x.fieldCode === src.fieldCode);
      const s = (f?.settings as any) || {};
      template = s.prompt || '';
      maxTokens = s.maxTokens;
      if (!template) throw new BadRequestException('このAI項目にはプロンプトが設定されていません');
    } else if (src.actionId) {
      const actions: any[] = ((app.aiConfig as any)?.actions) || [];
      const a = actions.find((x) => x.id === src.actionId);
      if (!a) throw new NotFoundException('AIアクションが見つかりません');
      template = a.prompt || '';
    } else if (src.prompt) {
      template = src.prompt; // 設定画面のテスト/プレビュー用
    }
    if (!template.trim()) throw new BadRequestException('プロンプトが空です');

    const resolved = this.runTemplate(template, fields, data || {}, userMap);
    let emitted = 0;
    await this.llm.chatStream(
      [
        { role: 'system', content: '指示に厳密に従い、余計な前置きや思考過程の説明は出さず、結果のテキストだけを日本語で返してください。' },
        { role: 'user', content: resolved },
      ],
      (t) => { emitted += t.length; cb.onToken(t); },
      { maxTokens: maxTokens || 1024, onQueued: cb.onQueued },
    );
    if (emitted === 0) cb.onToken(EMPTY_ANSWER);
  }

  // ===== 自然言語からアプリ定義（テンプレ）を生成 =====
  async generateTemplateStream(
    description: string,
    cb: { onProgress: (t: string) => void; onDefinition: (def: any) => void; onQueued?: QueuedCb },
  ): Promise<void> {
    const full = await this.llm.chatStream(
      [
        { role: 'system', content: TEMPLATE_SYSTEM },
        { role: 'user', content: `# アプリの要望\n${description}\n\n# 指示\n上記を実現するアプリ定義を、スキーマに従いJSONオブジェクトで1つだけ出力してください。` },
      ],
      (t) => cb.onProgress(t),
      { maxTokens: 3072, onQueued: cb.onQueued },
    );
    const parsed = extractJsonObject(full);
    if (!parsed) {
      throw new BadRequestException('AIの出力からアプリ定義を解析できませんでした。要望を具体的にして再度お試しください。');
    }
    const def = sanitizeDefinition(parsed);
    if (def.fields.length === 0) {
      throw new BadRequestException('有効な項目を生成できませんでした。要望を具体的にして再度お試しください。');
    }
    cb.onDefinition(def);
  }

  // ===== 自然言語からレコードを下書き =====
  async draftRecord(userId: string, role: string, appId: string, text: string) {
    const usable = await this.loadDraftFields(userId, role, appId);
    if (usable.length === 0) return { values: {}, filled: [] };

    const sys =
      'あなたは入力支援アシスタントです。ユーザーの文章から、指定されたフィールドに当てはまる値だけを抽出し、JSONオブジェクトのみを出力してください。前置き・説明・コードブロックは書かないこと。';
    const user = `# フィールド定義\n${this.draftSchemaText(usable)}\n\n# ルール\n- JSONのキーはフィールドコード。該当情報が無いキーは出力しない。\n- 選択肢型は必ず候補の中の語をそのまま使う。\n- 日付は YYYY-MM-DD、日時は YYYY-MM-DDTHH:mm 形式。\n- 複数値（チェックボックス等）は配列。\n- JSONオブジェクトのみを出力する。\n\n# ユーザーの文章\n${text}`;

    const rawText = await this.llm.chat(
      [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
      { temperature: 0.1 },
    );
    return this.applyDraft(usable, extractJsonObject(rawText));
  }

  // ===== 画像（書類・伝票・名刺等）を読み取ってレコードを下書き（VLM-OCR） =====
  async draftRecordFromImage(userId: string, role: string, appId: string, imageDataUrl: string) {
    const usable = await this.loadDraftFields(userId, role, appId);
    if (usable.length === 0) return { values: {}, filled: [] };

    // 視覚対応モデル（VLM）を自動選択。設定のチャットモデルは視覚非対応の場合があるため使わない。
    const model = await this.llm.resolveVisionModel();
    const sys =
      'あなたはOCR搭載の入力支援アシスタントです。画像（書類・伝票・名刺・手書きメモ等）に写っている文字を読み取り、指定フィールドに当てはまる値だけを抽出してJSONオブジェクトのみを出力してください。前置き・説明・コードブロックは書かないこと。';
    const userText = `# フィールド定義\n${this.draftSchemaText(usable)}\n\n# ルール\n- JSONのキーはフィールドコード。画像から読み取れないキーは出力しない。\n- 選択肢型は必ず候補の中の語をそのまま使う。\n- 日付は YYYY-MM-DD、日時は YYYY-MM-DDTHH:mm 形式。\n- 数字は半角。金額は通貨記号・カンマを除いた数値のみ。\n- 複数値（チェックボックス等）は配列。\n- JSONオブジェクトのみを出力する。\n\n画像を読み取り、上記フィールドの値を抽出してください。`;

    const rawText = await this.llm.chat(
      [
        { role: 'system', content: sys },
        {
          role: 'user',
          content: [
            { type: 'text', text: userText },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
      { temperature: 0.1, model },
    );
    return this.applyDraft(usable, extractJsonObject(rawText));
  }

  /** 下書き対象のフィールド（自動採番/計算/構造/添付/参照/位置/担当者は対象外）を取得。 */
  private async loadDraftFields(userId: string, role: string, appId: string) {
    await this.permission.assert(userId, role, appId, 'canView');
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException('アプリが見つかりません');
    const fields = await this.prisma.field.findMany({ where: { appId } });
    const skip = ['auto_number', 'calc', 'file', 'subtable', 'section', 'reference', 'location', 'user_select', 'group_select'];
    return fields.filter((f) => !skip.includes(f.fieldType));
  }

  /** フィールド定義をプロンプト用のテキストに整形。 */
  private draftSchemaText(usable: { fieldCode: string; fieldType: string; label: string; required: boolean; settings: any }[]) {
    return usable
      .map((f) => {
        const opts = (f.settings as any)?.options;
        const o = Array.isArray(opts) && opts.length ? ` 選択肢=[${opts.join(' / ')}]` : '';
        return `- ${f.fieldCode} (${f.fieldType}${f.required ? '/必須' : ''}): ${f.label}${o}`;
      })
      .join('\n');
  }

  /** 抽出済みJSONをフィールド型に合わせて検証し、採用した値だけ返す。 */
  private applyDraft(
    usable: { fieldCode: string; fieldType: string; settings: any }[],
    parsed: Record<string, any> | null,
  ) {
    const values: Record<string, any> = {};
    if (parsed) {
      for (const f of usable) {
        if (!(f.fieldCode in parsed)) continue;
        const v = coerceFieldValue(f, parsed[f.fieldCode]);
        if (v !== undefined && v !== null && v !== '') values[f.fieldCode] = v;
      }
    }
    return { values, filled: Object.keys(values) };
  }

  // ===== 候補ベクトルの取得（権限フィルタ込み） =====
  // 参照種別・アプリ・文書で候補を絞る（可視性も担保＝見えない対象はヒット0）。
  private async candidateRows(visibleApps: string[] | null, visibleDocs: string[] | null, opts: SearchOptions) {
    const select = {
      id: true, source: true, appId: true, recordId: true, docId: true, content: true, vector: true,
      structPath: true, structLabel: true, structAnchor: true,
    };
    if (opts.docId) {
      const allowed = visibleDocs === null || visibleDocs.includes(opts.docId);
      const where: any = { source: 'document', docId: allowed ? opts.docId : '__none__' };
      return this.prisma.embedding.findMany({ where, select });
    }
    const appAllowed = !opts.appId || visibleApps === null || visibleApps.includes(opts.appId);
    const requestedAppId = appAllowed ? opts.appId : '__none__';
    const recordWhere = requestedAppId
      ? { source: 'record', appId: requestedAppId }
      : visibleApps === null
        ? { source: 'record' }
        : { source: 'record', appId: { in: visibleApps.length ? visibleApps : ['__none__'] } };
    const docWhere = visibleDocs === null
      ? { source: 'document' }
      : { source: 'document', docId: { in: visibleDocs.length ? visibleDocs : ['__none__'] } };
    const sourceMode = opts.sourceMode || 'both';
    if (sourceMode === 'records') return this.prisma.embedding.findMany({ where: recordWhere as any, select });
    if (sourceMode === 'knowledge') return this.prisma.embedding.findMany({ where: docWhere as any, select });
    return this.prisma.embedding.findMany({ where: { OR: [recordWhere as any, docWhere as any] }, select });
  }

  /**
   * owner/org公開範囲で非特権なアプリの、許可される作成者ID集合のマップ（appId→creatorIds）。
   * 空マップ=制限なし。org のメンバー集合はユーザー単位で一度だけ計算して使い回す。
   */
  private async restrictedAppCreators(
    userId: string,
    role: string,
    visible: string[] | null,
  ): Promise<Map<string, Set<string>>> {
    const map = new Map<string, Set<string>>();
    if (role === 'SystemAdmin') return map;
    const where: any = { recordViewScope: { in: ['owner', 'org'] } };
    if (visible !== null) where.id = { in: visible.length ? visible : ['__none__'] };
    const apps = await this.prisma.app.findMany({
      where,
      select: { id: true, createdBy: true, recordViewScope: true },
    });
    let orgIds: string[] | null = null;
    for (const a of apps) {
      if (a.createdBy === userId) continue; // 所有者は制限なし
      if (a.recordViewScope === 'org') {
        if (orgIds === null) orgIds = await this.permission.orgScopedUserIds(userId);
        map.set(a.id, new Set(orgIds));
      } else {
        map.set(a.id, new Set([userId])); // owner
      }
    }
    return map;
  }

  private async recordOkSet(
    scored: { r: any }[],
    restricted: Map<string, Set<string>>,
  ): Promise<Set<string>> {
    const ids = scored
      .filter((s) => s.r.source === 'record' && s.r.appId && restricted.has(s.r.appId) && s.r.recordId)
      .map((s) => s.r.recordId as string);
    if (ids.length === 0) return new Set();
    const recs = await this.prisma.record.findMany({
      where: { id: { in: ids } },
      select: { id: true, appId: true, createdBy: true },
    });
    const ok = new Set<string>();
    for (const r of recs) {
      const allow = restricted.get(r.appId);
      if (allow && allow.has(r.createdBy)) ok.add(r.id);
    }
    return ok;
  }

  /**
   * 「対象社員フィールド基準」のアプリで、対象社員が管轄外のレコードIDを返す（検索結果から除外する集合）。
   * 非特権ユーザーのみ対象（recordFieldScope が SystemAdmin/所有者/未設定では null を返す）。
   */
  private async fieldScopeBlockedRecordIds(
    scored: { r: any }[],
    userId: string,
    role: string,
  ): Promise<Set<string>> {
    const blocked = new Set<string>();
    const recHits = scored.filter((s) => s.r.source === 'record' && s.r.appId && s.r.recordId);
    if (recHits.length === 0) return blocked;
    const appIds = Array.from(new Set(recHits.map((s) => s.r.appId as string)));
    const scopeByApp = new Map<string, { field: string; userIds: Set<string> }>();
    for (const appId of appIds) {
      const fs = await this.permission.recordFieldScope(appId, userId, role);
      if (fs) scopeByApp.set(appId, { field: fs.field, userIds: new Set(fs.userIds) });
    }
    if (scopeByApp.size === 0) return blocked;
    const ids = recHits.filter((s) => scopeByApp.has(s.r.appId)).map((s) => s.r.recordId as string);
    if (ids.length === 0) return blocked;
    const recs = await this.prisma.record.findMany({
      where: { id: { in: ids } },
      select: { id: true, appId: true, dataJson: true },
    });
    for (const r of recs) {
      const sc = scopeByApp.get(r.appId);
      if (!sc) continue;
      const val = String((r.dataJson as any)?.[sc.field] ?? '');
      if (!sc.userIds.has(val)) blocked.add(r.id);
    }
    return blocked;
  }

  // ===== 集計 =====
  private aggregate(app: any, records: any[], fields: any[]) {
    const total = records.length;
    const distributions: { label: string; field: string; items: { value: string; count: number }[] }[] = [];
    const numbers: { label: string; field: string; sum: number; avg: number; min: number; max: number }[] = [];

    for (const f of fields) {
      if (['status', 'select', 'radio'].includes(f.fieldType)) {
        const counts = new Map<string, number>();
        for (const r of records) {
          const v = (r.dataJson as any)?.[f.fieldCode];
          const key = v === null || v === undefined || v === '' ? '(未設定)' : String(v);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
        distributions.push({
          label: f.label,
          field: f.fieldCode,
          items: Array.from(counts.entries()).map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count),
        });
      } else if (f.fieldType === 'number' || f.fieldType === 'calc') {
        const nums = records.map((r) => Number((r.dataJson as any)?.[f.fieldCode])).filter((n) => !isNaN(n));
        if (nums.length) {
          const sum = nums.reduce((s, n) => s + n, 0);
          numbers.push({
            label: f.label,
            field: f.fieldCode,
            sum,
            avg: Math.round((sum / nums.length) * 10) / 10,
            min: Math.min(...nums),
            max: Math.max(...nums),
          });
        }
      }
    }

    // プロセス完了率
    let process: { rate: number; done: number; open: number } | undefined;
    const proc: any = app.processConfig;
    if (proc?.enabled && proc.statusField) {
      const actions: { from: string }[] = proc.actions || [];
      const isOpen = (v: any) => actions.some((a) => a.from === v);
      const open = records.filter((r) => isOpen((r.dataJson as any)?.[proc.statusField])).length;
      const done = total - open;
      process = { rate: total ? Math.round((done / total) * 100) : 0, done, open };
    }

    return { total, distributions, numbers, process };
  }

  private buildAnalysisBlock(app: any, records: any[], fields: any[], userMap: Record<string, string>, stats: any): string {
    const lines: string[] = [];
    lines.push(`# アプリ: ${app.name}`);
    if (app.description) lines.push(`説明: ${app.description}`);
    lines.push(`総レコード数: ${stats.total}`);
    if (stats.process) lines.push(`進捗: 完了率 ${stats.process.rate}%（完了 ${stats.process.done} / 未完了 ${stats.process.open}）`);

    if (stats.distributions.length) {
      lines.push('\n## 区分別の件数');
      for (const d of stats.distributions) {
        const top = d.items.slice(0, 8).map((i: any) => `${i.value}=${i.count}`).join(', ');
        lines.push(`- ${d.label}: ${top}`);
      }
    }
    if (stats.numbers.length) {
      lines.push('\n## 数値項目の統計');
      for (const n of stats.numbers) {
        lines.push(`- ${n.label}: 合計=${n.sum}, 平均=${n.avg}, 最小=${n.min}, 最大=${n.max}`);
      }
    }

    // サンプル（最新数件）
    const fieldLite = fields.map((f) => ({ fieldCode: f.fieldCode, fieldType: f.fieldType, label: f.label, settings: f.settings as any }));
    const sample = [...records]
      .sort((a, b) => (b.updatedAt?.getTime?.() || 0) - (a.updatedAt?.getTime?.() || 0))
      .slice(0, 5);
    if (sample.length) {
      lines.push('\n## サンプル（最新レコード）');
      sample.forEach((r, i) => {
        const t = recordToText(fieldLite, (r.dataJson as any) || {}, userMap).replace(/\n/g, ' / ');
        lines.push(`${i + 1}. ${t.slice(0, 300)}`);
      });
    }

    lines.push('\n# 指示\n上記データの傾向・特徴・注意点・改善提案を、日本語の箇条書きでまとめてください。');
    return lines.join('\n');
  }

  // ===== 補助 =====
  private async scopedRecords(appId: string, userId: string, role: string) {
    const app = await this.prisma.app.findUnique({ where: { id: appId } });
    if (!app) throw new NotFoundException('アプリが見つかりません');
    const allowed = await this.permission.allowedCreatorIds(appId, userId, role, 'view');
    return this.prisma.record.findMany({
      where: { appId, ...(allowed ? { createdBy: { in: allowed } } : {}) },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private titleAndSnippet(content: string, source: string, structLabel?: string | null): { title: string; snippet: string } {
    const lines = (content || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const headerMatch = lines[0]?.match(/^【(.+)】$/);
    const header = headerMatch ? headerMatch[1] : undefined;
    // 行政文書チャンクは構造パス行 [..] を本文から除き、タイトルへ条番号を併記。
    let body = headerMatch ? lines.slice(1) : lines;
    if (structLabel && body[0]?.startsWith('[') && body[0].endsWith(']')) body = body.slice(1);
    let title: string;
    if (source === 'document') {
      title = structLabel && header ? `${header} ${structLabel}` : header || 'ドキュメント';
    } else {
      const firstVal = body[0]?.includes(': ') ? body[0].split(': ').slice(1).join(': ') : body[0];
      title = (firstVal || header || '(無題のレコード)').slice(0, 60);
    }
    const snippet = body.join(' / ').slice(0, 240);
    return { title, snippet };
  }

  private async appNameMap(appIds: string[]): Promise<Record<string, string>> {
    const ids = Array.from(new Set(appIds));
    if (ids.length === 0) return {};
    const apps = await this.prisma.app.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const m: Record<string, string> = {};
    for (const a of apps) m[a.id] = a.name;
    return m;
  }

  private async userMap(): Promise<Record<string, string>> {
    const users = await this.prisma.user.findMany({ select: { id: true, loginId: true } });
    const m: Record<string, string> = {};
    for (const u of users) m[u.id] = u.loginId;
    return m;
  }
}

/** LLM出力からJSONオブジェクトを頑健に取り出す（コードフェンスや前後文を許容）。 */
function extractJsonObject(text: string): Record<string, any> | null {
  if (!text) return null;
  const t = text.replace(/```json/gi, '```').replace(/```/g, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = t.slice(start, end + 1);
  try {
    const obj = JSON.parse(slice);
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  } catch {
    return null;
  }
}

/** 抽出値をフィールド型に合わせて検証・変換。不正なら undefined（採用しない）。 */
function coerceFieldValue(field: { fieldType: string; settings?: any }, value: any): any {
  if (value === null || value === undefined) return undefined;
  const t = field.fieldType;
  const opts: string[] = Array.isArray(field.settings?.options) ? field.settings.options.map(String) : [];

  if (t === 'number') {
    const n = Number(value);
    return isNaN(n) ? undefined : n;
  }
  if (t === 'select' || t === 'radio' || t === 'status') {
    const v = String(value);
    return opts.length === 0 || opts.includes(v) ? v : undefined;
  }
  if (t === 'checkbox' || t === 'multi_select') {
    const arr = Array.isArray(value) ? value.map(String) : [String(value)];
    const filtered = opts.length ? arr.filter((v) => opts.includes(v)) : arr;
    return filtered.length ? filtered : undefined;
  }
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return undefined;
  return String(value);
}
