import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  Res,
  ForbiddenException,
} from '@nestjs/common';
import type { Response } from 'express';
import { RecordsService } from './records.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { PermissionService, type EffectivePermission } from '../permissions/permission.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateRecordDto, UpdateRecordDto, CommentDto, ImportDto, BulkDeleteDto, BulkDistributeDto, ReferencingCountDto, ExistDto } from './dto/record.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/records')
export class RecordsController {
  constructor(
    private readonly recordsService: RecordsService,
    private readonly permission: PermissionService,
    private readonly audit: AuditLogsService,
  ) {}

  @Get()
  async findAll(
    @Query('appId') appId: string,
    @Query('search') search: string,
    @Query() query: Record<string, string>,
    @CurrentUser() user: AuthUser,
  ) {
    const perm = await this.permission.assert(user.userId, user.role, appId, 'canView');
    // filter[xxx] 形式のクエリを抽出
    const filters: Record<string, string> = {};
    for (const [k, v] of Object.entries(query)) {
      const m = k.match(/^filter\[(.+)\]$/);
      if (m) filters[m[1]] = v;
    }
    // レコード公開範囲(owner/org)に応じてアクセス可能な作成者に限定（管理権限ありは全件）
    const allowed = await this.permission.allowedCreatorIds(appId, user.userId, user.role, 'view', perm.canManage);
    // 対象社員フィールド基準の絞り込み（設定時のみ・非特権ユーザー）
    const fieldScope = await this.permission.recordFieldScope(appId, user.userId, user.role, perm.canManage);
    return this.recordsService.findAll(appId, { search, filters }, allowed, fieldScope);
  }

