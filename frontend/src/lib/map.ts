import { useEffect, useReducer } from 'react';
import { api } from './api';

/** 位置フィールドの値。緯度・経度と任意ラベル。 */
export interface GeoPoint {
  lat: number;
  lng: number;
  label?: string;
}

/** 既定の地図中心（東京駅）と初期ズーム。フィールド設定で上書き可能。 */
export const DEFAULT_CENTER: { lat: number; lng: number } = { lat: 35.681236, lng: 139.767125 };
export const DEFAULT_ZOOM = 13;

/**
 * 内蔵（オフライン）タイルが日本全域で用意されている最大ズーム。
 * これより深いズームは実タイルが一部地域にしか無いため、Leaflet に
 * このレベルのタイルを引き伸ばさせて（maxNativeZoom）タイル欠け（白い空白）を防ぐ。
 * ＝「タイルがある範囲までしか実描画しない」ための基準値。
 * 配信タイルを入れ替えてカバー範囲が変わったらこの値を見直す。
 */
export const BUILTIN_MAX_NATIVE_ZOOM = 13;

/* ===================== 地図の高さ（全画面・ダッシュボード共通） ===================== */

export type MapHeight = 'sm' | 'md' | 'lg' | 'xl';

export const MAP_HEIGHT_LABELS: Record<MapHeight, string> = {
  sm: '低',
  md: '中',
  lg: '高',
  xl: '特大',
};

/** 地図の高さ（リテラルでTailwindに検出させる）。 */
export const MAP_HEIGHT_CLASS: Record<MapHeight, string> = {
  sm: 'h-56',
  md: 'h-72',
  lg: 'h-[28rem]',
  xl: 'h-[40rem]',
};

/**
 * 位置フィールド設定の height からTailwind高さクラスを得る。
 * 未設定（'' / undefined）なら fallback を使う。
 */
export function mapHeightClass(settings: any, fallback: MapHeight = 'md'): string {
  const h = settings?.height as MapHeight | undefined;
  return MAP_HEIGHT_CLASS[h && MAP_HEIGHT_CLASS[h] ? h : fallback];
}

/**
 * 内蔵タイルのバージョン。地図種を入れ替えた際にこの値を変えると、
 * URLが変わるためブラウザの古いキャッシュを確実に外せる。
 */
export const TILE_VERSION = '3';

/* ===================== 背景地図（ベースマップ）プリセット ===================== */

export type BasemapKind = 'builtin' | 'online' | 'blank' | 'custom';

export interface BasemapDef {
  id: string;
  label: string;
  kind: BasemapKind;
  /** builtin: storage/tiles 配下のサブフォルダ名 */
  folder?: string;
  /** builtin: 拡張子（png / jpg） */
  ext?: string;
  /** online: タイルURLテンプレート */
  url?: string;
  attribution?: string;
  /** blank: 背景色 */
  bg?: string;
  maxZoom?: number;
}

const GSI = '地図データ © 国土地理院';

