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

  it('aggregates subtable columns with sum / avg / count', () => {
    const rec = {
      items: [
        { qty: 2, unit_price: 1000, amount: 2000 },
        { qty: 3, unit_price: 500, amount: 1500 },
        { qty: 1, unit_price: '', amount: '' },
      ],
      tax_rate: 10,
    };
    expect(evalFormula('sum(items.amount)', rec)).toBe(3500);
    expect(evalFormula('count(items)', rec)).toBe(3);
    expect(evalFormula('avg(items.amount)', rec)).toBe(1750);
    expect(evalFormula('sum(items.amount) + floor(sum(items.amount) * tax_rate / 100)', rec)).toBe(3850);
    expect(evalFormula('sum(missing.amount)', rec)).toBe(0);
    expect(evalFormula('1.5 * 2', rec)).toBe(3);
  });

  it('compares two fields via valueField in rule tables', () => {
    const settings = {
      fallback: '適正',
      rules: [{ when: [{ field: 'stock', op: '<', valueField: 'reorder' }], result: '発注要' }],
    };
    expect(evalRules(settings, { stock: 5, reorder: 10 })).toBe('発注要');
    expect(evalRules(settings, { stock: 20, reorder: 10 })).toBe('適正');
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
