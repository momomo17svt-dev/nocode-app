import { BadRequestException, HttpException } from '@nestjs/common';
import { PublicFormsService } from './public-forms.service';

describe('PublicFormsService', () => {
  const app = {
    id: 'app1',
    name: 'Public form',
    description: null,
    publicFormConfig: {},
    fields: [{ fieldCode: 'title', fieldType: 'text', label: 'Title', required: true, settings: {} }],
  };
  let prisma: any;
  let records: any;
  let audit: any;
  let service: PublicFormsService;

  beforeEach(() => {
    process.env.PUBLIC_FORM_RATE_LIMIT_PER_MINUTE = '1';
    prisma = { app: { findFirst: jest.fn().mockResolvedValue(app) } };
    records = { create: jest.fn().mockResolvedValue({ id: 'record1' }) };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new PublicFormsService(prisma, records, audit);
  });

  afterEach(() => {
    delete process.env.PUBLIC_FORM_RATE_LIMIT_PER_MINUTE;
  });

  it('同一フォーム・IPからの過剰な匿名投稿を拒否する', async () => {
    await service.submit('token', { title: 'first' }, '192.0.2.1');
    await expect(service.submit('token', { title: 'second' }, '192.0.2.1')).rejects.toBeInstanceOf(HttpException);
    expect(records.create).toHaveBeenCalledTimes(1);
  });

  it('別IPからの投稿は独立して数える', async () => {
    await service.submit('token', { title: 'first' }, '192.0.2.1');
    await service.submit('token', { title: 'second' }, '192.0.2.2');
    expect(records.create).toHaveBeenCalledTimes(2);
  });

  it('必須項目が未入力の匿名投稿を拒否する', async () => {
    await expect(service.submit('token', {}, '192.0.2.3')).rejects.toThrow(BadRequestException);
    expect(records.create).not.toHaveBeenCalled();
  });

  it('フォームに無いキーは保存対象から除く', async () => {
    await service.submit('token', { title: 'ok', secret: 'x' }, '192.0.2.4');
    expect(records.create).toHaveBeenCalledWith('app1', { title: 'ok' }, expect.any(String));
  });
});
