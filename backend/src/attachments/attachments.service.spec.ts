import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { AttachmentsService } from './attachments.service';

jest.mock('fs');

const existsSync = fs.existsSync as jest.Mock;
const unlinkSync = fs.unlinkSync as jest.Mock;

describe('AttachmentsService', () => {
  let prisma: any;
  let service: AttachmentsService;

  beforeEach(() => {
    prisma = {
      record: { findUnique: jest.fn() },
      attachment: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    service = new AttachmentsService(prisma);
    jest.clearAllMocks();
    existsSync.mockReturnValue(true);
    unlinkSync.mockReturnValue(undefined);
  });

  describe('getRecordMeta', () => {
    it('レコードが無ければ NotFound', async () => {
      prisma.record.findUnique.mockResolvedValue(null);
      await expect(service.getRecordMeta('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getForAccess', () => {
    it('添付が無ければ NotFound', async () => {
      prisma.attachment.findUnique.mockResolvedValue(null);
      await expect(service.getForAccess('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('resolvePath', () => {
    it('パストラバーサルを含む名前は弾く', () => {
      expect(() => service.resolvePath('../../etc/passwd')).toThrow('不正なファイル名です');
    });

    it('実ファイルが存在しなければ NotFound', () => {
      existsSync.mockReturnValue(false);
      expect(() => service.resolvePath('11111111-2222-3333-4444-555555555555')).toThrow(NotFoundException);
    });

    it('存在する正当な名前は絶対パスを返す', () => {
      existsSync.mockReturnValue(true);
      const p = service.resolvePath('11111111-2222-3333-4444-555555555555');
      expect(p).toContain('11111111-2222-3333-4444-555555555555');
    });
  });

  describe('remove', () => {
    it('添付が無ければ NotFound', async () => {
      prisma.attachment.findUnique.mockResolvedValue(null);
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });

    it('DBメタを削除し実ファイルも削除する', async () => {
      prisma.attachment.findUnique.mockResolvedValue({ id: 'a1', savedName: '11111111-2222-3333-4444-555555555555' });
      existsSync.mockReturnValue(true);

      const res = await service.remove('a1');

      expect(prisma.attachment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
      expect(unlinkSync).toHaveBeenCalled();
      expect(res).toEqual({ success: true });
    });

    it('ファイル削除失敗してもメタ削除は成功扱い', async () => {
      prisma.attachment.findUnique.mockResolvedValue({ id: 'a1', savedName: '11111111-2222-3333-4444-555555555555' });
      existsSync.mockReturnValue(true);
      unlinkSync.mockImplementation(() => { throw new Error('locked'); });

      await expect(service.remove('a1')).resolves.toEqual({ success: true });
    });
  });
});
