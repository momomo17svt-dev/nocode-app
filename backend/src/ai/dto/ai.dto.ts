import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ChatMessageDto {
  @IsIn(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @IsString()
  content!: string;
}

export class AskDto {
  @IsString() @MaxLength(2000)
  question!: string;

  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ChatMessageDto)
  history?: ChatMessageDto[];

  // 指定すると、その文書1件の中だけを対象に回答する（未指定＝可視範囲を横断）。
  @IsOptional() @IsString()
  docId?: string;
}

export class SearchDto {
  @IsString() @MaxLength(2000)
  query!: string;

  @IsOptional() @IsInt() @Min(1) @Max(20)
  k?: number;

  // 指定すると、その文書1件の中だけを検索する（未指定＝可視範囲を横断）。
  @IsOptional() @IsString()
  docId?: string;
}

export class AnalyzeAppDto {
  @IsString()
  appId!: string;
}

export class AnalyzeRecordDto {
  @IsString()
  recordId!: string;

  @IsOptional() @IsIn(['summary', 'next'])
  mode?: 'summary' | 'next';
}

export class DraftRecordDto {
  @IsString()
  appId!: string;

  @IsString() @MaxLength(4000)
  text!: string;
}

export class GenerateDto {
  @IsString()
  appId!: string;

  @IsOptional() @IsString()
  fieldCode?: string;

  @IsOptional() @IsString()
  actionId?: string;

  @IsOptional() @IsString() @MaxLength(8000)
  prompt?: string;

  @IsOptional() @IsObject()
  data?: Record<string, any>;
}

export class GenerateTemplateDto {
  @IsString() @MaxLength(4000)
  description!: string;
}

export class UpsertDocDto {
  @IsString() @MaxLength(200)
  title!: string;

  @IsString() @MaxLength(200000)
  content!: string;

  @IsOptional() @IsString()
  appId?: string | null;

  // 行政文書モード。'gov'=構造解析、'plain'=通常、未指定=自動判定。
  @IsOptional() @IsIn(['plain', 'gov'])
  docKind?: 'plain' | 'gov';
}

/** 保存前の構造プレビュー用。 */
export class GovParseDto {
  @IsString() @MaxLength(200000)
  content!: string;
}
