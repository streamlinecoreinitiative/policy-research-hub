import path from 'path';
import { NextResponse } from 'next/server';
import { uploadFileToDrive } from '@/lib/drive';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const filePath = body?.filePath as string;
    const drive = body?.drive;

    if (!filePath || !drive) {
      return NextResponse.json({ error: 'filePath and drive credentials are required.' }, { status: 400 });
    }

    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    const res = await uploadFileToDrive({ filePath: resolvedPath, drive });

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
