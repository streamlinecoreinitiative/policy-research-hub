import { NextResponse } from 'next/server';
import { generateNewsletter, getNewsletters, getSubscriberCount } from '@/lib/newsletterAgent';

export const runtime = 'nodejs';

// GET — list newsletter drafts and subscriber count
export async function GET() {
  try {
    const newsletters = await getNewsletters();
    const subscriberCount = await getSubscriberCount();

    return NextResponse.json({
      newsletters,
      subscriberCount,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

// POST — generate a new newsletter draft
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const model = (body?.model as string) || 'qwen3:4b';
    const daysBack = (body?.daysBack as number) || 7;

    const draft = await generateNewsletter(model, daysBack);

    return NextResponse.json({
      newsletter: draft,
      message: `Newsletter draft generated with ${draft.articles.length} articles`,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
