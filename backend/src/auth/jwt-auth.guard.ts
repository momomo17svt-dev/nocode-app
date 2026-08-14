import { ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: ExecutionContext, status?: any) {
    const authenticated = super.handleRequest(err, user, info, context, status) as any;
    const method = context.switchToHttp().getRequest()?.method;
    if (authenticated?.apiTokenReadOnly && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      throw new ForbiddenException('このAPIトークンは読み取り専用です');
    }
    return authenticated;
  }
}
