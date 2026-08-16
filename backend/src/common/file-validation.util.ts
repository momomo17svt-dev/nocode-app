import { BadRequestException } from '@nestjs/common';
import { basename, extname } from 'path';

export type UploadKind = 'attachment' | 'image' | 'document';
export interface ValidatedUpload {
  originalName: string;
  mimeType: string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.json': 'application/json',
  '.log': 'text/plain',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
};

const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.dll', '.com', '.scr', '.msi', '.bat', '.cmd', '.ps1', '.sh', '.jar', '.apk',
]);

function startsWith(buffer: Buffer, bytes: number[]): boolean {
  return bytes.every((byte, index) => buffer[index] === byte);
}

function detectedMime(buffer: Buffer): string | null {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buffer, [0x50, 0x4b, 0x05, 0x06])) return 'application/zip';
  return null;
}

function isExecutable(buffer: Buffer): boolean {
  return startsWith(buffer, [0x4d, 0x5a]) ||
    startsWith(buffer, [0x7f, 0x45, 0x4c, 0x46]) ||
    startsWith(buffer, [0xca, 0xfe, 0xba, 0xbe]) ||
    startsWith(buffer, [0xfe, 0xed, 0xfa, 0xce]) ||
    startsWith(buffer, [0xcf, 0xfa, 0xed, 0xfe]);
}

function looksLikeText(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    const suspicious = [...buffer].filter((byte) => byte < 0x09 || (byte > 0x0d && byte < 0x20)).length;
    return suspicious <= Math.max(1, Math.floor(buffer.length * 0.01));
  } catch {
    return false;
  }
}

export function sanitizeUploadName(name: string): string {
  // 正規表現を掛ける前に長さを切る。末尾一致の `[. ]+$` は極端に長い名前で
  // 後戻り探索が膨らむため、返す長さ(200)より十分大きいところで先に抑える。
  const safe = basename(name || 'file')
    .slice(0, 300)
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();
  return (safe || 'file').slice(0, 200);
}

/** クライアント申告MIMEだけを信用せず、シグネチャ・拡張子・用途を照合する。 */
export function validateUpload(
  buffer: Buffer,
  originalName: string,
  claimedMime: string | undefined,
  kind: UploadKind = 'attachment',
): ValidatedUpload {
  if (!buffer?.length) throw new BadRequestException('ファイルが空です');

  const safeName = sanitizeUploadName(originalName);
  const extension = extname(safeName).toLowerCase();
  if (DANGEROUS_EXTENSIONS.has(extension) || isExecutable(buffer)) {
    throw new BadRequestException('実行可能ファイルはアップロードできません');
  }

  const signatureMime = detectedMime(buffer);
  const expectedMime = MIME_BY_EXTENSION[extension];
  const text = !signatureMime && looksLikeText(buffer);
  const actualMime = signatureMime || (text ? expectedMime || 'text/plain' : 'application/octet-stream');

  if (expectedMime === 'application/pdf' && signatureMime !== expectedMime) {
    throw new BadRequestException('PDFの内容と拡張子が一致しません');
  }
  if (expectedMime?.startsWith('image/') && signatureMime !== expectedMime) {
    throw new BadRequestException('画像の内容と拡張子が一致しません');
  }
  if (['.docx', '.xlsx', '.pptx', '.zip'].includes(extension) && signatureMime !== 'application/zip') {
    throw new BadRequestException('Office/ZIPファイルの内容と拡張子が一致しません');
  }
  if (expectedMime?.startsWith('text/') || ['.json', '.xml', '.yaml', '.yml'].includes(extension)) {
    if (!text) throw new BadRequestException('テキストファイルの内容が不正です');
  }

  if (kind === 'image' && !actualMime.startsWith('image/')) {
    throw new BadRequestException('PNG・JPEG・GIF・WebP画像を指定してください');
  }
  if (kind === 'document') {
    if (!expectedMime) throw new BadRequestException('対応していない文書形式です');
    if (!text && actualMime !== 'application/pdf' && extension !== '.docx') {
      throw new BadRequestException('文書の内容と拡張子が一致しません');
    }
  }

  // 既知形式は検出値を保存する。未知バイナリは安全な汎用MIMEでダウンロードさせる。
  const mimeType = expectedMime && (text || signatureMime) ? expectedMime : actualMime;
  if (claimedMime?.startsWith('image/') && !mimeType.startsWith('image/')) {
    throw new BadRequestException('申告されたMIMEタイプとファイル内容が一致しません');
  }
  return { originalName: safeName, mimeType };
}
