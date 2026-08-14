import { BadRequestException } from '@nestjs/common';
import { LlmService } from './llm.service';
import { DEFAULT_LLM_CONFIG } from './llm.types';

describe('LlmService providers', () => {
  let prisma: any;
  let service: LlmService;

  beforeEach(() => {
    prisma = {
      setting: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    };
    service = new LlmService(prisma);
    jest.restoreAllMocks();
  });

  it('既存URLからプロバイダーを推測しAPIキーを管理画面へ返さない', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: { baseUrl: 'https://api.openai.com/v1', apiKey: 'secret-key' },
    });

    await expect(service.getPublicConfig()).resolves.toEqual(expect.objectContaining({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      apiKeyConfigured: true,
    }));
  });

  it('APIキー空欄では保存済みキーを維持し、明示時だけ削除する', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: { ...DEFAULT_LLM_CONFIG, provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'keep-me' },
    });

    await service.saveConfig({ apiKey: '', chatModel: 'gpt-test' });
    expect(prisma.setting.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: { value: expect.objectContaining({ apiKey: 'keep-me', chatModel: 'gpt-test' }) },
    }));

    await service.saveConfig({}, true);
    expect(prisma.setting.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: { value: expect.objectContaining({ apiKey: '' }) },
    }));
  });

  it('プロバイダー変更時は新しいキーがなければ旧キーを破棄する', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: { ...DEFAULT_LLM_CONFIG, provider: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'openai-key' },
    });

    await service.saveConfig({ provider: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', apiKey: '' });
    expect(prisma.setting.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: { value: expect.objectContaining({ provider: 'openrouter', apiKey: '' }) },
    }));

    await service.saveConfig({ provider: 'groq', baseUrl: 'https://api.groq.com/openai/v1', apiKey: 'groq-key' });
    expect(prisma.setting.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: { value: expect.objectContaining({ provider: 'groq', apiKey: 'groq-key' }) },
    }));
  });

  it('OpenAI互換モデル一覧へBearer認証を付け、LM Studio専用APIを呼ばない', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: {
        ...DEFAULT_LLM_CONFIG,
        provider: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: 'router-key',
      },
    });
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: 'vendor/chat-model' }, { id: 'vendor/embed-model' }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const health = await service.health();

    expect(health).toEqual(expect.objectContaining({
      ok: true,
      provider: 'openrouter',
      resolvedChatModel: 'vendor/chat-model',
      resolvedEmbedModel: 'vendor/embed-model',
    }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/models');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer router-key');
  });

  it('任意互換APIではapi-keyヘッダーを選択できる', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    await service.listModels({
      ...DEFAULT_LLM_CONFIG,
      provider: 'custom',
      baseUrl: 'https://example.test/openai/v1',
      apiKey: 'custom-key',
      apiKeyHeader: 'api-key',
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(new Headers(init?.headers).get('api-key')).toBe('custom-key');
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
  });

  it('LM Studio以外ではモデル手動読み込みを拒否する', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: { ...DEFAULT_LLM_CONFIG, provider: 'ollama', baseUrl: 'http://localhost:11434/v1' },
    });
    await expect(service.loadModel('llama3', 'chat')).rejects.toBeInstanceOf(BadRequestException);
  });
});
