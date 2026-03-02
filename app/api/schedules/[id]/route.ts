import { NextResponse } from 'next/server';
import { removeSchedule, pauseSchedule, resumeSchedule } from '@/lib/scheduler';
import { requireLocalhost } from '@/lib/adminGuard';

export const runtime = 'nodejs';

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const blocked = requireLocalhost(req);
  if (blocked) return blocked;

  try {
    const id = params.id;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    await removeSchedule(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const blocked = requireLocalhost(req);
  if (blocked) return blocked;

  try {
    const id = params.id;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const body = await req.json();
    const action = body?.action as string;

    if (action === 'pause') {
      const schedule = await pauseSchedule(id);
      return NextResponse.json({ ok: true, schedule });
    } else if (action === 'resume') {
      const schedule = await resumeSchedule(id);
      return NextResponse.json({ ok: true, schedule });
    } else {
      return NextResponse.json({ error: 'Invalid action. Use "pause" or "resume".' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
