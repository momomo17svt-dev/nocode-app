/**
 * アプリテンプレート定義。
 * 「あらゆる業務」をすぐ作り始められるよう、代表的な業務アプリのフォーム定義・
 * プロセス（ワークフロー）・レコード公開範囲をひな形として用意する。
 *
 * フィールドコード(fieldCode)は英数字・アンダースコアのみ（FieldDtoのバリデーションに準拠）。
 * processConfig は { enabled, statusField, statuses, actions:[{from,to,label}] } 形式
 * （AppSettingsのProcessSettings / RecordDetail と同一）。
 */

export interface TemplateField {
  fieldCode: string;
  fieldType: string;
  label: string;
  required?: boolean;
  settings?: Record<string, any>;
}

export interface ProcessAction {
  from: string;
  to: string;
  label: string;
  /** この遷移を実行できる承認者を限定する user_select フィールドコード（任意）。 */
  approver?: string;
}

export interface TemplateProcess {
  enabled: boolean;
  statusField: string;
  statuses: string[];
  actions: ProcessAction[];
}

/** アプリ作成者が定義する AIアクション（RecordDetail のカスタムボタン）。 */
export interface TemplateAiAction {
  id: string;
  name: string;
  prompt: string;
  output: 'show' | 'field';
  targetField?: string;
}

export interface TemplateAiConfig {
  actions: TemplateAiAction[];
}

/** 期限リマインド設定。 */
export interface TemplateReminderConfig {
  enabled: boolean;
  dueDateField: string;
  assigneeField: string;
  daysBefore: number;
}

/**
 * 保存ビュー定義（生成時に View レコードとして作成）。
 * フロント RecordList の保存ビュー形式に準拠（conditions/columns/sort）。
 * ビュー種別（かんばん/カレンダー/地図/集計）は項目型から自動派生されるため保存対象外。
 */
export interface TemplateView {
  name: string;
  /** 表示する fieldCode 群。 */
  columns?: string[];
  /** 絞り込み条件。op は contains/eq/ne/gt/lt/empty/notempty。 */
  conditions?: { field: string; op: string; value?: string }[];
  /** 並び替え（RecordList 準拠で order を使用）。 */
  sort?: { field: string; order: 'asc' | 'desc' } | null;
}

/**
 * ダッシュボードのウィジェット定義（生成時に新アプリIDを appId として注入）。
 * DashboardsService の Widget 型に準拠（id/appId は生成時付与）。
 */
export interface TemplateDashboardWidget {
  type: 'chart' | 'kpi' | 'list' | 'map';
  title?: string;
  size?: string;
  chartType?: string;
  groupField?: string;
  metric?: 'count' | 'sum' | 'avg' | 'min' | 'max';
  valueField?: string;
  kpiMode?: 'count' | 'sum' | 'avg' | 'open' | 'rate';
  columns?: string[];
  limit?: number;
  sortField?: string;
  sortDir?: 'asc' | 'desc';
  filters?: { field: string; op: string; value?: string }[];
}

/** ダッシュボード定義（生成時に Dashboard レコードとして作成）。 */
export interface TemplateDashboard {
  name: string;
  widgets: TemplateDashboardWidget[];
}

export interface AppTemplate {
  /** テンプレートID（URLやAPIで指定） */
  id: string;
  /** 既定のアプリ名 */
  name: string;
  /** 分類（ギャラリーのグルーピング用） */
  category: string;
  /** フロントのアイコン名（lucide-react） */
  icon: string;
  /** 一覧カード用の短い説明 */
  summary: string;
  /** アプリの説明（作成時に description として設定） */
  description: string;
  fields: TemplateField[];
  processConfig?: TemplateProcess;
  recordViewScope?: 'all' | 'owner' | 'org';
  recordEditScope?: 'all' | 'owner' | 'org';
  /** AIアクション設定（任意）。 */
  aiConfig?: TemplateAiConfig;
  /** 帳票（印刷/PDF）テンプレート定義（任意）。{ templates:[...] } */
  reportConfig?: { templates: Record<string, any>[] };
  /** 期限リマインド設定（任意）。 */
  reminderConfig?: TemplateReminderConfig;
  /** 生成時に自動作成する保存ビュー（任意）。 */
  views?: TemplateView[];
  /** 生成時に自動作成するダッシュボード（任意）。 */
  dashboard?: TemplateDashboard;
}

