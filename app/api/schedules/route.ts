import { NextResponse } from 'next/server';
import {
  addSchedule,
  listSchedules,
  initScheduler,
  MIN_SCHEDULE_INTERVAL_MINUTES,
  MAX_SCHEDULE_INTERVAL_MINUTES
} from '@/lib/scheduler';
import { requireLocalhost } from '@/lib/adminGuard';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const blocked = requireLocalhost(req);
  if (blocked) return blocked;

  await initScheduler();
  const schedules = await listSchedules();
  return NextResponse.json({ schedules });
}

export async function POST(req: Request) {
  const blocked = requireLocalhost(req);
  if (blocked) return blocked;

  try {
    const body = await req.json();
    const topic = body?.topic as string;
    const plannerModel = body?.plannerModel as string;
    const writerModel = body?.writerModel as string;
    const intervalMinutes = Number(body?.intervalMinutes || 0);
    const autoUpload = Boolean(body?.autoUpload);
    const drive = body?.drive;

    if (!topic || !plannerModel || !writerModel || !intervalMinutes) {
      return NextResponse.json(
        { error: 'topic, plannerModel, writerModel, and intervalMinutes are required.' },
        { status: 400 }
      );
    }

    if (intervalMinutes < MIN_SCHEDULE_INTERVAL_MINUTES || intervalMinutes > MAX_SCHEDULE_INTERVAL_MINUTES) {
      return NextResponse.json(
        {
          error: `intervalMinutes must be between ${MIN_SCHEDULE_INTERVAL_MINUTES} and ${MAX_SCHEDULE_INTERVAL_MINUTES}.`
        },
        { status: 400 }
      );
    }

    const created = await addSchedule({
      topic,
      plannerModel,
      writerModel,
      intervalMinutes,
      autoUpload,
      drive
    });
    return NextResponse.json({ schedule: created });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
