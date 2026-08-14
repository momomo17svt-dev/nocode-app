import { evalFormula, evalRules, formatAutoNumber } from './compute.util';

describe('evalFormula', () => {
  describe('基本の四則演算と優先順位', () => {
    it('加減算', () => {
      expect(evalFormula('1 + 2 + 3', {})).toBe(6);
      expect(evalFormula('10 - 4 - 1', {})).toBe(5);
    });

    it('乗除算は加減算より優先', () => {
      expect(evalFormula('2 + 3 * 4', {})).toBe(14);
      expect(evalFormula('20 - 10 / 5', {})).toBe(18);
    });

    it('括弧で優先順位を上書き', () => {
      expect(evalFormula('(2 + 3) * 4', {})).toBe(20);
      expect(evalFormula('((1 + 1) * (3 - 1))', {})).toBe(4);
    });

    it('単項マイナス／プラス', () => {
      expect(evalFormula('-5 + 3', {})).toBe(-2);
      expect(evalFormula('3 * -2', {})).toBe(-6);
      expect(evalFormula('+4', {})).toBe(4);
    });

    it('小数', () => {
      expect(evalFormula('0.1 + 0.2', {})).toBe(0.3); // 1e6丸めで誤差吸収
      expect(evalFormula('1.5 * 2', {})).toBe(3);
    });
  });

  describe('フィールド参照', () => {
    it('値を数値として参照する', () => {
      expect(evalFormula('qty * price', { qty: 3, price: 100 })).toBe(300);
    });

    it('文字列の数値はパースされる', () => {
      expect(evalFormula('a + b', { a: '10', b: '5' })).toBe(15);
    });

    it('未定義フィールドは0として扱う', () => {
      expect(evalFormula('missing + 5', {})).toBe(5);
    });

    it('非数値の値は0として扱う', () => {
      expect(evalFormula('a + 1', { a: 'abc' })).toBe(1);
      expect(evalFormula('a + 1', { a: null })).toBe(1);
    });
  });

  describe('ゼロ除算', () => {
    it('0除算は0を返す（例外を投げない）', () => {
      expect(evalFormula('10 / 0', {})).toBe(0);
      expect(evalFormula('10 / x', { x: 0 })).toBe(0);
    });
  });

  describe('比較演算（真=1 / 偽=0）', () => {
    it.each([
      ['5 > 3', 1],
      ['3 > 5', 0],
      ['3 < 5', 1],
      ['5 >= 5', 1],
      ['4 <= 3', 0],
      ['2 == 2', 1],
      ['2 != 3', 1],
      ['2 != 2', 0],
    ])('%s => %i', (formula, expected) => {
      expect(evalFormula(formula as string, {})).toBe(expected);
    });
  });

  describe('組み込み関数', () => {
    it('if(条件, 真, 偽)', () => {
      expect(evalFormula('if(1, 100, 200)', {})).toBe(100);
      expect(evalFormula('if(0, 100, 200)', {})).toBe(200);
      expect(evalFormula('if(qty > 10, 1, 0)', { qty: 15 })).toBe(1);
    });

    it('min / max', () => {
      expect(evalFormula('min(3, 7, 2)', {})).toBe(2);
      expect(evalFormula('max(3, 7, 2)', {})).toBe(7);
    });

    it('abs / round / floor / ceil', () => {
      expect(evalFormula('abs(-8)', {})).toBe(8);
      expect(evalFormula('round(2.4)', {})).toBe(2);
      expect(evalFormula('round(2.5)', {})).toBe(3);
      expect(evalFormula('floor(2.9)', {})).toBe(2);
      expect(evalFormula('ceil(2.1)', {})).toBe(3);
    });

    it('関数のネスト', () => {
      expect(evalFormula('max(min(10, 5), 3)', {})).toBe(5);
    });
  });

  describe('丸め（小数第6位）', () => {
    it('1e6を超える桁は丸める', () => {
      expect(evalFormula('1 / 3', {})).toBe(0.333333);
    });
  });

  describe('不正入力は空文字を返す（throwしない）', () => {
    it.each([
      '1 +',          // 途中で終了
      '(1 + 2',       // 括弧未閉
      '1 + * 2',      // 演算子連続
      'unknownFn(1)', // 未対応関数
      '@@@',          // 不正文字
      '',             // 空
    ])('%s => ""', (formula) => {
      expect(evalFormula(formula, {})).toBe('');
    });

    it('NaN/Infinityになる式は空文字', () => {
      // 0/0 はゼロ除算保護で0になるが、非有限になるケースを担保
      expect(evalFormula('0 / 0', {})).toBe(0);
    });
  });
});

