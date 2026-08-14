// 行政文書（法令・条例・規則／通知・通達・要綱）の構造解析で用いる型定義。
// パーサ(gov-structure.util)・チャンカ(gov-chunk.util)・フロント(lib/govdoc)で共有する形。

/** 文書の系統。law=条文構造中心 / notice=鑑文・記書き中心 / mixed=両方 / plain=構造が薄い。 */
export type GovFamily = 'law' | 'notice' | 'mixed' | 'plain';

/** 構造ノードの種別。 */
export type GovNodeKind =
  | 'cover' // 鑑文（発番号/日付/宛先/発信者/件名）
  | 'preamble' // 前文・制定文
  | 'part' // 編
  | 'chapter' // 章
  | 'section' // 節
  | 'subsection' // 款
  | 'division' // 目
  | 'article' // 条
  | 'paragraph' // 項
  | 'item' // 号
  | 'subitem' // イロハ
  | 'supplementary' // 附則
  | 'appendix' // 別表・別記様式
  | 'note' // 記書き全体（記〜以上）
  | 'noteItem' // 記書きの各項目
  | 'body'; // 通知本文・その他段落

/** 文書から抽出したメタ情報。 */
export interface GovMeta {
  docNumber?: string; // 発番号（例: 総務発第123号 / 条例第5号）
  date?: string; // 公布日・制定日（原文表記のまま）
  enforceDate?: string; // 施行日（原文表記のまま）
  subject?: string; // 件名
  addressee?: string; // 宛先
  issuer?: string; // 発信者
}

/** 構造ツリーのノード。 */
export interface GovNode {
  id: string; // 安定アンカー（同一テキストの解析で不変）
  kind: GovNodeKind;
  num?: string; // 番号文字列（"3" / "3の2" / "一" 等。表示には label を使う）
  label: string; // 表示ラベル（"第3条" / "（目的）" / "２" / "一" 等）
  caption?: string; // 条見出し（（目的）等）。article のときのみ。
  text: string; // このノード固有の本文（子の本文は含めない）
  path: string; // パンくず（"第2章 総則 / 第3条"）
  children: GovNode[];
}

/** 目次エントリ（章・条の一覧表示用）。 */
export interface GovTocEntry {
  id: string;
  kind: GovNodeKind;
  label: string;
  caption?: string;
  depth: number; // 目次のインデント深さ（0始まり）
}

/** parseGovDoc の出力。 */
export interface GovStructure {
  family: GovFamily;
  title?: string; // 題名（条例名・件名等）
  meta: GovMeta;
  toc: GovTocEntry[];
  nodes: GovNode[];
}

/** chunkGov の出力（1チャンク＝埋め込み1件）。 */
export interface GovChunk {
  content: string; // 埋め込み対象テキスト（題名・構造パス込み）
  structPath: string; // 構造パス（"第2章 総則 / 第3条第2項"）
  structLabel: string; // 引用用の見出し（"第3条" / "第3条第2項" / "記 1" 等）
  structAnchor: string; // 該当ノードの id（閲覧ジャンプ用）
}
