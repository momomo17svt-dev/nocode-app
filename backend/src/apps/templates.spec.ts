import { APP_TEMPLATES, type AppTemplate } from './templates';
import { APP_SUITES } from './suites';
import { getSampleData, getSuiteSampleData } from './template-samples';

/**
 * テンプレート定義の参照整合性テスト。
 *
 * テンプレートは「項目コードを文字列で指し合う」構造なので、項目名を変えたときに
 * ビュー・ダッシュボード・計算式・プロセスの参照だけが取り残されても TypeScript では
 * 気付けない。生成されたアプリを開いて初めて壊れているのが分かる、という壊れ方をする。
 * ここで定義同士の突き合わせを機械的に行う。
 */

type Target = AppTemplate & { __suite?: [string, string] };

// スイート同梱のアプリは APP_TEMPLATES とは別定義。検査から漏れやすいので必ず含める。
const SUITE_APPS: Target[] = APP_SUITES.flatMap((s) =>
  s.members.map((m) => ({ ...(m.template as AppTemplate), id: `${s.id}:${m.key}`, __suite: [s.id, m.key] as [string, string] })),
);
const TARGETS: Target[] = [...APP_TEMPLATES, ...SUITE_APPS];

/** 計算式に書ける関数名（項目コードと区別するため）。 */
const FUNCS = new Set(['if', 'min', 'max', 'abs', 'round', 'floor', 'ceil', 'sum', 'avg', 'count']);
const AGGREGATE = /\b(sum|avg|count)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)(?:\.([A-Za-z_][A-Za-z0-9_]*))?\s*\)/gi;

const samplesOf = (t: Target): Record<string, any>[] =>
  (t.__suite ? getSuiteSampleData(t.__suite[0], t.__suite[1]) : getSampleData(t.id)) || [];

