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
} from '@nestjs/common';
import { AppsService } from './apps.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { PermissionService } from '../permissions/permission.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateAppDto, UpdateAppDto, SetStatusDto, PublicFormDto, CreateFromTemplateDto, CreateFromSuiteDto, SaveAsTemplateDto, CreateFromDefinitionDto, SaveDefinitionTemplateDto } from './dto/app.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/apps')
export class AppsController {
  constructor(
    private readonly appsService: AppsService,
    private readonly permission: PermissionService,
    private readonly audit: AuditLogsService,
  ) {}

  /** 自分が閲覧可能なアプリ一覧。 */
  @Get()
  findAll(@CurrentUser() user: AuthUser) {
    return this.appsService.findAllVisible(user.userId, user.role);
  }

  /** 利用可能なアプリテンプレート一覧（作成者ロールのみ）。:id より前に宣言すること。 */
  @Roles('SystemAdmin', 'AppCreator', 'GroupAdmin')
  @Get('templates')
  listTemplates() {
    return this.appsService.listTemplates();
  }

  /** ユーザー定義テンプレートの削除（作成者本人またはシステム管理者）。 */
  @Roles('SystemAdmin', 'AppCreator', 'GroupAdmin')
  @Delete('templates/user/:tid')
  deleteUserTemplate(@Param('tid') tid: string, @CurrentUser() user: AuthUser) {
    return this.appsService.deleteUserTemplate(tid, user.userId, user.role);
  }

  /** 連携アプリ群（スイート）一覧（作成者ロールのみ）。:id より前に宣言すること。 */
  @Roles('SystemAdmin', 'AppCreator', 'GroupAdmin')
  @Get('suites')
  listSuites() {
    return this.appsService.listSuites();
  }

  /** 連携アプリ群（スイート）からアプリ一式を生成。システム管理者とアプリ作成者のみ。 */
  @Roles('SystemAdmin', 'AppCreator', 'GroupAdmin')
  @Post('from-suite')
  async createFromSuite(
    @Body() dto: CreateFromSuiteDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    const result = await this.appsService.createFromSuite(
      dto.suiteId,
      { withSamples: dto.withSamples, allowDuplicate: dto.allowDuplicate },
      user.userId,
    );
    for (const app of result.apps) {
      await this.audit.log({
        userId: user.userId,
        actionType: 'APP_CREATE',
        targetResource: 'app',
        targetId: app.id,
        details: { name: app.name, suiteId: dto.suiteId },
        ipAddress: req.ip,
      });
    }
    return result;
  }

