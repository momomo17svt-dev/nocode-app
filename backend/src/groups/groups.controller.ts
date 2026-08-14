import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, BadRequestException } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { PermissionService } from '../permissions/permission.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import {
  CreateGroupDto,
  UpdateGroupDto,
  MemberDto,
  ImportGroupsDto,
  ReorderGroupDto,
  GroupChildrenQueryDto,
  GroupSearchQueryDto,
  MembersQueryDto,
} from './dto/group.dto';

/**
 * グループ管理。SystemAdmin は全件。GroupAdmin(管理者)は自分の管轄(所属部署＋配下部署)内のみ変更可。
 * 参照系は閲覧可とし、変更系(作成/更新/削除/並べ替え/メンバー増減)に管轄スコープ検査を入れる。
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SystemAdmin', 'GroupAdmin')
@Controller('api/groups')
export class GroupsController {
  constructor(
    private readonly groupsService: GroupsService,
    private readonly permission: PermissionService,
    private readonly audit: AuditLogsService,
  ) {}

  @Get()
  async findAll(@CurrentUser() user: AuthUser) {
    const all = await this.groupsService.findAll();
    if (user.role === 'SystemAdmin') return all;
    // GroupAdmin は管轄内の部署だけ。
    const scope = new Set(await this.permission.myScopeGroupIds(user.userId));
    return all.filter((g) => scope.has(g.id));
  }

  // 組織ツリーの遅延展開: 指定親の直下グループだけ取得（:id より前に宣言してルート衝突回避）。
  @Get('children')
  async findChildren(@Query() query: GroupChildrenQueryDto, @CurrentUser() user: AuthUser) {
    if (user.role === 'SystemAdmin') return this.groupsService.findChildren(query.parentId || null);
    // GroupAdmin: ルート(parentId無し)は自分の所属部署。配下は管轄内の部署のみ展開できる。
    if (!query.parentId) return this.groupsService.findUserRootGroups(user.userId);
    await this.permission.assertGroupInScope(user.userId, user.role, query.parentId);
    return this.groupsService.findChildren(query.parentId);
  }

  // グループ名の部分一致検索（親部署ピッカー等で使用）。
  @Get('search')
  async search(@Query() query: GroupSearchQueryDto, @CurrentUser() user: AuthUser) {
    const results = await this.groupsService.searchGroups(query.q ?? '', query.take ?? 50);
    if (user.role === 'SystemAdmin') return results;
    const scope = new Set(await this.permission.myScopeGroupIds(user.userId));
    return results.filter((r: any) => scope.has(r.id));
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    if (user.role !== 'SystemAdmin') await this.permission.assertGroupInScope(user.userId, user.role, id);
    return this.groupsService.findMeta(id);
  }

  // メンバーの検索・ページング取得。
  @Get(':id/members')
  async members(@Param('id') id: string, @Query() query: MembersQueryDto, @CurrentUser() user: AuthUser) {
    if (user.role !== 'SystemAdmin') await this.permission.assertGroupInScope(user.userId, user.role, id);
    return this.groupsService.findMembers(id, query);
  }

  @Post()
  async create(@Body() dto: CreateGroupDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    if (user.role !== 'SystemAdmin') {
      // GroupAdmin は最上位部署を作れず、管轄内の部署の配下にのみ作成できる。
      if (!dto.parentId) throw new BadRequestException('最上位部署の作成はシステム管理者のみ可能です');
      await this.permission.assertGroupInScope(user.userId, user.role, dto.parentId);
    }
    const group = await this.groupsService.create(dto);
    await this.logChange(user, 'GROUP_CREATE', group.id, req, { name: group.name });
    return group;
  }

  @Post('import')
  @Roles('SystemAdmin')
  async importCsv(@Body() dto: ImportGroupsDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    const result = await this.groupsService.importRows(dto.rows);
    await this.audit.log({
      userId: user.userId,
      actionType: 'GROUP_IMPORT',
      targetResource: 'group',
      details: { created: result.created, updated: result.updated, errors: result.errors.length },
      ipAddress: req.ip,
    });
    return result;
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateGroupDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    if (user.role !== 'SystemAdmin') {
      await this.permission.assertGroupInScope(user.userId, user.role, id);
      // 移動先(新しい親)も管轄内であること（管轄外へ持ち出せない）。
      if (dto.parentId) await this.permission.assertGroupInScope(user.userId, user.role, dto.parentId);
      else if (dto.parentId === null || dto.parentId === '') {
        throw new BadRequestException('最上位への移動はシステム管理者のみ可能です');
      }
    }
    const group = await this.groupsService.update(id, dto);
    await this.logChange(user, 'GROUP_UPDATE', id, req, dto);
    return group;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: any) {
    if (user.role !== 'SystemAdmin') {
      await this.permission.assertGroupInScope(user.userId, user.role, id);
    }
    const result = await this.groupsService.remove(id);
    await this.logChange(user, 'GROUP_DELETE', id, req);
    return result;
  }

  @Post(':id/reorder')
  async reorder(
    @Param('id') id: string,
    @Body() dto: ReorderGroupDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    if (user.role !== 'SystemAdmin') {
      await this.permission.assertGroupInScope(user.userId, user.role, id);
    }
    const result = await this.groupsService.reorder(id, dto.direction);
    await this.logChange(user, 'GROUP_UPDATE', id, req, { reorder: dto.direction });
    return result;
  }

  @Post(':id/members')
  async addMember(
    @Param('id') id: string,
    @Body() dto: MemberDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    if (user.role !== 'SystemAdmin') {
      // 管轄内の部署に、管轄内のユーザーだけ追加できる。
      await this.permission.assertGroupInScope(user.userId, user.role, id);
      await this.permission.assertUserInScope(user.userId, user.role, dto.userId);
    }
    const result = await this.groupsService.addMember(id, dto.userId);
    await this.logChange(user, 'GROUP_MEMBER_ADD', id, req, { userId: dto.userId });
    return result;
  }

  @Delete(':id/members/:userId')
  async removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    if (user.role !== 'SystemAdmin') {
      await this.permission.assertGroupInScope(user.userId, user.role, id);
    }
    const result = await this.groupsService.removeMember(id, userId);
    await this.logChange(user, 'GROUP_MEMBER_REMOVE', id, req, { userId });
    return result;
  }

  private logChange(user: AuthUser, actionType: string, groupId: string, req: any, details?: any) {
    return this.audit.log({
      userId: user.userId,
      actionType,
      targetResource: 'group',
      targetId: groupId,
      details,
      ipAddress: req.ip,
    });
  }
}
