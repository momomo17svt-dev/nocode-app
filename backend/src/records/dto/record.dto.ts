import { IsString, IsNotEmpty, IsObject, IsArray, IsOptional, MaxLength, IsInt, Min } from 'class-validator';

export class CreateRecordDto {
  @IsString()
  @IsNotEmpty()
  appId!: string;

  @IsObject()
  data!: Record<string, any>;
}

export class UpdateRecordDto {
  @IsObject()
  data!: Record<string, any>;

  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class CommentDto {
  @IsString()
  @IsNotEmpty({ message: 'コメントを入力してください' })
  @MaxLength(5000)
  comment!: string;
}

export class ImportDto {
  @IsString()
  @IsNotEmpty()
  appId!: string;

  @IsArray()
  rows!: Record<string, any>[];
}

export class BulkDeleteDto {
  @IsString()
  @IsNotEmpty()
  appId!: string;

  @IsArray()
  ids!: string[];
}

export class ReferencingCountDto {
  @IsString()
  @IsNotEmpty()
  appId!: string;

  @IsArray()
  ids!: string[];
}

export class ExistDto {
  @IsArray()
  ids!: string[];
}

export class BulkDistributeDto {
  @IsString()
  @IsNotEmpty()
  appId!: string;

  /** 配布先ユーザーを設定する user_select フィールドのコード。 */
  @IsString()
  @IsNotEmpty()
  assigneeField!: string;

  @IsArray()
  userIds!: string[];

  /** 各レコードに共通で設定する初期値（任意）。 */
  @IsOptional()
  @IsObject()
  baseData?: Record<string, any>;
}
