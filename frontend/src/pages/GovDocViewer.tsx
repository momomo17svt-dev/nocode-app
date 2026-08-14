import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { Loader2, Scale, ArrowLeft, ListTree, FileText, Paperclip } from 'lucide-react';
import { Layout } from '../components/Layout';
import { Markdown } from '../components/ui/Markdown';
import { aiApi, type DocDetail } from '../lib/ai';
import { FAMILY_LABELS, META_LABELS, hasMeta, countArticles, type GovNode, type GovStructure } from '../lib/govdoc';

/**
 * 行政文書の構造ビューア。左=目次ツリー（章/条）、右=メタ＋本文（条ごとにアンカー）。
 * 検索/RAGの出典カードから `/ai/documents/:id#<anchor>` で該当条へジャンプできる。
 */
export function GovDocViewer() {
  const { id } = useParams();
  const { hash } = useLocation();
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    aiApi
      .getKnowledge(id)
      .then((d) => setDoc(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  // ハッシュ(#anchor)があれば該当条までスクロール。
  useEffect(() => {
    if (!doc || !hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [doc, hash]);

  const jump = (anchor: string) => {
    const el = document.getElementById(anchor);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return <Layout><div className="py-20 grid place-items-center text-muted"><Loader2 className="size-6 animate-spin" /></div></Layout>;
  }
  if (error || !doc) {
    return (
      <Layout>
        <div className="py-16 text-center text-muted">
          <p className="font-medium">文書を表示できません</p>
          <p className="text-sm mt-1">{error || 'データが見つかりませんでした。'}</p>
          <Link to="/knowledge" className="text-sm text-primary hover:underline mt-3 inline-block">ナレッジへ戻る</Link>
        </div>
      </Layout>
    );
  }

  const structure: GovStructure | null = (doc.structure as any) || null;
  const isGov = doc.docKind === 'gov' && !!structure;

  return (
    <Layout>
      <div className="mb-4">
        <Link to="/knowledge" className="text-xs text-muted hover:text-content inline-flex items-center gap-1"><ArrowLeft className="size-3.5" />ナレッジへ戻る</Link>
      </div>
      <div className="flex items-start gap-3 mb-5">
        <span className="grid place-items-center size-10 shrink-0 rounded-lg bg-primary-soft text-primary-soft-fg">
          {isGov ? <Scale className="size-5" /> : <FileText className="size-5" />}
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight truncate">{doc.title}</h1>
          {isGov && structure ? (
            <p className="text-xs text-muted mt-0.5">
              {FAMILY_LABELS[structure.family]} ・ {countArticles(structure)} 条
              {doc.sourceFileName ? ` ・ ${doc.sourceFileName}` : ''}
            </p>
          ) : (
            <p className="text-xs text-muted mt-0.5">ナレッジ文書{doc.sourceFileName ? ` ・ ${doc.sourceFileName}` : ''}</p>
          )}
        </div>
      </div>

      {!isGov ? (
        // 一般文書: 本文をそのまま読み取り表示（行政文書モードなら下の構造ビューア）。
        <section className="card p-5">
          {doc.sourceFileName && (
            <p className="text-xs text-muted mb-3 flex items-center gap-1"><Paperclip className="size-3" />{doc.sourceFileName}</p>
          )}
          <div className="text-sm leading-relaxed">
            <Markdown content={doc.content || ''} />
          </div>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[16rem_1fr]">
          {/* 目次 */}
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <div className="card p-3">
              <p className="text-xs font-semibold text-muted flex items-center gap-1.5 mb-2 px-1"><ListTree className="size-3.5" />目次</p>
              <nav className="max-h-[70vh] overflow-auto pr-1">
                {structure!.toc.length === 0 && <p className="text-xs text-muted px-1 py-2">見出しを検出できませんでした。</p>}
                <ul className="space-y-0.5">
                  {structure!.toc.map((e) => (
                    <li key={e.id}>
                      <button
                        onClick={() => jump(e.id)}
                        className="w-full text-left text-xs rounded px-1.5 py-1 hover:bg-surface-2 truncate"
                        style={{ paddingLeft: `${0.375 + e.depth * 0.75}rem` }}
                      >
                        <span className="font-medium">{e.label}</span>
                        {e.caption && <span className="text-muted">（{e.caption}）</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            </div>
          </aside>

          {/* メタ＋本文 */}
          <div className="min-w-0 space-y-5">
            {hasMeta(structure!.meta) && (
              <section className="card p-4">
                <h4 className="text-xs font-semibold text-muted mb-2">文書情報</h4>
                <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 text-sm">
                  {META_LABELS.filter((m) => structure!.meta[m.key]).map((m) => (
                    <div key={m.key} className="flex gap-2">
                      <dt className="text-muted shrink-0 w-16">{m.label}</dt>
                      <dd className="font-medium break-words">{structure!.meta[m.key]}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <section className="card p-5">
              {structure!.nodes.map((n) => <NodeView key={n.id} node={n} />)}
            </section>
          </div>
        </div>
      )}
    </Layout>
  );
}

/** 構造ノードを再帰描画。条はアンカー(id)付きでジャンプ対象になる。 */
function NodeView({ node, depth = 0 }: { node: GovNode; depth?: number }) {
  const isHeading = ['part', 'chapter', 'section', 'subsection', 'division'].includes(node.kind);
  const isArticle = node.kind === 'article';
  const isContainerLabel = ['cover', 'note', 'appendix', 'supplementary', 'preamble', 'body'].includes(node.kind);

  return (
    <div id={node.id} className={`scroll-mt-4 ${isHeading ? 'mt-5 first:mt-0' : 'mt-3 first:mt-0'}`}>
      {isHeading && (
        <h3 className="text-base font-bold border-b border-border pb-1 mb-2">
          {node.label}{node.caption ? `　${node.caption}` : ''}
        </h3>
      )}

      {isArticle && (
        <div className="mb-1">
          {node.caption && <p className="text-sm text-muted">（{node.caption}）</p>}
          <p className="text-sm leading-relaxed">
            <span className="font-semibold">{node.label}</span>
            {node.text ? `　${node.text}` : ''}
          </p>
        </div>
      )}

      {isContainerLabel && (
        <div className="mb-1">
          <p className="text-sm font-semibold">{node.label}</p>
          {node.text && <p className="text-sm leading-relaxed whitespace-pre-wrap mt-0.5">{node.text}</p>}
        </div>
      )}

      {!isHeading && !isArticle && !isContainerLabel && (
        // paragraph / item / subitem / noteItem
        <p className="text-sm leading-relaxed" style={{ paddingLeft: `${Math.min(depth, 4) * 1}rem` }}>
          {node.label && node.kind !== 'paragraph' && <span className="text-muted mr-1">{node.label}</span>}
          {node.kind === 'paragraph' && <span className="font-medium mr-1">{node.label}</span>}
          {node.text}
        </p>
      )}

      {node.children.length > 0 && (
        <div className={isArticle || isContainerLabel ? 'pl-3 border-l border-border/60 ml-1' : ''}>
          {node.children.map((c) => <NodeView key={c.id} node={c} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}
