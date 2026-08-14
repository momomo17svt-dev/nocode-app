import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { resolveAttachmentPath } from '../common/storage.util';

@Injectable()
export class AttachmentsService {
  constructor(private prisma: PrismaService) {}

  /** 添付先レコードのアプリIDと作成者を取得（認可判定用）。 */
  async getRecordMeta(recordId: string) {
    const rec = await this.prisma.record.findUnique({
      where: { id: recordId },
      select: { appId: true, createdBy: true },
    });
    if (!rec) throw new NotFoundException('レコードが見つかりません');
    return rec;
  }

  findByRecord(recordId: string) {
    return this.prisma.attachment.findMany({
      where: { recordId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        fieldCode: true,
        createdAt: true,
      },
    });
  }

  create(data: {
    originalName: string;
    savedName: string;
    mimeType: string;
    size: number;
    recordId?: string;
    fieldCode?: string;
  }) {
    return this.prisma.attachment.create({ data });
  }

  /** 権限確認後に実ファイルを保存し、DB作成失敗時は孤立ファイルを削除する。 */
  async createFromUpload(data: {
    originalName: string;
    mimeType: string;
    size: number;
    recordId: string;
    fieldCode?: string;
    buffer: Buffer;
  }) {
    const ext = extname(data.originalName).replace(/[^.A-Za-z0-9]/g, '').slice(0, 10);
    const savedName = `${randomUUID()}${ext}`;
    const filePath = resolveAttachmentPath(savedName);

    await fs.promises.writeFile(filePath, data.buffer, { flag: 'wx' });
    try {
      return await this.create({
        originalName: data.originalName,
        savedName,
        mimeType: data.mimeType,
        size: data.size,
        recordId: data.recordId,
        fieldCode: data.fieldCode,
      });
    } catch (error) {
      await fs.promises.unlink(filePath).catch(() => undefined);
      throw error;
    }
  }

  /** ダウンロード用にメタデータとアプリIDを取得。 */
  async getForAccess(id: string) {
    const att = await this.prisma.attachment.findUnique({
      where: { id },
      include: { record: { select: { appId: true } } },
    });
    if (!att) throw new NotFoundException('添付ファイルが見つかりません');
    return att;
  }

  /** 実ファイルの絶対パスを安全に解決して返す。 */
  resolvePath(savedName: string) {
    const filePath = resolveAttachmentPath(savedName);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('ファイル本体が存在しません');
    }
    return filePath;
  }

  async remove(id: string) {
    const att = await this.prisma.attachment.findUnique({ where: { id } });
    if (!att) throw new NotFoundException('添付ファイルが見つかりません');
    // 先にDBメタデータを削除し、続いて実ファイルを削除
    await this.prisma.attachment.delete({ where: { id } });
    try {
      const filePath = resolveAttachmentPath(att.savedName);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {
      // ファイル削除失敗はメタデータ整合に影響しないため無視
    }
    return { success: true };
  }
}
