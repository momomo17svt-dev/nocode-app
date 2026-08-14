import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ApiTokensService {
  constructor(private prisma: PrismaService, private jwt: JwtService) {}

  async list() {
    const rows = await this.prisma.apiToken.findMany({ orderBy: { createdAt: 'desc' } });
    const ownerIds = Array.from(new Set(rows.map((r) => r.ownerId)));
    const owners = ownerIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, loginId: true, name: true } })
      : [];
    const names = new Map(owners.map((u) => [u.id, u.name?.trim() || u.loginId]));
    return rows.map(({ tokenHash: _tokenHash, ...row }) => ({ ...row, ownerName: names.get(row.ownerId) || row.ownerId }));
  }

  async create(input: { name: string; ownerId: string; readOnly?: boolean; expiresInDays?: number }) {
    const name = input.name?.trim();
    if (!name) throw new BadRequestException('トークン名を入力してください');
    const days = Math.min(365, Math.max(1, Math.floor(input.expiresInDays || 90)));
    const owner = await this.prisma.user.findUnique({ where: { id: input.ownerId } });
    if (!owner?.isActive) throw new BadRequestException('有効な利用ユーザーを選択してください');
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + days * 86_400_000);
    const token = this.jwt.sign(
      { kind: 'api', sub: owner.id, loginId: owner.loginId, role: owner.role, av: owner.authVersion },
      { expiresIn: `${days}d`, jwtid: id },
    );
    await this.prisma.apiToken.create({
      data: {
        id,
        name,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        tokenPrefix: token.slice(0, 12),
        ownerId: owner.id,
        readOnly: input.readOnly !== false,
        expiresAt,
      },
    });
    return { id, name, token, expiresAt, readOnly: input.readOnly !== false, ownerId: owner.id };
  }

  async revoke(id: string) {
    const exists = await this.prisma.apiToken.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('APIトークンが見つかりません');
    await this.prisma.apiToken.update({ where: { id }, data: { revokedAt: new Date() } });
    return { success: true };
  }
}
