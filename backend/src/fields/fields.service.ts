import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface FieldInput {
  id?: string;
  fieldCode: string;
  fieldType: string;
  label: string;
  required?: boolean;
  settings?: any;
}

@Injectable()
export class FieldsService {
  constructor(private prisma: PrismaService) {}

  findAll(appId: string) {
    return this.prisma.field.findMany({
      where: { appId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getAppId(fieldId: string): Promise<string> {
    const field = await this.prisma.field.findUnique({
      where: { id: fieldId },
      select: { appId: true },
    });
    if (!field) throw new NotFoundException('フィールドが見つかりません');
    return field.appId;
  }

  create(appId: string, data: FieldInput) {
    return this.prisma.field.create({
      data: {
        appId,
        fieldCode: data.fieldCode,
        fieldType: data.fieldType,
        label: data.label,
        required: data.required ?? false,
        settings: data.settings ?? {},
      },
    });
  }

  update(id: string, data: Partial<FieldInput>) {
    return this.prisma.field.update({
      where: { id },
      data: {
        ...(data.fieldCode !== undefined ? { fieldCode: data.fieldCode } : {}),
        ...(data.fieldType !== undefined ? { fieldType: data.fieldType } : {}),
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.required !== undefined ? { required: data.required } : {}),
        ...(data.settings !== undefined ? { settings: data.settings } : {}),
      },
    });
  }

  remove(id: string) {
    return this.prisma.field.delete({ where: { id } });
  }

  /**
   * フォームビルダー用の一括保存。アプリのフィールド定義を丸ごと置き換える。
   * （レコードの data_json は fieldCode で参照されるため定義削除では消えない）
   */
  async saveAll(appId: string, fields: FieldInput[]) {
    return this.prisma.$transaction(async (tx) => {
      await tx.field.deleteMany({ where: { appId } });
      for (const f of fields) {
        await tx.field.create({
          data: {
            appId,
            fieldCode: f.fieldCode,
            fieldType: f.fieldType,
            label: f.label,
            required: f.required ?? false,
            settings: f.settings ?? {},
          },
        });
      }
      return tx.field.findMany({ where: { appId }, orderBy: { createdAt: 'asc' } });
    });
  }
}
