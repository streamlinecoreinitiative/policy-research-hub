'use client';

import { Suspense, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type Article = {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  template: string;
  region?: string;
  publishedAt: string;
  wordCount: number;
  sourcesUsed: number;
  readabilityScore: number;
};

type TagCount = { tag: string; count: number };

const tagLabels: Record<string, string> = {
  climate: 'Climate', water: 'Water Security', energy: 'Clean Energy',
  agriculture: 'Agriculture', health: 'Health', policy: 'Policy',
  finance: 'Finance', resilience: 'Resilience', biodiversity: 'Biodiversity',
  urbanization: 'Urbanization', education: 'Education', gender: 'Gender Equity',
  'sub-saharan-africa': 'Sub-Saharan Africa', 'south-asia': 'South Asia',
  'southeast-asia': 'Southeast Asia', 'latin-america': 'Latin America',
  'pacific-islands': 'Pacific Islands', 'middle-east': 'MENA',
};

export default function LibraryPage() {
  return (
    <Suspense fallback={<div className="loading-state">Loading library...</div>}>
      <LibraryContent />
    </Suspense>
  );
}

function LibraryContent() {
  const searchParams = useSearchParams();
  const initialTag = searchParams.get('tag') || '';

  const [articles, setArticles] = useState<Article[]>([]);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTag, setActiveTag] = useState(initialTag);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 12;

  const fetchArticles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(page * PAGE_SIZE));
    if (activeTag) params.set('tag', activeTag);
    if (search.trim()) params.set('search', search.trim());

    try {
      const res = await fetch(`/api/articles?${params}`);
      const data = await res.json();
      setArticles(data.articles || []);
      setTotal(data.total || 0);
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [activeTag, search, page]);

  useEffect(() => {
    fetchArticles();
  }, [fetchArticles]);

  useEffect(() => {
    fetch('/api/articles/tags')
      .then(r => r.ok ? r.json() : { tags: [] })
      .then(d => setTags(d.tags || []))
      .catch(() => {});
  }, []);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleTagClick = (tag: string) => {
    setActiveTag(prev => prev === tag ? '' : tag);
    setPage(0);
  };

  return (
    <main className="pub library-page">
      <nav className="breadcrumb">
        <Link href="/">Home</Link> <span>/</span> <span>Research Library</span>
      </nav>

      <section className="lib-header">
        <h1>Research Library</h1>
        <p className="muted">
          {total} {total === 1 ? 'report' : 'reports'} covering climate adaptation,
          water security, clean energy, and sustainable development.
        </p>
      </section>

      {/* Search & Filter */}
      <section className="lib-controls">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search reports..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
          />
        </div>
        <div className="tag-filters">
          <button
            className={`tag-btn ${!activeTag ? 'active' : ''}`}
            onClick={() => { setActiveTag(''); setPage(0); }}
          >
            All
          </button>
          {tags.map(({ tag, count }) => (
            <button
              key={tag}
              className={`tag-btn ${activeTag === tag ? 'active' : ''}`}
              onClick={() => handleTagClick(tag)}
            >
              {tagLabels[tag] || tag} ({count})
            </button>
          ))}
        </div>
      </section>

      {/* Results */}
      {loading ? (
        <div className="loading-state">Loading...</div>
      ) : articles.length === 0 ? (
        <div className="empty-hero">
          <h3>No reports found</h3>
          <p>{search || activeTag ? 'Try a different search or filter.' : 'Generate your first report from the admin panel.'}</p>
          {(search || activeTag) && (
            <button className="btn-ghost" onClick={() => { setSearch(''); setActiveTag(''); }}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="card-grid lib-grid">
            {articles.map(a => (
              <Link href={`/article/${a.slug}`} key={a.slug} className="a-card">
                <div className="a-meta">
                  <span className="a-tmpl">{a.template}</span>
                  {a.region && <span className="a-region">{a.region}</span>}
                </div>
                <h3>{a.title}</h3>
                <p className="a-summary">{a.summary}</p>
                <div className="a-foot">
                  <span>{formatDate(a.publishedAt)}</span>
                  <span>{a.wordCount} words</span>
                  <span>{a.sourcesUsed} sources</span>
                </div>
                <div className="a-tags">
                  {a.tags.slice(0, 4).map(t => (
                    <span key={t} className="tag-sm">{tagLabels[t] || t}</span>
                  ))}
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                ← Previous
              </button>
              <span className="page-info">
                Page {page + 1} of {totalPages}
              </span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {/* RSS callout */}
      <section className="rss-callout">
        <p>Never miss a report — <a href="/feed.xml">subscribe via RSS</a> or go <Link href="/">back home</Link> to join the newsletter.</p>
      </section>
    </main>
  );
}
