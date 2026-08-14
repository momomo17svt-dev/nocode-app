/**
 * 連携アプリ群（スイート）定義。
 * 複数アプリを reference（関連レコード参照）で連結し、アプリ間連携・ルックアップ転記・
 * 明細計算・プロセス・帳票・集計を横断的に実演するためのひな形。
 *
 * reference 項目は settings.refTemplate にスイート内のメンバーキーを持たせる。
 * 生成時（AppsService.createFromSuite）に実アプリIDへ解決し settings.refAppId を埋める。
 * メンバーは依存順（参照先 → 参照元）に並べること。
 */
import type { AppTemplate } from './templates';

export interface AppSuiteMember {
  /** スイート内のシンボリックキー（reference の refTemplate で参照）。 */
  key: string;
  /** アプリ名の上書き（任意。未指定なら template.name）。 */
  name?: string;
  template: AppTemplate;
}

export interface AppSuite {
  id: string;
  name: string;
  category: string;
  icon: string;
  summary: string;
  description: string;
  /** 依存順（参照先→参照元）のメンバー。 */
  members: AppSuiteMember[];
}

// ───────────────────────────────────────────────────────────
// CRMスイート: 顧客 → 商談 → 見積 → 請求
// ───────────────────────────────────────────────────────────

const customerApp: AppTemplate = {
  id: 'crm_customer',
  name: '顧客マスタ',
  category: '営業・顧客',
  icon: 'Building2',
  summary: '取引先・見込み客を一元管理するCRMの基点',
  description: '会社単位で顧客情報を管理します。商談・見積・請求アプリから関連レコード参照で紐づく、CRMスイートの基点アプリです。',
  fields: [
    { fieldCode: 'customer_code', fieldType: 'auto_number', label: '顧客コード', settings: { prefix: 'C-', padding: 4 } },
    { fieldCode: 'company_name', fieldType: 'text', label: '会社名', required: true, settings: { maxLength: 120 } },
    { fieldCode: 'industry', fieldType: 'select', label: '業種', settings: { options: ['IT・通信', '製造', '商社・卸', '小売', '建設・不動産', '医療・福祉', '金融', 'その他'] } },
    { fieldCode: 'contact_name', fieldType: 'text', label: '担当者名' },
    { fieldCode: 'phone', fieldType: 'phone', label: '電話番号' },
    { fieldCode: 'email', fieldType: 'email', label: 'メールアドレス' },
    { fieldCode: 'address', fieldType: 'text', label: '住所' },
    { fieldCode: 'segment', fieldType: 'select', label: '区分', settings: { options: ['見込み', '商談中', '既存', '失注'], defaultValue: '見込み' } },
    { fieldCode: 'sales_rep', fieldType: 'user_select', label: '営業担当' },
    { fieldCode: 'note', fieldType: 'textarea', label: '備考' },
  ],
  views: [
    { name: '既存顧客', columns: ['company_name', 'industry', 'contact_name', 'sales_rep', 'phone'], conditions: [{ field: 'segment', op: 'eq', value: '既存' }], sort: { field: 'company_name', order: 'asc' } },
    { name: '見込み客', columns: ['company_name', 'industry', 'contact_name', 'sales_rep', 'phone'], conditions: [{ field: 'segment', op: 'eq', value: '見込み' }], sort: { field: 'company_name', order: 'asc' } },
  ],
  dashboard: {
    name: '顧客サマリ',
    widgets: [
      { type: 'kpi', title: '顧客数', kpiMode: 'count' },
      { type: 'chart', title: '区分別', chartType: 'pie', groupField: 'segment', metric: 'count' },
      { type: 'chart', title: '業種別', chartType: 'bar', groupField: 'industry', metric: 'count' },
      { type: 'list', title: '最近登録した顧客', columns: ['company_name', 'industry', 'sales_rep'], limit: 8 },
    ],
  },
};

