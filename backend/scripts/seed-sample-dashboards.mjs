// 実DB上の既存アプリを参照して「サンプルダッシュボード」を生成する補助スクリプト。
//   実行: cd backend && node scripts/seed-sample-dashboards.mjs
// admin ユーザー所有・全員公開(access.mode=public)で作成。再実行時は同名(サンプル:)を作り直す。
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: `${process.env.DATABASE_URL}` });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

let seq = 0;
const wid = () => `w_s_${Date.now().toString(36)}_${seq++}`;

function firstOf(fields, types) {
  return fields.find((f) => types.includes(f.fieldType));
}

function processInfo(app) {
  const proc = app.processConfig || null;
  const hasProcess = !!proc?.enabled && !!proc?.statusField;
  return { hasProcess, statusField: hasProcess ? proc.statusField : null };
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { loginId: 'admin' } });
  if (!admin) throw new Error('admin ユーザーが見つかりません。先に npm run seed を実行してください。');

  const apps = await prisma.app.findMany({ orderBy: { createdAt: 'asc' } });
  if (apps.length === 0) throw new Error('アプリが1件もありません。先にアプリを作成してください。');

  // アプリごとにフィールドを読み、用途別の代表フィールドを把握
  const meta = [];
  for (const app of apps) {
    const fields = await prisma.field.findMany({ where: { appId: app.id } });
    const recCount = await prisma.record.count({ where: { appId: app.id } });
    const { hasProcess, statusField } = processInfo(app);
    meta.push({
      app,
      fields,
      recCount,
      hasProcess,
      statusField,
      selectField: firstOf(fields, ['status', 'select', 'radio']),
      userField: firstOf(fields, ['user_select']),
      numberField: firstOf(fields, ['number', 'calc']),
    });
  }

  const withData = meta.filter((m) => m.recCount > 0);
  const pool0 = withData.length ? withData : meta;
  const procApps = pool0.filter((m) => m.hasProcess);

  // ---- ダッシュボード1: 全社サマリー ----
  const summary = [];
  summary.push({ id: wid(), type: 'mytasks', title: '自分のタスク', size: 'md' });

  for (const m of procApps.slice(0, 2)) {
    summary.push({ id: wid(), type: 'kpi', title: `${m.app.name}：完了率`, size: 'sm', appId: m.app.id, kpiMode: 'rate' });
    summary.push({ id: wid(), type: 'kpi', title: `${m.app.name}：未完了`, size: 'sm', appId: m.app.id, kpiMode: 'open' });
  }
  // 件数KPI（プロセスが無くても出せる）
  const anyApp = pool0[0];
  if (anyApp) summary.push({ id: wid(), type: 'kpi', title: `${anyApp.app.name}：総件数`, size: 'sm', appId: anyApp.app.id, kpiMode: 'count' });

  const donutApp = procApps[0] || pool0.find((m) => m.selectField);
  if (donutApp && (donutApp.statusField || donutApp.selectField)) {
    summary.push({
      id: wid(), type: 'chart', title: `${donutApp.app.name}：状況の内訳`, size: 'md',
      appId: donutApp.app.id, chartType: 'donut', metric: 'count',
      groupField: donutApp.statusField || donutApp.selectField.fieldCode,
    });
  }
  const barApp = pool0.find((m) => m.selectField && m !== donutApp) || pool0.find((m) => m.selectField);
  if (barApp && barApp.selectField) {
    summary.push({
      id: wid(), type: 'chart', title: `${barApp.app.name}：${barApp.selectField.label}別 件数`, size: 'lg',
      appId: barApp.app.id, chartType: 'bar', metric: 'count', groupField: barApp.selectField.fieldCode,
    });
  }
  const listApp = pool0[0];
  if (listApp) {
    summary.push({
      id: wid(), type: 'list', title: `${listApp.app.name}：最近のレコード`, size: 'full',
      appId: listApp.app.id, limit: 5, sortField: undefined, sortDir: 'desc',
    });
  }

  // ---- ダッシュボード2: 進捗トラッキング（プロセスありアプリがある場合のみ） ----
  const dashboards = [{ name: 'サンプル: 全社サマリー', widgets: summary }];
  const track = procApps[0];
  if (track) {
    const w = [];
    w.push({ id: wid(), type: 'kpi', title: '完了率', size: 'sm', appId: track.app.id, kpiMode: 'rate' });
    w.push({ id: wid(), type: 'kpi', title: '未完了', size: 'sm', appId: track.app.id, kpiMode: 'open' });
    w.push({ id: wid(), type: 'kpi', title: '総件数', size: 'sm', appId: track.app.id, kpiMode: 'count' });
    if (track.statusField) {
      w.push({ id: wid(), type: 'chart', title: 'ステータス別', size: 'md', appId: track.app.id, chartType: 'bar', metric: 'count', groupField: track.statusField });
    }
    if (track.userField) {
      w.push({ id: wid(), type: 'chart', title: '担当者別 件数', size: 'lg', appId: track.app.id, chartType: 'bar', metric: 'count', groupField: track.userField.fieldCode });
    }
    w.push({ id: wid(), type: 'list', title: '一覧', size: 'full', appId: track.app.id, limit: 8, sortDir: 'desc' });
    dashboards.push({ name: 'サンプル: 進捗トラッキング', widgets: w });
  }

  // 既存サンプルを作り直す
  await prisma.dashboard.deleteMany({ where: { ownerId: admin.id, name: { startsWith: 'サンプル:' } } });
  let order = 0;
  for (const d of dashboards) {
    const created = await prisma.dashboard.create({
      data: {
        name: d.name,
        ownerId: admin.id,
        isShared: true,
        access: { mode: 'public', shares: [] },
        layout: { widgets: d.widgets.map((w) => Object.fromEntries(Object.entries(w).filter(([, v]) => v !== undefined))) },
        sortOrder: order++,
      },
    });
    console.log(`created: ${created.name} (widgets=${d.widgets.length})`);
  }
  console.log(`Sample dashboards created for apps: ${pool0.map((m) => m.app.name).slice(0, 6).join(', ')}${pool0.length > 6 ? ' …' : ''}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
