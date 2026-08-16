import { normalizeProvider } from './llm.types';

describe('normalizeProvider', () => {
  it('明示指定が有効ならURLを見ずにそれを使う', () => {
    expect(normalizeProvider('groq', 'https://api.openai.com/v1')).toBe('groq');
  });

  it('未知の指定はURLからの推測に任せる', () => {
    expect(normalizeProvider('nonsense', 'https://api.openai.com/v1')).toBe('openai');
  });

  it('既知ホストを判別する', () => {
    expect(normalizeProvider('', 'https://api.openai.com/v1')).toBe('openai');
    expect(normalizeProvider('', 'https://openrouter.ai/api/v1')).toBe('openrouter');
    expect(normalizeProvider('', 'https://api.groq.com/openai/v1')).toBe('groq');
    expect(normalizeProvider('', 'https://generativelanguage.googleapis.com/v1beta/openai')).toBe('gemini');
    expect(normalizeProvider('', 'https://api.mistral.ai/v1')).toBe('mistral');
  });

  it('ローカルLLMを既定ポートで判別する', () => {
    expect(normalizeProvider('', 'http://localhost:1234/v1')).toBe('lmstudio');
    expect(normalizeProvider('', 'http://host.docker.internal:1234/v1')).toBe('lmstudio');
    expect(normalizeProvider('', 'http://localhost:11434/v1')).toBe('ollama');
    expect(normalizeProvider('', 'http://192.168.10.5:11434/v1')).toBe('ollama');
  });

  it('既知ホストに似せた別ホストを取り違えない', () => {
    expect(normalizeProvider('', 'https://api.openai.com.example.net/v1')).toBe('custom');
    expect(normalizeProvider('', 'https://example.net/api.openai.com/v1')).toBe('custom');
  });

  it('パスにポート番号が含まれるだけのURLを取り違えない', () => {
    expect(normalizeProvider('', 'https://example.net/v1/1234')).toBe('custom');
  });

  it('サブドメインは既知ホストとして扱う', () => {
    expect(normalizeProvider('', 'https://eu.api.mistral.ai/v1')).toBe('mistral');
  });

  it('URLが空なら既定、解析できなければcustom', () => {
    expect(normalizeProvider('', '')).toBe('lmstudio');
    expect(normalizeProvider(undefined, '')).toBe('lmstudio');
    expect(normalizeProvider('', 'not a url')).toBe('custom');
  });
});