/** 選択できる背景地図の一覧（テンプレ）。 */
export const BASEMAPS: BasemapDef[] = [
  { id: 'pale', label: '淡色地図', kind: 'builtin', folder: 'pale', ext: 'png', attribution: GSI, maxZoom: 18 },
  { id: 'std', label: '標準地図', kind: 'builtin', folder: 'std', ext: 'png', attribution: GSI, maxZoom: 18 },
  { id: 'photo', label: '航空写真', kind: 'builtin', folder: 'photo', ext: 'jpg', attribution: '画像 © 国土地理院', maxZoom: 18 },
  { id: 'gray', label: 'グレー背景', kind: 'blank', bg: '#e5e7eb' },
  { id: 'white', label: '白背景', kind: 'blank', bg: '#ffffff' },
  { id: 'gsi_pale_online', label: '淡色（オンライン）', kind: 'online', url: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', attribution: GSI, maxZoom: 18 },
  { id: 'gsi_photo_online', label: '航空写真（オンライン）', kind: 'online', url: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', attribution: '画像 © 国土地理院', maxZoom: 18 },
  { id: 'osm_online', label: 'OpenStreetMap（オンライン）', kind: 'online', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '© OpenStreetMap contributors', maxZoom: 19 },
  { id: 'custom', label: 'カスタムURL', kind: 'custom' },
];

/** フィールド設定で「システム設定に従う」を選んだときの値。 */
export const SYSTEM_BASEMAP = 'system';

export function getBasemap(id?: string): BasemapDef {
  return BASEMAPS.find((b) => b.id === id) || BASEMAPS[0];
}

function tileOrigin(): string {
  return api.base.replace(/\/api\/?$/, '');
}

/** ベースマップ定義から実効タイルURL（テンプレート）を得る。blank は null。 */
export function basemapTileUrl(b: BasemapDef, settings?: any): string | null {
  if (b.kind === 'builtin') return `${tileOrigin()}/tiles/${b.folder}/{z}/{x}/{y}.${b.ext}?v=${TILE_VERSION}`;
  if (b.kind === 'online') return b.url || null;
  if (b.kind === 'custom') return (settings?.tileUrl || '').trim() || _manifest.tileUrl.trim() || null;
  return null; // blank
}

/** MapView へ渡す実行時ベースマップ。 */
export interface BasemapRuntime {
  id: string;
  label: string;
  url: string | null;
  attribution?: string;
  bg?: string;
  maxZoom?: number;
  /** 実タイルが存在する最大ズーム。これを超えると引き伸ばし表示（白抜け防止）。 */
  maxNativeZoom?: number;
}

export function toRuntime(b: BasemapDef, settings?: any): BasemapRuntime {
  return {
    id: b.id,
    label: b.label,
    url: basemapTileUrl(b, settings),
    attribution: b.attribution,
    bg: b.bg,
    maxZoom: b.maxZoom,
    // 内蔵（オフライン）タイルのみ実描画ズームを制限。オンライン/カスタムは制限なし。
    maxNativeZoom: b.kind === 'builtin' ? BUILTIN_MAX_NATIVE_ZOOM : undefined,
  };
}

/**
 * フィールド設定から選択中のベースマップIDを得る。
 * 未指定・「システム設定に従う」なら、システム設定の既定背景を使う（旧 tileUrl 設定にも後方互換）。
 */
export function resolveBasemapId(settings: any): string {
  const chosen = String(settings?.basemap || '');
  if (chosen && chosen !== SYSTEM_BASEMAP) return chosen;
  if (!chosen && (settings?.tileUrl || '').trim()) return 'custom';
  const fallback = _manifest.defaultBasemap;
  return BASEMAPS.some((b) => b.id === fallback) ? fallback : 'pale';
}

/** 設定で選ばれた単一ベースマップの実行時情報。 */
export function resolveBasemapRuntime(settings: any): BasemapRuntime {
  return toRuntime(getBasemap(resolveBasemapId(settings)), settings);
}

/** 後方互換: 設定から実効タイルURLを返す（blank/未指定は null）。 */
export function resolveTileUrl(settings: any): string | null {
  return resolveBasemapRuntime(settings).url;
}

/* ===================== 利用可能タイル種の取得（マニフェスト） ===================== */

/** バックエンドが持つ地図の状態。DL済みの内蔵タイル種と、システム設定の既定背景。 */
export interface MapManifest {
  styles: string[];
  defaultBasemap: string;
  tileUrl: string;
}

let _manifest: MapManifest = { styles: [], defaultBasemap: 'pale', tileUrl: '' };
let _manifestPromise: Promise<MapManifest> | null = null;
const _manifestListeners = new Set<() => void>();

export function mapManifest(): MapManifest {
  return _manifest;
}

/** 取得は1回だけ。設定を保存した直後は force で取り直す。 */
export function loadMapManifest(force = false): Promise<MapManifest> {
  if (force) _manifestPromise = null;
  if (!_manifestPromise) {
    _manifestPromise = api
      .get('/tiles/styles')
      .then((r: any) => {
        _manifest = {
          styles: Array.isArray(r?.styles) ? r.styles : [],
          defaultBasemap: String(r?.defaultBasemap || 'pale'),
          tileUrl: String(r?.tileUrl || ''),
        };
        _manifestListeners.forEach((listener) => listener());
        return _manifest;
      })
      .catch(() => _manifest);
  }
  return _manifestPromise;
}

/** 読み込み後に再描画させるための購読フック。地図を描く画面で使う。 */
export function useMapManifest(): MapManifest {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    _manifestListeners.add(rerender);
    void loadMapManifest();
    return () => {
      _manifestListeners.delete(rerender);
    };
  }, []);
  return _manifest;
}

/** バックエンドにDL済みの内蔵タイル種（pale/std/photo のうち存在するもの）。 */
export function getAvailableTileStyles(): Promise<string[]> {
  return loadMapManifest().then((m) => m.styles);
}

/**
 * 閲覧画面のレイヤ切替に出すベースマップ一覧を組み立てる。
 * DL済みの内蔵種（pale/std/photo）＋グレー/白。設定の既定がオンライン/カスタムならそれも含める。
 */
export function buildSwitcherBasemaps(
  settings: any,
  available: string[],
): { list: BasemapRuntime[]; activeId: string; activeUnavailable: boolean } {
  const activeId = resolveBasemapId(settings);
  const ids: string[] = [];
  // DL済みの内蔵タイルだけを載せる。未取得の種別は選んでも白紙になるため出さない。
  for (const id of ['pale', 'std', 'photo']) if (available.includes(id)) ids.push(id);
  ids.push('gsi_pale_online', 'gsi_photo_online', 'osm_online', 'gray', 'white');
  if (!ids.includes(activeId)) ids.unshift(activeId);
  const list = ids.map((id) => toRuntime(getBasemap(id), settings));
  const active = getBasemap(activeId);
  return { list, activeId, activeUnavailable: active.kind === 'builtin' && !available.includes(active.id) };
}

/* ===================== 中心・ズーム・値判定 ===================== */

export function mapCenter(settings: any): { lat: number; lng: number } {
  const c = settings?.center;
  if (c && typeof c.lat === 'number' && typeof c.lng === 'number') return c;
  return DEFAULT_CENTER;
}

export function mapZoom(settings: any): number {
  const z = Number(settings?.zoom);
  return Number.isFinite(z) && z > 0 ? z : DEFAULT_ZOOM;
}

export function isGeoPoint(v: any): v is GeoPoint {
  return !!v && typeof v === 'object' && typeof v.lat === 'number' && typeof v.lng === 'number';
}

/** 内蔵タイル（淡色）のURLテンプレート。後方互換のため残置。 */
export function backendTileUrl(): string {
  return `${tileOrigin()}/tiles/pale/{z}/{x}/{y}.png?v=${TILE_VERSION}`;
}
