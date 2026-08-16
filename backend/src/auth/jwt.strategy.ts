import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { getJwtSecret } from './jwt.constants';
import { sessionTokenFromRequest } from './auth-cookie.util';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        sessionTokenFromRequest,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: { sub: string; loginId: string; role: string; av?: number; kind?: string; jti?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, loginId: true, role: true, isActive: true, authVersion: true },
    });
    if (!user?.isActive || user.authVersion !== (payload.av ?? 0)) {
      throw new UnauthorizedException('セッションが失効しました');
    }
    if (payload.kind === 'api') {
      if (!payload.jti) throw new UnauthorizedException('APIトークンが無効です');
      const token = await this.prisma.apiToken.findUnique({ where: { id: payload.jti } });
      if (!token || token.revokedAt || token.ownerId !== user.id || (token.expiresAt && token.expiresAt.getTime() <= Date.now())) {
        throw new UnauthorizedException('APIトークンが無効または失効しています');
      }
      // 高頻度APIでも毎回DB書込みにならないよう、最終利用時刻は5分単位で更新する。
      if (!token.lastUsedAt || token.lastUsedAt.getTime() < Date.now() - 5 * 60_000) {
        await this.prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: new Date() } });
      }
      return {
        userId: user.id,
        loginId: user.loginId,
        role: user.role,
        authVersion: user.authVersion,
        apiTokenId: token.id,
        apiTokenReadOnly: token.readOnly,
      };
    }
    return { userId: user.id, loginId: user.loginId, role: user.role, authVersion: user.authVersion };
  }
}
