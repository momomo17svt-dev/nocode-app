import { resolveAttachmentPath, ATTACHMENTS_DIR } from './storage.util';

describe('resolveAttachmentPath（パストラバーサル防御）', () => {
  it('正当なUUID名は添付ディレクトリ配下の絶対パスを返す', () => {
    const name = '11111111-2222-3333-4444-555555555555';
    const p = resolveAttachmentPath(name);
    expect(p.startsWith(ATTACHMENTS_DIR)).toBe(true);
    expect(p.endsWith(name)).toBe(true);
  });

  it.each([
    ['空文字', ''],
    ['親参照 ..', '../secret'],
    ['スラッシュ', 'sub/dir'],
    ['バックスラッシュ', 'sub\\dir'],
    ['ドットドットのみ', '..'],
    ['親参照を含む名前', 'a/../../../etc/passwd'],
  ])('%s は拒否する', (_label, name) => {
    expect(() => resolveAttachmentPath(name)).toThrow();
  });

  it('絶対パスは拒否する', () => {
    expect(() => resolveAttachmentPath('C:\\Windows\\system32')).toThrow();
    expect(() => resolveAttachmentPath('/etc/passwd')).toThrow();
  });
});
