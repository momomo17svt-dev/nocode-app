import { BadRequestException } from '@nestjs/common';
import {
  MAX_ARRAY_ITEMS,
  MAX_SUBTABLE_ROWS,
  MAX_TEXT_LENGTH,
  assertRequiredFilled,
  sanitizeRecordInput,
} from './record-input.util';

describe('sanitizeRecordInput', () => {
  const fields = [
    { fieldCode: 'name', fieldType: 'text', label: '氏名' },
    { fieldCode: 'memo', fieldType: 'textarea', label: '備考' },
    { fieldCode: 'tags', fieldType: 'checkbox', label: 'タグ' },
    { fieldCode: 'rows', fieldType: 'subtable', label: '明細' },
  ];

  it('フィールド定義にあるキーだけを残す', () => {
    const clean = sanitizeRecordInput(fields, { name: '山田', __proto__polluted: 'x', unknown: 'y' });
    expect(clean).toEqual({ name: '山田' });
  });

  it('未定義キーだけの入力は空オブジェクトになる', () => {
    expect(sanitizeRecordInput(fields, { nope: 1 })).toEqual({});
  });

  it('null/undefined の入力を受け付ける', () => {
    expect(sanitizeRecordInput(fields, null)).toEqual({});
    expect(sanitizeRecordInput(fields, undefined)).toEqual({});
  });

  it('1値の文字数上限を超えたら拒否する', () => {
    const tooLong = 'あ'.repeat(MAX_TEXT_LENGTH + 1);
    expect(() => sanitizeRecordInput(fields, { memo: tooLong })).toThrow(BadRequestException);
  });

  it('上限ちょうどは通す', () => {
    const exact = 'あ'.repeat(MAX_TEXT_LENGTH);
    expect(sanitizeRecordInput(fields, { memo: exact }).memo).toHaveLength(MAX_TEXT_LENGTH);
  });

  it('配列の要素数上限を超えたら拒否する', () => {
    const many = Array.from({ length: MAX_ARRAY_ITEMS + 1 }, (_, i) => `t${i}`);
    expect(() => sanitizeRecordInput(fields, { tags: many })).toThrow(BadRequestException);
  });

  it('サブテーブルの行数上限を超えたら拒否する', () => {
    const rows = Array.from({ length: MAX_SUBTABLE_ROWS + 1 }, () => ({ a: 1 }));
    expect(() => sanitizeRecordInput(fields, { rows })).toThrow(BadRequestException);
  });

  it('サブテーブル行の中の長すぎる文字列も拒否する', () => {
    const rows = [{ note: 'x'.repeat(MAX_TEXT_LENGTH + 1) }];
    expect(() => sanitizeRecordInput(fields, { rows })).toThrow(BadRequestException);
  });

  it('入れ子が深すぎる値を拒否する', () => {
    let nested: any = 'leaf';
    for (let i = 0; i < 15; i++) nested = { child: nested };
    expect(() => sanitizeRecordInput(fields, { rows: nested })).toThrow(BadRequestException);
  });

  it('通常の値はそのまま通す', () => {
    const input = { name: '山田', tags: ['a', 'b'], rows: [{ qty: 1 }] };
    expect(sanitizeRecordInput(fields, input)).toEqual(input);
  });
});

describe('assertRequiredFilled', () => {
  const fields = [
    { fieldCode: 'name', fieldType: 'text', label: '氏名', required: true },
    { fieldCode: 'memo', fieldType: 'textarea', label: '備考', required: false },
  ];

  it('必須が埋まっていれば通す', () => {
    expect(() => assertRequiredFilled(fields, { name: '山田' })).not.toThrow();
  });

  it('必須が未入力なら項目名付きで拒否する', () => {
    expect(() => assertRequiredFilled(fields, { memo: 'x' })).toThrow(/氏名/);
  });

  it('空文字と空配列も未入力として扱う', () => {
    expect(() => assertRequiredFilled(fields, { name: '' })).toThrow(BadRequestException);
    expect(() => assertRequiredFilled(fields, { name: [] })).toThrow(BadRequestException);
  });
});
