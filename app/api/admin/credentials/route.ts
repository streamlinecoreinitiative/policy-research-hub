import { NextResponse } from 'next/server';
import {
  readCredentials,
  saveBlueskyCredentials,
  testBlueskyConnection,
  postToBluesky,
  maskCredentials,
} from '@/lib/socialCredentials';

export const runtime = 'nodejs';

/**
 * GET /api/admin/credentials — Get masked Bluesky credentials
 */
export async function GET(req: Request) {
  const host = req.headers.get('host') || '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  if (!isLocal) {
    return NextResponse.json({ error: 'Local access only' }, { status: 403 });
  }

  try {
    const creds = await readCredentials();
    return NextResponse.json(maskCredentials(creds));
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

/**
 * POST /api/admin/credentials
 * Actions:
 *   - { action: 'save', handle, appPassword, enabled } — Save Bluesky credentials
 *   - { action: 'test', handle, appPassword } — Test Bluesky login without saving
 *   - { action: 'post', text, url } — Post to Bluesky immediately
 */
export async function POST(req: Request) {
  const host = req.headers.get('host') || '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  if (!isLocal) {
    return NextResponse.json({ error: 'Local access only' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'save') {
      const { handle, appPassword, enabled } = body;
      if (!handle || !appPassword) {
        return NextResponse.json({ error: 'Handle and app password are required' }, { status: 400 });
      }
      const creds = await saveBlueskyCredentials(handle, appPassword, enabled ?? true);
      return NextResponse.json({ success: true, credentials: maskCredentials(creds) });
    }

    if (action === 'test') {
      const { handle, appPassword } = body;
      if (!handle || !appPassword) {
        return NextResponse.json({ error: 'Handle and app password required' }, { status: 400 });
      }
      const result = await testBlueskyConnection(handle, appPassword);
      return NextResponse.json(result);
    }

    if (action === 'post') {
      const { text, url } = body;
      if (!text) {
        return NextResponse.json({ error: 'Post text is required' }, { status: 400 });
      }
      const uri = await postToBluesky(text, url);
      return NextResponse.json({ success: true, uri });
    }

    return NextResponse.json({ error: 'Unknown action. Use: save, test, or post' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
