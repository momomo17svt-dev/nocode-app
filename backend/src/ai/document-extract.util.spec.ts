import { extractDocumentText } from './document-extract.util';

/** HTMLから本文を取り出す（htmlToText は非公開なので公開APIごしに確かめる）。 */
async function fromHtml(html: string): Promise<string> {
  const res = await extractDocumentText(Buffer.from(html, 'utf8'), 'doc.html');
  return res.text;
}

describe('extractDocumentText(HTML)', () => {
  it('script/styleの中身を落とす', async () => {
    const text = await fromHtml('<p>本文</p><script>alert(1)</script><style>.a{color:red}</style>');
    expect(text).toContain('本文');
    expect(text).not.toContain('alert');
    expect(text).not.toContain('color:red');
  });

  it('終了タグに空白が入っていてもscriptを落とす', async () => {
    // `</script >` を取りこぼすと、後段のタグ除去だけが効いてコードが本文に残る。
    const text = await fromHtml('<p>本文</p><script>alert(1)</script >');
    expect(text).toContain('本文');
    expect(text).not.toContain('alert');
  });

  it('実体参照を二重に解除しない', async () => {
    // `&amp;lt;` は `&lt;` が正解。`<` まで戻すと原文と違う内容が索引に載る。
    const text = await fromHtml('<p>&amp;lt; と &amp;amp; と &lt;tag&gt;</p>');
    expect(text).toContain('&lt; と &amp; と <tag>');
  });

  it('scriptを大量に含む入力でも現実的な時間で終わる', async () => {
    // 遅延一致のままだと入力長の二乗になり、この程度の入力で秒単位に膨らむ。
    const html = '<p>本文</p>' + '<script'.repeat(20000);
    const started = process.hrtime.bigint();
    const text = await fromHtml(html);
    const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
    expect(text).toContain('本文');
    expect(elapsedMs).toBeLessThan(2000);
  });
});
