import { Controller, Get, UseGuards } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TILES_DIR } from '../common/storage.util';

const KNOWN_STYLES = ['pale', 'std', 'photo'];

/**
 * 内蔵タイル（背景地図）のメタ情報。
 * 実体タイル画像は main.ts の useStaticAssets により /tiles/<種別>/... で配信される。
 */
@UseGuards(JwtAuthGuard)
@Controller('api/tiles')
export class TilesController {
  /** ダウンロード済みの内蔵タイル種を返す（フロントの背景地図切替で利用可能なものを判定）。 */
  @Get('styles')
  styles() {
    const present = KNOWN_STYLES.filter((s) => {
      try {
        const dir = path.join(TILES_DIR, s);
        return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
      } catch {
        return false;
      }
    });
    return { styles: present.length ? present : [] };
  }
}
