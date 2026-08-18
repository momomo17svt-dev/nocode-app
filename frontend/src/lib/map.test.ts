import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { buildSwitcherBasemaps, loadMapManifest, resolveBasemapId, resolveTileUrl } from './map';

/** バックエンドが返す地図マニフェストを差し替える。 */
async function withManifest(manifest: { styles: string[]; defaultBasemap: string; tileUrl?: string }) {
  vi.spyOn(api, 'get').mockResolvedValue({ tileUrl: '', ...manifest });
  await loadMapManifest(true);
}

describe('背景地図の解決', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('フィールド未指定ならシステム設定の既定を使う', async () => {
    await withManifest({ styles: [], defaultBasemap: 'osm_online' });
    expect(resolveBasemapId({})).toBe('osm_online');
    expect(resolveBasemapId({ basemap: 'system' })).toBe('osm_online');
  });

  it('フィールドで明示した背景はシステム設定より優先する', async () => {
    await withManifest({ styles: ['pale'], defaultBasemap: 'osm_online' });
    expect(resolveBasemapId({ basemap: 'pale' })).toBe('pale');
  });

  it('旧設定のカスタムURLは custom として扱う', async () => {
    await withManifest({ styles: [], defaultBasemap: 'pale' });
    expect(resolveBasemapId({ tileUrl: 'https://example.test/{z}/{x}/{y}.png' })).toBe('custom');
  });

  it('システム既定がカスタムなら、そのURLでタイルを引く', async () => {
    await withManifest({ styles: [], defaultBasemap: 'custom', tileUrl: 'https://example.test/{z}/{x}/{y}.png' });
    expect(resolveTileUrl({})).toBe('https://example.test/{z}/{x}/{y}.png');
  });

  it('切替一覧にはオンライン地図が常に並び、未取得の内蔵タイルは出さない', async () => {
    await withManifest({ styles: [], defaultBasemap: 'pale' });
    const sw = buildSwitcherBasemaps({}, []);
    const ids = sw.list.map((b) => b.id);
    expect(ids).toContain('gsi_pale_online');
    expect(ids).toContain('osm_online');
    // 未取得の内蔵タイルは、選択中のもの以外は並べない。
    expect(ids.filter((id) => id === 'std' || id === 'photo')).toHaveLength(0);
    expect(sw.activeUnavailable).toBe(true);
  });

  it('取得済みの内蔵タイルは一覧の先頭に並ぶ', async () => {
    await withManifest({ styles: ['pale', 'photo'], defaultBasemap: 'pale' });
    const sw = buildSwitcherBasemaps({}, ['pale', 'photo']);
    expect(sw.list.slice(0, 2).map((b) => b.id)).toEqual(['pale', 'photo']);
    expect(sw.activeUnavailable).toBe(false);
  });
});
