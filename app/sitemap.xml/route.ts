import { readIndex } from '@/lib/articleIndex';

export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://baseflow.institute';
  const index = await readIndex();
  const published = index.articles.filter(a => a.status === 'published');

  const staticPages = [
    { url: '', priority: '1.0', changefreq: 'daily' },
    { url: '/library', priority: '0.9', changefreq: 'daily' },
    { url: '/about', priority: '0.5', changefreq: 'monthly' },
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${staticPages.map(p => `  <url>
    <loc>${siteUrl}${p.url}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </url>`).join('\n')}
${published.map(a => `  <url>
    <loc>${siteUrl}/article/${a.slug}</loc>
    <lastmod>${a.updatedAt?.split('T')[0] || a.publishedAt?.split('T')[0] || new Date().toISOString().split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  });
}
