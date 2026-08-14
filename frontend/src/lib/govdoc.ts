// 行政文書の構造（バックエンド parseGovDoc の出力）をフロントで描画するための型と表示ヘルパ。
// 解析はバックエンドが正。フロントは structure JSON を受け取って表示するだけ。

export type GovFamily = 'law' | 'notice' | 'mixed' | 'plain';

export type GovNodeKind =
  | 'cover' | 'preamble' | 'part' | 'chapter' | 'section' | 'subsection' | 'division'
  | 'article' | 'paragraph' | 'item' | 'subitem' | 'supplementary' | 'appendix'
  | 'note' | 'noteItem' | 'body';

export interface GovMeta {
  docNumber?: string;
  date?: string;
  enforceDate?: string;
  subject?: string;
  addressee?: string;
  issuer?: string;
}

export interface GovNode {
  id: string;
  kind: GovNodeKind;
  num?: string;
  label: string;
  caption?: string;
  text: string;
  path: string;
  children: GovNode[];
}

export interface GovTocEntry {
  id: string;
  kind: GovNodeKind;
  label: string;
  caption?: string;
  depth: number;
}

export interface GovStructure {
  family: GovFamily;
  title?: string;
  meta: GovMeta;
  toc: GovTocEntry[];
  nodes: GovNode[];
}

export const FAMILY_LABELS: Record<GovFamily, string> = {
  law: '法令・条例型',
  notice: '通知・通達型',
  mixed: '混在（条文＋鑑文）',
  plain: '構造なし',
};

export const META_LABELS: { key: keyof GovMeta; label: string }[] = [
  { key: 'docNumber', label: '発番号' },
  { key: 'date', label: '日付' },
  { key: 'enforceDate', label: '施行日' },
  { key: 'subject', label: '件名' },
  { key: 'addressee', label: '宛先' },
  { key: 'issuer', label: '発信者' },
];

/** メタが1つでも埋まっているか。 */
export function hasMeta(meta?: GovMeta | null): boolean {
  return !!meta && META_LABELS.some((m) => !!meta[m.key]);
}

/** 構造ツリー内の総条数（toc から article を数える）。 */
export function countArticles(s?: GovStructure | null): number {
  if (!s) return 0;
  return s.toc.filter((e) => e.kind === 'article').length;
}
