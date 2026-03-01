'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type ArticleMeta = {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  template: string;
  region?: string;
  publishedAt: string;
  updatedAt: string;
  wordCount: number;
  sourcesUsed: number;
  readabilityScore: number;
};

type RelatedArticle = {
  slug: string;
  title: string;
  summary: string;
  publishedAt: string;
  tags: string[];
};

const tagLabels: Record<string, string> = {
  climate: 'Climate', water: 'Water Security', energy: 'Clean Energy',
  agriculture: 'Agriculture', health: 'Health', policy: 'Policy',
  finance: 'Finance', resilience: 'Resilience', biodiversity: 'Biodiversity',
  urbanization: 'Urbanization', education: 'Education', gender: 'Gender Equity',
  'sub-saharan-africa': 'Sub-Saharan Africa', 'south-asia': 'South Asia',
  'southeast-asia': 'Southeast Asia', 'latin-america': 'Latin America',
  'pacific-islands': 'Pacific Islands', 'middle-east': 'MENA',
};

function renderMarkdown(md: string): string {
  let html = md
    // Headers (h3 first to avoid conflicts)
    .replace(/^### (.*$)/gim, '</p><h3>$1</h3><p>')
    .replace(/^## (.*$)/gim, '</p><h2>$1</h2><p>')
    .replace(/^# (.*$)/gim, '</p><h1>$1</h1><p>')
    // Bold & italic (bold first to avoid conflicts)
    .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // Links (before line break conversion)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Verification flags
    .replace(/\[VERIFY\]/gi, '<span style="color:#d97706;font-weight:600">⚠️ VERIFY</span>')
    .replace(/\[needs verification\]/gi, '<span style="color:#d97706;font-weight:600">⚠️ VERIFY</span>')
    .replace(/\[NEEDS SOURCE\]/gi, '<span style="color:#d97706;font-weight:600">⚠️ NEEDS SOURCE</span>')
    // Bullet lists — mark with data attribute
    .replace(/^\s*[-*]\s+(.*$)/gim, '<li data-list="ul">$1</li>')
    // Numbered lists
    .replace(/^\d+\.\s+(.*$)/gim, '<li data-list="ol">$1</li>')
    // Paragraphs
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br/>');

  // Wrap consecutive list items by type
  html = html.replace(/(<li data-list="ol">.*?<\/li>(?:<br\/>)?)+/g, (match) =>
    '<ol>' + match.replace(/ data-list="ol"/g, '').replace(/<br\/>/g, '') + '</ol>'
  );
  html = html.replace(/(<li data-list="ul">.*?<\/li>(?:<br\/>)?)+/g, (match) =>
    '<ul>' + match.replace(/ data-list="ul"/g, '').replace(/<br\/>/g, '') + '</ul>'
  );

  // Wrap in paragraph
  html = '<p>' + html + '</p>';

  // Clean up empty/invalid paragraph nesting
  html = html
    .replace(/<p>\s*<\/p>/g, '')
    .replace(/<p>\s*(<h[1-3]>)/g, '$1')
    .replace(/(<\/h[1-3]>)\s*<\/p>/g, '$1')
    .replace(/<p>\s*(<[uo]l>)/g, '$1')
    .replace(/(<\/[uo]l>)\s*<\/p>/g, '$1');

  return html;
}

export default function ArticleView({
  meta,
  content,
  htmlContent,
  related,
}: {
  meta: ArticleMeta;
  content: string;
  htmlContent: string;
  related: RelatedArticle[];
}) {
  const [copied, setCopied] = useState(false);

  const renderedContent = useMemo(() => renderMarkdown(content), [content]);

  const readingTime = Math.max(1, Math.ceil(meta.wordCount / 250));
  const formattedDate = new Date(meta.publishedAt).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const shareText = `${meta.title} — Baseflow Institute`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const shareTwitter = () => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`, '_blank');
  };

  const shareLinkedIn = () => {
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`, '_blank');
  };

  const shareEmail = () => {
    window.open(`mailto:?subject=${encodeURIComponent(meta.title)}&body=${encodeURIComponent(`Check out this research: ${shareUrl}`)}`);
  };

  const downloadMd = () => {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="pub article-page">
      <nav className="breadcrumb">
        <Link href="/">Home</Link>
        <span>/</span>
        <Link href="/library">Library</Link>
        <span>/</span>
        <span>{meta.title.slice(0, 50)}...</span>
      </nav>

      <article className="article-container">
        {/* Header */}
        <header className="article-header">
          <div className="a-meta-bar">
            <span className="a-tmpl">{meta.template}</span>
            {meta.region && <span className="a-region">{meta.region}</span>}
          </div>
          <h1>{meta.title}</h1>
          <div className="article-info">
            <span>{formattedDate}</span>
            <span className="sep">·</span>
            <span>{readingTime} min read</span>
            <span className="sep">·</span>
            <span>{meta.wordCount} words</span>
            <span className="sep">·</span>
            <span>{meta.sourcesUsed} sources cited</span>
          </div>
          <div className="a-tags" style={{ marginTop: 12 }}>
            {meta.tags.map(t => (
              <Link href={`/library?tag=${t}`} key={t} className="tag-sm">
                {tagLabels[t] || t}
              </Link>
            ))}
          </div>
        </header>

        {/* AI Disclosure */}
        <div className="ai-disclosure">
          <strong>Transparency Note:</strong> This report was generated by an AI research pipeline using
          data from public sources (World Bank, Wikipedia, DuckDuckGo). All statistics include source
          citations. Items marked [VERIFY] require independent confirmation. This is a research aid,
          not a substitute for expert analysis.
        </div>

        {/* Article Body */}
        <div className="article-body markdown-preview"
          dangerouslySetInnerHTML={{ __html: renderedContent }}
        />

        {/* Share & Download */}
        <div className="share-bar">
          <span className="share-label">Share this research:</span>
          <button onClick={shareTwitter} className="share-btn" title="Share on Twitter">𝕏 Twitter</button>
          <button onClick={shareLinkedIn} className="share-btn" title="Share on LinkedIn">in LinkedIn</button>
          <button onClick={shareEmail} className="share-btn" title="Share via email">✉ Email</button>
          <button onClick={copyLink} className="share-btn" title="Copy link">
            {copied ? '✓ Copied!' : '🔗 Copy Link'}
          </button>
          <button onClick={downloadMd} className="share-btn" title="Download markdown">↓ Download</button>
        </div>

        {/* Quality Score */}
        <div className="quality-footer">
          <h3>Report Quality Metrics</h3>
          <div className="qf-grid">
            <div className="qf-item">
              <strong>{meta.wordCount}</strong>
              <span>Words</span>
            </div>
            <div className="qf-item">
              <strong>{meta.sourcesUsed}</strong>
              <span>Sources</span>
            </div>
            <div className="qf-item">
              <strong>{meta.readabilityScore}/100</strong>
              <span>Readability</span>
            </div>
            <div className="qf-item">
              <strong>{readingTime} min</strong>
              <span>Read Time</span>
            </div>
          </div>
        </div>
      </article>

      {/* Related Articles */}
      {related.length > 0 && (
        <section className="related-section">
          <h2>Related Research</h2>
          <div className="card-grid">
            {related.map(r => (
              <Link href={`/article/${r.slug}`} key={r.slug} className="a-card">
                <h3>{r.title}</h3>
                <p className="a-summary">{r.summary}</p>
                <div className="a-tags">
                  {r.tags.slice(0, 3).map(t => (
                    <span key={t} className="tag-sm">{tagLabels[t] || t}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Back to library */}
      <div className="back-bar">
        <Link href="/library" className="btn-ghost">← Back to Library</Link>
        <Link href="/" className="btn-ghost">Home</Link>
      </div>
    </main>
  );
}
