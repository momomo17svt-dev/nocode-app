import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator';
import { AiService } from './ai.service';
import { EmbeddingService } from './embedding.service';
import { DocumentsService } from './documents.service';
import { AnalyzeAppDto, AnalyzeRecordDto, AskDto, DraftRecordDto, GenerateDto, GenerateTemplateDto, GovParseDto, SearchDto, UpsertDocDto } from './dto/ai.dto';

@UseGuards(JwtAuthGuard)
@Controller('api/ai')
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly emb: EmbeddingService,
    private readonly docs: DocumentsService,
  ) {}

  // ===== 利用系（全ユーザー・権限は内部でアプリ単位に適用） =====
  @Post('search')
  search(@Body() dto: SearchDto, @CurrentUser() user: AuthUser) {
    return this.ai.search(user.userId, user.role, dto.query, { k: dto.k, docId: dto.docId });
  }

  @Post('ask')
  ask(@Body() dto: AskDto, @CurrentUser() user: AuthUser) {
    return this.ai.ask(user.userId, user.role, dto.question, dto.history as any, dto.docId);
  }

  /** RAGチャットのストリーミング応答（SSE）。Bearer認証のため EventSource ではなく fetch で消費する。 */
  @Post('ask/stream')
  async askStream(@Body() dto: AskDto, @CurrentUser() user: AuthUser, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as any).flushHeaders?.();
    const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      await this.ai.askStream(user.userId, user.role, dto.question, dto.history as any, {
        onSources: (sources) => send('sources', sources),
        onToken: (t) => send('token', t),
        onQueued: (info) => send('queued', info),
      }, dto.docId);
      send('done', {});
    } catch (e: any) {
      send('error', e?.message || 'AI応答の生成に失敗しました');
    } finally {
      res.end();
    }
  }

  @Post('analyze/app')
  analyzeApp(@Body() dto: AnalyzeAppDto, @CurrentUser() user: AuthUser) {
    return this.ai.analyzeApp(user.userId, user.role, dto.appId);
  }

  /** AI分析のストリーミング応答（SSE）。遅い推論モデルでも集計→インサイトが順次表示される。 */
  @Post('analyze/app/stream')
  async analyzeAppStream(@Body() dto: AnalyzeAppDto, @CurrentUser() user: AuthUser, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as any).flushHeaders?.();
    const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      await this.ai.analyzeAppStream(user.userId, user.role, dto.appId, {
        onStats: (s) => send('stats', s),
        onToken: (t) => send('token', t),
        onQueued: (info) => send('queued', info),
      });
      send('done', {});
    } catch (e: any) {
      send('error', e?.message || 'AI分析の生成に失敗しました');
    } finally {
      res.end();
    }
  }

  @Post('analyze/record')
  analyzeRecord(@Body() dto: AnalyzeRecordDto, @CurrentUser() user: AuthUser) {
    return this.ai.analyzeRecord(user.userId, user.role, dto.recordId, dto.mode || 'summary');
  }

  /** 自然言語の説明文からレコードのフィールド値を下書き（入力支援）。 */
  @Post('draft-record')
  draftRecord(@Body() dto: DraftRecordDto, @CurrentUser() user: AuthUser) {
    return this.ai.draftRecord(user.userId, user.role, dto.appId, dto.text);
  }

  /** 画像（書類・伝票・名刺等）を読み取ってレコードのフィールド値を下書き（VLM-OCR入力支援）。 */
  @Post('draft-record/image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
    }),
  )
  draftRecordImage(
    @UploadedFile() file: Express.Multer.File,
    @Query('appId') appId: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('画像が指定されていません');
    if (!file.mimetype?.startsWith('image/')) throw new BadRequestException('画像ファイルを指定してください');
    if (!appId) throw new BadRequestException('appId が指定されていません');
    const dataUrl = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    return this.ai.draftRecordFromImage(user.userId, user.role, appId, dataUrl);
  }

  /** AI項目/AIアクションのプロンプトを実行してストリーミング生成（SSE）。 */
  @Post('generate/stream')
  async generateStream(@Body() dto: GenerateDto, @CurrentUser() user: AuthUser, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as any).flushHeaders?.();
    const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      await this.ai.generateStream(
        user.userId,
        user.role,
        dto.appId,
        { fieldCode: dto.fieldCode, actionId: dto.actionId, prompt: dto.prompt },
        dto.data || {},
        { onToken: (t) => send('token', t), onQueued: (info) => send('queued', info) },
      );
      send('done', {});
    } catch (e: any) {
      send('error', e?.message || 'AI生成に失敗しました');
    } finally {
      res.end();
    }
  }

  /** 自然言語の要望からアプリ定義（テンプレ）をストリーミング生成（SystemAdmin/AppCreator）。 */
  @Post('generate-template/stream')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin', 'AppCreator', 'GroupAdmin')
  async generateTemplate(@Body() dto: GenerateTemplateDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    (res as any).flushHeaders?.();
    const send = (event: string, data: any) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    try {
      await this.ai.generateTemplateStream(dto.description, {
        onProgress: (t) => send('progress', t),
        onDefinition: (def) => send('definition', def),
        onQueued: (info) => send('queued', info),
      });
      send('done', {});
    } catch (e: any) {
      send('error', e?.message || 'アプリ定義の生成に失敗しました');
    } finally {
      res.end();
    }
  }

  // ===== インデックス管理（管理者のみ） =====
  @Get('index/status')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  status() {
    return this.emb.status();
  }

  @Post('index/app/:appId')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  indexApp(@Param('appId') appId: string) {
    return this.emb.indexApp(appId);
  }

  @Post('index/reindex')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  reindex() {
    return this.emb.reindexAll();
  }

  // ===== ナレッジ（全ユーザー・可視性で絞り込み） =====
  /** 自分が検索できる（可視な）ナレッジ文書の一覧。 */
  @Get('knowledge')
  listKnowledge(@CurrentUser() user: AuthUser) {
    return this.docs.listVisible(user.userId, user.role);
  }

  /** 可視なナレッジ文書を1件取得（構造ビューア用）。 */
  @Get('knowledge/:id')
  getKnowledge(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.docs.getVisible(id, user.userId, user.role);
  }

  // ===== ナレッジ文書（管理者のみ） =====
  @Get('documents')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  listDocs() {
    return this.docs.list();
  }

  @Get('documents/:id')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  getDoc(@Param('id') id: string) {
    return this.docs.get(id);
  }

  @Post('documents')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  createDoc(@Body() dto: UpsertDocDto, @CurrentUser() user: AuthUser) {
    return this.docs.create(dto, user.userId);
  }

  /** ファイルをアップロードして本文を抽出しナレッジ文書を作成（txt/md/csv/PDF/Word等）。 */
  @Post('documents/upload')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    }),
  )
  uploadDoc(
    @UploadedFile() file: Express.Multer.File,
    @Query('appId') appId: string,
    @Query('kind') kind: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('ファイルが指定されていません');
    // multer は originalname を latin1 で渡すため UTF-8 に復元（日本語ファイル名対策）
    const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    return this.docs.createFromUpload(
      { buffer: file.buffer, originalName, mimeType: file.mimetype },
      appId || null,
      user.userId,
      kind || null,
    );
  }

  /** 保存前に行政文書の構造をプレビュー解析する（SystemAdmin）。 */
  @Post('gov/parse')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  govParse(@Body() dto: GovParseDto) {
    return this.docs.parse(dto.content);
  }

  @Put('documents/:id')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  updateDoc(@Param('id') id: string, @Body() dto: UpsertDocDto) {
    return this.docs.update(id, dto);
  }

  @Delete('documents/:id')
  @UseGuards(RolesGuard)
  @Roles('SystemAdmin')
  deleteDoc(@Param('id') id: string) {
    return this.docs.remove(id);
  }
}
