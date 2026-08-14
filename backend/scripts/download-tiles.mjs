#!/usr/bin/env node
/**
 * オフライン地図タイル 事前ダウンロードスクリプト
 * ------------------------------------------------
 * インターネットに繋がる環境で実行し、指定範囲(bbox)・ズーム域のXYZタイルを
 * storage/tiles/{z}/{x}/{y}.png に保存します。これをLANサーバへ持ち込めば、
 * オフライン環境でも地図(方式②)が表示できます。
 *
 * 使い方:
 *   node scripts/download-tiles.mjs --bbox 139.74,35.65,139.80,35.70 --zoom 13-17
 *
 * 全国(市町村境界まで)の例:
 *   node scripts/download-tiles.mjs --japan --zoom 0-12     （約14万枚/1GB前後）
 *
 * 主なオプション:
 *   --bbox   minLng,minLat,maxLng,maxLat（例: 139.74,35.65,139.80,35.70）
 *   --japan  日本全域プリセット（離島含む）。--bbox の代わりに使える
 *   --mainland 本州+北海道+四国+九州+南西諸島（海域が少なく枚数節約）
 *   --zoom   ズーム域。"0-12" または "13,15,17"（必須）
 *   --style  地図種 std(標準) / pale(淡色・既定) / photo(航空写真)
 *   --source タイルURLテンプレート（--style より優先。例OSM: https://tile.openstreetmap.org/{z}/{x}/{y}.png）
 *   --overwrite 既存タイルも上書き（地図種の差し替え時に使用）
 *   --out    出力先（既定: ../storage/tiles ＝ バックエンド配信先）
 *   --concurrency 同時DL数（既定: 4）
 *   --delay  各リクエスト間の待機ms（既定: 80。配信元への礼儀）
 *   --dry-run 件数見積りのみ（DLしない）
 *   --force  10万枚超でも続行
 *
 * 注意: タイル配信元の利用規約を必ず確認してください。
 *   - 国土地理院: https://maps.gsi.go.jp/development/ichiran.html
 *   - OSM: https://operations.osmfoundation.org/policies/tiles/ （大量DL不可）
 */
import { mkdir, writeFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (key.includes('=')) {
      const [k, v] = key.split(/=(.*)/s);
      out[k] = v;
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      out[key] = argv[++i];
    } else {
      out[key] = true;
    }
  }
  return out;
}

