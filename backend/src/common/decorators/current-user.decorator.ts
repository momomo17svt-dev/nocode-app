import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  userId: string;
  loginId: string;
  role: string;
  authVersion?: number;
  apiTokenId?: string;
  apiTokenReadOnly?: boolean;
}

/**
 * JwtStrategy.validate() がセットした req.user を取り出すデコレータ。
 */
export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext): AuthUser | AuthUser[keyof AuthUser] => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUser = request.user;
    return data ? user?.[data] : user;
  },
);
