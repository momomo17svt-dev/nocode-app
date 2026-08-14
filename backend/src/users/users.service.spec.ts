import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('UsersService', () => {
  let prisma: any;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn((args) => ({ id: 'new', ...args.data })),
        update: jest.fn(),
        delete: jest.fn(),
      },
      // remove() は削除前に紐づきアプリ/レコードを集計する。既定は「紐づきなし」。
      app: { findMany: jest.fn().mockResolvedValue([]) },
      record: { groupBy: jest.fn().mockResolvedValue([]) },
    };
    service = new UsersService(prisma);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
    // clearAllMocks 後も「紐づきなし」を維持する。
    prisma.app.findMany.mockResolvedValue([]);
    prisma.record.groupBy.mockResolvedValue([]);
  });

  describe('create', () => {
    it('正常系: パスワードをハッシュ化して作成', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.create({ loginId: 'bob', password: 'password123', role: 'StandardUser' });
      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ loginId: 'bob', passwordHash: 'hashed-pw' }) }),
      );
    });

    it('不正なロールは BadRequest', async () => {
      await expect(service.create({ loginId: 'bob', password: 'password123', role: 'God' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('パスワード8文字未満は BadRequest', async () => {
      await expect(service.create({ loginId: 'bob', password: 'short' })).rejects.toThrow(BadRequestException);
    });

    it('ログインID重複は Conflict', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
      await expect(service.create({ loginId: 'bob', password: 'password123' })).rejects.toThrow(ConflictException);
    });

    it('role未指定なら StandardUser', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await service.create({ loginId: 'bob', password: 'password123' });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'StandardUser' }) }),
      );
    });
  });

  describe('update', () => {
    it('パスワード変更時はハッシュ化', async () => {
      prisma.user.update.mockResolvedValue({ id: 'u1' });
      await service.update('u1', { password: 'newpassword123' });
      expect(bcrypt.hash).toHaveBeenCalledWith('newpassword123', 10);
    });

    it('短いパスワードは BadRequest', async () => {
      await expect(service.update('u1', { password: 'short' })).rejects.toThrow(BadRequestException);
    });

    it('不正ロールは BadRequest', async () => {
      await expect(service.update('u1', { role: 'God' })).rejects.toThrow(BadRequestException);
    });

    it('存在しないIDの更新は NotFound', async () => {
      prisma.user.update.mockRejectedValue(new Error('not found'));
      await expect(service.update('missing', { isActive: false })).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('存在しないIDの削除は NotFound', async () => {
      prisma.user.delete.mockRejectedValue(new Error('not found'));
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('importRows', () => {
    beforeEach(() => {
      prisma.user.findUnique.mockResolvedValue(null);
    });

    it('日本語ロール名を正規化して取り込む', async () => {
      await service.importRows([{ loginId: 'taro', password: 'password123', role: 'システム管理者' }]);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ loginId: 'taro', role: 'SystemAdmin' }) }),
      );
    });

    it('ログインID未入力・短いパスワード・不正ロールは行エラーで継続', async () => {
      const res = await service.importRows([
        { loginId: '', password: 'password123' },
        { loginId: 'a', password: 'short' },
        { loginId: 'b', password: 'password123', role: '不明ロール' },
        { loginId: 'ok', password: 'password123', role: '一般ユーザー' },
      ]);
      expect(res.created).toBe(1);
      expect(res.errors).toHaveLength(3);
      expect(res.errors.map((e) => e.row)).toEqual([1, 2, 3]);
    });

    it('role空欄は StandardUser として取り込む', async () => {
      await service.importRows([{ loginId: 'x', password: 'password123', role: '' }]);
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ role: 'StandardUser' }) }),
      );
    });
  });
});