function lon2tile(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}
function lat2tile(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}
function parseZooms(spec) {
  if (spec.includes('-')) {
    const [a, b] = spec.split('-').map(Number);
    const zs = [];
    for (let z = a; z <= b; z++) zs.push(z);
    return zs;
  }
  return spec.split(',').map(Number);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function exists(p) {
  try { await access(p, constants.F_OK); return true; } catch { return false; }
}

// 範囲プリセット（minLng,minLat,maxLng,maxLat）
const PRESETS = {
  japan: '122.9,24.0,154.0,45.6',      // 南鳥島/沖ノ鳥島まで含む全域(遠洋の海タイル多)
  mainland: '122.9,24.0,146.2,45.6',   // 有人域(与那国〜小笠原〜北海道。無人の遠洋を除き枚数節約)
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const bbox = args.bbox || (args.japan ? PRESETS.japan : args.mainland ? PRESETS.mainland : null);
  if (!bbox || !args.zoom) {
    console.error('必須オプションが不足: --bbox（または --japan / --mainland プリセット）と --zoom。詳細は冒頭コメント参照。');
    process.exit(1);
  }
  const [minLng, minLat, maxLng, maxLat] = String(bbox).split(',').map(Number);
  if ([minLng, minLat, maxLng, maxLat].some((n) => Number.isNaN(n))) {
    console.error('--bbox は minLng,minLat,maxLng,maxLat の数値4つで指定してください。');
    process.exit(1);
  }
  const zooms = parseZooms(String(args.zoom));
  // 地図種プリセット（--style）。既定は淡色(pale)=業務向けのクリーンな見た目。
  const SOURCES = {
    std: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
    pale: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png',
    photo: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
  };
  const source = String(args.source || SOURCES[args.style] || SOURCES.pale);
  // 種別名（フォルダ名）と拡張子。--style 未指定で --source 指定時は 'custom'。
  const styleName = String(args.style || (args.source ? 'custom' : 'pale'));
  const ext = /\.jpe?g(\?|$)/i.test(source) ? 'jpg' : 'png';
  // 出力先: storage/tiles/<種別>/  （--out で明示指定も可）
  const baseTiles = process.env.TILES_DIR || resolve(__dirname, '..', '..', 'storage', 'tiles');
  const outDir = args.out ? resolve(String(args.out)) : resolve(baseTiles, styleName);
  const concurrency = Math.max(1, Number(args.concurrency) || 4);
  const delay = Number(args.delay ?? 80);

  // 対象タイル列挙
  const jobs = [];
  for (const z of zooms) {
    const x1 = lon2tile(Math.min(minLng, maxLng), z);
    const x2 = lon2tile(Math.max(minLng, maxLng), z);
    const y1 = lat2tile(Math.max(minLat, maxLat), z); // 緯度は上が小さいy
    const y2 = lat2tile(Math.min(minLat, maxLat), z);
    for (let x = x1; x <= x2; x++) {
      for (let y = y1; y <= y2; y++) jobs.push({ z, x, y });
    }
  }

  console.log(`対象タイル数: ${jobs.length} 枚 (zoom ${zooms.join(',')})`);
  console.log(`配信元      : ${source}`);
  console.log(`出力先      : ${outDir}`);
  if (args['dry-run']) { console.log('--dry-run のため終了します。'); return; }
  if (jobs.length > 250000 && !args.force) {
    console.error(`タイルが25万枚を超えています(${jobs.length})。範囲/ズームを狭めるか --force を付けてください(z13以上の全国は数十万〜数百万枚)。`);
    process.exit(1);
  }

  await mkdir(outDir, { recursive: true });
  let done = 0, saved = 0, skipped = 0, notile = 0, failed = 0;

  async function worker(queue) {
    while (queue.length) {
      const { z, x, y } = queue.pop();
      const dest = resolve(outDir, String(z), String(x), `${y}.${ext}`);
      if (!args.overwrite && await exists(dest)) { skipped++; done++; continue; }
      const url = source.replace('{z}', z).replace('{x}', x).replace('{y}', y);
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'NoCodeApp-TileFetcher/1.0 (offline LAN cache)' } });
        // 404 = その座標にタイルが存在しない(外洋など)。エラーではなく「タイル無し」として扱う。
        if (res.status === 404) { notile++; done++; if (delay) await sleep(delay); continue; }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        await mkdir(dirname(dest), { recursive: true });
        await writeFile(dest, buf);
        saved++;
      } catch (e) {
        failed++;
        if (failed <= 10) console.warn(`  失敗 z${z}/${x}/${y}: ${e.message}`);
      }
      done++;
      if (done % 100 === 0) process.stdout.write(`\r進捗 ${done}/${jobs.length} (保存${saved} 既存${skipped} 海/無${notile} 失敗${failed})`);
      if (delay) await sleep(delay);
    }
  }

  const queue = jobs.slice();
  await Promise.all(Array.from({ length: concurrency }, () => worker(queue)));
  process.stdout.write('\n');
  console.log(`完了: 保存${saved} / 既存スキップ${skipped} / タイル無し(外洋等)${notile} / 失敗${failed}`);
  if (failed > 0) console.log('※「失敗」(404以外)が多い場合は --delay を増やすか配信元の規約/可用性を確認してください。404=外洋でタイルが無いだけなので正常です。');
}

main().catch((e) => { console.error(e); process.exit(1); });
