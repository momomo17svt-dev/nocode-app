import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { STORAGE_ROOT } from '../common/storage.util';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from './settings.service';

const BACKUP_DIR = path.join(STORAGE_ROOT, 'backups');
const STATUS_KEY = 'system:backup-status';

@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private prisma: PrismaService, private settings: SettingsService) {}

  onModuleInit() {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    this.timer = setInterval(() => void this.tick(), 15 * 60_000);
    setTimeout(() => void this.tick(), 60_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async getStatus() {
    const row = await this.prisma.setting.findUnique({ where: { key: STATUS_KEY } });
    return { running: this.running, ...((row?.value as any) || {}) };
  }

  async listFiles() {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const names = await fs.promises.readdir(BACKUP_DIR);
    const rows = await Promise.all(names.filter((name) => /^nocode-\d{8}-\d{6}\.dump$/.test(name)).map(async (name) => {
      const stat = await fs.promises.stat(path.join(BACKUP_DIR, name));
      return { name, size: stat.size, createdAt: stat.mtime };
    }));
    return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  resolveDownload(name: string): string {
    if (!/^nocode-\d{8}-\d{6}\.dump$/.test(name)) throw new BadRequestException('不正なバックアップ名です');
    const file = path.join(BACKUP_DIR, name);
    if (!fs.existsSync(file)) throw new NotFoundException('バックアップが見つかりません');
    return file;
  }

  async runNow() {
    if (this.running) return { success: false, message: 'バックアップは既に実行中です' };
    this.running = true;
    const startedAt = new Date();
    const stamp = startedAt.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const name = `nocode-${stamp}.dump`;
    const file = path.join(BACKUP_DIR, name);
    try {
      await this.dump(file);
      const policy = await this.settings.getBackupPolicy();
      await this.rotate(policy.retentionDays);
      await this.saveStatus({ lastSuccessAt: new Date().toISOString(), lastFile: name, lastError: null });
      return { success: true, name };
    } catch (error: any) {
      await fs.promises.unlink(file).catch(() => undefined);
      const message = error?.message || 'バックアップに失敗しました';
      await this.saveStatus({ lastFailureAt: new Date().toISOString(), lastError: message });
      return { success: false, message };
    } finally {
      this.running = false;
    }
  }

  private async tick() {
    try {
      if (this.running) return;
      const policy = await this.settings.getBackupPolicy().catch(() => null);
      const now = new Date();
      if (!policy?.enabled || now.getHours() !== policy.hour) return;
      const status = await this.getStatus();
      const lastDate = status.lastSuccessAt ? this.localDateKey(new Date(String(status.lastSuccessAt))) : '';
      if (lastDate === this.localDateKey(now)) return;
      await this.runNow();
    } catch {
      // 次の15分周期で再試行する。起動中の一時的なDB切断でプロセスを落とさない。
    }
  }

  private dump(outputFile: string): Promise<void> {
    const raw = process.env.DATABASE_URL;
    if (!raw) return Promise.reject(new Error('DATABASE_URLが設定されていません'));
    const url = new URL(raw);
    const executable = process.env.PG_DUMP_PATH || 'pg_dump';
    const args = [
      '-h', url.hostname,
      '-p', url.port || '5432',
      '-U', decodeURIComponent(url.username),
      '-d', decodeURIComponent(url.pathname.replace(/^\//, '')),
      '-F', 'c', '--no-owner', '--no-privileges', '-f', outputFile,
    ];
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) },
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += String(chunk).slice(0, 2_000); });
      child.once('error', (error) => reject(new Error(`pg_dumpを起動できません: ${error.message}`)));
      child.once('close', (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || `pg_dump終了コード: ${code}`)));
    });
  }

  private async rotate(retentionDays: number) {
    const cutoff = Date.now() - retentionDays * 86_400_000;
    for (const file of await this.listFiles()) {
      if (file.createdAt.getTime() < cutoff) await fs.promises.unlink(path.join(BACKUP_DIR, file.name)).catch(() => undefined);
    }
  }

  private async saveStatus(patch: Record<string, any>) {
    const { running: _running, ...current } = await this.getStatus();
    const value = { ...current, ...patch };
    await this.prisma.setting.upsert({
      where: { key: STATUS_KEY },
      update: { value },
      create: { key: STATUS_KEY, value },
    });
  }

  private localDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
