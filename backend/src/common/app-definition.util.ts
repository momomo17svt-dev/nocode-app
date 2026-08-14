import { FIELD_TYPES } from '../fields/dto/field.dto';

// AI生成/クライアント由来のアプリ定義を、安全な形へ検証・正規化する。
// LLM出力もクライアント往復も信用せず、必ずこのユーティリティを通す。

export interface DefinitionField {
  fieldCode: string;
  fieldType: string;
  label: string;
  required: boolean;
  settings: Record<string, any>;
}
export interface DefinitionProcess {
  enabled: boolean;
  statusField: string;
  statuses: string[];
  actions: { from: string; to: string; label: string }[];
}
export interface DefinitionAiAction {
  id: string;
  name: string;
  prompt: string;
  output: 'show' | 'field';
  targetField?: string;
}
export interface AppDefinition {
  name?: string;
  description?: string;
  recordViewScope: 'all' | 'owner' | 'org';
  recordEditScope: 'all' | 'owner' | 'org';
  fields: DefinitionField[];
  processConfig?: DefinitionProcess;
  aiConfig?: { actions: DefinitionAiAction[] };
}

const CHOICE_TYPES = ['select', 'radio', 'checkbox', 'status'];
const MAX_FIELDS = 40;
// LLMが出しがちな別名→正規の種別
const TYPE_ALIASES: Record<string, string> = {
  string: 'text',
  multiline: 'textarea',
  longtext: 'textarea',
  dropdown: 'select',
  selectbox: 'select',
  enum: 'select',
  bool: 'checkbox',
  boolean: 'checkbox',
  user: 'user_select',
  attachment: 'file',
  url: 'link',
  tel: 'phone',
  datetime_local: 'datetime',
};

function asString(v: any, max = 2000): string {
  if (v === null || v === undefined) return '';
  return String(v).slice(0, max).trim();
}
function asStringArray(v: any): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => asString(x, 200)).filter(Boolean);
}

/** fieldCode を `^[A-Za-z_][A-Za-z0-9_]*$` に正規化（不正は field_n）。重複は連番で回避。 */
function slugCode(raw: any, index: number, used: Set<string>): string {
  let s = asString(raw, 100).replace(/[^A-Za-z0-9_]/g, '');
  if (!s || !/^[A-Za-z_]/.test(s)) s = s ? `f_${s}` : `field_${index + 1}`;
  let code = s;
  let n = 2;
  while (used.has(code)) code = `${s}_${n++}`;
  used.add(code);
  return code;
}

function normalizeType(raw: any): string | null {
  const t = asString(raw, 40).toLowerCase();
  if (FIELD_TYPES.includes(t)) return t;
  if (TYPE_ALIASES[t] && FIELD_TYPES.includes(TYPE_ALIASES[t])) return TYPE_ALIASES[t];
  return null;
}

export function sanitizeDefinition(raw: any): AppDefinition {
  const r = raw && typeof raw === 'object' ? raw : {};
  const used = new Set<string>();
  const byCode: Record<string, DefinitionField> = {};

  const rawFields: any[] = Array.isArray(r.fields) ? r.fields.slice(0, MAX_FIELDS) : [];
  const fields: DefinitionField[] = [];
  rawFields.forEach((f, i) => {
    const label = asString(f?.label, 200);
    if (!label) return;
    let type = normalizeType(f?.fieldType) || 'text';
    const settings: Record<string, any> = f?.settings && typeof f.settings === 'object' ? { ...f.settings } : {};

    if (CHOICE_TYPES.includes(type)) {
      const opts = asStringArray(settings.options);
      if (opts.length === 0) {
        type = 'text'; // 選択肢が無い選択系は文字列へ降格（不正値を作らない）
      } else {
        settings.options = opts;
      }
    }
    if (type === 'ai') {
      settings.prompt = asString(settings.prompt, 8000);
      if (settings.maxTokens !== undefined) settings.maxTokens = Number(settings.maxTokens) || undefined;
    }

    const field: DefinitionField = {
      fieldCode: slugCode(f?.fieldCode, i, used),
      fieldType: type,
      label,
      required: !!f?.required,
      settings,
    };
    fields.push(field);
    byCode[field.fieldCode] = field;
  });

  const def: AppDefinition = {
    name: asString(r.name, 200) || undefined,
    description: asString(r.description, 2000) || undefined,
    recordViewScope: r.recordViewScope === 'owner' || r.recordViewScope === 'org' ? r.recordViewScope : 'all',
    recordEditScope: r.recordEditScope === 'owner' || r.recordEditScope === 'org' ? r.recordEditScope : 'all',
    fields,
  };

  // プロセス管理: statusField が実在し選択系で、statuses が揃うときのみ採用
  const pc = r.processConfig;
  if (pc && typeof pc === 'object') {
    const sf = byCode[asString(pc.statusField, 100)];
    let statuses = asStringArray(pc.statuses);
    if (sf && ['status', 'select', 'radio'].includes(sf.fieldType)) {
      if (statuses.length === 0) statuses = asStringArray(sf.settings.options);
      if (statuses.length > 0) {
        sf.settings.options = statuses; // プロセスと選択肢を一致させる
        const actions = (Array.isArray(pc.actions) ? pc.actions : [])
          .map((a: any) => ({ from: asString(a?.from, 100), to: asString(a?.to, 100), label: asString(a?.label, 100) }))
          .filter((a: any) => statuses.includes(a.from) && statuses.includes(a.to) && a.label);
        def.processConfig = { enabled: true, statusField: sf.fieldCode, statuses, actions };
      }
    }
  }

  // AIアクション
  const ac = r.aiConfig;
  const rawActions: any[] = Array.isArray(ac?.actions) ? ac.actions : Array.isArray(r.aiActions) ? r.aiActions : [];
  if (rawActions.length) {
    const actions: DefinitionAiAction[] = rawActions
      .map((a: any, i: number) => {
        const name = asString(a?.name, 100);
        const prompt = asString(a?.prompt, 8000);
        if (!name || !prompt) return null;
        const targetOk = a?.output === 'field' && byCode[asString(a?.targetField, 100)];
        return {
          id: asString(a?.id, 60) || `act_${Date.now().toString(36)}_${i}`,
          name,
          prompt,
          output: targetOk ? 'field' : 'show',
          ...(targetOk ? { targetField: byCode[asString(a.targetField, 100)].fieldCode } : {}),
        } as DefinitionAiAction;
      })
      .filter((a): a is DefinitionAiAction => !!a);
    if (actions.length) def.aiConfig = { actions };
  }

  return def;
}