const leadApp: AppTemplate = {
  id: 'crm_lead',
  name: '商談管理',
  category: '営業・顧客',
  icon: 'TrendingUp',
  summary: '顧客に紐づく商談を確度・金額・ステータスで管理',
  description: '顧客マスタを参照して商談を登録します。顧客を選ぶと会社名・担当者などをルックアップ転記。確度・想定金額・受注予定で営業パイプラインを可視化します。',
  fields: [
    { fieldCode: 'lead_no', fieldType: 'auto_number', label: '商談番号', settings: { prefix: 'L-', padding: 4 } },
    { fieldCode: 'title', fieldType: 'text', label: '商談名', required: true, settings: { maxLength: 200 } },
    { fieldCode: 'customer', fieldType: 'reference', label: '顧客', required: true, settings: { refTemplate: 'customer', refDisplayField: 'company_name', lookups: [{ from: 'contact_name', to: 'contact_name' }, { from: 'phone', to: 'phone' }] } },
    { fieldCode: 'contact_name', fieldType: 'text', label: '先方担当者' },
    { fieldCode: 'phone', fieldType: 'phone', label: '電話番号' },
    { fieldCode: 'amount', fieldType: 'number', label: '想定金額', settings: { unit: '円', thousandSeparator: true } },
    { fieldCode: 'probability', fieldType: 'select', label: '確度', settings: { options: ['低', '中', '高'], defaultValue: '中' } },
    { fieldCode: 'expected_close', fieldType: 'date', label: '受注予定日' },
    { fieldCode: 'owner', fieldType: 'user_select', label: '営業担当' },
    { fieldCode: 'status', fieldType: 'status', label: 'ステータス', required: true, settings: { options: ['新規', '商談中', '提案', '受注', '失注'], defaultValue: '新規' } },
    { fieldCode: 'note', fieldType: 'textarea', label: 'メモ' },
  ],
  processConfig: {
    enabled: true,
    statusField: 'status',
    statuses: ['新規', '商談中', '提案', '受注', '失注'],
    actions: [
      { from: '新規', to: '商談中', label: '商談化' },
      { from: '商談中', to: '提案', label: '提案へ' },
      { from: '提案', to: '受注', label: '受注' },
      { from: '提案', to: '失注', label: '失注' },
      { from: '商談中', to: '失注', label: '失注' },
    ],
  },
  views: [
    { name: '進行中の商談', columns: ['title', 'customer', 'amount', 'probability', 'expected_close', 'owner', 'status'], conditions: [{ field: 'status', op: 'ne', value: '受注' }, { field: 'status', op: 'ne', value: '失注' }], sort: { field: 'expected_close', order: 'asc' } },
    { name: '受注済み', columns: ['title', 'customer', 'amount', 'expected_close', 'owner'], conditions: [{ field: 'status', op: 'eq', value: '受注' }], sort: { field: 'expected_close', order: 'desc' } },
  ],
  dashboard: {
    name: '商談ダッシュボード',
    widgets: [
      { type: 'kpi', title: '商談件数', kpiMode: 'count' },
      { type: 'kpi', title: '想定金額合計', kpiMode: 'sum', valueField: 'amount' },
      { type: 'kpi', title: '受注率', kpiMode: 'rate' },
      { type: 'chart', title: 'ステータス別件数', chartType: 'bar', groupField: 'status', metric: 'count' },
      { type: 'chart', title: 'ステータス別金額', chartType: 'bar', groupField: 'status', metric: 'sum', valueField: 'amount' },
      { type: 'chart', title: '確度別', chartType: 'pie', groupField: 'probability', metric: 'count' },
    ],
  },
};

