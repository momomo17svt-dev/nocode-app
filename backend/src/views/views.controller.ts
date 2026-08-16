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
  ForbiddenException,
} from '@nestjs/common';
import { ViewsService } from './views.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { PermissionService } from '../permissions/permission.service';
import { CreateViewDto, UpdateViewDto } from './dto/view.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/views')
export class ViewsController {
  constructor(
    private readonly viewsService: ViewsService,
    private readonly permission: PermissionService,
  ) {}

  @Get()
  async findAll(@Query('appId') appId: string, @CurrentUser() user: AuthUser) {
    await this.permission.assert(user.userId, user.role, appId, 'canView');
    return this.viewsService.findAll(appId, user.userId);
  }

  @Post()
  async create(@Body() dto: CreateViewDto, @CurrentUser() user: AuthUser) {
    // 全体共有ビューはアプリ管理権限が必要。自分専用ビューは閲覧権限で可。
    const action = dto.isShared === false ? 'canView' : 'canManage';
    await this.permission.assert(user.userId, user.role, dto.appId, action);
    return this.viewsService.create(dto.appId, dto, user.userId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateViewDto, @CurrentUser() user: AuthUser) {
    await this.authorizeMutate(id, user, dto.isShared);
    return this.viewsService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    await this.authorizeMutate(id, user);
    return this.viewsService.remove(id);
  }

  /**
   * 共有ビューは管理権限、専用ビューは作成者本人のみ変更/削除可。
   * 専用→共有への昇格(nextShared=true)も管理権限を要求する。
   * 更新前の状態だけで判定すると、閲覧権限しかない利用者が
   * 「専用ビューを作る→共有に切り替える」で共有ビューを作れてしまうため。
   */
  private async authorizeMutate(id: string, user: AuthUser, nextShared?: boolean) {
    const meta = await this.viewsService.getMeta(id);
    if (meta.isShared || nextShared === true) {
      await this.permission.assert(user.userId, user.role, meta.appId, 'canManage');
    } else if (meta.createdBy !== user.userId && user.role !== 'SystemAdmin') {
      throw new ForbiddenException('このビューを操作する権限がありません');
    }
  }
}
