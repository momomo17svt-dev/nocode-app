import { useState, useEffect } from 'react';
import { type FieldDef, formatValue } from '../lib/fields';
import { ReferenceInput } from './ReferenceInput';
import { SubtableInput } from './SubtableInput';
import { LocationInput } from './LocationInput';
import { EntityPicker } from './EntityPicker';
import { AiFieldInput } from './ai/AiFieldInput';

interface Props {
  field: FieldDef;
  value: any;
  onChange: (value: any) => void;
  users: { id: string; loginId: string; name?: string | null }[];
  groups: { id: string; name: string }[];
  /** AI生成フィールド用: 所属アプリと現在のレコード値（{code}置換用）。 */
  appId?: string;
  record?: Record<string, any>;
  /** 関連レコード参照で選択された参照先 dataJson を親へ渡す（ルックアップ転記用）。 */
  onLookup?: (refData: Record<string, any>) => void;
}

/** 各種フィールドの入力UIを描画する共通コンポーネント。 */
export function FieldInput({ field, value, onChange, users, groups, appId, record, onLookup }: Props) {
  const opts: string[] = field.settings?.options || [];

  switch (field.fieldType) {
    case 'ai':
      return <AiFieldInput field={field} value={value} onChange={onChange} appId={appId} record={record} />;

    case 'text':
      return <input className="input" placeholder={field.settings?.placeholder} value={value ?? ''} maxLength={field.settings?.maxLength || undefined} onChange={(e) => onChange(e.target.value)} />;

    case 'link':
      return <input className="input" type="url" placeholder={field.settings?.placeholder || 'https://...'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;

    case 'email':
      return <input className="input" type="email" placeholder={field.settings?.placeholder || 'name@example.com'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;

    case 'phone':
      return <input className="input" type="tel" placeholder={field.settings?.placeholder || '03-1234-5678'} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;

    case 'subtable':
      return <SubtableInput field={field} value={value} onChange={onChange} />;

    case 'location':
      return <LocationInput field={field} value={value} onChange={onChange} />;

    case 'section':
      return null;

    case 'textarea':
      return <textarea className="input" rows={3} placeholder={field.settings?.placeholder} value={value ?? ''} maxLength={field.settings?.maxLength || undefined} onChange={(e) => onChange(e.target.value)} />;

    case 'number':
      return (
        <div className="flex items-center gap-2">
          <input className="input" type="number" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))} />
          {field.settings?.unit && <span className="text-sm text-muted shrink-0">{field.settings.unit}</span>}
        </div>
      );

    case 'date':
      return <input className="input" type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;

    case 'datetime':
      return <input className="input" type="datetime-local" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;

    case 'checkbox': {
      const arr: string[] = Array.isArray(value) ? value : [];
      const toggle = (o: string) => onChange(arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o]);
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="accent-[var(--primary)]" checked={arr.includes(o)} onChange={() => toggle(o)} /> {o}
            </label>
          ))}
        </div>
      );
    }

    case 'radio':
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {opts.map((o) => (
            <label key={o} className="flex items-center gap-1.5 text-sm">
              <input type="radio" className="accent-[var(--primary)]" name={field.fieldCode} checked={value === o} onChange={() => onChange(o)} /> {o}
            </label>
          ))}
        </div>
      );

    case 'select':
    case 'status':
      return (
        <select className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">選択してください</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );

    case 'user_select':
      // 15万〜の規模を <select> に全件展開しないため、検索型ピッカーで選ぶ。
      return <UserSelectField value={value} onChange={onChange}
        initialLabel={(() => { const u = users.find((u) => u.id === value); return u ? (u.name?.trim() || u.loginId) : undefined; })()}
        scope={field.settings?.userScope === 'mygroups' ? 'mygroups' : undefined} />;

    case 'group_select':
      return <GroupSelectField value={value} onChange={onChange} initialLabel={groups.find((g) => g.id === value)?.name} />;

    case 'auto_number':
      return <input className="input" value={value ?? '(保存時に自動採番)'} disabled />;

    case 'calc':
      return <input className="input bg-surface-2" value={value === '' || value === null || value === undefined ? '' : formatValue(field, value)} placeholder="（自動計算）" disabled />;

    case 'reference':
      return <ReferenceInput field={field} value={value} onChange={onChange} onLookup={onLookup} />;

    case 'file':
      return <p className="text-sm text-muted">添付ファイルはレコード保存後に詳細画面からアップロードできます。</p>;

    default:
      return <input className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** ユーザー選択: 検索型ピッカー。値はユーザーID、表示名はローカルに保持する。 */
function UserSelectField({ value, onChange, initialLabel, scope }: { value: any; onChange: (v: any) => void; initialLabel?: string; scope?: 'mygroups' }) {
  const [label, setLabel] = useState(initialLabel ?? '');
  // 既存レコード読込時にラベルが後から解決されたら反映（新規選択時の表示は消さない）。
  useEffect(() => { if (initialLabel) setLabel(initialLabel); }, [initialLabel]);
  return (
    <EntityPicker kind="user" value={value || null} label={label} scope={scope}
      onChange={(id, lbl) => { setLabel(lbl); onChange(id || ''); }}
      placeholder={scope === 'mygroups' ? '自部署の社員を検索…' : 'ユーザーを検索…'} />
  );
}

/** グループ選択: 検索型ピッカー。 */
function GroupSelectField({ value, onChange, initialLabel }: { value: any; onChange: (v: any) => void; initialLabel?: string }) {
  const [label, setLabel] = useState(initialLabel ?? '');
  useEffect(() => { if (initialLabel) setLabel(initialLabel); }, [initialLabel]);
  return (
    <EntityPicker kind="group" value={value || null} label={label}
      onChange={(id, lbl) => { setLabel(lbl); onChange(id || ''); }}
      placeholder="グループを検索…" />
  );
}
