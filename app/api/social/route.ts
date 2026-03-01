import { NextResponse } from 'next/server';
import { getQueuedPosts, updatePostStatus } from '@/lib/socialPostAgent';
import { requireLocalhost } from '@/lib/adminGuard';

export const runtime = 'nodejs';

// GET — retrieve social post queue
export async function GET(req: Request) {
  const blocked = requireLocalhost(req);
  if (blocked) return blocked;

  try {
    const { searchParams } = new URL(req.url);
    const platform = searchParams.get('platform') || undefined;
    const status = searchParams.get('status') || undefined;

    const posts = await getQueuedPosts({ platform, status });

    return NextResponse.json({
      posts,
      total: posts.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

// PATCH — update post status (mark as posted/skipped)
export async function PATCH(req: Request) {
  const blocked = requireLocalhost(req);
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const { postId, status } = body;

    if (!postId || !['posted', 'skipped'].includes(status)) {
      return NextResponse.json(
        { error: 'postId and status (posted|skipped) required.' },
        { status: 400 }
      );
    }

    await updatePostStatus(postId, status);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
