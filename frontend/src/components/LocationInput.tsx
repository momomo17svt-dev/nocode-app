import { MapPin, LocateFixed, X } from 'lucide-react';
import { MapView } from './MapView';
import type { FieldDef } from '../lib/fields';
import { isGeoPoint, mapCenter, mapHeightClass, mapZoom, resolveBasemapRuntime, type GeoPoint } from '../lib/map';

interface Props {
  field: FieldDef;
  value: any;
  onChange: (value: GeoPoint | null) => void;
}

/** 位置（地図）フィールドの入力UI。地図クリック/ドラッグ・緯度経度直接入力・現在地取得に対応。 */
export function LocationInput({ field, value, onChange }: Props) {
  const v: GeoPoint | null = isGeoPoint(value) ? value : null;
  const center = v ? { lat: v.lat, lng: v.lng } : mapCenter(field.settings);

  const setPoint = (lat: number, lng: number) =>
    onChange({ lat: Number(lat.toFixed(6)), lng: Number(lng.toFixed(6)), label: v?.label });
  const setLabel = (label: string) => (v ? onChange({ ...v, label }) : undefined);
  const setNum = (key: 'lat' | 'lng', raw: string) => {
    const n = raw === '' ? NaN : Number(raw);
    const base = v ?? { lat: center.lat, lng: center.lng };
    if (Number.isNaN(n)) return;
    onChange({ ...base, [key]: n });
  };

  const useCurrent = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setPoint(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const base = resolveBasemapRuntime(field.settings);

  return (
    <div className="space-y-2">
      <MapView
        className={mapHeightClass(field.settings)}
        picked={v}
        onPick={setPoint}
        center={center}
        zoom={mapZoom(field.settings)}
        tileUrl={base.url}
        tileBg={base.bg}
        attribution={base.attribution}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted">緯度</span>
          <input
            className="input w-28 py-1 text-sm"
            type="number"
            step="any"
            value={v?.lat ?? ''}
            onChange={(e) => setNum('lat', e.target.value)}
            placeholder="35.6812"
          />
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted">経度</span>
          <input
            className="input w-28 py-1 text-sm"
            type="number"
            step="any"
            value={v?.lng ?? ''}
            onChange={(e) => setNum('lng', e.target.value)}
            placeholder="139.7671"
          />
        </div>
        <button type="button" className="btn btn-sm" onClick={useCurrent} title="現在地を取得">
          <LocateFixed className="size-4" />現在地
        </button>
        {v && (
          <button type="button" className="btn btn-sm btn-ghost text-danger" onClick={() => onChange(null)} title="クリア">
            <X className="size-4" />クリア
          </button>
        )}
      </div>
      <div className="flex items-center gap-1">
        <MapPin className="size-3.5 text-muted shrink-0" />
        <input
          className="input py-1 text-sm"
          value={v?.label ?? ''}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="地点の名称（任意・例: 正門）"
          disabled={!v}
        />
      </div>
    </div>
  );
}
