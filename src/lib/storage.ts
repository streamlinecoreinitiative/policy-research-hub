import fs from 'fs/promises';
import path from 'path';

const SCHEDULE_PATH = path.join(process.cwd(), 'data/schedules.json');

export type StoredSchedule = {
  id: string;
  topic: string;
  plannerModel: string;
  writerModel: string;
  autoUpload: boolean;
  paused?: boolean;
  drive?: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    folderId?: string;
  };
  intervalMinutes: number;
  nextRunAt: number;
  lastRunAt?: number;
  lastResult?: {
    articlePath?: string;
    fileId?: string;
    webViewLink?: string;
    error?: string;
    ranAt: number;
  };
};

async function ensureFile() {
  try {
    await fs.access(SCHEDULE_PATH);
  } catch {
    // On Vercel the filesystem is read-only — skip file creation
    if (process.env.VERCEL) return;
    try {
      await fs.mkdir(path.dirname(SCHEDULE_PATH), { recursive: true });
      await fs.writeFile(SCHEDULE_PATH, '[]', 'utf8');
    } catch (err) {
      console.warn('ensureFile: could not create schedules file:', (err as Error).message);
    }
  }
}

export async function readSchedules(): Promise<StoredSchedule[]> {
  await ensureFile();
  const raw = await fs.readFile(SCHEDULE_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}

export async function writeSchedules(schedules: StoredSchedule[]) {
  await ensureFile();
  await fs.writeFile(SCHEDULE_PATH, JSON.stringify(schedules, null, 2), 'utf8');
}
