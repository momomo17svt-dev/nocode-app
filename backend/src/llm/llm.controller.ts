import { Body, Controller, Get, Put, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { LlmService } from './llm.service';
import { UpdateLlmConfigDto, LoadModelDto } from './dto/llm.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/llm')
export class LlmController {
  constructor(private readonly llm: LlmService) {}

  /** 接続状態とロード済みモデル一覧（全ユーザー・軽量）。 */
  @Get('health')
  health() {
    return this.llm.health();
  }

  /** キュー稼働状況＋モデル読込状態（全ユーザー・LM Studio非接触で軽量。頻繁なポーリング用）。 */
  @Get('queue')
  queue() {
    return this.llm.queueStatus();
  }

  /** 現在のAI設定（管理者のみ）。 */
  @Get('config')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  config() {
    return this.llm.getPublicConfig();
  }

  /** AI設定の更新（管理者のみ）。 */
  @Put('config')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  async update(@Body() dto: UpdateLlmConfigDto) {
    const { clearApiKey, ...patch } = dto;
    const saved = await this.llm.saveConfig(patch, clearApiKey === true);
    return this.llm.toPublicConfig(saved);
  }

  /** 指定モデルをLM Studio側でロード（旧モデル解放込み・管理者のみ）。完了後の状態を返す。 */
  @Post('load')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  async load(@Body() dto: LoadModelDto) {
    const cfg = await this.llm.getConfig();
    const model = dto.model || (dto.kind === 'embed' ? cfg.embedModel : cfg.chatModel);
    if (model) await this.llm.loadModel(model, dto.kind);
    return this.llm.health();
  }
}
