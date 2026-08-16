import { parseGovDoc, detectGovLikely } from './gov-structure.util';
import { chunkGov } from './gov-chunk.util';
import { GovNode } from './gov-types';

/** 全ノードのテキストを平坦化（消失検査用）。 */
function allText(nodes: GovNode[]): string {
  const out: string[] = [];
  const walk = (n: GovNode) => {
    out.push(n.label, n.text);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return out.join('\n');
}

// 達スタイル（単位なし「第○」見出し＋目次＋はしがき）の縮約フィクスチャ
const TATSU_DOC = [
  '自衛隊統合達第１６号',
  '秘密保全に関する訓令（平成１９年防衛省訓令第３６号）第５３条第１項の規定',
  'に基づき、秘密保全に関する達を次のように定める。',
  '平成２０年３月２５日',
  '統合幕僚長 海将 齋藤 隆',
  '秘密保全に関する達',
  '改正 平成21年08月20日 自衛隊統合達第15号',
  '目次',
  '第１章 総則（第１条－第６条）',
  '第２章 秘密の保全（第７条－第１３条）',
  '附則',
  '',
  'はしがき',
  '',
  '第１ 目的及び記述範囲',
  '　本書はなんちゃらです。',
  '',
  '第２ 使用上の注意事項',
  '　本書は取扱注意です。',
  '',
  '第１章 総則',
  '第１ 要旨',
  '１ この達は、統幕における秘密保全に関して必要な事項を定めるものとする。',
  '２ 暗号の秘密保全については、別の達による。',
  '',
  '第２ この達において、次の各号に掲げる用語の意義は、当該各号に定めるところによる。',
  '一 統幕等 統幕及び統幕学校をいう。',
  '二 文書等 文書、図画又は物件をいう。',
  '第２章 秘密の保全',
  '第１節',
  '第３ 要旨',
  '１ 秘密の保全は誠実に行うものとする。',
].join('\n');

describe('parseGovDoc: 達スタイル（単位なし「第○」）', () => {
  const structure = parseGovDoc(TATSU_DOC);

  it('題名とメタを抽出する', () => {
    expect(structure.title).toBe('秘密保全に関する達');
    expect(structure.meta.docNumber).toBe('自衛隊統合達第１６号');
    expect(structure.meta.date).toBe('平成２０年３月２５日');
  });

  it('目次スキップが「はしがき」で終わり、前書きと第１・第２が消えない', () => {
    const text = allText(structure.nodes);
    expect(text).toContain('はしがき');
    expect(text).toContain('本書はなんちゃらです。');
    expect(text).toContain('本書は取扱注意です。');
  });

  it('目次の章は取り込まず、本文の章だけが構造になる', () => {
    const chapters = structure.toc.filter((e) => e.kind === 'chapter');
    expect(chapters.map((c) => c.label)).toEqual(['第１章', '第２章']);
  });

  it('「第○」見出しが条相当ノードになり目次に並ぶ', () => {
    const articles = structure.toc.filter((e) => e.kind === 'article').map((e) => e.label);
    expect(articles).toEqual(['第１', '第２', '第１', '第２', '第３']);
    expect(structure.toc.some((e) => e.kind === 'section' && e.label === '第１節')).toBe(true);
  });

  it('チャンクが「第○」単位＋構造パス付きになる', () => {
    const chunks = chunkGov(structure, { title: structure.title || '', chunkSize: 800 });
    const youshi = chunks.find((c) => c.structPath === '第１章 総則 / 第１')!;
    expect(youshi).toBeDefined();
    expect(youshi.content).toContain('１ この達は');
    expect(youshi.content).toContain('第2項　暗号の秘密保全'); // 項番号は半角へ正規化される（既存仕様）
    expect(chunks.some((c) => c.structPath === '第２章 秘密の保全 / 第１節 / 第３')).toBe(true);
  });
});

describe('parseGovDoc: 条ベース文書の回帰', () => {
  const LAW_DOC = [
    'サンプル条例',
    '第１章 総則',
    '（目的）',
    '第１条 この条例は、テストを目的とする。',
    '２ 前項の規定は、テストとする。',
    '（定義）',
    '第２条 定義は次のとおり。',
    '一 テスト テストをいう。',
  ].join('\n');

  it('条・項・号の解析が変わらない', () => {
    const s = parseGovDoc(LAW_DOC);
    expect(s.title).toBe('サンプル条例');
    expect(s.family).toBe('law');
    const chunks = chunkGov(s, { title: s.title || '', chunkSize: 800 });
    const art1 = chunks.find((c) => c.structPath === '第１章 総則 / 第１条')!;
    expect(art1).toBeDefined();
    expect(art1.content).toContain('（目的）');
    expect(art1.content).toContain('第2項　前項の規定');
    const art2 = chunks.find((c) => c.structPath === '第１章 総則 / 第２条')!;
    expect(art2.content).toContain('一　テスト');
  });
});

describe('detectGovLikely', () => {
  it('条参照が無くても「第○ 」見出しが並べば行政文書と判定する', () => {
    const doc = ['実施要領', '第１ 総則', 'あいうえお。', '第２ 手続', 'かきくけこ。', '第３ 雑則', 'さしすせそ。'].join('\n');
    expect(detectGovLikely(doc)).toBe(true);
  });

  it('通常の業務文書は誤判定しない', () => {
    const doc = ['第2四半期の売上報告', '売上は前年比110%でした。', '第3四半期の見込みは横ばいです。'].join('\n');
    expect(detectGovLikely(doc)).toBe(false);
  });

  it('改行だらけの入力でも現実的な時間で終わる', () => {
    // 行内空白に \s を使うと (^|\n) と重なり、改行の連続で走査位置が二乗に膨らむ。
    const doc = '\n'.repeat(50000);
    const started = process.hrtime.bigint();
    expect(detectGovLikely(doc)).toBe(false);
    expect(Number(process.hrtime.bigint() - started) / 1e6).toBeLessThan(2000);
  });
});
