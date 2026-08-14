import { IsString, IsNotEmpty, IsOptional, IsIn, IsBoolean, IsArray, IsInt, Min, Max, MinLength, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

const ROLES = ['SystemAdmin', 'GroupAdmin', 'AppCreator', 'StandardUser', 'Viewer'];

/** ユーザー一覧の検索・ページング条件（15万件規模を一括返却しないため）。 */
export class UserQueryDto {
  // ログインID・氏名の部分一致（大文字小文字無視）。
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @IsIn(ROLES, { message: '不正なロールです' })
  role?: string;

  // 状態フィルタ: active=有効のみ / inactive=無効のみ / 未指定=全件。
  @IsOptional()
  @IsIn(['active', 'inactive'])
  active?: 'active' | 'inactive';

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

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: 'ログインIDを入力してください' })
  @MaxLength(100)
  loginId!: string;

  // 氏名（表示名）。任意。
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsString()
  @MinLength(8, { message: 'パスワードは8文字以上にしてください' })
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsIn(ROLES, { message: '不正なロールです' })
  role?: string;

  // 初期所属部署(グループ)ID。管理者(GroupAdmin)が作成する場合は必須・管轄内であること。
  @IsOptional()
  @IsString()
  @MaxLength(100)
  groupId?: string;
}

export class UpdateUserDto {
  // 氏名（表示名）。空文字でクリア可。
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  // 所属部署ID（単一）。空文字/null で未所属にする。
  @IsOptional()
  @IsString()
  @MaxLength(100)
  groupId?: string | null;

  @IsOptional()
  @IsIn(ROLES, { message: '不正なロールです' })
  role?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'パスワードは8文字以上にしてください' })
  @MaxLength(200)
  password?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ImportUsersDto {
  @IsArray()
  rows!: Record<string, any>[];
}
