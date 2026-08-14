import { buildHintMessages, derivePatterns, parseHintResponse, sampleForHint, templateOf } from './chunk-hint.util';
import { chunkStructured } from './structured-chunk.util';

describe('sampleForHint', () => {
  it('行境界で切り詰める', () => {
    const text = Array.from({ length: 200 }, (_, i) => `line${i} あいうえおかきくけこ`).join('\n');
    const s = sampleForHint(text, 500);
    expect(s.length).toBeLessThanOrEqual(500);
    expect(s.endsWith('こ')).toBe(true); // 行の途中で切れていない
  });
});

describe('parseHintResponse', () => {
  it('前置き付きの応答からJSON配列を取り出す', () => {
    const raw = '見出しは以下のとおりです。\n["第１ 総則", "第２ 対象"]\n以上です。';
    expect(parseHintResponse(raw)).toEqual(['第１ 総則', '第２ 対象']);
  });
  it('文字列以外の要素や空要素は捨てる', () => {
    expect(parseHintResponse('[1, "A", "", null, "B"]')).toEqual(['A', 'B']);
  });
  it('JSONが無ければ空', () => {
    expect(parseHintResponse('見出しはありません')).toEqual([]);
  });
});

describe('templateOf', () => {
  it('番号部分を一般化した行頭パターンを導出する', () => {
    const t1 = new RegExp(templateOf('第１ 要旨')!);
    expect(t1.test('第２ 使用上の注意事項')).toBe(true);
    expect(t1.test('第１章 総則')).toBe(false); // 単位付きは対象外

    const t2 = new RegExp(templateOf('STEP1: 準備')!);
    expect(t2.test('STEP2: 実行')).toBe(true);
    expect(t2.test('STEPS はこちら')).toBe(false);

    const t3 = new RegExp(templateOf('（１）目的')!);
    expect(t3.test('（２）適用範囲')).toBe(true);
  });
  it('番号の無い短い見出しはリテラル一致', () => {
    const t = new RegExp(templateOf('背景')!);
    expect(t.test('背景')).toBe(true);
    expect(t.test('背景説明の続き')).toBe(false);
  });
  it('本文らしい行からは導出しない', () => {
    expect(templateOf('売上は前年比で増加しました。')).toBeNull();
    expect(templateOf('1000人が参加した大会です。')).toBeNull();
  });
});

describe('derivePatterns', () => {
  const sample = [
    '実施要領の説明文です。',
    '第１ 総則',
    '本要領は実施の細目を定める。',
    '（１）目的',
    '目的はテストである。',
    '第２ 対象',
    '全職員を対象とする。',
  ].join('\n');

  it('サンプルに実在する例だけからパターンを作り、同型は統合する', () => {
    const patterns = derivePatterns(['第１ 総則', '第２ 対象', '第９９ 存在しない見出し'], sample);
    expect(patterns).toHaveLength(1); // 第N は1テンプレートに統合、捏造例は除外
    expect(patterns[0].regex.test('第３ 雑則')).toBe(true);
  });

  it('複数様式は初出順にレベルを振る', () => {
    const patterns = derivePatterns(['第１ 総則', '（１）目的'], sample);
    expect(patterns).toHaveLength(2);
    expect(patterns[0].level).toBeLessThan(patterns[1].level);
    expect(patterns[0].regex.test('第５ ほげ')).toBe(true);
    expect(patterns[1].regex.test('（３）ふが')).toBe(true);
  });
});

describe('chunkStructured + extraPatterns（LLM推定パターンでの再分割）', () => {
  it('既定パターンで見出しが取れない文書を、推定パターンで構造化できる', () => {
    const text = [
      '実施要領の前書きです。',
      '第１ 総則',
      '本要領は実施の細目を定めるものとする。'.repeat(25),
      '第２ 対象',
      '全職員を対象とする。'.repeat(50),
    ].join('\n');
    // 既定パターンのみ → 見出しなし（段落モード、パス無し）
    const plain = chunkStructured(text, { title: '要領', chunkSize: 800 })!;
    expect(plain.every((c) => !c.structPath)).toBe(true);

    // 推定パターン適用 → 構造パス付き
    const extras = derivePatterns(['第１ 総則'], text);
    const chunks = chunkStructured(text, { title: '要領', chunkSize: 800, extraPatterns: extras })!;
    expect(chunks.some((c) => c.structPath === '第１ 総則')).toBe(true);
    expect(chunks.some((c) => c.structPath === '第２ 対象')).toBe(true);
  });
});

describe('buildHintMessages', () => {
  it('サンプルを含むJSON出力指示のメッセージを組み立てる', () => {
    const msgs = buildHintMessages('サンプル本文');
    expect(msgs[0].role).toBe('system');
    expect(String(msgs[1].content)).toContain('サンプル本文');
    expect(String(msgs[1].content)).toContain('JSON配列');
  });
});
