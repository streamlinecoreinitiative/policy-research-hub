import path from 'path';
import { NextResponse } from 'next/server';
import { uploadFileToDrive, getEnvDriveCredentials } from '@/lib/drive';
import { requireLocalhost } from '@/lib/adminGuard';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const blocked = requireLocalhost(req);
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const filePath = body?.filePath as string;
    const drive = body?.drive;

    if (!filePath) {
      return NextResponse.json({ error: 'filePath is required.' }, { status: 400 });
    }

    // Use provided credentials, or fall back to env vars
    if (!drive && !getEnvDriveCredentials()) {
      return NextResponse.json({ error: 'Drive credentials required. Set GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN env vars or pass drive object.' }, { status: 400 });
    }

    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    const res = await uploadFileToDrive({ filePath: resolvedPath, drive: drive || undefined });

    return NextResponse.json({
      fileId: res.id,
      fileName: res.name,
      webViewLink: res.webViewLink
    });
  } catch (err) {
    console.error('Drive upload error', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
