import { NextResponse } from 'next/server';

/**
 * Check if the request comes from localhost.
 * Returns a 403 response if not local, or null if the request is allowed.
 */
export function requireLocalhost(req: Request): NextResponse | null {
  const host = req.headers.get('host') || '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  if (!isLocal) {
    return NextResponse.json(
      { error: 'This endpoint is only available on localhost' },
      { status: 403 }
    );
  }
  return null;
}
