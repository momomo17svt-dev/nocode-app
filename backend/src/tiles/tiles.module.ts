import { Module } from '@nestjs/common';
import { TilesController } from './tiles.controller';
import { SettingsModule } from '../system-settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [TilesController],
})
export class TilesModule {}
