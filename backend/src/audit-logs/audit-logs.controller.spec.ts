import { AuditLogsController } from './audit-logs.controller';

describe('AuditLogsController', () => {
  let service: any;
  let controller: AuditLogsController;

  beforeEach(() => {
    service = { findAll: jest.fn().mockResolvedValue([]) };
    controller = new AuditLogsController(service);
  });

  it('limit未指定は既定500件で取得する', async () => {
    await controller.findAll();
    expect(service.findAll).toHaveBeenCalledWith(500);
  });

  it('limit文字列を数値へ変換して渡す', async () => {
    await controller.findAll('25');
    expect(service.findAll).toHaveBeenCalledWith(25);
  });
});
