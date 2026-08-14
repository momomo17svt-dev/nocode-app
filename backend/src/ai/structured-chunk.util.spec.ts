import { chunkStructured, detectHeading } from './structured-chunk.util';

describe('detectHeading', () => {
  it('各種見出しを検出する', () => {
    expect(detectHeading('# 概要')?.level).toBe(10);
    expect(detectHeading('## 目的')?.level).toBe(11);
    expect(detectHeading('第１章　総則')?.level).toBe(2);
    expect(detectHeading('第2節 定義')?.level).toBe(3);
    expect(detectHeading('【運用ルール】')?.label).toBe('運用ルール');
    expect(detectHeading('■ バックアップ手順')?.level).toBe(18);
    expect(detectHeading('Ⅰ．総論')?.level).toBe(19);
    expect(detectHeading('１．はじめに')?.level).toBe(20);
    expect(detectHeading('2) 手順')?.level).toBe(20);
    expect(detectHeading('1.2 設計方針')?.level).toBe(21);
    expect(detectHeading('（１）アカウント')?.level).toBe(24);
    expect(detectHeading('(2) パスワード')?.level).toBe(24);
    expect(detectHeading('① 申請する')?.level).toBe(26);
  });

  it('本文を見出しと誤検出しない', () => {
    expect(detectHeading('通常の本文です。')).toBeNull();
    expect(detectHeading('1.5倍にする場合の注意')).toBeNull();
    expect(detectHeading('2026.07.05 定例会議')).toBeNull();
    expect(detectHeading('第1章の規定により処理する。')).toBeNull();
    expect(detectHeading('・箇条書き項目')).toBeNull();
    expect(detectHeading('12345. 番号が大きすぎる行')).toBeNull();
  });
});

describe('chunkStructured', () => {
  it('見出し階層でチャンクを区切り構造パスを付ける', () => {
    const body1 = 'サーバーは毎日バックアップします。'.repeat(6);
    const body2 = 'パスワードは十二文字以上にします。'.repeat(6);
    const text = ['前書きの説明文です。', '', '■ 運用', '１．バックアップ', body1, '', '２．パスワード', body2].join('\n');
    const chunks = chunkStructured(text, { title: 'テスト文書', chunkSize: 100 })!;

    // 前文はパス無しで先頭チャンクになる
    expect(chunks[0].structPath).toBeUndefined();
    expect(chunks[0].content).toBe('【テスト文書】\n前書きの説明文です。');

    const backup = chunks.find((c) => c.content.includes('バックアップします'))!;
    expect(backup.structPath).toBe('■ 運用 / １．バックアップ');
    expect(backup.structLabel).toBe('１．バックアップ');
    // 書式は gov チャンクと同じ「【タイトル】\n[パス]\n本文」
    const lines = backup.content.split('\n');
    expect(lines[0]).toBe('【テスト文書】');
    expect(lines[1]).toBe('[■ 運用 / １．バックアップ]');
    expect(lines[2]).toBe('１．バックアップ');
  });

  it('小さな節は同一階層内で結合する', () => {
    const text = ['1. りんご', '赤い果物です。', '', '2. ばなな', '黄色い果物です。', '', '3. みかん', 'オレンジ色です。'].join('\n');
    const chunks = chunkStructured(text, { title: '果物', chunkSize: 800 })!;
    expect(chunks).toHaveLength(1);
    expect(chunks[0].structLabel).toBe('1. りんご〜3. みかん');
    expect(chunks[0].content).toContain('ばなな');
  });

  it('大きな節は文境界で分割し、見出しとパスを各断片に複製する', () => {
    const sentence = '障害が発生した場合は速やかに管理者へ連絡してください。';
    const text = ['# 障害対応', sentence.repeat(20), '', '# 連絡先', '管理者は田中さんです。'].join('\n');
    const chunks = chunkStructured(text, { title: '手順書', chunkSize: 100 })!;
    const pieces = chunks.filter((c) => c.structLabel === '障害対応');
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    for (const p of pieces) {
      expect(p.structPath).toBe('障害対応');
      expect(p.content).toContain('# 障害対応');
      // 文の途中で切れない
      expect(p.content.endsWith('。')).toBe(true);
    }
  });

  it('容器見出し（本文の無い章）はチャンク化せず、子のパスに現れる', () => {
    const text = [
      '第１章　総則', '', '１．目的', '本規程は情報セキュリティ対策を定める。', '',
      '第２章　運用', '', '１．点検', '毎月一回の点検を実施する。',
    ].join('\n');
    const chunks = chunkStructured(text, { title: '規程', chunkSize: 800 })!;
    expect(chunks).toHaveLength(2);
    expect(chunks[0].structPath).toBe('第１章　総則 / １．目的');
    expect(chunks[1].structPath).toBe('第２章　運用 / １．点検');
    expect(chunks.some((c) => c.structLabel === '第１章　総則')).toBe(false);
  });

  it('見出しが無い文書は段落単位で詰める（パス無し・文境界維持）', () => {
    const p1 = '今日はとても良く晴れています。'.repeat(4); // 60文字
    const p2 = '明日は雨が降る予報です。'.repeat(4); // 48文字
    const text = [p1, '', p2, '', '三つ目の段落です。'].join('\n');
    const chunks = chunkStructured(text, { title: 'メモ', chunkSize: 100 })!;
    expect(chunks.length).toBe(2);
    for (const c of chunks) {
      expect(c.structPath).toBeUndefined();
      expect(c.content.endsWith('。')).toBe(true);
    }
    expect(chunks.map((c) => c.content).join('')).toContain('三つ目の段落です。');
  });

  it('規則性が全く無い塊は null（呼び出し側で固定長フォールバック）', () => {
    expect(chunkStructured('あ'.repeat(500), { title: 'x', chunkSize: 100 })).toBeNull();
  });

  it('空文字は空配列', () => {
    expect(chunkStructured('', { title: 'x', chunkSize: 100 })).toEqual([]);
  });
});