  /** アプリ詳細 + 自分の有効権限を同梱（フロントの権限ベースUI用）。 */
  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    const perm = await this.permission.assert(user.userId, user.role, id, 'canView');
    const app = await this.appsService.findOne(id);
    return { ...app, myPermission: perm };
  }

  /** アプリ作成はシステム管理者とアプリ作成者のみ。 */
  @Roles('SystemAdmin', 'AppCreator', 'GroupAdmin')
  @Post()
  async create(@Body() dto: CreateAppDto, @CurrentUser() user: AuthUser, @Req() req: any) {
    const app = await this.appsService.create(dto, user.userId);
    await this.audit.log({
      userId: user.userId,
      actionType: 'APP_CREATE',
      targetResource: 'app',
      targetId: app.id,
      details: { name: app.name },
      ipAddress: req.ip,
    });
    return app;
  }

  /** テンプレートからアプリ生成。システム管理者とアプリ作成者のみ。 */
  @Roles('SystemAdmin', 'AppCreator', 'GroupAdmin')
  @Post('from-template')
  async createFromTemplate(
    @Body() dto: CreateFromTemplateDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    const app = await this.appsService.createFromTemplate(
      dto.templateId,
      { name: dto.name, description: dto.description, withSamples: dto.withSamples },
      user.userId,
    );
    await this.audit.log({
      userId: user.userId,
      actionType: 'APP_CREATE',
      targetResource: 'app',
      targetId: app.id,
      details: { name: app.name, templateId: dto.templateId },
      ipAddress: req.ip,
    });
    return app;
  }

  /** AI生成などの定義からアプリを作成。システム管理者とアプリ作成者のみ。 */
  @Roles('SystemAdmin', 'AppCreator', 'GroupAdmin')
  @Post('from-definition')
  async createFromDefinition(
    @Body() dto: CreateFromDefinitionDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    const app = await this.appsService.createFromDefinition(dto.definition, { name: dto.name, description: dto.description }, user.userId);
    await this.audit.log({
      userId: user.userId,
      actionType: 'APP_CREATE',
      targetResource: 'app',
      targetId: app.id,
      details: { name: app.name, source: 'definition' },
      ipAddress: req.ip,
    });
    return app;
  }

  /** AI生成などの定義をユーザーテンプレートとして保存。システム管理者とアプリ作成者のみ。 */
  @Roles('SystemAdmin', 'AppCreator', 'GroupAdmin')
  @Post('templates/from-definition')
  async saveDefinitionAsTemplate(
    @Body() dto: SaveDefinitionTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.appsService.saveDefinitionAsTemplate(
      { name: dto.name, category: dto.category, icon: dto.icon, summary: dto.summary },
      dto.definition,
      user.userId,
    );
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateAppDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    await this.permission.assert(user.userId, user.role, id, 'canManage');
    const app = await this.appsService.update(id, dto);
    await this.audit.log({
      userId: user.userId,
      actionType: 'APP_UPDATE',
      targetResource: 'app',
      targetId: id,
      details: dto,
      ipAddress: req.ip,
    });
    return app;
  }

  /** 公開/非公開の切り替え。 */
  @Put(':id/status')
  async setStatus(
    @Param('id') id: string,
    @Body() dto: SetStatusDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    await this.permission.assert(user.userId, user.role, id, 'canManage');
    const app = await this.appsService.setStatus(id, dto.status);
    await this.audit.log({
      userId: user.userId,
      actionType: 'APP_STATUS_CHANGE',
      targetResource: 'app',
      targetId: id,
      details: { status: dto.status },
      ipAddress: req.ip,
    });
    return app;
  }

  /** 匿名公開フォームの有効化/無効化。管理権限が必要。 */
  @Put(':id/public-form')
  async setPublicForm(
    @Param('id') id: string,
    @Body() dto: PublicFormDto,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    await this.permission.assert(user.userId, user.role, id, 'canManage');
    const result = await this.appsService.setPublicForm(id, dto.enabled, dto.regenerate);
    await this.audit.log({
      userId: user.userId,
      actionType: 'APP_UPDATE',
      targetResource: 'app',
      targetId: id,
      details: { publicFormEnabled: result.publicFormEnabled, regenerate: !!dto.regenerate },
      ipAddress: req.ip,
    });
    return result;
  }

  /** アプリ複製。作成権限ロール + 複製元の管理権限が必要。 */
  @Roles('SystemAdmin', 'AppCreator', 'GroupAdmin')
  @Post(':id/duplicate')
  async duplicate(@Param('id') id: string, @CurrentUser() user: AuthUser, @Req() req: any) {
    await this.permission.assert(user.userId, user.role, id, 'canManage');
    const app = await this.appsService.duplicate(id, user.userId);
    await this.audit.log({
      userId: user.userId,
      actionType: 'APP_DUPLICATE',
      targetResource: 'app',
      targetId: app.id,
      details: { sourceAppId: id },
      ipAddress: req.ip,
    });
    return app;
  }

  /** 既存アプリをテンプレートとして保存。作成権限ロール + 管理権限が必要。 */
  @Roles('SystemAdmin', 'AppCreator', 'GroupAdmin')
  @Post(':id/save-as-template')
  async saveAsTemplate(
    @Param('id') id: string,
    @Body() dto: SaveAsTemplateDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.permission.assert(user.userId, user.role, id, 'canManage');
    return this.appsService.saveAsTemplate(id, dto, user.userId);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Query('force') force: string,
    @CurrentUser() user: AuthUser,
    @Req() req: any,
  ) {
    await this.permission.assert(user.userId, user.role, id, 'canManage');
    const result = await this.appsService.remove(id, force === 'true');
    await this.audit.log({
      userId: user.userId,
      actionType: 'APP_DELETE',
      targetResource: 'app',
      targetId: id,
      ipAddress: req.ip,
    });
    return result;
  }
}
