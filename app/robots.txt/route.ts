export async function GET() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://policy-research-hub.vercel.app';

  const robotsTxt = `# Open Policy Research Hub
User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml

# Disallow admin area
Disallow: /admin
`;

  return new Response(robotsTxt, {
    headers: {
      'Content-Type': 'text/plain',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