export const APP_TEMPLATES: AppTemplate[] = [
  {
    id: 'showcase',
    name: '総合デモ（全機能ショーケース）',
    category: '使い方・サンプル',
    icon: 'Blocks',
    summary: '全フィールド種・プロセス・計算/ルール表・地図・AI・帳票・リマインドを1つに凝縮した学習用サンプル',
    description:
      'このノーコード基盤で使える機能をひととおり体験できるサンプルアプリです。' +
      'テキスト・数値・日付・選択・チェック・ユーザー/部署選択・ファイル・自動採番・計算（式／ルール表）・' +
      '明細テーブル・リンク/メール/電話・位置情報（地図）・AI生成項目・関連レコード参照など主要なフィールド種に加え、' +
      'プロセス管理（承認ルーティング）、AIアクション、帳票（PDF/印刷）、期限リマインドを最初から設定済みです。' +
      '「サンプルデータも作成する」を有効にすると、ダッシュボード・かんばん・カレンダー・地図・集計の各ビューもすぐ確認できます。',
    recordViewScope: 'all',
    recordEditScope: 'all',
    fields: [
      // ── 基本情報 ──
      { fieldCode: 'sec_basic', fieldType: 'section', label: '基本情報', settings: { description: '案件の概要を入力します。番号は自動採番されます。' } },
      { fieldCode: 'case_no', fieldType: 'auto_number', label: '案件番号', settings: { prefix: 'CASE-', padding: 4 } },
      { fieldCode: 'title', fieldType: 'text', label: '件名', required: true, settings: { maxLength: 200 } },
      { fieldCode: 'detail', fieldType: 'textarea', label: '詳細・背景' },
      { fieldCode: 'category', fieldType: 'select', label: 'カテゴリ', settings: { options: ['企画', '開発', '保守', '調査', 'その他'], defaultValue: '企画' } },
      { fieldCode: 'priority', fieldType: 'radio', label: '優先度', settings: { options: ['低', '中', '高'], defaultValue: '中' } },
      { fieldCode: 'tags', fieldType: 'checkbox', label: 'タグ（複数選択）', settings: { options: ['重要', '顧客向け', '社内', '要フォロー'] } },

      // ── 担当・期日 ──
      { fieldCode: 'sec_owner', fieldType: 'section', label: '担当・期日', settings: { description: '担当者・承認者・部署・期日。期限が近づくと担当者へ自動リマインドします。' } },
      { fieldCode: 'assignee', fieldType: 'user_select', label: '担当者' },
      { fieldCode: 'approver', fieldType: 'user_select', label: '承認者' },
      { fieldCode: 'dept', fieldType: 'group_select', label: '担当部署' },
      { fieldCode: 'received_at', fieldType: 'datetime', label: '受付日時' },
      { fieldCode: 'start_date', fieldType: 'date', label: '開始日' },
      { fieldCode: 'due_date', fieldType: 'date', label: '期限日' },

      // ── 連絡先 ──
      { fieldCode: 'sec_contact', fieldType: 'section', label: '連絡先', settings: { description: 'メール・電話・URLはそのままリンクとして表示されます。' } },
      { fieldCode: 'contact_email', fieldType: 'email', label: 'メールアドレス' },
      { fieldCode: 'contact_phone', fieldType: 'phone', label: '電話番号' },
      { fieldCode: 'ref_url', fieldType: 'link', label: '関連URL' },

      // ── 金額・自動計算 ──
      { fieldCode: 'sec_money', fieldType: 'section', label: '金額・自動計算', settings: { description: '明細・税込合計・進捗から健全度を自動算出します（計算式とルール表の両方の例）。' } },
      {
        fieldCode: 'items', fieldType: 'subtable', label: '明細',
        settings: { columns: [
          { fieldCode: 'name', fieldType: 'text', label: '品目', settings: {} },
          { fieldCode: 'qty', fieldType: 'number', label: '数量', settings: {} },
          { fieldCode: 'unit_price', fieldType: 'number', label: '単価', settings: { unit: '円', thousandSeparator: true } },
          { fieldCode: 'amount', fieldType: 'calc', label: '金額', settings: { formula: 'qty * unit_price', unit: '円', thousandSeparator: true } },
        ] },
      },
      { fieldCode: 'estimate', fieldType: 'number', label: '見積金額（税抜）', settings: { unit: '円', thousandSeparator: true } },
      { fieldCode: 'tax_rate', fieldType: 'number', label: '消費税率', settings: { unit: '%', defaultValue: 10 } },
      { fieldCode: 'total', fieldType: 'calc', label: '税込合計', settings: { formula: 'estimate + estimate * tax_rate / 100', unit: '円', thousandSeparator: true } },
      { fieldCode: 'progress', fieldType: 'number', label: '進捗率', settings: { unit: '%' } },
      { fieldCode: 'health', fieldType: 'calc', label: '健全度（自動判定）', settings: { mode: 'rules', fallback: '要注意', rules: [
        { when: [{ field: 'progress', op: '>=', value: 100 }], result: '完了' },
        { when: [{ field: 'progress', op: '>=', value: 70 }], result: '順調' },
        { when: [{ field: 'progress', op: '>=', value: 30 }], result: '進行中' },
      ] } },

      // ── 位置情報 ──
      { fieldCode: 'sec_map', fieldType: 'section', label: '位置情報', settings: { description: '地図をクリックまたは現在地ボタンで地点を記録します（一覧の「地図」タブでピン表示）。' } },
      { fieldCode: 'site', fieldType: 'location', label: '現地・対象地点', settings: { zoom: 14, center: { lat: 35.681236, lng: 139.767125 } } },

      // ── 添付・参照・AI ──
      { fieldCode: 'sec_extra', fieldType: 'section', label: '添付・参照・AI', settings: { description: '添付ファイル、他アプリのレコード参照、AIによる自動生成項目。' } },
      { fieldCode: 'attachment', fieldType: 'file', label: '添付ファイル' },
      { fieldCode: 'related', fieldType: 'reference', label: '関連レコード（参照先はアプリ設定で指定）', settings: {} },
      { fieldCode: 'response_plan', fieldType: 'textarea', label: '対応方針（AIアクションの書き込み先）' },
      { fieldCode: 'ai_summary', fieldType: 'ai', label: 'AI要約', settings: { prompt: '次の案件を3行以内で要約してください。\n件名: {title}\nカテゴリ: {category}\n詳細: {detail}', maxTokens: 512 } },

      // ── ステータス ──
      { fieldCode: 'sec_status', fieldType: 'section', label: 'ステータス管理', settings: { description: '起票→申請→承認→対応→完了のワークフロー。承認は承認者本人のみ実行できます。' } },
      { fieldCode: 'status', fieldType: 'status', label: 'ステータス', required: true, settings: { options: ['起票', '申請中', '承認済', '対応中', '完了'], defaultValue: '起票' } },
      { fieldCode: 'note', fieldType: 'textarea', label: '備考' },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['起票', '申請中', '承認済', '対応中', '完了'],
      actions: [
        { from: '起票', to: '申請中', label: '申請する' },
        { from: '申請中', to: '承認済', label: '承認する', approver: 'approver' },
        { from: '申請中', to: '起票', label: '差し戻す', approver: 'approver' },
        { from: '承認済', to: '対応中', label: '着手する' },
        { from: '対応中', to: '完了', label: '完了にする' },
      ],
    },
    aiConfig: {
      actions: [
        { id: 'summarize', name: '内容を要約', output: 'show', prompt: '次の案件内容を、要点が分かるように3行で要約してください。\n\n{_record}' },
        { id: 'plan', name: '対応方針を提案', output: 'field', targetField: 'response_plan', prompt: '次の案件に対する具体的な対応方針を、箇条書きで提案してください。\n\n件名: {title}\n詳細: {detail}\n優先度: {priority}' },
      ],
    },
    reportConfig: {
      templates: [
        {
          id: 'case_report',
          name: '案件報告書',
          paper: 'A4',
          orientation: 'portrait',
          title: '案 件 報 告 書',
          subtitle: '案件番号: {case_no} ／ 件名: {title}',
          showDate: true,
          blocks: [
            { type: 'heading', content: '案件概要' },
            { type: 'fields', columns: 2, fieldCodes: ['category', 'priority', 'assignee', 'dept', 'start_date', 'due_date', 'status', 'health'] },
            { type: 'heading', content: '詳細・背景' },
            { type: 'fields', columns: 1, fieldCodes: ['detail'] },
            { type: 'heading', content: '明細' },
            { type: 'subtable', fieldCode: 'items' },
            { type: 'fields', columns: 2, fieldCodes: ['estimate', 'tax_rate', 'total', 'progress'] },
            { type: 'heading', content: '対応方針' },
            { type: 'fields', columns: 1, fieldCodes: ['response_plan'] },
          ],
          footer: '本書は {title} に関する報告書です。',
        },
      ],
    },
    reminderConfig: { enabled: true, dueDateField: 'due_date', assigneeField: 'assignee', daysBefore: 3 },
    views: [
      { name: '対応中（未完了）', columns: ['case_no', 'title', 'category', 'priority', 'assignee', 'due_date', 'status'], conditions: [{ field: 'status', op: 'ne', value: '完了' }], sort: { field: 'due_date', order: 'asc' } },
      { name: '高優先度', columns: ['case_no', 'title', 'assignee', 'due_date', 'status'], conditions: [{ field: 'priority', op: 'eq', value: '高' }], sort: { field: 'due_date', order: 'asc' } },
      { name: '承認待ち', columns: ['case_no', 'title', 'assignee', 'approver', 'status'], conditions: [{ field: 'status', op: 'eq', value: '申請中' }], sort: { field: 'received_at', order: 'asc' } },
    ],
    dashboard: {
      name: '案件ダッシュボード',
      widgets: [
        { type: 'kpi', title: '案件総数', kpiMode: 'count' },
        { type: 'kpi', title: '未完了', kpiMode: 'open' },
        { type: 'kpi', title: '完了率', kpiMode: 'rate' },
        { type: 'chart', title: 'ステータス別', chartType: 'bar', groupField: 'status', metric: 'count' },
        { type: 'chart', title: 'カテゴリ別', chartType: 'pie', groupField: 'category', metric: 'count' },
        { type: 'chart', title: 'カテゴリ別 税込合計', chartType: 'bar', groupField: 'category', metric: 'sum', valueField: 'total' },
        { type: 'map', title: '対象地点マップ', groupField: 'site' },
        { type: 'list', title: '直近の案件', columns: ['case_no', 'title', 'assignee', 'status'], limit: 8 },
      ],
    },
  },
  {
    id: 'inquiry',
    name: '問い合わせ管理',
    category: '顧客対応',
    icon: 'Headset',
    summary: '受付〜対応〜完了の進捗を担当者・ステータスで管理',
    description: '顧客からの問い合わせを記録し、担当者とステータスで対応状況を可視化します。',
    fields: [
      { fieldCode: 'inquiry_no', fieldType: 'auto_number', label: '問い合わせ番号', settings: { prefix: 'INQ-', padding: 4 } },
      { fieldCode: 'subject', fieldType: 'text', label: '件名', required: true, settings: { maxLength: 200 } },
      { fieldCode: 'content', fieldType: 'textarea', label: '問い合わせ内容', required: true },
      { fieldCode: 'customer_name', fieldType: 'text', label: '顧客名' },
      { fieldCode: 'contact', fieldType: 'text', label: '連絡先（電話/メール）' },
      { fieldCode: 'priority', fieldType: 'select', label: '優先度', settings: { options: ['低', '中', '高'], defaultValue: '中' } },
      { fieldCode: 'assignee', fieldType: 'user_select', label: '担当者' },
      { fieldCode: 'status', fieldType: 'status', label: 'ステータス', required: true, settings: { options: ['受付', '対応中', '保留', '完了'], defaultValue: '受付' } },
      { fieldCode: 'received_date', fieldType: 'date', label: '受付日' },
      { fieldCode: 'response_note', fieldType: 'textarea', label: '対応メモ' },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['受付', '対応中', '保留', '完了'],
      actions: [
        { from: '受付', to: '対応中', label: '対応を開始' },
        { from: '対応中', to: '保留', label: '保留にする' },
        { from: '保留', to: '対応中', label: '対応を再開' },
        { from: '対応中', to: '完了', label: '完了にする' },
      ],
    },
    views: [
      { name: '未完了', columns: ['inquiry_no', 'subject', 'customer_name', 'priority', 'assignee', 'status'], conditions: [{ field: 'status', op: 'ne', value: '完了' }], sort: { field: 'received_date', order: 'asc' } },
      { name: '高優先度', columns: ['inquiry_no', 'subject', 'customer_name', 'assignee', 'status'], conditions: [{ field: 'priority', op: 'eq', value: '高' }], sort: { field: 'received_date', order: 'asc' } },
    ],
    dashboard: {
      name: '問い合わせダッシュボード',
      widgets: [
        { type: 'kpi', title: '問い合わせ総数', kpiMode: 'count' },
        { type: 'kpi', title: '未対応', kpiMode: 'open' },
        { type: 'kpi', title: '完了率', kpiMode: 'rate' },
        { type: 'chart', title: 'ステータス別', chartType: 'bar', groupField: 'status', metric: 'count' },
        { type: 'chart', title: '優先度別', chartType: 'pie', groupField: 'priority', metric: 'count' },
        { type: 'chart', title: '担当者別', chartType: 'bar', groupField: 'assignee', metric: 'count' },
      ],
    },
  },
  {
    id: 'survey',
    name: 'アンケート・調査回収',
    category: '調査・回収',
    icon: 'ClipboardList',
    summary: '対象者ごとに回答状況を管理し、回答率・未回答者を可視化',
    description: '対象者ごとに1レコードを作成し、回答ステータスで回収状況（回答率・未回答者）を見える化します。',
    fields: [
      { fieldCode: 'target_user', fieldType: 'user_select', label: '対象者', required: true },
      { fieldCode: 'theme', fieldType: 'text', label: '調査テーマ', required: true },
      { fieldCode: 'answer_status', fieldType: 'status', label: '回答ステータス', required: true, settings: { options: ['未回答', '回答済'], defaultValue: '未回答' } },
      { fieldCode: 'answer', fieldType: 'textarea', label: '回答内容' },
      { fieldCode: 'answered_date', fieldType: 'date', label: '回答日' },
      { fieldCode: 'due_date', fieldType: 'date', label: '回答期限' },
      { fieldCode: 'note', fieldType: 'textarea', label: '備考' },
    ],
    processConfig: {
      enabled: true,
      statusField: 'answer_status',
      statuses: ['未回答', '回答済'],
      actions: [{ from: '未回答', to: '回答済', label: '回答済にする' }],
    },
  },
  {
    id: 'daily_report',
    name: '日報',
    category: '社内業務',
    icon: 'NotebookPen',
    summary: '日々の業務・稼働時間を記録し、提出状況を管理',
    description: '日々の業務内容・所感・稼働時間を記録します。各自が自分のレコードのみ閲覧・編集できる設定です。',
    fields: [
      { fieldCode: 'report_date', fieldType: 'date', label: '日付', required: true },
      { fieldCode: 'work_content', fieldType: 'textarea', label: '業務内容', required: true },
      { fieldCode: 'achievement', fieldType: 'textarea', label: '所感・成果' },
      { fieldCode: 'issues', fieldType: 'textarea', label: '課題・相談' },
      { fieldCode: 'work_hours', fieldType: 'number', label: '稼働時間', settings: { unit: '時間' } },
      { fieldCode: 'status', fieldType: 'status', label: '提出ステータス', required: true, settings: { options: ['下書き', '提出済'], defaultValue: '下書き' } },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['下書き', '提出済'],
      actions: [{ from: '下書き', to: '提出済', label: '提出する' }],
    },
    recordViewScope: 'owner',
    recordEditScope: 'owner',
  },
  {
    id: 'expense',
    name: '経費精算',
    category: '申請・承認',
    icon: 'Receipt',
    summary: '申請→承認→却下の承認フロー付き経費精算',
    description: '経費の申請・承認を管理します。金額の合計集計や、申請中件数の可視化に使えます。',
    fields: [
      { fieldCode: 'request_no', fieldType: 'auto_number', label: '申請番号', settings: { prefix: 'EXP-', padding: 4 } },
      { fieldCode: 'applicant', fieldType: 'user_select', label: '申請者' },
      { fieldCode: 'title', fieldType: 'text', label: '件名', required: true },
      { fieldCode: 'category', fieldType: 'select', label: '費目', settings: { options: ['交通費', '会議費', '消耗品費', '接待費', 'その他'] } },
      { fieldCode: 'amount', fieldType: 'number', label: '金額', required: true, settings: { unit: '円', thousandSeparator: true } },
      { fieldCode: 'incurred_date', fieldType: 'date', label: '発生日' },
      { fieldCode: 'receipt', fieldType: 'file', label: '領収書' },
      { fieldCode: 'status', fieldType: 'status', label: '承認ステータス', required: true, settings: { options: ['申請中', '承認', '却下'], defaultValue: '申請中' } },
      { fieldCode: 'remarks', fieldType: 'textarea', label: '備考' },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['申請中', '承認', '却下'],
      actions: [
        { from: '申請中', to: '承認', label: '承認する' },
        { from: '申請中', to: '却下', label: '却下する' },
      ],
    },
    reportConfig: {
      templates: [
        {
          id: 'expense_report', name: '経費精算書', paper: 'A4', orientation: 'portrait',
          title: '経 費 精 算 書', subtitle: '申請番号: {request_no}', showDate: true,
          blocks: [
            { type: 'fields', columns: 2, fieldCodes: ['applicant', 'category', 'incurred_date', 'amount', 'status'] },
            { type: 'heading', content: '件名・備考' },
            { type: 'fields', columns: 1, fieldCodes: ['title'] },
            { type: 'text', content: '{remarks}' },
          ],
          footer: '上記のとおり経費を精算します。',
        },
      ],
    },
    views: [
      { name: '申請中', columns: ['request_no', 'applicant', 'title', 'category', 'amount', 'status'], conditions: [{ field: 'status', op: 'eq', value: '申請中' }], sort: { field: 'incurred_date', order: 'asc' } },
      { name: '承認済み', columns: ['request_no', 'applicant', 'title', 'amount', 'incurred_date'], conditions: [{ field: 'status', op: 'eq', value: '承認' }], sort: { field: 'incurred_date', order: 'desc' } },
    ],
    dashboard: {
      name: '経費ダッシュボード',
      widgets: [
        { type: 'kpi', title: '申請件数', kpiMode: 'count' },
        { type: 'kpi', title: '金額合計', kpiMode: 'sum', valueField: 'amount' },
        { type: 'kpi', title: '申請中', kpiMode: 'open' },
        { type: 'chart', title: '費目別 金額', chartType: 'bar', groupField: 'category', metric: 'sum', valueField: 'amount' },
        { type: 'chart', title: 'ステータス別', chartType: 'pie', groupField: 'status', metric: 'count' },
      ],
    },
  },
  {
    id: 'inventory',
    name: '在庫管理',
    category: '管理業務',
    icon: 'Package',
    summary: '在庫数・単価から在庫金額を自動計算',
    description: '品目ごとの在庫数・単価を管理し、在庫金額を自動計算します。発注点の管理にも使えます。',
    fields: [
      { fieldCode: 'item_name', fieldType: 'text', label: '品名', required: true },
      { fieldCode: 'item_code', fieldType: 'text', label: '品番' },
      { fieldCode: 'category', fieldType: 'select', label: 'カテゴリ', settings: { options: ['原材料', '部品', '製品', '消耗品'] } },
      { fieldCode: 'quantity', fieldType: 'number', label: '在庫数', settings: { unit: '個' } },
      { fieldCode: 'unit_price', fieldType: 'number', label: '単価', settings: { unit: '円', thousandSeparator: true } },
      { fieldCode: 'stock_value', fieldType: 'calc', label: '在庫金額', settings: { formula: 'quantity * unit_price', unit: '円', thousandSeparator: true } },
      { fieldCode: 'location', fieldType: 'text', label: '保管場所' },
      { fieldCode: 'reorder_point', fieldType: 'number', label: '発注点', settings: { unit: '個' } },
      { fieldCode: 'updated_on', fieldType: 'date', label: '最終更新日' },
    ],
    views: [
      { name: 'カテゴリ別', columns: ['item_name', 'item_code', 'category', 'quantity', 'unit_price', 'stock_value'], conditions: [], sort: { field: 'category', order: 'asc' } },
    ],
    dashboard: {
      name: '在庫ダッシュボード',
      widgets: [
        { type: 'kpi', title: '品目数', kpiMode: 'count' },
        { type: 'kpi', title: '在庫金額合計', kpiMode: 'sum', valueField: 'stock_value' },
        { type: 'chart', title: 'カテゴリ別 在庫金額', chartType: 'bar', groupField: 'category', metric: 'sum', valueField: 'stock_value' },
        { type: 'chart', title: 'カテゴリ別 品目数', chartType: 'pie', groupField: 'category', metric: 'count' },
      ],
    },
  },
  {
    id: 'equipment',
    name: '備品予約',
    category: '社内業務',
    icon: 'CalendarClock',
    summary: '備品・設備の予約と利用状況を管理',
    description: '会議室や備品の予約を管理します。予約中→利用中→返却済のステータスで利用状況を追えます。',
    fields: [
      { fieldCode: 'equipment', fieldType: 'select', label: '備品', required: true, settings: { options: ['プロジェクター', '会議室A', '会議室B', '社用車', '貸出ノートPC'] } },
      { fieldCode: 'reserver', fieldType: 'user_select', label: '利用者' },
      { fieldCode: 'start_at', fieldType: 'datetime', label: '利用開始', required: true },
      { fieldCode: 'end_at', fieldType: 'datetime', label: '利用終了', required: true },
      { fieldCode: 'purpose', fieldType: 'text', label: '用途' },
      { fieldCode: 'status', fieldType: 'status', label: 'ステータス', required: true, settings: { options: ['予約中', '利用中', '返却済'], defaultValue: '予約中' } },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['予約中', '利用中', '返却済'],
      actions: [
        { from: '予約中', to: '利用中', label: '利用開始' },
        { from: '利用中', to: '返却済', label: '返却する' },
      ],
    },
  },
  {
    id: 'task',
    name: 'タスク・課題管理',
    category: '社内業務',
    icon: 'ListChecks',
    summary: '担当者・期限・優先度でタスクの進捗を管理',
    description: 'チームのタスク・課題を担当者と期限で管理します。ステータスで進捗を可視化できます。',
    fields: [
      { fieldCode: 'task_name', fieldType: 'text', label: 'タスク名', required: true },
      { fieldCode: 'detail', fieldType: 'textarea', label: '詳細' },
      { fieldCode: 'assignee', fieldType: 'user_select', label: '担当者' },
      { fieldCode: 'priority', fieldType: 'select', label: '優先度', settings: { options: ['低', '中', '高'], defaultValue: '中' } },
      { fieldCode: 'status', fieldType: 'status', label: 'ステータス', required: true, settings: { options: ['未着手', '進行中', '完了'], defaultValue: '未着手' } },
      { fieldCode: 'due_date', fieldType: 'date', label: '期限' },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['未着手', '進行中', '完了'],
      actions: [
        { from: '未着手', to: '進行中', label: '着手する' },
        { from: '進行中', to: '完了', label: '完了にする' },
      ],
    },
    reminderConfig: { enabled: true, dueDateField: 'due_date', assigneeField: 'assignee', daysBefore: 2 },
    views: [
      { name: '未完了', columns: ['task_name', 'assignee', 'priority', 'due_date', 'status'], conditions: [{ field: 'status', op: 'ne', value: '完了' }], sort: { field: 'due_date', order: 'asc' } },
      { name: '進行中', columns: ['task_name', 'assignee', 'priority', 'due_date'], conditions: [{ field: 'status', op: 'eq', value: '進行中' }], sort: { field: 'due_date', order: 'asc' } },
    ],
    dashboard: {
      name: 'タスクダッシュボード',
      widgets: [
        { type: 'kpi', title: 'タスク総数', kpiMode: 'count' },
        { type: 'kpi', title: '未完了', kpiMode: 'open' },
        { type: 'kpi', title: '完了率', kpiMode: 'rate' },
        { type: 'chart', title: 'ステータス別', chartType: 'bar', groupField: 'status', metric: 'count' },
        { type: 'chart', title: '担当者別', chartType: 'bar', groupField: 'assignee', metric: 'count' },
        { type: 'chart', title: '優先度別', chartType: 'pie', groupField: 'priority', metric: 'count' },
      ],
    },
  },
  {
    id: 'purchase',
    name: '発注管理',
    category: '管理業務',
    icon: 'ShoppingCart',
    summary: '発注明細・希望納期・検収までの進捗を管理',
    description: '仕入先への発注を明細付きで管理し、発注済→入荷待ち→検収完了まで追跡します。',
    fields: [
      { fieldCode: 'po_no', fieldType: 'auto_number', label: '発注番号', settings: { prefix: 'PO-', padding: 4 } },
      { fieldCode: 'supplier', fieldType: 'text', label: '仕入先', required: true },
      { fieldCode: 'order_date', fieldType: 'date', label: '発注日' },
      {
        fieldCode: 'items', fieldType: 'subtable', label: '発注明細',
        settings: { columns: [
          { fieldCode: 'name', fieldType: 'text', label: '品名', settings: {} },
          { fieldCode: 'qty', fieldType: 'number', label: '数量', settings: {} },
          { fieldCode: 'unit_price', fieldType: 'number', label: '単価', settings: { unit: '円', thousandSeparator: true } },
          { fieldCode: 'amount', fieldType: 'calc', label: '金額', settings: { formula: 'qty * unit_price', unit: '円', thousandSeparator: true } },
        ] },
      },
      { fieldCode: 'desired_date', fieldType: 'date', label: '希望納期' },
      { fieldCode: 'assignee', fieldType: 'user_select', label: '発注担当' },
      { fieldCode: 'status', fieldType: 'status', label: 'ステータス', required: true, settings: { options: ['起票', '発注済', '入荷待ち', '検収完了'], defaultValue: '起票' } },
      { fieldCode: 'remarks', fieldType: 'textarea', label: '備考' },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['起票', '発注済', '入荷待ち', '検収完了'],
      actions: [
        { from: '起票', to: '発注済', label: '発注する' },
        { from: '発注済', to: '入荷待ち', label: '入荷待ちにする' },
        { from: '入荷待ち', to: '検収完了', label: '検収完了' },
      ],
    },
  },
  {
    id: 'recruit',
    name: '採用応募者管理',
    category: '人事',
    icon: 'Briefcase',
    summary: '応募者の連絡先と選考ステータスを一元管理',
    description: '応募者の連絡先（メール・電話）と書類選考〜内定までの選考状況を管理します。',
    fields: [
      { fieldCode: 'applicant', fieldType: 'text', label: '応募者名', required: true },
      { fieldCode: 'email', fieldType: 'email', label: 'メールアドレス' },
      { fieldCode: 'phone', fieldType: 'phone', label: '電話番号' },
      { fieldCode: 'position', fieldType: 'select', label: '応募職種', settings: { options: ['エンジニア', '営業', 'コーポレート', 'デザイナー', 'その他'] } },
      { fieldCode: 'source', fieldType: 'select', label: '応募経路', settings: { options: ['自社サイト', 'エージェント', '社員紹介', '求人媒体'] } },
      { fieldCode: 'resume', fieldType: 'file', label: '履歴書・職務経歴書' },
      { fieldCode: 'assignee', fieldType: 'user_select', label: '採用担当' },
      { fieldCode: 'status', fieldType: 'status', label: '選考ステータス', required: true, settings: { options: ['書類選考', '一次面接', '二次面接', '内定', '見送り'], defaultValue: '書類選考' } },
      { fieldCode: 'eval', fieldType: 'textarea', label: '評価メモ' },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['書類選考', '一次面接', '二次面接', '内定', '見送り'],
      actions: [
        { from: '書類選考', to: '一次面接', label: '一次へ進める' },
        { from: '一次面接', to: '二次面接', label: '二次へ進める' },
        { from: '二次面接', to: '内定', label: '内定にする' },
        { from: '書類選考', to: '見送り', label: '見送り' },
        { from: '一次面接', to: '見送り', label: '見送り' },
        { from: '二次面接', to: '見送り', label: '見送り' },
      ],
    },
    views: [
      { name: '選考中', columns: ['applicant', 'position', 'source', 'assignee', 'status'], conditions: [{ field: 'status', op: 'ne', value: '内定' }, { field: 'status', op: 'ne', value: '見送り' }], sort: { field: 'applicant', order: 'asc' } },
      { name: '内定', columns: ['applicant', 'position', 'assignee'], conditions: [{ field: 'status', op: 'eq', value: '内定' }], sort: { field: 'applicant', order: 'asc' } },
    ],
    dashboard: {
      name: '採用ダッシュボード',
      widgets: [
        { type: 'kpi', title: '応募者数', kpiMode: 'count' },
        { type: 'kpi', title: '選考中', kpiMode: 'open' },
        { type: 'chart', title: '選考ステータス別', chartType: 'bar', groupField: 'status', metric: 'count' },
        { type: 'chart', title: '職種別', chartType: 'pie', groupField: 'position', metric: 'count' },
        { type: 'chart', title: '応募経路別', chartType: 'bar', groupField: 'source', metric: 'count' },
      ],
    },
  },
  {
    id: 'leave',
    name: '勤怠・休暇申請',
    category: '申請・承認',
    icon: 'CalendarDays',
    summary: '休暇・遅刻早退の申請→承認フロー',
    description: '有給・欠勤・遅刻早退などの申請を受け付け、承認／却下を管理します。',
    fields: [
      { fieldCode: 'applicant', fieldType: 'user_select', label: '申請者' },
      { fieldCode: 'leave_type', fieldType: 'select', label: '種別', required: true, settings: { options: ['有給休暇', '欠勤', '遅刻', '早退', '特別休暇'] } },
      { fieldCode: 'start_date', fieldType: 'date', label: '開始日', required: true },
      { fieldCode: 'end_date', fieldType: 'date', label: '終了日' },
      { fieldCode: 'days', fieldType: 'number', label: '日数', settings: { unit: '日' } },
      { fieldCode: 'reason', fieldType: 'textarea', label: '理由' },
      { fieldCode: 'status', fieldType: 'status', label: '承認ステータス', required: true, settings: { options: ['申請中', '承認', '却下'], defaultValue: '申請中' } },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['申請中', '承認', '却下'],
      actions: [
        { from: '申請中', to: '承認', label: '承認する' },
        { from: '申請中', to: '却下', label: '却下する' },
      ],
    },
  },
  {
    id: 'project',
    name: 'プロジェクト管理',
    category: '社内業務',
    icon: 'FolderKanban',
    summary: '案件の担当・期間・進捗率・ステータスを管理',
    description: 'プロジェクトの担当・期間・進捗率を管理し、計画→進行→完了で追跡します。',
    fields: [
      { fieldCode: 'project_name', fieldType: 'text', label: 'プロジェクト名', required: true },
      { fieldCode: 'client', fieldType: 'text', label: 'クライアント' },
      { fieldCode: 'pm', fieldType: 'user_select', label: 'PM（担当）' },
      { fieldCode: 'start_date', fieldType: 'date', label: '開始日' },
      { fieldCode: 'end_date', fieldType: 'date', label: '終了予定' },
      { fieldCode: 'progress', fieldType: 'number', label: '進捗率', settings: { unit: '%' } },
      { fieldCode: 'status', fieldType: 'status', label: 'ステータス', required: true, settings: { options: ['計画', '進行中', '保留', '完了'], defaultValue: '計画' } },
      { fieldCode: 'summary', fieldType: 'textarea', label: '概要' },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['計画', '進行中', '保留', '完了'],
      actions: [
        { from: '計画', to: '進行中', label: '開始する' },
        { from: '進行中', to: '保留', label: '保留にする' },
        { from: '保留', to: '進行中', label: '再開する' },
        { from: '進行中', to: '完了', label: '完了にする' },
      ],
    },
    views: [
      { name: '進行中', columns: ['project_name', 'client', 'pm', 'end_date', 'progress', 'status'], conditions: [{ field: 'status', op: 'ne', value: '完了' }], sort: { field: 'end_date', order: 'asc' } },
      { name: '完了', columns: ['project_name', 'client', 'pm', 'end_date'], conditions: [{ field: 'status', op: 'eq', value: '完了' }], sort: { field: 'end_date', order: 'desc' } },
    ],
    dashboard: {
      name: 'プロジェクト状況',
      widgets: [
        { type: 'kpi', title: '案件数', kpiMode: 'count' },
        { type: 'kpi', title: '進行中', kpiMode: 'open' },
        { type: 'kpi', title: '完了率', kpiMode: 'rate' },
        { type: 'chart', title: 'ステータス別', chartType: 'bar', groupField: 'status', metric: 'count' },
        { type: 'chart', title: 'PM別 件数', chartType: 'bar', groupField: 'pm', metric: 'count' },
        { type: 'chart', title: 'ステータス別 平均進捗', chartType: 'bar', groupField: 'status', metric: 'avg', valueField: 'progress' },
      ],
    },
  },
  {
    id: 'contract',
    name: '契約管理',
    category: '管理業務',
    icon: 'FileSignature',
    summary: '契約期間・金額・更新状況を管理（契約書添付）',
    description: '取引先との契約を期間・金額・更新有無で管理し、契約書を添付できます。',
    fields: [
      { fieldCode: 'contract_name', fieldType: 'text', label: '契約名', required: true },
      { fieldCode: 'partner', fieldType: 'text', label: '取引先' },
      { fieldCode: 'contract_type', fieldType: 'select', label: '契約種別', settings: { options: ['業務委託', '売買', '賃貸借', '保守', 'その他'] } },
      { fieldCode: 'start_date', fieldType: 'date', label: '開始日' },
      { fieldCode: 'end_date', fieldType: 'date', label: '終了日' },
      { fieldCode: 'amount', fieldType: 'number', label: '契約金額', settings: { unit: '円', thousandSeparator: true } },
      { fieldCode: 'auto_renew', fieldType: 'radio', label: '自動更新', settings: { options: ['有', '無'] } },
      { fieldCode: 'owner', fieldType: 'user_select', label: '管理担当' },
      { fieldCode: 'file', fieldType: 'file', label: '契約書' },
      { fieldCode: 'status', fieldType: 'status', label: 'ステータス', required: true, settings: { options: ['有効', '更新待ち', '終了'], defaultValue: '有効' } },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['有効', '更新待ち', '終了'],
      actions: [
        { from: '有効', to: '更新待ち', label: '更新待ちにする' },
        { from: '更新待ち', to: '有効', label: '更新する' },
        { from: '更新待ち', to: '終了', label: '終了する' },
      ],
    },
  },
  {
    id: 'minutes',
    name: '議事録',
    category: '社内業務',
    icon: 'StickyNote',
    summary: '会議の議題・決定事項・ToDo（明細）を記録',
    description: '会議の議題・決定事項を記録し、ToDo（担当・期限つき明細）を残せます。',
    fields: [
      { fieldCode: 'meeting_name', fieldType: 'text', label: '会議名', required: true },
      { fieldCode: 'meeting_at', fieldType: 'datetime', label: '日時' },
      { fieldCode: 'recorder', fieldType: 'user_select', label: '記録者' },
      { fieldCode: 'agenda', fieldType: 'textarea', label: '議題' },
      { fieldCode: 'decisions', fieldType: 'textarea', label: '決定事項' },
      {
        fieldCode: 'todos', fieldType: 'subtable', label: 'ToDo',
        settings: { columns: [
          { fieldCode: 'task', fieldType: 'text', label: '内容', settings: {} },
          { fieldCode: 'owner', fieldType: 'text', label: '担当', settings: {} },
          { fieldCode: 'due', fieldType: 'date', label: '期限', settings: {} },
        ] },
      },
      { fieldCode: 'note', fieldType: 'textarea', label: '備考' },
    ],
  },
  {
    id: 'contacts',
    name: '連絡先名簿',
    category: '顧客対応',
    icon: 'Contact',
    summary: 'メール・電話・Webサイト付きの連絡先台帳',
    description: '取引先・関係者の連絡先を、メール・電話・Webサイト付きで管理します。',
    fields: [
      { fieldCode: 'name', fieldType: 'text', label: '氏名', required: true },
      { fieldCode: 'company', fieldType: 'text', label: '会社名' },
      { fieldCode: 'title', fieldType: 'text', label: '役職' },
      { fieldCode: 'email', fieldType: 'email', label: 'メール' },
      { fieldCode: 'phone', fieldType: 'phone', label: '電話番号' },
      { fieldCode: 'website', fieldType: 'link', label: 'Webサイト' },
      { fieldCode: 'address', fieldType: 'text', label: '住所' },
      { fieldCode: 'category', fieldType: 'select', label: '区分', settings: { options: ['取引先', '見込み', 'パートナー', 'その他'] } },
      { fieldCode: 'note', fieldType: 'textarea', label: '備考' },
    ],
  },
  {
    id: 'doc_mgmt',
    name: '文書収受・決裁管理',
    category: '官公庁',
    icon: 'Stamp',
    summary: '公文書の収受・起案から決裁・施行・完結まで管理',
    description: '公文書を文書番号で管理し、起案→課長確認→決裁→施行→完結の決裁フローを記録します。',
    fields: [
      { fieldCode: 'doc_no', fieldType: 'auto_number', label: '文書番号', settings: { prefix: '文-', padding: 4 } },
      { fieldCode: 'subject', fieldType: 'text', label: '件名', required: true },
      { fieldCode: 'doc_type', fieldType: 'select', label: '文書種別', settings: { options: ['収受', '起案', '通知', '報告', 'その他'] } },
      { fieldCode: 'doc_date', fieldType: 'date', label: '収受／起案日' },
      { fieldCode: 'department', fieldType: 'text', label: '主管課' },
      { fieldCode: 'drafter', fieldType: 'user_select', label: '起案者' },
      { fieldCode: 'content', fieldType: 'textarea', label: '概要' },
      { fieldCode: 'file', fieldType: 'file', label: '文書ファイル' },
      { fieldCode: 'retention', fieldType: 'select', label: '保存年限', settings: { options: ['1年', '3年', '5年', '10年', '30年', '永年'] } },
      { fieldCode: 'status', fieldType: 'status', label: '決裁状況', required: true, settings: { options: ['起案', '課長確認', '決裁待ち', '決裁済', '施行', '完結'], defaultValue: '起案' } },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['起案', '課長確認', '決裁待ち', '決裁済', '施行', '完結'],
      actions: [
        { from: '起案', to: '課長確認', label: '課長へ回す' },
        { from: '課長確認', to: '決裁待ち', label: '決裁へ上げる' },
        { from: '決裁待ち', to: '決裁済', label: '決裁する' },
        { from: '決裁済', to: '施行', label: '施行する' },
        { from: '施行', to: '完結', label: '完結にする' },
      ],
    },
    reportConfig: {
      templates: [
        {
          id: 'ringi', name: '回議書', paper: 'A4', orientation: 'portrait',
          title: '回 議 書', subtitle: '文書番号: {doc_no}', showDate: true,
          blocks: [
            { type: 'fields', columns: 2, fieldCodes: ['subject', 'doc_type', 'doc_date', 'department', 'drafter', 'retention', 'status'] },
            { type: 'heading', content: '概要' },
            { type: 'text', content: '{content}' },
          ],
          footer: '本案のとおり決裁を求める。',
        },
      ],
    },
    views: [
      { name: '決裁待ち', columns: ['doc_no', 'subject', 'department', 'drafter', 'status'], conditions: [{ field: 'status', op: 'eq', value: '決裁待ち' }], sort: { field: 'doc_date', order: 'asc' } },
      { name: '未完結', columns: ['doc_no', 'subject', 'doc_type', 'drafter', 'status'], conditions: [{ field: 'status', op: 'ne', value: '完結' }], sort: { field: 'doc_date', order: 'asc' } },
    ],
    dashboard: {
      name: '文書管理状況',
      widgets: [
        { type: 'kpi', title: '文書総数', kpiMode: 'count' },
        { type: 'kpi', title: '未完結', kpiMode: 'open' },
        { type: 'chart', title: '決裁状況別', chartType: 'bar', groupField: 'status', metric: 'count' },
        { type: 'chart', title: '文書種別', chartType: 'pie', groupField: 'doc_type', metric: 'count' },
      ],
    },
  },
  {
    id: 'foia',
    name: '情報公開請求 受付管理',
    category: '官公庁',
    icon: 'FileSearch',
    summary: '開示請求の受付・期限・開示区分・通知までを管理',
    description: '情報公開（開示）請求を受付番号で管理し、決定期限・開示区分・通知状況を追跡します。',
    fields: [
      { fieldCode: 'req_no', fieldType: 'auto_number', label: '請求番号', settings: { prefix: '開示-', padding: 4 } },
      { fieldCode: 'requester', fieldType: 'text', label: '請求者' },
      { fieldCode: 'request_content', fieldType: 'textarea', label: '請求内容', required: true },
      { fieldCode: 'received_date', fieldType: 'date', label: '受付日' },
      { fieldCode: 'due_date', fieldType: 'date', label: '決定期限' },
      { fieldCode: 'staff', fieldType: 'user_select', label: '担当（担当課）' },
      { fieldCode: 'decision', fieldType: 'select', label: '開示区分', settings: { options: ['全部開示', '部分開示', '不開示', '不存在'] } },
      { fieldCode: 'status', fieldType: 'status', label: '対応状況', required: true, settings: { options: ['受付', '内容検討', '決定', '通知済'], defaultValue: '受付' } },
      { fieldCode: 'note', fieldType: 'textarea', label: '備考' },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['受付', '内容検討', '決定', '通知済'],
      actions: [
        { from: '受付', to: '内容検討', label: '検討を開始' },
        { from: '内容検討', to: '決定', label: '開示決定' },
        { from: '決定', to: '通知済', label: '通知する' },
      ],
    },
    reminderConfig: { enabled: true, dueDateField: 'due_date', assigneeField: 'staff', daysBefore: 5 },
    views: [
      { name: '対応中', columns: ['req_no', 'requester', 'received_date', 'due_date', 'staff', 'status'], conditions: [{ field: 'status', op: 'ne', value: '通知済' }], sort: { field: 'due_date', order: 'asc' } },
      { name: '開示区分別', columns: ['req_no', 'requester', 'decision', 'status'], conditions: [{ field: 'status', op: 'eq', value: '通知済' }], sort: { field: 'received_date', order: 'desc' } },
    ],
    dashboard: {
      name: '情報公開ダッシュボード',
      widgets: [
        { type: 'kpi', title: '請求総数', kpiMode: 'count' },
        { type: 'kpi', title: '対応中', kpiMode: 'open' },
        { type: 'chart', title: '対応状況別', chartType: 'bar', groupField: 'status', metric: 'count' },
        { type: 'chart', title: '開示区分別', chartType: 'pie', groupField: 'decision', metric: 'count' },
      ],
    },
  },
  {
    id: 'subsidy',
    name: '補助金 申請受付・審査',
    category: '官公庁',
    icon: 'HandCoins',
    summary: '補助金の申請受付・審査・交付決定を管理',
    description: '補助金申請を受付番号で管理し、審査から交付決定／不交付まで記録します。',
    fields: [
      { fieldCode: 'app_no', fieldType: 'auto_number', label: '申請番号', settings: { prefix: '補-', padding: 4 } },
      { fieldCode: 'applicant', fieldType: 'text', label: '申請者（団体名）', required: true },
      { fieldCode: 'program', fieldType: 'select', label: '補助メニュー', settings: { options: ['設備補助', '人材補助', '地域活性', 'その他'] } },
      { fieldCode: 'amount_requested', fieldType: 'number', label: '申請額', settings: { unit: '円', thousandSeparator: true } },
      { fieldCode: 'received_date', fieldType: 'date', label: '受付日' },
      { fieldCode: 'reviewer', fieldType: 'user_select', label: '審査担当' },
      { fieldCode: 'amount_granted', fieldType: 'number', label: '交付決定額', settings: { unit: '円', thousandSeparator: true } },
      { fieldCode: 'status', fieldType: 'status', label: '審査状況', required: true, settings: { options: ['受付', '審査中', '交付決定', '不交付'], defaultValue: '受付' } },
      { fieldCode: 'note', fieldType: 'textarea', label: '備考' },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['受付', '審査中', '交付決定', '不交付'],
      actions: [
        { from: '受付', to: '審査中', label: '審査を開始' },
        { from: '審査中', to: '交付決定', label: '交付決定' },
        { from: '審査中', to: '不交付', label: '不交付' },
      ],
    },
    views: [
      { name: '審査中', columns: ['app_no', 'applicant', 'program', 'amount_requested', 'reviewer', 'status'], conditions: [{ field: 'status', op: 'eq', value: '審査中' }], sort: { field: 'received_date', order: 'asc' } },
      { name: '交付決定', columns: ['app_no', 'applicant', 'program', 'amount_granted'], conditions: [{ field: 'status', op: 'eq', value: '交付決定' }], sort: { field: 'received_date', order: 'desc' } },
    ],
    dashboard: {
      name: '補助金審査ダッシュボード',
      widgets: [
        { type: 'kpi', title: '申請件数', kpiMode: 'count' },
        { type: 'kpi', title: '申請額合計', kpiMode: 'sum', valueField: 'amount_requested' },
        { type: 'kpi', title: '交付決定額合計', kpiMode: 'sum', valueField: 'amount_granted' },
        { type: 'chart', title: '審査状況別', chartType: 'bar', groupField: 'status', metric: 'count' },
        { type: 'chart', title: 'メニュー別', chartType: 'pie', groupField: 'program', metric: 'count' },
      ],
    },
  },
  {
    id: 'jsdf_ops',
    name: '部隊運用 総合管理（自衛隊・全機能デモ）',
    category: '自衛隊・防衛',
    icon: 'Radar',
    summary: '任務の発令〜計画〜承認〜実施〜完了を、全フィールド種・承認ルーティング・地図・AI・帳票・リマインドで一括管理する自衛隊向け総合デモ',
    description:
      '災害派遣・警戒監視・訓練演習・後方支援などの任務を1件として管理する、自衛隊向けの全機能デモアプリです。' +
      '任務番号の自動採番、所要資源の明細と経費の自動計算、即応態勢の自動判定（ルール表）、展開地点の地図記録、' +
      '指揮官による承認ルーティング、AIによる状況要約・行動方針案、任務報告書の帳票（PDF/印刷）、完了予定日のリマインドまでを最初から設定済みです。' +
      '「サンプルデータも作成する」を有効にすると、ダッシュボード・かんばん・カレンダー・地図・集計の各ビューがすぐに確認できます。',
    recordViewScope: 'all',
    recordEditScope: 'all',
    fields: [
      // ── 任務概要 ──
      { fieldCode: 'sec_mission', fieldType: 'section', label: '任務概要', settings: { description: '任務の区分・優先度・必要能力を入力します。任務番号は自動採番されます。' } },
      { fieldCode: 'mission_no', fieldType: 'auto_number', label: '任務番号', settings: { prefix: 'OP-', padding: 4 } },
      { fieldCode: 'title', fieldType: 'text', label: '任務名', required: true, settings: { maxLength: 200 } },
      { fieldCode: 'overview', fieldType: 'textarea', label: '任務概要・状況' },
      { fieldCode: 'mission_type', fieldType: 'select', label: '任務区分', settings: { options: ['災害派遣', '警戒監視', '訓練・演習', '後方支援', '国際平和協力', 'その他'], defaultValue: '災害派遣' } },
      { fieldCode: 'priority', fieldType: 'radio', label: '優先度', settings: { options: ['低', '中', '高', '緊急'], defaultValue: '中' } },
      { fieldCode: 'capabilities', fieldType: 'checkbox', label: '必要能力（複数選択）', settings: { options: ['人員輸送', '医療・救護', '給水・給食', '施設・道路啓開', '通信', '航空輸送'] } },

      // ── 指揮・部隊 ──
      { fieldCode: 'sec_command', fieldType: 'section', label: '指揮・部隊', settings: { description: '現地指揮官・承認者・担当部隊・日程。完了予定日が近づくと現地指揮官へ自動リマインドします。' } },
      { fieldCode: 'commander', fieldType: 'user_select', label: '現地指揮官' },
      { fieldCode: 'approver', fieldType: 'user_select', label: '承認者（指揮官）' },
      { fieldCode: 'unit_org', fieldType: 'group_select', label: '担当部隊' },
      { fieldCode: 'ordered_at', fieldType: 'datetime', label: '命令受領日時' },
      { fieldCode: 'start_date', fieldType: 'date', label: '行動開始日' },
      { fieldCode: 'due_date', fieldType: 'date', label: '完了予定日' },

      // ── 連絡先 ──
      { fieldCode: 'sec_contact', fieldType: 'section', label: '連絡先', settings: { description: 'メール・電話・関連資料URLはそのままリンクとして表示されます。' } },
      { fieldCode: 'contact_email', fieldType: 'email', label: '連絡先メール' },
      { fieldCode: 'contact_phone', fieldType: 'phone', label: '連絡先電話' },
      { fieldCode: 'ref_url', fieldType: 'link', label: '関連資料URL' },

      // ── 所要・経費 ──
      { fieldCode: 'sec_resource', fieldType: 'section', label: '所要・経費', settings: { description: '所要資源の明細から経費を集計し、税込合計と即応態勢を自動算出します（計算式とルール表の両方の例）。' } },
      {
        fieldCode: 'resources', fieldType: 'subtable', label: '所要資源',
        settings: { columns: [
          { fieldCode: 'name', fieldType: 'text', label: '品目', settings: {} },
          { fieldCode: 'qty', fieldType: 'number', label: '数量', settings: {} },
          { fieldCode: 'unit_price', fieldType: 'number', label: '単価', settings: { unit: '円', thousandSeparator: true } },
          { fieldCode: 'amount', fieldType: 'calc', label: '金額', settings: { formula: 'qty * unit_price', unit: '円', thousandSeparator: true } },
        ] },
      },
      { fieldCode: 'personnel', fieldType: 'number', label: '派遣人員', settings: { unit: '名' } },
      { fieldCode: 'budget', fieldType: 'number', label: '概算経費（税抜）', settings: { unit: '円', thousandSeparator: true } },
      { fieldCode: 'tax_rate', fieldType: 'number', label: '消費税率', settings: { unit: '%', defaultValue: 10 } },
      { fieldCode: 'total', fieldType: 'calc', label: '税込合計', settings: { formula: 'budget + budget * tax_rate / 100', unit: '円', thousandSeparator: true } },
      { fieldCode: 'readiness', fieldType: 'number', label: '準備完了率', settings: { unit: '%' } },
      { fieldCode: 'readiness_level', fieldType: 'calc', label: '即応態勢（自動判定）', settings: { mode: 'rules', fallback: '準備中', rules: [
        { when: [{ field: 'readiness', op: '>=', value: 100 }], result: '即応可' },
        { when: [{ field: 'readiness', op: '>=', value: 70 }], result: '概ね可' },
        { when: [{ field: 'readiness', op: '>=', value: 30 }], result: '準備中' },
      ] } },

      // ── 展開地点 ──
      { fieldCode: 'sec_map', fieldType: 'section', label: '展開地点', settings: { description: '地図をクリックまたは現在地ボタンで展開地点を記録します（一覧の「地図」タブでピン表示）。' } },
      { fieldCode: 'area_name', fieldType: 'text', label: '展開地点名称' },
      { fieldCode: 'site', fieldType: 'location', label: '展開地点', settings: { zoom: 9, center: { lat: 36.2, lng: 138.3 } } },

      // ── 添付・参照・AI ──
      { fieldCode: 'sec_extra', fieldType: 'section', label: '添付・参照・AI', settings: { description: '添付資料、関連任務の参照、AIによる状況要約・行動方針案。' } },
      { fieldCode: 'attachment', fieldType: 'file', label: '添付資料' },
      { fieldCode: 'related', fieldType: 'reference', label: '関連任務（参照先はアプリ設定で指定）', settings: {} },
      { fieldCode: 'action_plan', fieldType: 'textarea', label: '行動方針（AIアクションの書き込み先）' },
      { fieldCode: 'ai_summary', fieldType: 'ai', label: 'AI状況要約', settings: { prompt: '次の任務を3行以内で要約してください。\n任務名: {title}\n区分: {mission_type}\n概要: {overview}', maxTokens: 512 } },

      // ── ステータス ──
      { fieldCode: 'sec_status', fieldType: 'section', label: 'ステータス管理', settings: { description: '要請受理→計画→承認待ち→実施中→完了のワークフロー。発令の承認は承認者本人のみ実行できます。' } },
      { fieldCode: 'status', fieldType: 'status', label: 'ステータス', required: true, settings: { options: ['要請受理', '計画', '承認待ち', '実施中', '完了'], defaultValue: '要請受理' } },
      { fieldCode: 'note', fieldType: 'textarea', label: '特記事項' },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['要請受理', '計画', '承認待ち', '実施中', '完了'],
      actions: [
        { from: '要請受理', to: '計画', label: '計画着手' },
        { from: '計画', to: '承認待ち', label: '承認を申請' },
        { from: '承認待ち', to: '実施中', label: '承認して発令', approver: 'approver' },
        { from: '承認待ち', to: '計画', label: '差し戻す', approver: 'approver' },
        { from: '実施中', to: '完了', label: '完了にする' },
      ],
    },
    aiConfig: {
      actions: [
        { id: 'summarize', name: '状況を要約', output: 'show', prompt: '次の任務の状況を、要点が分かるように3行で要約してください。\n\n{_record}' },
        { id: 'plan', name: '行動方針を提案', output: 'field', targetField: 'action_plan', prompt: '次の任務に対する具体的な行動方針を、安全管理上の留意点を含めて箇条書きで提案してください。\n\n任務名: {title}\n区分: {mission_type}\n概要: {overview}\n優先度: {priority}' },
      ],
    },
    reportConfig: {
      templates: [
        {
          id: 'mission_report',
          name: '任務報告書',
          paper: 'A4',
          orientation: 'portrait',
          title: '任 務 報 告 書',
          subtitle: '任務番号: {mission_no} ／ 任務名: {title}',
          showDate: true,
          blocks: [
            { type: 'heading', content: '任務概要' },
            { type: 'fields', columns: 2, fieldCodes: ['mission_type', 'priority', 'commander', 'unit_org', 'start_date', 'due_date', 'status', 'readiness_level'] },
            { type: 'heading', content: '状況' },
            { type: 'fields', columns: 1, fieldCodes: ['overview'] },
            { type: 'heading', content: '所要資源' },
            { type: 'subtable', fieldCode: 'resources' },
            { type: 'fields', columns: 2, fieldCodes: ['personnel', 'budget', 'tax_rate', 'total'] },
            { type: 'heading', content: '行動方針' },
            { type: 'fields', columns: 1, fieldCodes: ['action_plan'] },
          ],
          footer: '本書は {title} に関する任務報告書です。',
        },
      ],
    },
    reminderConfig: { enabled: true, dueDateField: 'due_date', assigneeField: 'commander', daysBefore: 3 },
    views: [
      { name: '実施中（未完了）', columns: ['mission_no', 'title', 'mission_type', 'priority', 'commander', 'due_date', 'status'], conditions: [{ field: 'status', op: 'ne', value: '完了' }], sort: { field: 'due_date', order: 'asc' } },
      { name: '承認待ち', columns: ['mission_no', 'title', 'commander', 'approver', 'status'], conditions: [{ field: 'status', op: 'eq', value: '承認待ち' }], sort: { field: 'ordered_at', order: 'asc' } },
      { name: '緊急任務', columns: ['mission_no', 'title', 'mission_type', 'commander', 'status'], conditions: [{ field: 'priority', op: 'eq', value: '緊急' }], sort: { field: 'due_date', order: 'asc' } },
    ],
    dashboard: {
      name: '部隊運用ダッシュボード',
      widgets: [
        { type: 'kpi', title: '任務総数', kpiMode: 'count' },
        { type: 'kpi', title: '実施・準備中', kpiMode: 'open' },
        { type: 'kpi', title: '完了率', kpiMode: 'rate' },
        { type: 'chart', title: 'ステータス別', chartType: 'bar', groupField: 'status', metric: 'count' },
        { type: 'chart', title: '任務区分別', chartType: 'pie', groupField: 'mission_type', metric: 'count' },
        { type: 'chart', title: '区分別 派遣人員', chartType: 'bar', groupField: 'mission_type', metric: 'sum', valueField: 'personnel' },
        { type: 'map', title: '展開地点マップ', groupField: 'site' },
      ],
    },
  },
  {
    id: 'duty',
    name: '当直・勤務管理',
    category: '自衛隊・防衛',
    icon: 'ClipboardCheck',
    summary: '当直・週番の勤務記録と引継事項を管理',
    description: '当直・週番などの勤務を記録し、引継事項・異状の有無を残して引継完了まで管理します。',
    fields: [
      { fieldCode: 'duty_date', fieldType: 'date', label: '勤務日', required: true },
      { fieldCode: 'duty_type', fieldType: 'select', label: '区分', settings: { options: ['当直', '週番', 'ＣＱ', '日直'] } },
      { fieldCode: 'person', fieldType: 'user_select', label: '勤務者' },
      { fieldCode: 'handover', fieldType: 'textarea', label: '引継事項' },
      { fieldCode: 'abnormal', fieldType: 'textarea', label: '異状・特記事項' },
      { fieldCode: 'status', fieldType: 'status', label: '状況', required: true, settings: { options: ['勤務中', '引継完了'], defaultValue: '勤務中' } },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['勤務中', '引継完了'],
      actions: [{ from: '勤務中', to: '引継完了', label: '引継完了にする' }],
    },
  },
  {
    id: 'safety',
    name: 'ヒヤリハット・安全報告',
    category: '自衛隊・防衛',
    icon: 'ShieldAlert',
    summary: 'ヒヤリハット・事故の報告と対策の進捗を管理',
    description: 'ヒヤリハットや事故・故障を報告番号で管理し、調査→対策→完了まで安全管理します。',
    fields: [
      { fieldCode: 'report_no', fieldType: 'auto_number', label: '報告番号', settings: { prefix: '安-', padding: 4 } },
      { fieldCode: 'occurred_date', fieldType: 'date', label: '発生日', required: true },
      { fieldCode: 'place', fieldType: 'text', label: '発生場所' },
      { fieldCode: 'category', fieldType: 'select', label: '区分', settings: { options: ['ヒヤリハット', '事故', '故障', 'その他'] } },
      { fieldCode: 'severity', fieldType: 'select', label: '危険度', settings: { options: ['低', '中', '高'], defaultValue: '中' } },
      { fieldCode: 'content', fieldType: 'textarea', label: '内容', required: true },
      { fieldCode: 'reporter', fieldType: 'user_select', label: '報告者' },
      { fieldCode: 'countermeasure', fieldType: 'textarea', label: '対策' },
      { fieldCode: 'status', fieldType: 'status', label: '対応状況', required: true, settings: { options: ['報告', '調査中', '対策実施', '完了'], defaultValue: '報告' } },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['報告', '調査中', '対策実施', '完了'],
      actions: [
        { from: '報告', to: '調査中', label: '調査を開始' },
        { from: '調査中', to: '対策実施', label: '対策を実施' },
        { from: '対策実施', to: '完了', label: '完了にする' },
      ],
    },
  },
  {
    id: 'production',
    name: '生産指示・実績',
    category: '製造',
    icon: 'Factory',
    summary: '生産指示と実績数量を工程ステータスで管理',
    description: '製造の生産指示を指示番号で管理し、計画→加工→検査→完成の工程と実績数量を記録します。',
    fields: [
      { fieldCode: 'order_no', fieldType: 'auto_number', label: '指示番号', settings: { prefix: '生-', padding: 4 } },
      { fieldCode: 'product', fieldType: 'text', label: '品名', required: true },
      { fieldCode: 'qty', fieldType: 'number', label: '指示数量', settings: { unit: '個' } },
      { fieldCode: 'done_qty', fieldType: 'number', label: '実績数量', settings: { unit: '個' } },
      { fieldCode: 'line', fieldType: 'text', label: '製造ライン' },
      { fieldCode: 'assignee', fieldType: 'user_select', label: '担当' },
      { fieldCode: 'start_date', fieldType: 'date', label: '着手予定' },
      { fieldCode: 'due_date', fieldType: 'date', label: '完了予定' },
      { fieldCode: 'status', fieldType: 'status', label: '工程', required: true, settings: { options: ['計画', '加工中', '検査', '完成'], defaultValue: '計画' } },
    ],
    processConfig: { enabled: true, statusField: 'status', statuses: ['計画', '加工中', '検査', '完成'], actions: [
      { from: '計画', to: '加工中', label: '加工開始' },
      { from: '加工中', to: '検査', label: '検査へ' },
      { from: '検査', to: '完成', label: '完成にする' },
    ] },
  },
  {
    id: 'quality',
    name: '品質・不良管理',
    category: '製造',
    icon: 'Factory',
    summary: '不良の発生〜原因調査〜是正処置を管理',
    description: '不良・不適合を報告番号で管理し、原因調査から是正処置・完了まで追跡します。',
    fields: [
      { fieldCode: 'report_no', fieldType: 'auto_number', label: '不良報告番号', settings: { prefix: '品-', padding: 4 } },
      { fieldCode: 'occurred_date', fieldType: 'date', label: '発生日', required: true },
      { fieldCode: 'product', fieldType: 'text', label: '品名' },
      { fieldCode: 'defect_content', fieldType: 'textarea', label: '不良内容', required: true },
      { fieldCode: 'qty', fieldType: 'number', label: '不良数', settings: { unit: '個' } },
      { fieldCode: 'cause', fieldType: 'textarea', label: '原因' },
      { fieldCode: 'action', fieldType: 'textarea', label: '是正処置' },
      { fieldCode: 'assignee', fieldType: 'user_select', label: '担当' },
      { fieldCode: 'status', fieldType: 'status', label: '対応状況', required: true, settings: { options: ['発生', '原因調査', '是正処置', '完了'], defaultValue: '発生' } },
    ],
    processConfig: { enabled: true, statusField: 'status', statuses: ['発生', '原因調査', '是正処置', '完了'], actions: [
      { from: '発生', to: '原因調査', label: '調査開始' },
      { from: '原因調査', to: '是正処置', label: '是正する' },
      { from: '是正処置', to: '完了', label: '完了にする' },
    ] },
  },
  {
    id: 'sales_daily',
    name: '売上日報',
    category: '小売・店舗',
    icon: 'Store',
    summary: '店舗の売上・客数から客単価を自動計算',
    description: '店舗ごとの日次売上・客数を記録し、客単価を自動計算します。',
    fields: [
      { fieldCode: 'report_date', fieldType: 'date', label: '日付', required: true },
      { fieldCode: 'store', fieldType: 'text', label: '店舗' },
      { fieldCode: 'sales', fieldType: 'number', label: '売上高', settings: { unit: '円', thousandSeparator: true } },
      { fieldCode: 'customers', fieldType: 'number', label: '客数', settings: { unit: '人' } },
      { fieldCode: 'avg_spend', fieldType: 'calc', label: '客単価', settings: { formula: 'sales / customers', unit: '円', thousandSeparator: true } },
      { fieldCode: 'staff', fieldType: 'user_select', label: '報告者' },
      { fieldCode: 'note', fieldType: 'textarea', label: '特記事項' },
    ],
    dashboard: {
      name: '売上ダッシュボード',
      widgets: [
        { type: 'kpi', title: '売上合計', kpiMode: 'sum', valueField: 'sales' },
        { type: 'kpi', title: '客数合計', kpiMode: 'sum', valueField: 'customers' },
        { type: 'chart', title: '店舗別 売上', chartType: 'bar', groupField: 'store', metric: 'sum', valueField: 'sales' },
        { type: 'chart', title: '日別 売上', chartType: 'line', groupField: 'report_date', metric: 'sum', valueField: 'sales' },
      ],
    },
  },
  {
    id: 'incident_med',
    name: '医療安全インシデント報告',
    category: '医療・介護',
    icon: 'ShieldAlert',
    summary: 'ヒヤリハット・アクシデントを報告〜対策で管理',
    description: '医療安全のインシデントを影響度付きで報告し、分析→対策→完了まで管理します。',
    fields: [
      { fieldCode: 'report_no', fieldType: 'auto_number', label: '報告番号', settings: { prefix: '医安-', padding: 4 } },
      { fieldCode: 'occurred_at', fieldType: 'datetime', label: '発生日時', required: true },
      { fieldCode: 'category', fieldType: 'select', label: '区分', settings: { options: ['ヒヤリハット', 'アクシデント'] } },
      { fieldCode: 'level', fieldType: 'select', label: '影響度', settings: { options: ['レベル0', 'レベル1', 'レベル2', 'レベル3以上'] } },
      { fieldCode: 'content', fieldType: 'textarea', label: '内容', required: true },
      { fieldCode: 'action', fieldType: 'textarea', label: '対策' },
      { fieldCode: 'reporter', fieldType: 'user_select', label: '報告者' },
      { fieldCode: 'status', fieldType: 'status', label: '対応状況', required: true, settings: { options: ['報告', '分析', '対策', '完了'], defaultValue: '報告' } },
    ],
    processConfig: { enabled: true, statusField: 'status', statuses: ['報告', '分析', '対策', '完了'], actions: [
      { from: '報告', to: '分析', label: '分析開始' },
      { from: '分析', to: '対策', label: '対策立案' },
      { from: '対策', to: '完了', label: '完了にする' },
    ] },
    views: [
      { name: '未完了', columns: ['report_no', 'occurred_at', 'category', 'level', 'reporter', 'status'], conditions: [{ field: 'status', op: 'ne', value: '完了' }], sort: { field: 'occurred_at', order: 'desc' } },
      { name: 'アクシデント', columns: ['report_no', 'occurred_at', 'level', 'content', 'status'], conditions: [{ field: 'category', op: 'eq', value: 'アクシデント' }], sort: { field: 'occurred_at', order: 'desc' } },
    ],
    dashboard: {
      name: '医療安全ダッシュボード',
      widgets: [
        { type: 'kpi', title: '報告総数', kpiMode: 'count' },
        { type: 'kpi', title: '未完了', kpiMode: 'open' },
        { type: 'chart', title: '影響度別', chartType: 'bar', groupField: 'level', metric: 'count' },
        { type: 'chart', title: '区分別', chartType: 'pie', groupField: 'category', metric: 'count' },
      ],
    },
  },
  {
    id: 'course',
    name: '受講者・申込管理',
    category: '教育',
    icon: 'GraduationCap',
    summary: '講座の申込受付から修了までを管理（連絡先付き）',
    description: '受講申込を申込番号で管理し、申込→受付→受講中→修了の状況を追跡します。',
    fields: [
      { fieldCode: 'entry_no', fieldType: 'auto_number', label: '申込番号', settings: { prefix: '受-', padding: 4 } },
      { fieldCode: 'name', fieldType: 'text', label: '受講者名', required: true },
      { fieldCode: 'email', fieldType: 'email', label: 'メール' },
      { fieldCode: 'course_name', fieldType: 'select', label: '講座名', settings: { options: ['基礎コース', '応用コース', '資格対策', 'セミナー'] } },
      { fieldCode: 'apply_date', fieldType: 'date', label: '申込日' },
      { fieldCode: 'staff', fieldType: 'user_select', label: '担当' },
      { fieldCode: 'status', fieldType: 'status', label: '状況', required: true, settings: { options: ['申込', '受付', '受講中', '修了', 'キャンセル'], defaultValue: '申込' } },
    ],
    processConfig: { enabled: true, statusField: 'status', statuses: ['申込', '受付', '受講中', '修了', 'キャンセル'], actions: [
      { from: '申込', to: '受付', label: '受付する' },
      { from: '受付', to: '受講中', label: '受講開始' },
      { from: '受講中', to: '修了', label: '修了にする' },
      { from: '申込', to: 'キャンセル', label: 'キャンセル' },
      { from: '受付', to: 'キャンセル', label: 'キャンセル' },
    ] },
  },
  {
    id: 'site',
    name: '現場・工事管理',
    category: '建設・不動産',
    icon: 'HardHat',
    summary: '工事を着工前〜施工〜竣工で進捗率とともに管理',
    description: '工事を工事番号で管理し、工期・進捗率・現場監督とともに着工前→施工中→検査→竣工を追跡します。',
    fields: [
      { fieldCode: 'site_no', fieldType: 'auto_number', label: '工事番号', settings: { prefix: '工-', padding: 4 } },
      { fieldCode: 'site_name', fieldType: 'text', label: '工事名', required: true },
      { fieldCode: 'address', fieldType: 'text', label: '現場住所' },
      { fieldCode: 'geo', fieldType: 'location', label: '現場位置（地図）', settings: { zoom: 14, center: { lat: 35.681236, lng: 139.767125 } } },
      { fieldCode: 'client', fieldType: 'text', label: '施主' },
      { fieldCode: 'start_date', fieldType: 'date', label: '着工日' },
      { fieldCode: 'end_date', fieldType: 'date', label: '完工予定' },
      { fieldCode: 'progress', fieldType: 'number', label: '進捗率', settings: { unit: '%' } },
      { fieldCode: 'manager', fieldType: 'user_select', label: '現場監督' },
      { fieldCode: 'status', fieldType: 'status', label: '状況', required: true, settings: { options: ['着工前', '施工中', '検査', '竣工'], defaultValue: '着工前' } },
    ],
    processConfig: { enabled: true, statusField: 'status', statuses: ['着工前', '施工中', '検査', '竣工'], actions: [
      { from: '着工前', to: '施工中', label: '着工する' },
      { from: '施工中', to: '検査', label: '検査へ' },
      { from: '検査', to: '竣工', label: '竣工する' },
    ] },
    views: [
      { name: '施工中', columns: ['site_no', 'site_name', 'client', 'manager', 'end_date', 'progress', 'status'], conditions: [{ field: 'status', op: 'ne', value: '竣工' }], sort: { field: 'end_date', order: 'asc' } },
    ],
    dashboard: {
      name: '工事状況',
      widgets: [
        { type: 'kpi', title: '工事件数', kpiMode: 'count' },
        { type: 'kpi', title: '進行中', kpiMode: 'open' },
        { type: 'chart', title: '状況別', chartType: 'bar', groupField: 'status', metric: 'count' },
        { type: 'map', title: '現場マップ', groupField: 'geo' },
      ],
    },
  },
  {
    id: 'property',
    name: '物件管理（不動産）',
    category: '建設・不動産',
    icon: 'Building',
    summary: '物件の募集〜成約を価格・掲載URL付きで管理',
    description: '物件を物件番号で管理し、種別・賃料／価格・掲載URLとともに募集中→申込→成約を追跡します。',
    fields: [
      { fieldCode: 'prop_no', fieldType: 'auto_number', label: '物件番号', settings: { prefix: '物-', padding: 4 } },
      { fieldCode: 'prop_name', fieldType: 'text', label: '物件名', required: true },
      { fieldCode: 'address', fieldType: 'text', label: '所在地' },
      { fieldCode: 'geo', fieldType: 'location', label: '所在地（地図）', settings: { zoom: 15, center: { lat: 35.681236, lng: 139.767125 } } },
      { fieldCode: 'prop_type', fieldType: 'select', label: '種別', settings: { options: ['賃貸', '売買', '事業用'] } },
      { fieldCode: 'price', fieldType: 'number', label: '賃料／価格', settings: { unit: '円', thousandSeparator: true } },
      { fieldCode: 'url', fieldType: 'link', label: '掲載URL' },
      { fieldCode: 'agent', fieldType: 'user_select', label: '担当' },
      { fieldCode: 'status', fieldType: 'status', label: '状況', required: true, settings: { options: ['募集中', '申込', '成約', '取下げ'], defaultValue: '募集中' } },
    ],
    processConfig: { enabled: true, statusField: 'status', statuses: ['募集中', '申込', '成約', '取下げ'], actions: [
      { from: '募集中', to: '申込', label: '申込受付' },
      { from: '申込', to: '成約', label: '成約にする' },
      { from: '募集中', to: '取下げ', label: '取下げ' },
    ] },
    views: [
      { name: '募集中', columns: ['prop_no', 'prop_name', 'address', 'prop_type', 'price', 'agent', 'status'], conditions: [{ field: 'status', op: 'eq', value: '募集中' }], sort: { field: 'price', order: 'asc' } },
    ],
    dashboard: {
      name: '物件ダッシュボード',
      widgets: [
        { type: 'kpi', title: '物件数', kpiMode: 'count' },
        { type: 'chart', title: '状況別', chartType: 'pie', groupField: 'status', metric: 'count' },
        { type: 'chart', title: '種別別', chartType: 'bar', groupField: 'prop_type', metric: 'count' },
        { type: 'map', title: '物件マップ', groupField: 'geo' },
      ],
    },
  },
  {
    id: 'it_incident',
    name: '障害（インシデント）管理',
    category: 'IT・情報システム',
    icon: 'Server',
    summary: 'システム障害を検知〜復旧〜再発防止で管理',
    description: 'システム障害を管理番号で記録し、影響度とともに検知→調査→復旧→再発防止を追跡します。',
    fields: [
      { fieldCode: 'inc_no', fieldType: 'auto_number', label: '管理番号', settings: { prefix: 'INC-', padding: 4 } },
      { fieldCode: 'detected_at', fieldType: 'datetime', label: '検知日時', required: true },
      { fieldCode: 'system', fieldType: 'text', label: '対象システム' },
      { fieldCode: 'impact', fieldType: 'select', label: '影響度', settings: { options: ['軽微', '中', '重大', '全面停止'] } },
      { fieldCode: 'content', fieldType: 'textarea', label: '事象', required: true },
      { fieldCode: 'action', fieldType: 'textarea', label: '対応内容' },
      { fieldCode: 'assignee', fieldType: 'user_select', label: '担当' },
      { fieldCode: 'status', fieldType: 'status', label: '対応状況', required: true, settings: { options: ['検知', '調査', '復旧', '再発防止', '完了'], defaultValue: '検知' } },
    ],
    processConfig: { enabled: true, statusField: 'status', statuses: ['検知', '調査', '復旧', '再発防止', '完了'], actions: [
      { from: '検知', to: '調査', label: '調査開始' },
      { from: '調査', to: '復旧', label: '復旧する' },
      { from: '復旧', to: '再発防止', label: '再発防止へ' },
      { from: '再発防止', to: '完了', label: '完了にする' },
    ] },
    views: [
      { name: '対応中', columns: ['inc_no', 'detected_at', 'system', 'impact', 'assignee', 'status'], conditions: [{ field: 'status', op: 'ne', value: '完了' }], sort: { field: 'detected_at', order: 'desc' } },
      { name: '重大・全面停止', columns: ['inc_no', 'system', 'impact', 'assignee', 'status'], conditions: [{ field: 'impact', op: 'eq', value: '全面停止' }], sort: { field: 'detected_at', order: 'desc' } },
    ],
    dashboard: {
      name: '障害ダッシュボード',
      widgets: [
        { type: 'kpi', title: '障害総数', kpiMode: 'count' },
        { type: 'kpi', title: '対応中', kpiMode: 'open' },
        { type: 'kpi', title: '完了率', kpiMode: 'rate' },
        { type: 'chart', title: '対応状況別', chartType: 'bar', groupField: 'status', metric: 'count' },
        { type: 'chart', title: '影響度別', chartType: 'pie', groupField: 'impact', metric: 'count' },
      ],
    },
  },
  {
    id: 'delivery',
    name: '配送管理',
    category: '物流・運送',
    icon: 'PackageCheck',
    summary: '配送を受注〜出荷〜配達完了で管理（連絡先付き）',
    description: '配送を伝票番号で管理し、ドライバー・配送日とともに受注→出荷→配送中→配達完了を追跡します。',
    fields: [
      { fieldCode: 'slip_no', fieldType: 'auto_number', label: '伝票番号', settings: { prefix: '配-', padding: 5 } },
      { fieldCode: 'destination', fieldType: 'text', label: '配送先', required: true },
      { fieldCode: 'address', fieldType: 'text', label: '住所' },
      { fieldCode: 'geo', fieldType: 'location', label: '配達先（地図）', settings: { zoom: 13, center: { lat: 35.681236, lng: 139.767125 } } },
      { fieldCode: 'phone', fieldType: 'phone', label: '連絡先' },
      { fieldCode: 'item', fieldType: 'text', label: '品名' },
      { fieldCode: 'delivery_date', fieldType: 'date', label: '配送日' },
      { fieldCode: 'driver', fieldType: 'user_select', label: 'ドライバー' },
      { fieldCode: 'status', fieldType: 'status', label: '状況', required: true, settings: { options: ['受注', '出荷', '配送中', '配達完了', '不在'], defaultValue: '受注' } },
    ],
    processConfig: { enabled: true, statusField: 'status', statuses: ['受注', '出荷', '配送中', '配達完了', '不在'], actions: [
      { from: '受注', to: '出荷', label: '出荷する' },
      { from: '出荷', to: '配送中', label: '配送開始' },
      { from: '配送中', to: '配達完了', label: '配達完了' },
      { from: '配送中', to: '不在', label: '不在' },
      { from: '不在', to: '配送中', label: '再配達' },
    ] },
    views: [
      { name: '配送中・未完了', columns: ['slip_no', 'destination', 'item', 'delivery_date', 'driver', 'status'], conditions: [{ field: 'status', op: 'ne', value: '配達完了' }], sort: { field: 'delivery_date', order: 'asc' } },
    ],
    dashboard: {
      name: '配送ダッシュボード',
      widgets: [
        { type: 'kpi', title: '配送件数', kpiMode: 'count' },
        { type: 'kpi', title: '未完了', kpiMode: 'open' },
        { type: 'chart', title: '状況別', chartType: 'bar', groupField: 'status', metric: 'count' },
        { type: 'map', title: '配達先マップ', groupField: 'geo' },
      ],
    },
  },
  {
    id: 'regulation',
    name: '規程・文書管理',
    category: '法務・コンプライアンス',
    icon: 'Scale',
    summary: '社内規程・様式を制定〜改定〜廃止で管理',
    description: '社内規程・マニュアルを規程番号で管理し、制定→改定→廃止のライフサイクルを記録します。',
    fields: [
      { fieldCode: 'reg_no', fieldType: 'auto_number', label: '規程番号', settings: { prefix: '規-', padding: 4 } },
      { fieldCode: 'reg_name', fieldType: 'text', label: '規程名', required: true },
      { fieldCode: 'reg_type', fieldType: 'select', label: '種別', settings: { options: ['規程', '要領', 'マニュアル', '様式'] } },
      { fieldCode: 'enacted_date', fieldType: 'date', label: '制定日' },
      { fieldCode: 'revised_date', fieldType: 'date', label: '最終改定日' },
      { fieldCode: 'owner', fieldType: 'user_select', label: '所管' },
      { fieldCode: 'file', fieldType: 'file', label: '文書' },
      { fieldCode: 'status', fieldType: 'status', label: '状態', required: true, settings: { options: ['制定', '改定', '廃止'], defaultValue: '制定' } },
    ],
    processConfig: { enabled: true, statusField: 'status', statuses: ['制定', '改定', '廃止'], actions: [
      { from: '制定', to: '改定', label: '改定する' },
      { from: '改定', to: '廃止', label: '廃止する' },
      { from: '制定', to: '廃止', label: '廃止する' },
    ] },
  },
  {
    id: 'fitness',
    name: '体力検定',
    category: '自衛隊・防衛',
    icon: 'Dumbbell',
    summary: '種目記録から得点・級・総合判定を性別×年齢区分でルール表自動採点',
    description: '体力検定を受検番号で管理。種目の記録を入れると、得点・合計・級・総合判定を「ルール表（条件分岐）」で自動採点します。3,000m走は年齢区分別、握力は性別別の基準。基準値はアプリ設定のルール表で自由に変更できます。',
    fields: [
      { fieldCode: 'test_no', fieldType: 'auto_number', label: '受検番号', settings: { prefix: '体-', padding: 4 } },
      { fieldCode: 'person', fieldType: 'user_select', label: '受検者', required: true },
      { fieldCode: 'test_date', fieldType: 'date', label: '検定日', required: true },
      { fieldCode: 'gender', fieldType: 'select', label: '性別', settings: { options: ['男', '女'] } },
      { fieldCode: 'age', fieldType: 'number', label: '年齢', settings: { unit: '歳' } },
      { fieldCode: 'pushups', fieldType: 'number', label: '腕立て伏せ', settings: { unit: '回' } },
      { fieldCode: 'pt_pushups', fieldType: 'calc', label: '腕立て得点', settings: { unit: '点', mode: 'rules', fallback: 1, rules: [
        { when: [{ field: 'pushups', op: '<=', value: 0 }], result: 0 },
        { when: [{ field: 'pushups', op: '>=', value: 60 }], result: 10 },
        { when: [{ field: 'pushups', op: '>=', value: 50 }], result: 8 },
        { when: [{ field: 'pushups', op: '>=', value: 40 }], result: 6 },
        { when: [{ field: 'pushups', op: '>=', value: 30 }], result: 4 },
        { when: [{ field: 'pushups', op: '>=', value: 20 }], result: 2 },
      ] } },
      { fieldCode: 'situps', fieldType: 'number', label: '腹筋（上体起こし）', settings: { unit: '回' } },
      { fieldCode: 'pt_situps', fieldType: 'calc', label: '腹筋得点', settings: { unit: '点', mode: 'rules', fallback: 1, rules: [
        { when: [{ field: 'situps', op: '<=', value: 0 }], result: 0 },
        { when: [{ field: 'situps', op: '>=', value: 60 }], result: 10 },
        { when: [{ field: 'situps', op: '>=', value: 50 }], result: 8 },
        { when: [{ field: 'situps', op: '>=', value: 40 }], result: 6 },
        { when: [{ field: 'situps', op: '>=', value: 30 }], result: 4 },
        { when: [{ field: 'situps', op: '>=', value: 20 }], result: 2 },
      ] } },
      { fieldCode: 'run_sec', fieldType: 'number', label: '3,000m走（秒）', settings: { unit: '秒' } },
      { fieldCode: 'pt_run', fieldType: 'calc', label: '走得点（年齢区分別）', settings: { unit: '点', mode: 'rules', fallback: 2, rules: [
        { when: [{ field: 'run_sec', op: '<=', value: 0 }], result: 0 },
        { when: [{ field: 'age', op: '<', value: 30 }, { field: 'run_sec', op: '<=', value: 720 }], result: 10 },
        { when: [{ field: 'age', op: '<', value: 30 }, { field: 'run_sec', op: '<=', value: 780 }], result: 8 },
        { when: [{ field: 'age', op: '<', value: 30 }, { field: 'run_sec', op: '<=', value: 840 }], result: 6 },
        { when: [{ field: 'age', op: '<', value: 30 }, { field: 'run_sec', op: '<=', value: 900 }], result: 4 },
        { when: [{ field: 'age', op: '<', value: 30 }], result: 2 },
        { when: [{ field: 'run_sec', op: '<=', value: 780 }], result: 10 },
        { when: [{ field: 'run_sec', op: '<=', value: 840 }], result: 8 },
        { when: [{ field: 'run_sec', op: '<=', value: 900 }], result: 6 },
        { when: [{ field: 'run_sec', op: '<=', value: 960 }], result: 4 },
      ] } },
      { fieldCode: 'grip', fieldType: 'number', label: '握力', settings: { unit: 'kg' } },
      { fieldCode: 'pt_grip', fieldType: 'calc', label: '握力得点（性別別）', settings: { unit: '点', mode: 'rules', fallback: 2, rules: [
        { when: [{ field: 'grip', op: '<=', value: 0 }], result: 0 },
        { when: [{ field: 'gender', op: '==', value: '男' }, { field: 'grip', op: '>=', value: 55 }], result: 10 },
        { when: [{ field: 'gender', op: '==', value: '男' }, { field: 'grip', op: '>=', value: 50 }], result: 8 },
        { when: [{ field: 'gender', op: '==', value: '男' }, { field: 'grip', op: '>=', value: 45 }], result: 6 },
        { when: [{ field: 'gender', op: '==', value: '男' }, { field: 'grip', op: '>=', value: 40 }], result: 4 },
        { when: [{ field: 'gender', op: '==', value: '男' }], result: 2 },
        { when: [{ field: 'grip', op: '>=', value: 35 }], result: 10 },
        { when: [{ field: 'grip', op: '>=', value: 30 }], result: 8 },
        { when: [{ field: 'grip', op: '>=', value: 27 }], result: 6 },
        { when: [{ field: 'grip', op: '>=', value: 24 }], result: 4 },
      ] } },
      { fieldCode: 'total_points', fieldType: 'calc', label: '合計得点', settings: { formula: 'pt_pushups + pt_situps + pt_run + pt_grip', unit: '点' } },
      { fieldCode: 'grade', fieldType: 'calc', label: '判定（級）', settings: { unit: '級', mode: 'rules', fallback: 5, rules: [
        { when: [{ field: 'total_points', op: '<=', value: 0 }], result: 0 },
        { when: [{ field: 'total_points', op: '>=', value: 36 }], result: 1 },
        { when: [{ field: 'total_points', op: '>=', value: 30 }], result: 2 },
        { when: [{ field: 'total_points', op: '>=', value: 22 }], result: 3 },
        { when: [{ field: 'total_points', op: '>=', value: 14 }], result: 4 },
      ] } },
      { fieldCode: 'overall', fieldType: 'calc', label: '総合判定', settings: { mode: 'rules', fallback: '要再検', rules: [
        { when: [{ field: 'total_points', op: '<=', value: 0 }], result: '未実施' },
        { when: [{ field: 'total_points', op: '>=', value: 30 }], result: '優秀' },
        { when: [{ field: 'total_points', op: '>=', value: 20 }], result: '良好' },
        { when: [{ field: 'total_points', op: '>=', value: 14 }], result: '合格' },
      ] } },
      { fieldCode: 'status', fieldType: 'status', label: '状況', required: true, settings: { options: ['予定', '受検済', '再検査'], defaultValue: '予定' } },
      { fieldCode: 'note', fieldType: 'textarea', label: '所見・特記' },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['予定', '受検済', '再検査'],
      actions: [
        { from: '予定', to: '受検済', label: '受検完了' },
        { from: '受検済', to: '再検査', label: '再検査にする' },
        { from: '再検査', to: '受検済', label: '再検査完了' },
      ],
    },
  },
  {
    id: 'onsite_claim',
    name: 'クレーム・現地対応 管理',
    category: '顧客対応',
    icon: 'MessageSquareWarning',
    summary: '発生場所を地図で記録し、現地対応の進捗を管理',
    description: 'クレーム・現地対応の案件を発生場所（位置）付きで管理します。受付〜現地確認〜完了の進捗と対応履歴を残せます。',
    fields: [
      { fieldCode: 'claim_no', fieldType: 'auto_number', label: '案件番号', settings: { prefix: 'CLM-', padding: 4 } },
      { fieldCode: 'site', fieldType: 'location', label: '発生場所', required: true, settings: { zoom: 15, center: { lat: 35.681236, lng: 139.767125 } } },
      { fieldCode: 'content', fieldType: 'textarea', label: '内容', required: true },
      { fieldCode: 'received_date', fieldType: 'date', label: '受付日' },
      { fieldCode: 'priority', fieldType: 'select', label: '優先度', settings: { options: ['低', '中', '高'], defaultValue: '中' } },
      { fieldCode: 'status', fieldType: 'status', label: 'ステータス', required: true, settings: { options: ['受付', '対応中', '現地確認', '完了'], defaultValue: '受付' } },
      { fieldCode: 'assignee', fieldType: 'user_select', label: '担当者' },
      {
        fieldCode: 'actions', fieldType: 'subtable', label: '対応履歴',
        settings: { columns: [
          { fieldCode: 'date', fieldType: 'date', label: '日付', settings: {} },
          { fieldCode: 'action', fieldType: 'text', label: '対応内容', settings: {} },
          { fieldCode: 'staff', fieldType: 'text', label: '対応者', settings: {} },
        ] },
      },
    ],
    processConfig: {
      enabled: true,
      statusField: 'status',
      statuses: ['受付', '対応中', '現地確認', '完了'],
      actions: [
        { from: '受付', to: '対応中', label: '対応開始' },
        { from: '対応中', to: '現地確認', label: '現地確認へ' },
        { from: '現地確認', to: '完了', label: '完了' },
      ],
    },
    views: [
      { name: '未完了', columns: ['claim_no', 'content', 'received_date', 'priority', 'assignee', 'status'], conditions: [{ field: 'status', op: 'ne', value: '完了' }], sort: { field: 'received_date', order: 'asc' } },
    ],
    dashboard: {
      name: '現地対応ダッシュボード',
      widgets: [
        { type: 'kpi', title: '案件総数', kpiMode: 'count' },
        { type: 'kpi', title: '未完了', kpiMode: 'open' },
        { type: 'chart', title: 'ステータス別', chartType: 'bar', groupField: 'status', metric: 'count' },
        { type: 'map', title: '発生場所マップ', groupField: 'site' },
      ],
    },
  },
];

export function getTemplate(id: string): AppTemplate | undefined {
  return APP_TEMPLATES.find((t) => t.id === id);
}

/** ギャラリー表示用の軽量メタ（フィールドの詳細設定は含めるが十分小さい）。 */
export function listTemplates() {
  return APP_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    category: t.category,
    icon: t.icon,
    summary: t.summary,
    description: t.description,
    fields: t.fields.map((f) => ({ label: f.label, fieldType: f.fieldType, required: !!f.required })),
    hasProcess: !!t.processConfig?.enabled,
  }));
}
