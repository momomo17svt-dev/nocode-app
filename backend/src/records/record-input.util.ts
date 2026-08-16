import { BadRequestException } from '@nestjs/common';

/**
 * レコード値のサーバ側上限。
 * body 全体の上限(main.ts の 15MB)だけでは、1レコードに巨大な値を書き込む
 * 使い方を止められない。特に匿名の公開フォームは認証なしで create まで到達するため、
 * フィールド定義に照らした絞り込みと上限をサーバ側に置く。
 */
export const MAX_TEXT_LENGTH = 100_000;
export const MAX_ARRAY_ITEMS = 1_000;
export const MAX_SUBTABLE_ROWS = 1_000;
export const MAX_RECORD_CHARS = 2_000_000;
const MAX_DEPTH = 10;

export type FieldLike = {
  fieldCode: string;
  fieldType: string;
  label?: string;
  required?: boolean;
};

/**
 * クライアントから届いたレコード値を、アプリのフィールド定義に照らして整える。
 *
 * - 定義にないキーを捨てる（任意のキーを dataJson へ書き込ませない）
 * - 1値の文字数・配列要素数・サブテーブル行数・レコード全体のサイズに上限を設ける
 *
 * 捨てるのは「今回送られてきた未知キー」だけで、保存済みの値には触れない。
 * 項目を削除したアプリの過去レコードを、更新のたびに失わせないため。
 * 上限超過は黙って切り詰めず 400 で返す（利用者が気付かずデータを失うのを防ぐ）。
 */
export function sanitizeRecordInput(
  fields: FieldLike[],
  input: Record<string, any> | null | undefined,
): Record<string, any> {
  const known = new Map(fields.map((f) => [f.fieldCode, f]));
  const clean: Record<string, any> = {};

  for (const [key, value] of Object.entries(input || {})) {
    const field = known.get(key);
    if (!field) continue;
    assertValueWithinLimits(field, value, 0);
    clean[key] = value;
  }

  const size = JSON.stringify(clean).length;
  if (size > MAX_RECORD_CHARS) {
    throw new BadRequestException(
      `レコード全体の入力量が上限(${MAX_RECORD_CHARS.toLocaleString()}文字)を超えています`,
    );
  }
  return clean;
}

/** 必須項目が空でないことを確認する（公開フォームなど、画面側の検証を信頼できない経路向け）。 */
export function assertRequiredFilled(fields: FieldLike[], data: Record<string, any>): void {
  const missing = fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = data[f.fieldCode];
      return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
    })
    .map((f) => f.label || f.fieldCode);

  if (missing.length > 0) {
    throw new BadRequestException(`必須項目が未入力です: ${missing.join(', ')}`);
  }
}

function assertValueWithinLimits(field: FieldLike, value: any, depth: number): void {
  if (depth > MAX_DEPTH) {
    throw new BadRequestException(`${label(field)}の入力が複雑すぎます`);
  }
  if (typeof value === 'string') {
    if (value.length > MAX_TEXT_LENGTH) {
      throw new BadRequestException(
        `${label(field)}が上限(${MAX_TEXT_LENGTH.toLocaleString()}文字)を超えています`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    const limit = field.fieldType === 'subtable' ? MAX_SUBTABLE_ROWS : MAX_ARRAY_ITEMS;
    if (value.length > limit) {
      throw new BadRequestException(
        `${label(field)}の件数が上限(${limit.toLocaleString()}件)を超えています`,
      );
    }
    for (const item of value) assertValueWithinLimits(field, item, depth + 1);
    return;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) assertValueWithinLimits(field, item, depth + 1);
  }
}

function label(field: FieldLike): string {
  return field.label || field.fieldCode;
}
