import { AuditLogsController } from './audit-logs.controller';

describe('AuditLogsController', () => {
  let service: any;
  let controller: AuditLogsController;

  beforeEach(() => {
    service = { findPage: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50, totalPages: 1 }) };
    controller = new AuditLogsController(service);
  });

  it('ページ未指定は1ページ目を50件で取得する', async () => {
    await controller.findAll();
    expect(service.findPage).toHaveBeenCalledWith(1, 50);
  });

  it('ページ文字列を数値へ変換して渡す', async () => {
    await controller.findAll('3', '25');
    expect(service.findPage).toHaveBeenCalledWith(3, 25);
  });
});
