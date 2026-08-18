import { useEffect, useMemo, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DEFAULT_CENTER, DEFAULT_ZOOM, resolveBasemapRuntime, useMapManifest, type BasemapRuntime } from '../lib/map';

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  onClick?: () => void;
}

interface Props {
  /** 複数ピン表示（一覧の地図ビュー用）。 */
  markers?: MapMarker[];
  /** 単一ピン編集（入力ピッカー用）。クリック/ドラッグで位置を選ぶ。 */
  picked?: { lat: number; lng: number } | null;
  onPick?: (lat: number, lng: number) => void;
  center?: { lat: number; lng: number };
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  /** 単一背景: タイルURLテンプレート（null/未指定で内蔵淡色、blank時はnull＋tileBg）。 */
  tileUrl?: string | null;
  /** 単一背景が blank(タイルなし)の時の背景色。 */
  tileBg?: string;
  attribution?: string;
  /** 複数背景: 右上にレイヤ切替を表示し閲覧者が切替できる。 */
  basemaps?: BasemapRuntime[];
  activeBasemapId?: string;
  /** マーカー全体が収まるよう自動ズーム（markers 指定時）。 */
  fitToMarkers?: boolean;
  /** 表示中心・ズームの変化を通知（ドラッグ/ズーム完了時）。設定画面のWYSIWYG用。 */
  onViewChange?: (center: { lat: number; lng: number }, zoom: number) => void;
  /** 中心に十字マーカーを重ねる（初期表示の中心が一目で分かる）。 */
  centerCrosshair?: boolean;
  /** center/zoom プロップの変更で地図を追従移動させる（制御コンポーネント的挙動）。 */
  controlledCenter?: boolean;
  className?: string;
}

// 欠損タイル（未DL領域）は壊れた画像ではなく透明にする。
const TRANSPARENT_TILE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/** 地図ピン（lucide MapPin 風のSVG divIcon）。テーマ色 currentColor を使う。 */
function pinIcon(): L.DivIcon {
  return L.divIcon({
    className: 'agv-pin',
    html: `<svg width="30" height="30" viewBox="0 0 24 24" style="color: var(--primary); filter: drop-shadow(0 1.5px 1.5px rgba(0,0,0,.45))"><path fill="currentColor" stroke="#fff" stroke-width="1.3" d="M12 2.2c-3.9 0-7 3.1-7 7 0 5.3 7 12.6 7 12.6s7-7.3 7-12.6c0-3.9-3.1-7-7-7z"/><circle cx="12" cy="9.2" r="2.6" fill="#fff"/></svg>`,
    iconSize: [30, 30],
    iconAnchor: [15, 29],
    tooltipAnchor: [0, -26],
  });
}

/**
 * Leaflet を直接制御する地図コンポーネント。
 * - オフライン: 内蔵タイル（バックエンド /tiles/<種別> 配信）を既定で利用。
 * - markers で複数ピン表示、picked+onPick で単一ピンの選択（入力用）。
 * - basemaps を渡すと右上に背景地図のレイヤ切替コントロールを表示。
 */
