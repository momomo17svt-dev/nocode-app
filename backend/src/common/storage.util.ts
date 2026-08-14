import * as fs from 'fs';
import * as path from 'path';

/**
 * 添付ファイルの保存ルート。プロジェクト直下の storage/attachments。
 * 環境変数 STORAGE_DIR で上書き可能。
 */
export const STORAGE_ROOT =
  process.env.STORAGE_DIR || path.resolve(process.cwd(), '..', 'storage');
export const ATTACHMENTS_DIR = path.join(STORAGE_ROOT, 'attachments');

/**
 * 地図タイル(XYZ形式 {z}/{x}/{y}.png)の保存ルート。
 * オフラインLAN環境では、事前にDLしたタイルをここへ配置し /tiles から配信する。
 * 環境変数 TILES_DIR で上書き可能。
 */
export const TILES_DIR =
  process.env.TILES_DIR || path.join(STORAGE_ROOT, 'tiles');

export function ensureStorageDirs(): void {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  fs.mkdirSync(TILES_DIR, { recursive: true });
}

/**
 * 保存済みファイル名(UUID)から実ファイルパスを安全に解決する。
 * パストラバーサル(../ 等)を含む名前を弾き、保存ルート外を参照させない。
 */
export function resolveAttachmentPath(savedName: string): string {
  // ディレクトリ区切りや親参照を含む名前は不正
  if (
    !savedName ||
    savedName.includes('/') ||
    savedName.includes('\\') ||
    savedName.includes('..') ||
    path.isAbsolute(savedName)
  ) {
    throw new Error('不正なファイル名です');
  }
  const resolved = path.resolve(ATTACHMENTS_DIR, savedName);
  // 解決後のパスが必ず ATTACHMENTS_DIR 配下であることを保証
  const base = path.resolve(ATTACHMENTS_DIR) + path.sep;
  if (!(resolved + path.sep).startsWith(base) && resolved !== path.resolve(ATTACHMENTS_DIR)) {
    throw new Error('不正なファイルパスです');
  }
  return resolved;
}
