import { NextResponse } from 'next/server';
import { readCredentials, updatePlatformCredentials, maskCredentials } from '@/lib/socialCredentials';

export const runtime = 'nodejs';

/**
 * GET /api/admin/credentials — Get masked social media credentials
 */
export async function GET(req: Request) {
  const host = req.headers.get('host') || '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  if (!isLocal) {
    return NextResponse.json({ error: 'Credentials management is only available locally' }, { status: 403 });
  }

  try {
    const creds = await readCredentials();
    return NextResponse.json(maskCredentials(creds));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/admin/credentials — Save social media credentials for a platform
 * Body: { platform: 'twitter'|'linkedin'|'bluesky', credentials: {...}, enabled: boolean }
 */
export async function POST(req: Request) {
  const host = req.headers.get('host') || '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  if (!isLocal) {
    return NextResponse.json({ error: 'Credentials management is only available locally' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { platform, credentials, enabled } = body;

    if (!['twitter', 'linkedin', 'bluesky'].includes(platform)) {
      return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
    }
    if (!credentials || typeof credentials !== 'object') {
      return NextResponse.json({ error: 'Credentials object required' }, { status: 400 });
    }

    const updated = await updatePlatformCredentials(platform, credentials, enabled ?? true);
    return NextResponse.json({
      success: true,
      credentials: maskCredentials(updated),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
