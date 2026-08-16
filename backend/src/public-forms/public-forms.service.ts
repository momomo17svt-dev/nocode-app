import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordsService } from '../records/records.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { assertRequiredFilled } from '../records/record-input.util';
import {
  ANONYMOUS_USER_ID,
  PUBLIC_SAFE_FIELD_TYPES,
  PUBLIC_INPUT_FIELD_TYPES,
} from './public-form.constants';

@Injectable()
export class PublicFormsService {
  private readonly submissionWindows = new Map<string, number[]>();

  constructor(
    private prisma: PrismaService,
    private records: RecordsService,
    private audit: AuditLogsService,
  ) {}

  /** トークンから有効な公開フォームのアプリを取得する。無効・未有効化なら404（存在秘匿）。 */
  private async getEnabledApp(token: string) {
    if (!token) throw new NotFoundException('フォームが見つかりません');
    const app = await this.prisma.app.findFirst({
      where: { publicFormToken: token, publicFormEnabled: true },
      include: { fields: { orderBy: { createdAt: 'asc' } } },
    });
    if (!app) throw new NotFoundException('フォームが見つかりません');
    return app;
  }

  /** 公開フォームの描画情報（タイトル・説明・安全なフィールド定義のみ）。レコードは返さない。 */
  async getForm(token: string) {
    const app = await this.getEnabledApp(token);
    const cfg = (app.publicFormConfig as any) || {};
    const fields = app.fields
      .filter((f) => PUBLIC_SAFE_FIELD_TYPES.has(f.fieldType))
      .map((f) => ({
        fieldCode: f.fieldCode,
        fieldType: f.fieldType,
        label: f.label,
        required: f.required,
        settings: f.settings ?? {},
      }));
    return {
      title: (cfg.title as string)?.trim() || app.name,
      description: (cfg.description as string) ?? app.description ?? '',
      thankYouMessage: (cfg.thankYouMessage as string)?.trim() || '',
      fields,
    };
  }

  /** 匿名投稿。安全な入力フィールドのみ採用し、匿名ユーザー名義でレコードを作成する。 */
  async submit(token: string, data: Record<string, any>, ip?: string) {
    const app = await this.getEnabledApp(token);
    this.assertSubmissionRate(token, ip);
    const inputFields = app.fields.filter((f) => PUBLIC_INPUT_FIELD_TYPES.has(f.fieldType));
    const allowed = new Set(inputFields.map((f) => f.fieldCode));
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(data || {})) {
      if (allowed.has(k)) clean[k] = v;
    }
    // 匿名投稿は画面側の検証を信頼できないため、必須と入力量をサーバ側で確認する。
    // 必須判定はフォームに出している項目だけが対象（画面に出ない必須項目を
    // 求めると、そのフォームが恒久的に投稿不能になるため）。
    assertRequiredFilled(inputFields, clean);
    const record = await this.records.create(app.id, clean, ANONYMOUS_USER_ID);
    await this.audit.log({
      userId: null,
      actionType: 'PUBLIC_RECORD_CREATE',
      targetResource: 'record',
      targetId: record.id,
      details: { appId: app.id },
      ipAddress: ip,
    });
    return { ok: true };
  }

  /** 単一プロセス構成向けの軽量な匿名投稿制限。既定は1分10件/IP/フォーム。 */
  private assertSubmissionRate(token: string, ip?: string) {
    const configured = Number(process.env.PUBLIC_FORM_RATE_LIMIT_PER_MINUTE || 10);
    const limit = Number.isFinite(configured) ? Math.min(Math.max(configured, 1), 120) : 10;
    const now = Date.now();
    const windowStart = now - 60_000;
    const key = `${token}:${ip || 'unknown'}`;
    const recent = (this.submissionWindows.get(key) || []).filter((time) => time > windowStart);

    if (recent.length >= limit) {
      throw new HttpException('投稿回数が上限に達しました。しばらく待ってから再試行してください。', HttpStatus.TOO_MANY_REQUESTS);
    }
    recent.push(now);
    this.submissionWindows.set(key, recent);

    if (this.submissionWindows.size > 10_000) {
      for (const [entryKey, times] of this.submissionWindows) {
        if (!times.some((time) => time > windowStart)) this.submissionWindows.delete(entryKey);
      }
    }
  }
}