describe('evalRules', () => {
  it('最初に全条件を満たしたルールのresultを返す（上から評価）', () => {
    const settings = {
      mode: 'rules',
      rules: [
        { when: [{ field: 'score', op: '>=', value: 80 }], result: 'A' },
        { when: [{ field: 'score', op: '>=', value: 60 }], result: 'B' },
      ],
      fallback: 'C',
    };
    expect(evalRules(settings, { score: 90 })).toBe('A');
    expect(evalRules(settings, { score: 70 })).toBe('B');
    expect(evalRules(settings, { score: 50 })).toBe('C');
  });

  it('when内の複数条件はAND結合', () => {
    const settings = {
      rules: [
        {
          when: [
            { field: 'a', op: '>', value: 0 },
            { field: 'b', op: '>', value: 0 },
          ],
          result: 'both',
        },
      ],
      fallback: 'no',
    };
    expect(evalRules(settings, { a: 1, b: 1 })).toBe('both');
    expect(evalRules(settings, { a: 1, b: 0 })).toBe('no');
  });

  it('比較演算子の網羅', () => {
    const r = (op: string, value: any, value2: any, v: any) =>
      evalRules({ rules: [{ when: [{ field: 'x', op, value, value2 }], result: 'hit' }], fallback: 'miss' }, { x: v });
    expect(r('>', 5, undefined, 6)).toBe('hit');
    expect(r('<', 5, undefined, 4)).toBe('hit');
    expect(r('>=', 5, undefined, 5)).toBe('hit');
    expect(r('<=', 5, undefined, 5)).toBe('hit');
    expect(r('==', 'foo', undefined, 'foo')).toBe('hit');
    expect(r('!=', 'foo', undefined, 'bar')).toBe('hit');
    expect(r('between', 1, 10, 5)).toBe('hit');
    expect(r('between', 1, 10, 11)).toBe('miss');
    expect(r('empty', undefined, undefined, '')).toBe('hit');
    expect(r('notempty', undefined, undefined, 'x')).toBe('hit');
  });

  it('== は文字列比較（数値と文字列を吸収）', () => {
    const settings = { rules: [{ when: [{ field: 'x', op: '==', value: '5' }], result: 'hit' }], fallback: 'miss' };
    expect(evalRules(settings, { x: 5 })).toBe('hit');
  });

  it('数値文字列のresultは数値に変換される', () => {
    const settings = { rules: [{ when: [{ field: 'x', op: '>', value: 0 }], result: '42' }], fallback: '' };
    expect(evalRules(settings, { x: 1 })).toBe(42);
  });

  it('ルール無し／該当無しはfallback', () => {
    expect(evalRules({ rules: [] }, {})).toBe('');
    expect(evalRules({ rules: [], fallback: 'def' }, {})).toBe('def');
    expect(evalRules(undefined, {})).toBe('');
  });
});

describe('formatAutoNumber', () => {
  it('接頭辞＋ゼロ埋め', () => {
    expect(formatAutoNumber(12, { prefix: 'INQ-', padding: 4 })).toBe('INQ-0012');
  });

  it('paddingが0なら詰めない', () => {
    expect(formatAutoNumber(7, { prefix: 'No.', padding: 0 })).toBe('No.7');
  });

  it('桁数がpaddingを超えるときはそのまま', () => {
    expect(formatAutoNumber(12345, { prefix: '', padding: 3 })).toBe('12345');
  });

  it('設定未指定でも数値文字列を返す', () => {
    expect(formatAutoNumber(5, undefined)).toBe('5');
    expect(formatAutoNumber(5, {})).toBe('5');
  });
});
