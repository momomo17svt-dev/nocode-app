import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsIn,
  IsArray,
  ValidateNested,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/** 仕様書 3.6 のフォーム部品14種。 */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'datetime',
  'checkbox',
  'radio',
  'select',
  'user_select',
  'group_select',
  'file',
  'auto_number',
  'status',
  'calc',
  'reference',
  'subtable',
  'link',
  'email',
  'phone',
  'section',
  'location',
  'ai',
];

export class FieldDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message: 'フィールドコードは英字・数字・アンダースコアのみ使用できます',
  })
  fieldCode!: string;

  @IsIn(FIELD_TYPES, { message: '未対応のフィールド種類です' })
  fieldType!: string;

  @IsString()
  @IsNotEmpty({ message: '項目名を入力してください' })
  @MaxLength(200)
  label!: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  settings?: any;
}

export class SaveFieldsDto {
  @IsString()
  appId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FieldDto)
  fields!: FieldDto[];
}
