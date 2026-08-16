import { BadRequestException } from '@nestjs/common';
import { sanitizeUploadName, validateUpload } from './file-validation.util';

describe('file validation', () => {
  it('ファイル名からパスと危険文字を除去する', () => {
    expect(sanitizeUploadName('../../report<2026>.pdf')).toBe('report_2026_.pdf');
  });

  it('画像は申告MIMEではなくシグネチャで判定する', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    expect(validateUpload(png, 'image.png', 'application/octet-stream', 'image')).toEqual({
      originalName: 'image.png',
      mimeType: 'image/png',
    });
  });

  it('実行ファイルと偽装PDFを拒否する', () => {
    expect(() => validateUpload(Buffer.from('MZpayload'), 'safe.txt', 'text/plain')).toThrow(BadRequestException);
    expect(() => validateUpload(Buffer.from('plain text'), 'fake.pdf', 'application/pdf')).toThrow(BadRequestException);
  });

  it('文書アップロードは対応拡張子と内容を照合する', () => {
    expect(validateUpload(Buffer.from('hello'), 'notes.txt', 'text/plain', 'document').mimeType).toBe('text/plain');
    expect(() => validateUpload(Buffer.from([0, 1, 2]), 'notes.txt', 'text/plain', 'document')).toThrow(BadRequestException);
  });
});
