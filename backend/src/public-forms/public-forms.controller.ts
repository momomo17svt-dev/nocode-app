import { Controller, Get, Post, Param, Body, Req } from '@nestjs/common';
import { PublicFormsService } from './public-forms.service';
import { PublicSubmitDto } from './dto/public-form.dto';

/**
 * 匿名公開フォーム用のエンドポイント。
 * 認証ガードを意図的に付けず、ログイン不要でアクセスできる。
 * 公開はフォーム定義の取得と投稿のみで、既存レコードは一切返さない。
 */
@Controller('api/public/forms')
export class PublicFormsController {
  constructor(private readonly service: PublicFormsService) {}

  /** 公開フォームの描画情報を取得（トークンで識別、無効なら404）。 */
  @Get(':token')
  getForm(@Param('token') token: string) {
    return this.service.getForm(token);
  }

  /** 公開フォームへの匿名投稿。 */
  @Post(':token')
  submit(@Param('token') token: string, @Body() dto: PublicSubmitDto, @Req() req: any) {
    return this.service.submit(token, dto.data, req.ip);
  }
}