export function MapView({
  markers,
  picked,
  onPick,
  center,
  zoom,
  minZoom = 2,
  maxZoom = 19,
  tileUrl,
  tileBg,
  attribution = '地図データ © 国土地理院',
  basemaps,
  activeBasemapId,
  fitToMarkers,
  onViewChange,
  centerCrosshair,
  controlledCenter,
  className = 'h-[480px]',
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayersRef = useRef<Record<string, L.Layer>>({});
  const controlRef = useRef<L.Control.Layers | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const pickMarkerRef = useRef<L.Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const onViewChangeRef = useRef(onViewChange);
  onViewChangeRef.current = onViewChange;
  // 現在の背景の実タイル最大ズーム（自動フィットの寄り過ぎ＝タイル欠け防止に使う）。
  const nativeMaxRef = useRef<number | undefined>(undefined);

  const manifest = useMapManifest();
  // 単一背景指定を含め、内部的には常に「背景マップの配列」で扱う。
  const runtimes: BasemapRuntime[] = useMemo(() => {
    if (basemaps && basemaps.length) return basemaps;
    // 背景の指定が無ければシステム設定の既定に従う（内蔵タイル／オンライン／カスタム）。
    if (tileUrl === undefined) return [resolveBasemapRuntime({ basemap: manifest.defaultBasemap, tileUrl: manifest.tileUrl })];
    return [{
      id: '_single', label: '地図', url: tileUrl,
      attribution, bg: tileBg, maxZoom, maxNativeZoom: undefined,
    }];
  }, [basemaps, tileUrl, attribution, tileBg, maxZoom, manifest]);
  const activeId = activeBasemapId || runtimes[0]?.id;

  // 地図の生成（マウント時のみ）
  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      center: [center?.lat ?? DEFAULT_CENTER.lat, center?.lng ?? DEFAULT_CENTER.lng],
      zoom: zoom ?? DEFAULT_ZOOM,
      minZoom,
      maxZoom,
      attributionControl: true,
      zoomControl: true,
    });
    map.attributionControl.setPrefix(false);
    mapRef.current = map;
    markerLayerRef.current = L.layerGroup().addTo(map);

    map.on('click', (e: L.LeafletMouseEvent) => {
      onPickRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    map.on('moveend zoomend', () => {
      const c = map.getCenter();
      onViewChangeRef.current?.({ lat: c.lat, lng: c.lng }, map.getZoom());
    });

    const t = setTimeout(() => map.invalidateSize(), 0);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
      baseLayersRef.current = {};
      controlRef.current = null;
      pickMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // コンテナのサイズ変化（高さ変更・レイアウト変化・リサイズ）に追従して再描画する。
  // Leaflet は自動でサイズを検知しないため、検知できないとタイルが古いサイズのまま残る。
  useEffect(() => {
    const el = elRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => mapRef.current?.invalidateSize());
    });
    ro.observe(el);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  // 背景地図レイヤ（＋複数時はレイヤ切替コントロール）
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // 既存をクリア
    if (controlRef.current) { map.removeControl(controlRef.current); controlRef.current = null; }
    Object.values(baseLayersRef.current).forEach((l) => map.removeLayer(l));
    baseLayersRef.current = {};
    map.off('baselayerchange');

    const setBg = (bg?: string) => { if (elRef.current) elRef.current.style.backgroundColor = bg || ''; };
    const layerToBg = new Map<L.Layer, string | undefined>();
    const layerToNativeMax = new Map<L.Layer, number | undefined>();
    const baseLayers: Record<string, L.Layer> = {};
    let active: L.Layer | null = null;
    let activeNativeMax: number | undefined;

    for (const r of runtimes) {
      const layer = r.url
        ? L.tileLayer(r.url, { minZoom, maxZoom: r.maxZoom ?? maxZoom, maxNativeZoom: r.maxNativeZoom, attribution: r.attribution, errorTileUrl: TRANSPARENT_TILE })
        : L.layerGroup();
      baseLayersRef.current[r.id] = layer;
      baseLayers[r.label || r.id] = layer;
      layerToBg.set(layer, r.bg);
      layerToNativeMax.set(layer, r.maxNativeZoom);
      if (r.id === activeId) { active = layer; activeNativeMax = r.maxNativeZoom; }
    }
    if (!active) { active = baseLayersRef.current[runtimes[0].id]; activeNativeMax = runtimes[0].maxNativeZoom; }
    active.addTo(map);
    setBg(layerToBg.get(active));
    nativeMaxRef.current = activeNativeMax;

    if (runtimes.length > 1) {
      controlRef.current = L.control.layers(baseLayers, {}, { collapsed: true, position: 'topright' }).addTo(map);
      map.on('baselayerchange', (e: L.LayersControlEvent) => {
        setBg(layerToBg.get(e.layer));
        nativeMaxRef.current = layerToNativeMax.get(e.layer);
      });
    }
    return () => { map.off('baselayerchange'); };
  }, [runtimes, activeId, minZoom, maxZoom]);

  // 複数マーカー
  useEffect(() => {
    const map = mapRef.current;
    const layer = markerLayerRef.current;
    if (!map || !layer || !markers) return;
    // 非同期でデータが届いてからマウントされるケース（ダッシュボード等）に備え、
    // 範囲合わせ・タイル読込の前にコンテナの実サイズを反映させる。
    map.invalidateSize();
    layer.clearLayers();
    const pts: L.LatLngExpression[] = [];
    for (const m of markers) {
      if (typeof m.lat !== 'number' || typeof m.lng !== 'number') continue;
      const mk = L.marker([m.lat, m.lng], { icon: pinIcon() });
      if (m.label) mk.bindTooltip(m.label, { direction: 'top' });
      if (m.onClick) mk.on('click', m.onClick);
      mk.addTo(layer);
      pts.push([m.lat, m.lng]);
    }
    if (fitToMarkers && pts.length > 0) {
      // タイル欠け防止: 実タイルがある最大ズーム（内蔵=13）を超えて寄り過ぎない。
      const fitMaxZoom = Math.min(16, nativeMaxRef.current ?? 16);
      map.fitBounds(L.latLngBounds(pts as L.LatLngTuple[]), { padding: [40, 40], maxZoom: fitMaxZoom });
    }
  }, [markers, fitToMarkers]);

  // 単一ピン（ピッカー）
  useEffect(() => {
    const map = mapRef.current;
    if (!map || markers) return; // markers モードでは使わない
    if (picked && typeof picked.lat === 'number' && typeof picked.lng === 'number') {
      const ll: L.LatLngTuple = [picked.lat, picked.lng];
      if (!pickMarkerRef.current) {
        pickMarkerRef.current = L.marker(ll, { icon: pinIcon(), draggable: true }).addTo(map);
        pickMarkerRef.current.on('dragend', () => {
          const p = pickMarkerRef.current!.getLatLng();
          onPickRef.current?.(p.lat, p.lng);
        });
      } else {
        pickMarkerRef.current.setLatLng(ll);
      }
    } else if (pickMarkerRef.current) {
      map.removeLayer(pickMarkerRef.current);
      pickMarkerRef.current = null;
    }
  }, [picked, markers]);

  // controlledCenter: 保存済みの center/zoom が変わったら地図を追従移動させる（「既定に戻す」や数値入力用）。
  // ユーザー操作で動かしただけ（center/zoom プロップは不変）では発火せず、無限ループを避ける。
  const centerLat = center?.lat;
  const centerLng = center?.lng;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !controlledCenter || centerLat == null || centerLng == null) return;
    const cur = map.getCenter();
    const curZoom = map.getZoom();
    const targetZoom = zoom ?? curZoom;
    if (Math.abs(cur.lat - centerLat) < 1e-6 && Math.abs(cur.lng - centerLng) < 1e-6 && curZoom === targetZoom) return;
    map.setView([centerLat, centerLng], targetZoom);
  }, [controlledCenter, centerLat, centerLng, zoom]);

  return (
    <div className={`relative w-full rounded-xl overflow-hidden border border-border z-0 ${className}`}>
      <div ref={elRef} className="absolute inset-0" />
      {centerCrosshair && (
        <div className="pointer-events-none absolute inset-0 z-[500] grid place-items-center">
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none" style={{ filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,.55))' }}>
            <circle cx="17" cy="17" r="7" stroke="var(--primary)" strokeWidth="2.5" />
            <line x1="17" y1="1" x2="17" y2="9" stroke="var(--primary)" strokeWidth="2.5" />
            <line x1="17" y1="25" x2="17" y2="33" stroke="var(--primary)" strokeWidth="2.5" />
            <line x1="1" y1="17" x2="9" y2="17" stroke="var(--primary)" strokeWidth="2.5" />
            <line x1="25" y1="17" x2="33" y2="17" stroke="var(--primary)" strokeWidth="2.5" />
            <circle cx="17" cy="17" r="1.6" fill="var(--primary)" />
          </svg>
        </div>
      )}
    </div>
  );
}
