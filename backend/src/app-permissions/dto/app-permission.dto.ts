import { IsArray, IsBoolean, IsIn, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PermissionItemDto {
  @IsIn(['All', 'User', 'Group'])
  targetType!: 'All' | 'User' | 'Group';

  @IsOptional()
  @IsString()
  targetId?: string | null;

  @IsBoolean() canView!: boolean;
  @IsBoolean() canAdd!: boolean;
  @IsBoolean() canEdit!: boolean;
  @IsBoolean() canDelete!: boolean;
  @IsBoolean() canManage!: boolean;
}

export class SetPermissionsDto {
  @IsString()
  appId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionItemDto)
  permissions!: PermissionItemDto[];
}
