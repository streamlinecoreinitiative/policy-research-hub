import { Metadata } from 'next';
import { getArticleBySlug, getPublishedArticles, readIndex } from '@/lib/articleIndex';
import ArticleView from './ArticleView';

type Props = {
  params: { slug: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await getArticleBySlug(params.slug);
  if (!article) {
    return { title: 'Article Not Found — Open Policy Research Hub' };
  }

  const { meta } = article;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

  return {
    title: `${meta.title} — Open Policy Research Hub`,
    description: meta.summary,
    keywords: meta.tags.join(', '),
    authors: [{ name: 'Open Policy Research Hub' }],
    openGraph: {
      title: meta.title,
      description: meta.summary,
      type: 'article',
      publishedTime: meta.publishedAt,
      modifiedTime: meta.updatedAt,
      tags: meta.tags,
      url: `${siteUrl}/article/${meta.slug}`,
      siteName: 'Open Policy Research Hub',
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.summary,
    },
    alternates: {
      types: {
        'application/rss+xml': '/feed.xml',
      },
    },
  };
}

export async function generateStaticParams() {
  const index = await readIndex();
  return index.articles
    .filter(a => a.status === 'published')
    .map(a => ({ slug: a.slug }));
}

export default async function ArticlePage({ params }: Props) {
  const article = await getArticleBySlug(params.slug);

  if (!article) {
    return (
      <main className="pub article-page">
        <div className="article-container">
          <h1>Article Not Found</h1>
          <p>This report may have been removed or the URL is incorrect.</p>
          <a href="/library">← Back to Library</a>
        </div>
      </main>
    );
  }

  // Get related articles (same tags)
  const { articles: allArticles } = await getPublishedArticles({ limit: 100 });
  const related = allArticles
    .filter(a => a.slug !== article.meta.slug)
    .map(a => ({
      ...a,
      relevance: a.tags.filter(t => article.meta.tags.includes(t)).length,
    }))
    .filter(a => a.relevance > 0)
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 3);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://policy-research-hub.vercel.app';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.meta.title,
    description: article.meta.summary,
    datePublished: article.meta.publishedAt,
    dateModified: article.meta.updatedAt,
    author: {
      '@type': 'Organization',
      name: 'Open Policy Research Hub',
      url: siteUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Open Policy Research Hub',
      url: siteUrl,
    },
    mainEntityOfPage: `${siteUrl}/article/${article.meta.slug}`,
    keywords: article.meta.tags.join(', '),
    wordCount: article.meta.wordCount,
    articleSection: article.meta.template,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArticleView
        meta={article.meta}
        content={article.content}
        htmlContent={article.htmlContent}
        related={related}
      />
    </>
  );
}
