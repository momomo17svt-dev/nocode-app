import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { PassportModule } from '@nestjs/passport';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { JwtStrategy } from './jwt.strategy';
import { AuditLogsModule } from '../audit-logs/audit-logs.module';
import { getJwtSecret } from './jwt.constants';
import { PrismaModule } from '../prisma/prisma.module';
import { SettingsModule } from '../system-settings/settings.module';
import { ApiTokensService } from './api-tokens.service';

@Module({
  imports: [
    UsersModule,
    PassportModule,
    AuditLogsModule,
    PrismaModule,
    SettingsModule,
    JwtModule.register({
      secret: getJwtSecret(),
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as JwtSignOptions['expiresIn'] },
    }),
  ],
  providers: [AuthService, JwtStrategy, ApiTokensService],
  controllers: [AuthController],
  exports: [ApiTokensService],
})
export class AuthModule {}
