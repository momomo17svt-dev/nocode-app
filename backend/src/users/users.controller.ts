import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, ForbiddenException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { PermissionService } from '../permissions/permission.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateUserDto, UpdateUserDto, ImportUsersDto, UserQueryDto } from './dto/user.dto';

/**
 * ユーザー管理。SystemAdmin は全件。GroupAdmin(管理者)は自分の管轄(所属部署＋配下部署)に限定。
 * GroupAdmin は SystemAdmin ロールの付与・管轄外ユーザーの操作はできない。
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SystemAdmin', 'GroupAdmin')
@Controller('api/users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly permission: PermissionService,
    private readonly audit: AuditLogsService,
  ) {}

  @Get()
  async findAll(@Query() query: UserQueryDto, @CurrentUser() actor: AuthUser) {
    // GroupAdmin は管轄部署のメンバーだけに絞る。SystemAdmin は全件。
    const scope = actor.role === 'SystemAdmin' ? null : await this.permission.myScopeGroupIds(actor.userId);
    return this.usersService.findPaged(query, scope);
  }

  @Post()
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser, @Req() req: any) {
    if (actor.role !== 'SystemAdmin') {
      // GroupAdmin: SystemAdmin の作成は不可、初期所属は管轄内必須。
      if (dto.role === 'SystemAdmin') throw new ForbiddenException('システム管理者は作成できません');
      if (!dto.groupId) throw new BadRequestException('所属部署を指定してください');
      await this.permission.assertGroupInScope(actor.userId, actor.role, dto.groupId);
    }
    const user = await this.usersService.create(dto);
    await this.audit.log({
      userId: actor.userId,
      actionType: 'USER_CREATE',
      targetResource: 'user',
      targetId: user.id,
      details: { loginId: user.loginId, name: user.name, role: user.role },
      ipAddress: req.ip,
    });
    return user;
  }

  @Post('import')
  @Roles('SystemAdmin')
  async importCsv(@Body() dto: ImportUsersDto, @CurrentUser() actor: AuthUser, @Req() req: any) {
    const result = await this.usersService.importRows(dto.rows);
    await this.audit.log({
      userId: actor.userId,
      actionType: 'USER_IMPORT',
      targetResource: 'user',
      details: { created: result.created, errors: result.errors.length },
      ipAddress: req.ip,
    });
    return result;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
    @Req() req: any,
  ) {
    if (actor.role !== 'SystemAdmin') {
      // GroupAdmin: 管轄外ユーザーの操作・SystemAdmin への昇格は不可。
      if (dto.role === 'SystemAdmin') throw new ForbiddenException('システム管理者ロールは付与できません');
      await this.permission.assertUserInScope(actor.userId, actor.role, id);
      // 所属部署を変更する場合、異動先も管轄内であること（管轄外へ出せない）。
      if (dto.groupId) await this.permission.assertGroupInScope(actor.userId, actor.role, dto.groupId);
    }
    const user = await this.usersService.update(id, dto);
    await this.audit.log({
      userId: actor.userId,
      actionType: 'USER_UPDATE',
      targetResource: 'user',
      targetId: id,
      details: { role: dto.role, isActive: dto.isActive, passwordChanged: !!dto.password },
      ipAddress: req.ip,
    });
    return user;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() actor: AuthUser, @Req() req: any) {
    // 自分自身は削除させない（最後の管理者ロックアウト防止）
    if (id === actor.userId) {
      throw new ForbiddenException('自分自身は削除できません');
    }
    // GroupAdmin は管轄外ユーザーを削除できない。
    if (actor.role !== 'SystemAdmin') {
      await this.permission.assertUserInScope(actor.userId, actor.role, id);
    }
    const result = await this.usersService.remove(id);
    await this.audit.log({
      userId: actor.userId,
      actionType: 'USER_DELETE',
      targetResource: 'user',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
  }
}
