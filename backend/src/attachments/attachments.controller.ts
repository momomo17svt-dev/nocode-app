import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
  Res,
  Req,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { PermissionService } from '../permissions/permission.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

@UseGuards(JwtAuthGuard)
@Controller('api/attachments')
export class AttachmentsController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly permission: PermissionService,
    private readonly audit: AuditLogsService,
  ) {}

  @Get()
  async findByRecord(@Query('recordId') recordId: string, @CurrentUser() user: AuthUser) {
    const meta = await this.attachmentsService.getRecordMeta(recordId);
    const perm = await this.permission.assert(user.userId, user.role, meta.appId, 'canView');
    await this.assertViewScope(user, meta, perm);
    return this.attachmentsService.findByRecord(recordId);
  }

  /**
   * ファイルアップロード。保存名はUUID化し、元ファイル名はメタデータとしてのみ保持する。
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      // 権限確認が完了するまではディスクへ書き込まない。
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Query('recordId') recordId: string,
    @Query('fieldCode') fieldCode: string,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    if (!file) throw new BadRequestException('ファイルが指定されていません');
    if (!recordId) throw new BadRequestException('recordId が必要です');

    const meta = await this.attachmentsService.getRecordMeta(recordId);
    await this.assertCanModify(user, meta);

    const saved = await this.attachmentsService.createFromUpload({
      originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      mimeType: file.mimetype,
      size: file.size,
      recordId,
      fieldCode,
      buffer: file.buffer,
    });
    await this.audit.log({
      userId: user.userId,
      actionType: 'ATTACHMENT_UPLOAD',
      targetResource: 'record',
      targetId: recordId,
      details: { attachmentId: saved.id, name: saved.originalName },
      ipAddress: req.ip,
    });
    return {
      id: saved.id,
      originalName: saved.originalName,
      mimeType: saved.mimeType,
      size: saved.size,
      fieldCode: saved.fieldCode,
    };
  }

  /** ダウンロード。直接URLアクセスでも閲覧権限を必ず検証する。 */
  @Get(':id/download')
  async download(@Param('id') id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const att = await this.attachmentsService.getForAccess(id);
    const appId = att.record?.appId;
    if (!appId || !att.recordId) throw new ForbiddenException('アクセスできません');
    const perm = await this.permission.assert(user.userId, user.role, appId, 'canView');
    const meta = await this.attachmentsService.getRecordMeta(att.recordId);
    await this.assertViewScope(user, meta, perm);

    const filePath = this.attachmentsService.resolvePath(att.savedName);
    res.download(filePath, att.originalName);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: any) {
    const att = await this.attachmentsService.getForAccess(id);
    if (!att.record?.appId) throw new ForbiddenException('アクセスできません');
    const meta = await this.attachmentsService.getRecordMeta(att.recordId!);
    await this.assertCanModify(user, meta);
    const result = await this.attachmentsService.remove(id);
    await this.audit.log({
      userId: user.userId,
      actionType: 'ATTACHMENT_DELETE',
      targetResource: 'record',
      targetId: att.recordId,
      details: { attachmentId: id },
      ipAddress: req.ip,
    });
    return result;
  }

  /** レコード公開範囲(owner/org)に応じ、閲覧可能な作成者のレコードの添付のみ許可。 */
  private async assertViewScope(
    user: AuthUser,
    meta: { appId: string; createdBy: string },
    perm: { canManage: boolean },
  ) {
    const allowed = await this.permission.allowedCreatorIds(
      meta.appId,
      user.userId,
      user.role,
      'view',
      perm.canManage,
    );
    if (allowed && !allowed.includes(meta.createdBy)) {
      throw new ForbiddenException('この添付ファイルを閲覧する権限がありません（権限の範囲外です）');
    }
  }

  /**
   * 添付の追加/削除はレコード編集権限を持つ場合に許可。
   * 編集権限が無くても、追加権限ユーザーが自分の作成したレコードを操作する場合は
   * アプリ設定「作成者は自分のレコードを編集できる」がONなら許可する（レコード本体の編集と同じ判定）。
   */
  private async assertCanModify(user: AuthUser, meta: { appId: string; createdBy: string }) {
    const perm = await this.permission.getEffectivePermission(user.userId, user.role, meta.appId);
    if (perm.canEdit) return;
    if (perm.canAdd && meta.createdBy === user.userId) {
      const { editOwn } = await this.permission.getOwnMutationFlags(meta.appId);
      if (editOwn) return;
    }
    throw new ForbiddenException('添付ファイルを操作する権限がありません');
  }
}
