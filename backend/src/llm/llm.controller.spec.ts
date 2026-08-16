import { LlmController } from './llm.controller';

describe('LlmController', () => {
  let llm: any;
  let controller: LlmController;

  beforeEach(() => {
    llm = {
      getPublicConfig: jest.fn().mockResolvedValue({ apiKey: '', apiKeyConfigured: true }),
      saveConfig: jest.fn().mockResolvedValue({ apiKey: 'stored' }),
      toPublicConfig: jest.fn().mockReturnValue({ apiKey: '', apiKeyConfigured: true }),
    };
    controller = new LlmController(llm);
  });

  it('公開用設定だけを返す', async () => {
    await expect(controller.config()).resolves.toEqual({ apiKey: '', apiKeyConfigured: true });
    expect(llm.getPublicConfig).toHaveBeenCalled();
  });

  it('APIキー削除指示を設定値から分離して保存する', async () => {
    await expect(controller.update({ provider: 'openai', clearApiKey: true })).resolves.toEqual({
      apiKey: '', apiKeyConfigured: true,
    });
    expect(llm.saveConfig).toHaveBeenCalledWith({ provider: 'openai' }, true);
    expect(llm.toPublicConfig).toHaveBeenCalledWith({ apiKey: 'stored' });
  });
});
