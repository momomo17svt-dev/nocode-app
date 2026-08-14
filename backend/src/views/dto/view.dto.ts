import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsObject, IsArray, MaxLength } from 'class-validator';

export class CreateViewDto {
  @IsString()
  @IsNotEmpty()
  appId!: string;

  @IsString()
  @IsNotEmpty({ message: 'ビュー名を入力してください' })
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsOptional()
  @IsArray()
  conditions?: any[];

  @IsOptional()
  @IsArray()
  columns?: string[];

  @IsOptional()
  @IsObject()
  sort?: any;
}

export class UpdateViewDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isShared?: boolean;

  @IsOptional()
  @IsArray()
  conditions?: any[];

  @IsOptional()
  @IsArray()
  columns?: string[];

  @IsOptional()
  @IsObject()
  sort?: any;
}
