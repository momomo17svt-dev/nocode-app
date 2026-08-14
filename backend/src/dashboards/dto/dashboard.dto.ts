import { IsArray, IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** ウィジェット定義・アクセス権はクライアントが組み立てる JSON。検証は緩めに保つ。 */
export class CreateDashboardDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsArray()
  widgets?: any[];

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsOptional()
  @IsObject()
  access?: any;
}

export class UpdateDashboardDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsArray()
  widgets?: any[];

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsOptional()
  @IsObject()
  access?: any;
}

export class ComputeWidgetsDto {
  @IsArray()
  widgets!: any[];
}