describe.each(TARGETS.map((t) => [t.id, t] as const))('テンプレート %s', (_id, t) => {
  const codes = new Set(t.fields.map((f) => f.fieldCode));
  const byCode = new Map(t.fields.map((f) => [f.fieldCode, f]));
  const subtables = new Map(
    t.fields
      .filter((f) => f.fieldType === 'subtable')
      .map((f) => [f.fieldCode, new Set(((f.settings as any)?.columns || []).map((c: any) => c.fieldCode))]),
  );

  it('項目コードが重複しない', () => {
    expect(t.fields.map((f) => f.fieldCode)).toHaveLength(codes.size);
  });

  it('計算式・ルール表が実在する項目だけを参照する', () => {
    for (const f of t.fields.filter((f) => f.fieldType === 'calc')) {
      const s = (f.settings as any) || {};
      if (s.mode === 'rules') {
        expect(s.rules?.length ?? 0).toBeGreaterThan(0);
        for (const rule of s.rules || []) {
          for (const c of rule.when || []) {
            expect(codes).toContain(c.field);
            for (const ref of [c.valueField, c.value2Field]) if (ref) expect(codes).toContain(ref);
          }
        }
        continue;
      }
      expect(typeof s.formula).toBe('string');
      let rest: string = s.formula;
      for (const [whole, fn, table, column] of s.formula.matchAll(AGGREGATE)) {
        rest = rest.replace(whole, '0');
        expect(subtables.has(table)).toBe(true); // 集計対象は明細テーブルであること
        if (fn.toLowerCase() !== 'count') expect(subtables.get(table)).toContain(column);
      }
      for (const id of rest.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) {
        if (FUNCS.has(id.toLowerCase())) continue;
        expect(codes).toContain(id);
      }
    }
  });

  it('明細の行内計算が同じ明細の列だけを参照する', () => {
    for (const [code, cols] of subtables) {
      const columns: any[] = ((byCode.get(code)!.settings as any)?.columns || []);
      for (const c of columns.filter((c) => c.fieldType === 'calc' && c.settings?.formula)) {
        for (const id of c.settings.formula.match(/[A-Za-z_][A-Za-z0-9_]*/g) || []) {
          if (FUNCS.has(id.toLowerCase())) continue;
          expect(cols).toContain(id);
        }
      }
    }
  });

  it('プロセスの状態遷移が破綻していない', () => {
    const p = t.processConfig;
    if (!p?.enabled) return;
    expect(codes).toContain(p.statusField);

    const options: string[] = (byCode.get(p.statusField)?.settings as any)?.options || [];
    // ステータス項目の選択肢とプロセスの statuses は必ず一致させる。
    // 片方だけ増やすと、画面には出るのに遷移できない状態が生まれる。
    expect([...options].sort()).toEqual([...p.statuses].sort());

    for (const a of p.actions) {
      expect(p.statuses).toContain(a.from);
      expect(p.statuses).toContain(a.to);
      if (a.approver) expect(byCode.get(a.approver)?.fieldType).toBe('user_select');
    }

    // 初期値から全ステータスへ到達できること（行き場のない状態を作らない）
    const start = (byCode.get(p.statusField)?.settings as any)?.defaultValue ?? p.statuses[0];
    const reachable = new Set([start]);
    for (let changed = true; changed; ) {
      changed = false;
      for (const a of p.actions) {
        if (reachable.has(a.from) && !reachable.has(a.to)) { reachable.add(a.to); changed = true; }
      }
    }
    expect([...p.statuses].filter((s) => !reachable.has(s))).toEqual([]);
  });

  it('保存ビューが実在する項目だけを参照する', () => {
    for (const v of t.views || []) {
      for (const c of v.columns || []) expect(codes).toContain(c);
      for (const c of v.conditions || []) expect(codes).toContain(c.field);
      if (v.sort?.field) expect(codes).toContain(v.sort.field);
    }
  });

  it('ダッシュボードが実在する項目だけを参照する', () => {
    for (const w of t.dashboard?.widgets || []) {
      for (const key of ['groupField', 'valueField', 'sortField'] as const) {
        if (w[key]) expect(codes).toContain(w[key]);
      }
      for (const c of w.columns || []) expect(codes).toContain(c);
      for (const c of w.filters || []) expect(codes).toContain(c.field);
      if (w.type === 'map') expect(t.fields.some((f) => f.fieldType === 'location')).toBe(true);
    }
  });

  it('リマインドとAIアクションの設定先が実在する', () => {
    const r = t.reminderConfig;
    if (r?.enabled) {
      expect(['date', 'datetime']).toContain(byCode.get(r.dueDateField)?.fieldType);
      expect(byCode.get(r.assigneeField)?.fieldType).toBe('user_select');
    }
    for (const a of t.aiConfig?.actions || []) {
      if (a.output === 'field') expect(codes).toContain(a.targetField);
    }
    for (const f of t.fields.filter((f) => f.fieldType === 'ai')) {
      for (const m of ((f.settings as any)?.prompt || '').match(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g) || []) {
        expect(codes).toContain(m.slice(1, -1));
      }
    }
  });

  it('サンプルデータが定義と噛み合っている', () => {
    const samples = samplesOf(t);
    expect(samples.length).toBeGreaterThan(0);
    for (const s of samples) {
      for (const k of Object.keys(s)) {
        if (k === '__refs') continue; // スイート生成時に参照項目へ解決されるメタキー
        expect(codes).toContain(k);
      }
    }
    // 必須項目が空のサンプルを作らない（自アプリの必須ルールを満たさないレコードが最初から入る）
    const filled = samples.map((s) => ({ ...s, ...((s as any).__refs || {}) }));
    for (const f of t.fields.filter((f) => f.required)) {
      for (const s of filled) {
        expect(s[f.fieldCode] === undefined || s[f.fieldCode] === '').toBe(false);
      }
    }
  });

  it('作成直後に使える保存ビューとダッシュボードを持つ', () => {
    expect(t.views?.length ?? 0).toBeGreaterThan(0);
    expect(t.dashboard?.widgets.length ?? 0).toBeGreaterThan(0);
  });
});
