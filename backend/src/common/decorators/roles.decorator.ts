import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * グローバルロールでアクセスを制限するデコレータ。
 * 例: @Roles('SystemAdmin')
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
