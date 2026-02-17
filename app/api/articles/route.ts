import { NextResponse } from 'next/server';
import { getPublishedArticles, bootstrapIndex } from '@/lib/articleIndex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    // Bootstrap index with any existing files not yet indexed
    await bootstrapIndex();

    const { searchParams } = new URL(req.url);
    const tag = searchParams.get('tag') || undefined;
    const search = searchParams.get('search') || undefined;
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const result = await getPublishedArticles({ tag, search, limit, offset });

    return NextResponse.json({
      articles: result.articles,
      total: result.total,
      limit,
      offset,
      hasMore: offset + limit < result.total,
    });
  } catch (err) {
    console.error('Articles API error:', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