const quoteApp: AppTemplate = {
  id: 'crm_quote',
  name: '見積管理',
  category: '営業・顧客',
  icon: 'FileText',
  summary: '顧客参照＋明細テーブル＋消費税計算＋見積書PDF',
  description: '顧客を参照して見積を作成します。明細（品名・数量・単価・金額）、小計・消費税・合計の自動計算、見積書の帳票（PDF/印刷）まで備えたお手本アプリです。',
  fields: [
    { fieldCode: 'quote_no', fieldType: 'auto_number', label: '見積番号', settings: { prefix: 'Q-', padding: 4 } },
    { fieldCode: 'subject', fieldType: 'text', label: '件名', required: true, settings: { maxLength: 200 } },
    { fieldCode: 'customer', fieldType: 'reference', label: '顧客', required: true, settings: { refTemplate: 'customer', refDisplayField: 'company_name' } },
    { fieldCode: 'quote_date', fieldType: 'date', label: '見積日' },
    { fieldCode: 'valid_until', fieldType: 'date', label: '有効期限' },
    {
      fieldCode: 'items', fieldType: 'subtable', label: '明細',
      settings: { columns: [
        { fieldCode: 'name', fieldType: 'text', label: '品名', settings: {} },
        { fieldCode: 'qty', fieldType: 'number', label: '数量', settings: {} },
        { fieldCode: 'unit_price', fieldType: 'number', label: '単価', settings: { unit: '円', thousandSeparator: true } },
        { fieldCode: 'amount', fieldType: 'calc', label: '金額', settings: { formula: 'qty * unit_price', unit: '円', thousandSeparator: true } },
      ] },
    },
    { fieldCode: 'subtotal', fieldType: 'number', label: '小計', settings: { unit: '円', thousandSeparator: true } },
    { fieldCode: 'tax_rate', fieldType: 'number', label: '消費税率', settings: { unit: '%', defaultValue: 10 } },
    { fieldCode: 'tax', fieldType: 'calc', label: '消費税', settings: { formula: 'floor(subtotal * tax_rate / 100)', unit: '円', thousandSeparator: true } },
    { fieldCode: 'total', fieldType: 'calc', label: '合計', settings: { formula: 'subtotal + tax', unit: '円', thousandSeparator: true } },
    { fieldCode: 'owner', fieldType: 'user_select', label: '営業担当' },
    { fieldCode: 'status', fieldType: 'status', label: 'ステータス', required: true, settings: { options: ['作成中', '提出済', '受注', '失注'], defaultValue: '作成中' } },
    { fieldCode: 'note', fieldType: 'textarea', label: '備考' },
  ],
  processConfig: {
    enabled: true,
    statusField: 'status',
    statuses: ['作成中', '提出済', '受注', '失注'],
    actions: [
      { from: '作成中', to: '提出済', label: '提出する' },
      { from: '提出済', to: '受注', label: '受注にする' },
      { from: '提出済', to: '失注', label: '失注にする' },
    ],
  },
  reportConfig: {
    templates: [
      {
        id: 'quote_doc', name: '見積書', paper: 'A4', orientation: 'portrait',
        title: '御見積書', subtitle: '件名: {subject}', showDate: true,
        blocks: [
          { type: 'fields', columns: 2, fieldCodes: ['quote_no', 'quote_date', 'valid_until'] },
          { type: 'subtable', fieldCode: 'items' },
          { type: 'fields', columns: 2, fieldCodes: ['subtotal', 'tax', 'total'] },
          { type: 'heading', content: '備考' },
          { type: 'text', content: '{note}' },
        ],
        footer: '本見積書の有効期限: {valid_until}',
      },
    ],
  },
  views: [
    { name: '提出済み', columns: ['subject', 'customer', 'total', 'valid_until', 'owner', 'status'], conditions: [{ field: 'status', op: 'eq', value: '提出済' }], sort: { field: 'valid_until', order: 'asc' } },
    { name: '受注', columns: ['subject', 'customer', 'total', 'owner'], conditions: [{ field: 'status', op: 'eq', value: '受注' }], sort: { field: 'quote_date', order: 'desc' } },
  ],
  dashboard: {
    name: '見積ダッシュボード',
    widgets: [
      { type: 'kpi', title: '見積件数', kpiMode: 'count' },
      { type: 'kpi', title: '合計金額', kpiMode: 'sum', valueField: 'total' },
      { type: 'chart', title: 'ステータス別', chartType: 'bar', groupField: 'status', metric: 'count' },
      { type: 'list', title: '直近の見積', columns: ['subject', 'customer', 'total', 'status'], limit: 8 },
    ],
  },
};

