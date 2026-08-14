import { Link } from 'react-router-dom';
import { FileText, Database, ArrowRight, Scale } from 'lucide-react';
import type { SearchHit } from '../../lib/ai';

/** RAG出典・検索結果の1件カード。レコードは詳細へ、行政文書は構造ビューアの該当条へリンクする。 */
export function SourceCard({ hit, index }: { hit: SearchHit; index?: number }) {
  const isRecord = hit.source === 'record';
  const isGov = !isRecord && !!hit.structAnchor; // 行政文書チャンク（構造ビューアへのアンカーを持つのは gov のみ）
  const to = isRecord
    ? hit.appId && hit.recordId
      ? `/apps/${hit.appId}/records/${hit.recordId}`
      : null
    : hit.docId
      ? `/ai/documents/${hit.docId}${hit.structAnchor ? `#${hit.structAnchor}` : ''}`
      : null;

  const inner = (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-surface px-3.5 py-2.5 transition-colors hover:border-border-strong">
      <span className="mt-0.5 grid place-items-center size-7 shrink-0 rounded-md bg-surface-2 text-muted">
        {isRecord ? <Database className="size-3.5" /> : isGov ? <Scale className="size-3.5" /> : <FileText className="size-3.5" />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {index !== undefined && <span className="text-xs font-semibold text-primary-soft-fg">[{index}]</span>}
          <span className="text-sm font-medium truncate">{hit.title}</span>
        </div>
        <p className="text-xs text-muted mt-0.5 line-clamp-2 break-words">{hit.snippet}</p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted">
          <span className="rounded bg-surface-2 px-1.5 py-0.5">{isRecord ? hit.appName || 'レコード' : isGov ? '行政文書' : '文書'}</span>
          {!isRecord && hit.structLabel && (
            <span className="rounded bg-primary-soft px-1.5 py-0.5 font-medium text-primary-soft-fg">{hit.structLabel}</span>
          )}
          <span>関連度 {Math.round(hit.score * 100)}%</span>
        </div>
      </div>
      {to && <ArrowRight className="size-4 text-muted self-center shrink-0" />}
    </div>
  );

  return to ? <Link to={to}>{inner}</Link> : <div>{inner}</div>;
}
