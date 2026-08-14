import { IsString, IsNotEmpty, IsOptional, MaxLength, IsIn, IsObject, IsBoolean } from 'class-validator';

export class CreateAppDto {
  @IsString()
  @IsNotEmpty({ message: 'アプリ名を入力してください' })
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  withSamples?: boolean;
}

export class UpdateAppDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsIn(['all', 'owner', 'org'])
  recordViewScope?: string;

  @IsOptional()
  @IsIn(['all', 'owner', 'org'])
  recordEditScope?: string;

  // レコードを対象社員フィールド基準で絞る user_select 項目コード。空文字で無効化。
  @IsOptional()
  @IsString()
  @MaxLength(100)
  recordScopeField?: string;

  @IsOptional()
  @IsBoolean()
  creatorEditOwn?: boolean;

  @IsOptional()
  @IsBoolean()
  creatorDeleteOwn?: boolean;

  @IsOptional()
  @IsObject()
  processConfig?: any;

  @IsOptional()
  @IsObject()
  reminderConfig?: any;

  @IsOptional()
  @IsObject()
  aiConfig?: any;

  @IsOptional()
  @IsObject()
  reportConfig?: any;
}

export class SetStatusDto {
  @IsIn(['draft', 'published'])
  status!: 'draft' | 'published';
}

export class PublicFormDto {
  @IsBoolean()
  enabled!: boolean;

  /** true なら公開URLのトークンを再発行する。 */
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;
}

export class SaveAsTemplateDto {
  @IsString()
  @IsNotEmpty({ message: 'テンプレート名を入力してください' })
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string;
}

export class CreateFromDefinitionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsObject()
  definition!: any;
}

export class SaveDefinitionTemplateDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  summary?: string;

  @IsObject()
  definition!: any;
}

export class CreateFromTemplateDto {
  @IsString()
  @IsNotEmpty({ message: 'テンプレートを指定してください' })
  templateId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  withSamples?: boolean;
}

export class CreateFromSuiteDto {
  @IsString()
  @IsNotEmpty({ message: 'スイートを指定してください' })
  suiteId!: string;

  @IsOptional()
  @IsBoolean()
  withSamples?: boolean;

  @IsOptional()
  @IsBoolean()
  allowDuplicate?: boolean;
}