const invoiceApp: AppTemplate = {
  id: 'crm_invoice',
  name: '請求管理',
  category: '営業・顧客',
  icon: 'ReceiptText',
  summary: '見積参照＋入金ステータス＋支払期限リマインド',
  description: '見積を参照して請求を発行します。入金ステータスで未収を可視化し、支払期限が近づくと担当者へ自動リマインド。請求書の帳票も備えます。',
  fields: [
    { fieldCode: 'inv_no', fieldType: 'auto_number', label: '請求番号', settings: { prefix: 'INV-', padding: 4 } },
    { fieldCode: 'subject', fieldType: 'text', label: '件名', required: true, settings: { maxLength: 200 } },
    { fieldCode: 'quote', fieldType: 'reference', label: '見積', settings: { refTemplate: 'quote', refDisplayField: 'subject' } },
    { fieldCode: 'customer_name', fieldType: 'text', label: '請求先' },
    { fieldCode: 'issue_date', fieldType: 'date', label: '発行日' },
    { fieldCode: 'due_date', fieldType: 'date', label: '支払期限' },
    { fieldCode: 'amount', fieldType: 'number', label: '請求金額', required: true, settings: { unit: '円', thousandSeparator: true } },
    { fieldCode: 'owner', fieldType: 'user_select', label: '担当' },
    { fieldCode: 'status', fieldType: 'status', label: '入金ステータス', required: true, settings: { options: ['作成', '送付済', '入金済', '未収'], defaultValue: '作成' } },
    { fieldCode: 'note', fieldType: 'textarea', label: '備考' },
  ],
  processConfig: {
    enabled: true,
    statusField: 'status',
    statuses: ['作成', '送付済', '入金済', '未収'],
    actions: [
      { from: '作成', to: '送付済', label: '送付する' },
      { from: '送付済', to: '入金済', label: '入金確認' },
      { from: '送付済', to: '未収', label: '未収にする' },
      { from: '未収', to: '入金済', label: '入金確認' },
    ],
  },
  reminderConfig: { enabled: true, dueDateField: 'due_date', assigneeField: 'owner', daysBefore: 3 },
  reportConfig: {
    templates: [
      {
        id: 'invoice_doc', name: '請求書', paper: 'A4', orientation: 'portrait',
        title: '御請求書', subtitle: '件名: {subject}', showDate: true,
        blocks: [
          { type: 'fields', columns: 2, fieldCodes: ['inv_no', 'customer_name', 'issue_date', 'due_date'] },
          { type: 'fields', columns: 1, fieldCodes: ['amount'] },
          { type: 'heading', content: '備考' },
          { type: 'text', content: '{note}' },
        ],
        footer: 'お支払期限: {due_date}',
      },
    ],
  },
  views: [
    { name: '未入金', columns: ['subject', 'customer_name', 'amount', 'due_date', 'owner', 'status'], conditions: [{ field: 'status', op: 'ne', value: '入金済' }], sort: { field: 'due_date', order: 'asc' } },
    { name: '入金済み', columns: ['subject', 'customer_name', 'amount', 'issue_date'], conditions: [{ field: 'status', op: 'eq', value: '入金済' }], sort: { field: 'issue_date', order: 'desc' } },
  ],
  dashboard: {
    name: '請求ダッシュボード',
    widgets: [
      { type: 'kpi', title: '請求件数', kpiMode: 'count' },
      { type: 'kpi', title: '請求金額合計', kpiMode: 'sum', valueField: 'amount' },
      { type: 'kpi', title: '未収件数', kpiMode: 'open' },
      { type: 'chart', title: '入金状況', chartType: 'pie', groupField: 'status', metric: 'count' },
    ],
  },
};

export const APP_SUITES: AppSuite[] = [
  {
    id: 'crm',
    name: 'CRM（商談から請求まで）',
    category: '連携アプリ群',
    icon: 'Workflow',
    summary: '顧客・商談・見積・請求の4アプリが関連レコード参照で連携。アプリ間連携／ルックアップ転記／明細計算／帳票／集計を一気に体験',
    description:
      '営業の一連の流れ（顧客 → 商談 → 見積 → 請求）を、関連レコード参照（reference）で連携した4つのアプリとして一括作成します。' +
      '商談・見積は顧客を参照し、請求は見積を参照。顧客を選ぶと担当者などをルックアップ転記します。' +
      '見積は明細テーブル＋消費税の自動計算＋見積書PDF、請求は支払期限リマインドを備え、各アプリに保存ビューとダッシュボードが付属します。',
    members: [
      { key: 'customer', template: customerApp },
      { key: 'lead', template: leadApp },
      { key: 'quote', template: quoteApp },
      { key: 'invoice', template: invoiceApp },
    ],
  },
];

export function getSuite(id: string): AppSuite | undefined {
  return APP_SUITES.find((s) => s.id === id);
}

/** ギャラリー表示用の軽量メタ。 */
export function listSuites() {
  return APP_SUITES.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    icon: s.icon,
    summary: s.summary,
    description: s.description,
    apps: s.members.map((m) => ({ name: m.name || m.template.name, icon: m.template.icon })),
  }));
}
