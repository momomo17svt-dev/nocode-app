import { Controller, Get, UseGuards } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TILES_DIR } from '../common/storage.util';
import { SettingsService } from '../system-settings/settings.service';

const KNOWN_STYLES = ['pale', 'std', 'photo'];

/**
 * 内蔵タイル（背景地図）のメタ情報。
 * 実体タイル画像は main.ts の useStaticAssets により /tiles/<種別>/... で配信される。
 */
@UseGuards(JwtAuthGuard)
@Controller('api/tiles')
export class TilesController {
  constructor(private settings: SettingsService) {}

  /**
   * ダウンロード済みの内蔵タイル種と、システム設定の既定背景地図を返す。
   * 画面はこれだけで「内蔵タイルが使えるか」「既定はどれか」を判断できる。
   */
  @Get('styles')
  async styles() {
    const present = KNOWN_STYLES.filter((s) => {
      try {
        const dir = path.join(TILES_DIR, s);
        return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
      } catch {
        return false;
      }
    });
    const policy = await this.settings.getMapPolicy();
    return { styles: present, defaultBasemap: policy.defaultBasemap, tileUrl: policy.tileUrl };
  }
}
