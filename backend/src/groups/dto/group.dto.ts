import { IsString, IsNotEmpty, IsOptional, IsArray, IsIn, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/** 組織ツリーの遅延展開: 指定親(空=最上位)の直下グループだけを取得する。 */
export class GroupChildrenQueryDto {
  @IsOptional()
  @IsString()
  parentId?: string;
}

/** グループ名の部分一致検索（2万件をクライアントに展開しないため）。 */
export class GroupSearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}

/** グループメンバー一覧の検索・ページング。 */
export class MembersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty({ message: 'グループ名を入力してください' })
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // 親部署ID（空文字=最上位）。
  @IsOptional()
  @IsString()
  parentId?: string;
}

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // 親部署ID（空文字=最上位へ移動）。
  @IsOptional()
  @IsString()
  parentId?: string;
}

export class MemberDto {
  @IsString()
  @IsNotEmpty()
  userId!: string;
}

export class ImportGroupsDto {
  @IsArray()
  rows!: Record<string, any>[];
}

export class ReorderGroupDto {
  @IsIn(['up', 'down'])
  direction!: 'up' | 'down';
}
