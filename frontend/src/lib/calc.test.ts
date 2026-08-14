import { describe, expect, it } from 'vitest';
import { computeCalcFields, evalFormula, evalRules } from './calc';

describe('client calculation helpers', () => {
  it('evaluates arithmetic, comparisons, and supported functions', () => {
    expect(evalFormula('subtotal + subtotal * tax / 100', { subtotal: 1_000, tax: 10 })).toBe(1_100);
    expect(evalFormula('if(score >= 80, round(score / 10), 0)', { score: 86 })).toBe(9);
  });

  it('returns an empty value for unsafe or invalid expressions', () => {
    expect(evalFormula('globalThis.alert(1)', {})).toBe('');
    expect(evalFormula('1 / (2 - 2', {})).toBe('');
  });

  it('evaluates rule tables in order and uses the fallback', () => {
    const settings = {
      mode: 'rules',
      rules: [
        { when: [{ field: 'score', op: '>=', value: 80 }], result: 'A' },
        { when: [{ field: 'score', op: '>=', value: 60 }], result: 'B' },
      ],
      fallback: 'C',
    };
    expect(evalRules(settings, { score: 85 })).toBe('A');
    expect(evalRules(settings, { score: 70 })).toBe('B');
    expect(evalRules(settings, { score: 40 })).toBe('C');
  });

  it('computes dependent calculated fields in field order', () => {
    const fields = [
      { fieldCode: 'subtotal', fieldType: 'number' },
      { fieldCode: 'tax', fieldType: 'calc', settings: { formula: 'subtotal * 0.1' } },
      { fieldCode: 'total', fieldType: 'calc', settings: { formula: 'subtotal + tax' } },
    ];
    expect(computeCalcFields(fields, { subtotal: 2_000 })).toMatchObject({ tax: 200, total: 2_200 });
  });
});
