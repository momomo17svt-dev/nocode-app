import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ApiTokensService } from './api-tokens.service';

describe('ApiTokensService', () => {
  let prisma: any;
  let jwt: any;
  let service: ApiTokensService;

  beforeEach(() => {
    prisma = {
      apiToken: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      user: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-api-token-value') };
    service = new ApiTokensService(prisma, jwt);
  });

  it('トークン本体は作成時だけ返し、DBにはハッシュを保存する', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', loginId: 'alice', role: 'StandardUser', authVersion: 2, isActive: true });
    const result = await service.create({ name: '集計', ownerId: 'u1', readOnly: true, expiresInDays: 30 });
    expect(result.token).toBe('signed-api-token-value');
    expect(prisma.apiToken.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      tokenHash: createHash('sha256').update('signed-api-token-value').digest('hex'),
      readOnly: true,
    }) });
    expect(prisma.apiToken.create.mock.calls[0][0].data.token).toBeUndefined();
  });

  it('無効なユーザーでは発行しない', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', isActive: false });
    await expect(service.create({ name: 'x', ownerId: 'u1' })).rejects.toThrow(BadRequestException);
  });

  it('存在しないトークンの無効化はNotFound', async () => {
    prisma.apiToken.findUnique.mockResolvedValue(null);
    await expect(service.revoke('missing')).rejects.toThrow(NotFoundException);
  });

  it('一覧ではハッシュを返さず利用ユーザー名を付ける', async () => {
    prisma.apiToken.findMany.mockResolvedValue([{ id: 't1', ownerId: 'u1', tokenHash: 'secret-hash' }]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', loginId: 'alice', name: 'Alice' }]);
    const rows = await service.list();
    expect(rows[0]).toMatchObject({ id: 't1', ownerName: 'Alice' });
    expect((rows[0] as any).tokenHash).toBeUndefined();
  });
});