  /** CSVエクスポート（仕様: アプリ管理権限が必要・監査ログ必須）。 */
  @Get('export/csv')
  async exportCsv(
    @Query('appId') appId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
    @Res() res: Response,
  ) {
    await this.permission.assert(user.userId, user.role, appId, 'canManage');
    const csv = await this.recordsService.exportCsv(appId);
    await this.audit.log({
      userId: user.userId,
      actionType: 'CSV_EXPORT',
      targetResource: 'app',
      targetId: appId,
      ipAddress: req.ip,
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="records_${appId}.csv"`);
    res.send(csv);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const meta = await this.recordsService.getRecordMeta(id);
    const perm = await this.permission.assert(user.userId, user.role, meta.appId, 'canView');
    await this.assertRecordScope(meta.appId, 'view', perm, meta.createdBy, user.userId, user.role);
    await this.assertRecordFieldScope(meta.appId, perm.canManage, id, user.userId, user.role);
    return this.recordsService.findOne(id);
  }

  /** このレコードを参照している他アプリのレコード（閲覧権限のあるアプリのみ）。 */
  @Get(':id/related')
  async related(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const meta = await this.recordsService.getRecordMeta(id);
    await this.permission.assert(user.userId, user.role, meta.appId, 'canView');
    const groups = await this.recordsService.findRelated(id, { userId: user.userId, role: user.role });
    const out: typeof groups = [];
    for (const g of groups) {
      const perm = await this.permission
        .getEffectivePermission(user.userId, user.role, g.appId)
        .catch(() => null);
      if (perm?.canView) out.push(g);
    }
    return out;
  }

  @Post()
  async create(@Body() dto: CreateRecordDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    await this.permission.assert(user.userId, user.role, dto.appId, 'canAdd');
    const record = await this.recordsService.create(dto.appId, dto.data, user.userId);
    await this.audit.log({
      userId: user.userId,
      actionType: 'RECORD_CREATE',
      targetResource: 'record',
      targetId: record.id,
      details: { appId: dto.appId },
      ipAddress: req.ip,
    });
    return record;
  }

  @Post('import')
  async importCsv(@Body() dto: ImportDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    await this.permission.assert(user.userId, user.role, dto.appId, 'canAdd');
    const result = await this.recordsService.importRows(dto.appId, dto.rows, user.userId);
    await this.audit.log({
      userId: user.userId,
      actionType: 'CSV_IMPORT',
      targetResource: 'app',
      targetId: dto.appId,
      details: { created: result.created, errors: result.errors.length },
      ipAddress: req.ip,
    });
    return result;
  }

  @Post('bulk-delete')
  async bulkDelete(@Body() dto: BulkDeleteDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    const perm = await this.permission.getEffectivePermission(user.userId, user.role, dto.appId);
    let allowed: string[] | null;
    if (perm.canDelete) {
      // owner/org 編集範囲かつ管理権限なしの場合はアクセス可能な作成者のレコードのみ削除
      allowed = await this.permission.allowedCreatorIds(dto.appId, user.userId, user.role, 'edit', perm.canManage);
    } else if (perm.canAdd && (await this.permission.getOwnMutationFlags(dto.appId)).deleteOwn) {
      // 削除権限は無いが「作成者は自分のレコードを削除できる」設定がONなら本人作成分のみ
      allowed = [user.userId];
    } else {
      throw new ForbiddenException('このアプリのレコードを削除する権限がありません');
    }
    // 対象社員フィールド基準（設定時・非特権）の範囲内のみ削除対象にする。
    const fieldScope = await this.permission.recordFieldScope(dto.appId, user.userId, user.role, perm.canManage);
    const result = await this.recordsService.bulkRemove(dto.appId, dto.ids, allowed, fieldScope);
    await this.audit.log({
      userId: user.userId,
      actionType: 'RECORD_BULK_DELETE',
      targetResource: 'app',
      targetId: dto.appId,
      details: { requested: dto.ids.length, deleted: result.deleted },
      ipAddress: req.ip,
    });
    return result;
  }

  /** 指定レコード群を参照している他アプリのレコード件数（削除前の警告用）。canView 必須。 */
  @Post('referencing-count')
  async referencingCount(@Body() dto: ReferencingCountDto, @CurrentUser() user: AuthUser) {
    await this.permission.assert(user.userId, user.role, dto.appId, 'canView');
    const count = await this.recordsService.countReferencing(dto.appId, dto.ids);
    return { count };
  }

  /** 指定IDのうち実在するレコードIDを返す（参照のリンク切れ可視化用）。存在有無のみで内容は返さない。 */
  @Post('exist')
  async exist(@Body() dto: ExistDto) {
    const existing = await this.recordsService.existingIds(dto.ids);
    return { existing };
  }

  /** 一括配布: 指定ユーザーごとに担当者を設定したレコードを生成する（canAdd）。 */
  @Post('bulk-distribute')
  async bulkDistribute(@Body() dto: BulkDistributeDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    await this.permission.assert(user.userId, user.role, dto.appId, 'canAdd');
    const result = await this.recordsService.bulkDistribute(
      dto.appId,
      dto.assigneeField,
      dto.userIds,
      dto.baseData ?? {},
      user.userId,
    );
    await this.audit.log({
      userId: user.userId,
      actionType: 'RECORD_CREATE',
      targetResource: 'app',
      targetId: dto.appId,
      details: { distributed: result.created },
      ipAddress: req.ip,
    });
    return result;
  }

  /** レコード複製。閲覧（範囲含む）+ 追加権限が必要。 */
  @Post(':id/duplicate')
  async duplicate(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: any) {
    const meta = await this.recordsService.getRecordMeta(id);
    const perm = await this.permission.assert(user.userId, user.role, meta.appId, 'canView');
    await this.assertRecordScope(meta.appId, 'view', perm, meta.createdBy, user.userId, user.role);
    await this.assertRecordFieldScope(meta.appId, perm.canManage, id, user.userId, user.role);
    await this.permission.assert(user.userId, user.role, meta.appId, 'canAdd');
    const record = await this.recordsService.duplicate(id, user.userId);
    await this.audit.log({
      userId: user.userId,
      actionType: 'RECORD_CREATE',
      targetResource: 'record',
      targetId: record.id,
      details: { appId: meta.appId, duplicatedFrom: id },
      ipAddress: req.ip,
    });
    return record;
  }

  @Post(':id/comments')
  async addComment(
    @Param('id') id: string,
    @Body() dto: CommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const meta = await this.recordsService.getRecordMeta(id);
    const perm = await this.permission.assert(user.userId, user.role, meta.appId, 'canView');
    await this.assertRecordScope(meta.appId, 'view', perm, meta.createdBy, user.userId, user.role);
    await this.assertRecordFieldScope(meta.appId, perm.canManage, id, user.userId, user.role);
    return this.recordsService.addComment(id, user.userId, dto.comment);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateRecordDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    const meta = await this.recordsService.getRecordMeta(id);
    const perm = await this.permission.getEffectivePermission(user.userId, user.role, meta.appId);
    await this.assertCanMutate(meta.appId, 'edit', perm, meta.createdBy, user.userId, user.role);
    await this.assertRecordFieldScope(meta.appId, perm.canManage, id, user.userId, user.role);
    const record = await this.recordsService.update(id, dto.data, user.userId, { canManage: perm.canManage });
    await this.audit.log({
      userId: user.userId,
      actionType: 'RECORD_UPDATE',
      targetResource: 'record',
      targetId: id,
      details: { appId: meta.appId },
      ipAddress: req.ip,
    });
    return record;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: any) {
    const meta = await this.recordsService.getRecordMeta(id);
    const perm = await this.permission.getEffectivePermission(user.userId, user.role, meta.appId);
    await this.assertCanMutate(meta.appId, 'delete', perm, meta.createdBy, user.userId, user.role);
    await this.assertRecordFieldScope(meta.appId, perm.canManage, id, user.userId, user.role);
    const result = await this.recordsService.remove(id);
    await this.audit.log({
      userId: user.userId,
      actionType: 'RECORD_DELETE',
      targetResource: 'record',
      targetId: id,
      details: { appId: meta.appId },
      ipAddress: req.ip,
    });
    return result;
  }

  /**
   * レコードの編集/削除可否を検証する（403を投げる）。
   *  - canEdit/canDelete を持つ場合: 従来どおりレコード範囲(owner/org)で判定。
   *  - 持たない場合: 「作成者は自分のレコードを編集/削除できる」設定がONなら、
   *    追加権限(canAdd)ユーザーは本人が作成したレコードに限り許可する。
   */
  private async assertCanMutate(
    appId: string,
    action: 'edit' | 'delete',
    perm: EffectivePermission,
    recordCreatedBy: string,
    userId: string,
    role: string,
  ) {
    const hasAction = action === 'edit' ? perm.canEdit : perm.canDelete;
    if (hasAction) {
      await this.assertRecordScope(appId, 'edit', perm, recordCreatedBy, userId, role);
      return;
    }
    // アクション権限なし: 追加権限 + 設定ON + 作成者本人 のときのみ許可
    if (perm.canAdd && recordCreatedBy === userId) {
      const flags = await this.permission.getOwnMutationFlags(appId);
      if (action === 'edit' ? flags.editOwn : flags.deleteOwn) return;
    }
    throw new ForbiddenException(
      action === 'edit'
        ? 'このレコードを編集する権限がありません'
        : 'このレコードを削除する権限がありません',
    );
  }

  /**
   * 対象社員フィールド基準のレコードスコープを検証する（設定時のみ）。
   * 対象社員(field)値が自分の部署ツリー内でなければ 403。管理権限保有者は常に許可。
   */
  private async assertRecordFieldScope(
    appId: string,
    canManage: boolean,
    recordId: string,
    userId: string,
    role: string,
  ) {
    const fs = await this.permission.recordFieldScope(appId, userId, role, canManage);
    if (!fs) return;
    const value = await this.recordsService.getRecordFieldValue(recordId, fs.field);
    if (!fs.userIds.includes(value)) {
      throw new ForbiddenException('このレコードは管轄範囲外です');
    }
  }

  /**
   * レコード単位の公開範囲(owner)を検証する。
   * 管理権限保有者(所有者・管理者含む)は常に許可。それ以外は作成者本人のみ許可。
   */
  private async assertRecordScope(
    appId: string,
    kind: 'view' | 'edit',
    perm: { canManage: boolean },
    recordCreatedBy: string,
    userId: string,
    role: string,
  ) {
    const allowed = await this.permission.allowedCreatorIds(appId, userId, role, kind, perm.canManage);
    if (allowed && !allowed.includes(recordCreatedBy)) {
      throw new ForbiddenException(
        kind === 'view'
          ? 'このレコードを閲覧する権限がありません（権限の範囲外です）'
          : 'このレコードを編集・削除する権限がありません（権限の範囲外です）',
      );
    }
  }
}
