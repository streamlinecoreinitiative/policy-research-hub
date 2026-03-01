import path from 'path';
import { runAgents } from './agents-v2';
import { uploadFileToDrive } from './drive';
import { readSchedules, writeSchedules, StoredSchedule } from './storage';
import { addLogEntry } from './processLog';

const CHECK_INTERVAL_MS = 60_000;

let initialized = false;
let schedules: StoredSchedule[] = [];
const runningIds = new Set<string>();

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function persist() {
  await writeSchedules(schedules);
}

async function processSchedule(s: StoredSchedule) {
  if (runningIds.has(s.id)) return;
  const now = Date.now();
  if (s.nextRunAt > now) return;
  runningIds.add(s.id);

  try {
    addLogEntry({
      type: 'schedule',
      status: 'running',
      title: `Schedule run: ${s.topic.substring(0, 60)}`,
      details: `Schedule ${s.id} triggered. Models: ${s.plannerModel}/${s.writerModel}`,
    }).catch(() => {});

    const result = await runAgents({
      topic: s.topic,
      plannerModel: s.plannerModel,
      writerModel: s.writerModel
    });

    let driveRes:
      | { fileId?: string; webViewLink?: string; fileName?: string }
      | undefined;

    if (s.autoUpload && s.drive) {
      try {
        // Upload the HTML version for better formatting
        const htmlPath = result.articlePathHTML;
        const resolved = path.isAbsolute(htmlPath)
          ? htmlPath
          : path.join(process.cwd(), htmlPath);
        const uploaded = await uploadFileToDrive({
          filePath: resolved,
          drive: s.drive,
          mimeType: 'text/html'
        });
        driveRes = {
          fileId: uploaded.id || undefined,
          webViewLink: uploaded.webViewLink || undefined,
          fileName: uploaded.name || undefined
        };
      } catch (err) {
        driveRes = { fileName: undefined, fileId: undefined, webViewLink: undefined };
        result.warnings.push(
          `Drive upload failed for schedule ${s.id}: ${(err as Error).message}`
        );
      }
    }

    s.lastRunAt = now;
    s.lastResult = {
      articlePath: result.articlePath,
      fileId: driveRes?.fileId,
      webViewLink: driveRes?.webViewLink,
      ranAt: now
    };
  } catch (err) {
    addLogEntry({
      type: 'schedule',
      status: 'error',
      title: `Schedule failed: ${s.topic.substring(0, 60)}`,
      details: (err as Error).message,
    }).catch(() => {});
    s.lastRunAt = now;
    s.lastResult = {
      error: (err as Error).message,
      ranAt: now
    };
  } finally {
    s.nextRunAt = Date.now() + s.intervalMinutes * 60_000;
    runningIds.delete(s.id);
    await persist();
  }
}

async function tick() {
  const now = Date.now();
  const due = schedules.filter((s) => s.nextRunAt <= now);
  for (const s of due) {
    void processSchedule(s);
  }
}

export async function initScheduler() {
  if (initialized) return;
  initialized = true;
  schedules = await readSchedules();

  // Auto-fix model names if they reference removed models
  let needsPersist = false;
  for (const s of schedules) {
    if (!s.plannerModel.startsWith('qwen3')) {
      s.plannerModel = 'qwen3:4b';
      needsPersist = true;
    }
    if (!s.writerModel.startsWith('qwen3')) {
      s.writerModel = 'qwen3:8b';
      needsPersist = true;
    }
  }
  if (needsPersist) {
    await persist();
    addLogEntry({
      type: 'system',
      status: 'warning',
      title: 'Auto-fixed schedule model references',
      details: 'Updated stale model names to qwen3:4b/qwen3:8b on scheduler init',
    }).catch(() => {});
  }

  setInterval(() => void tick(), CHECK_INTERVAL_MS);
}

export async function listSchedules() {
  await initScheduler();
  return schedules;
}

export async function addSchedule(params: {
  topic: string;
  plannerModel: string;
  writerModel: string;
  intervalMinutes: number;
  autoUpload: boolean;
  drive?: StoredSchedule['drive'];
}) {
  const { topic, plannerModel, writerModel, intervalMinutes, autoUpload, drive } = params;
  const now = Date.now();
  const newSchedule: StoredSchedule = {
    id: genId(),
    topic,
    plannerModel,
    writerModel,
    autoUpload,
    drive: drive && autoUpload ? drive : undefined,
    intervalMinutes: Math.max(15, intervalMinutes),
    nextRunAt: now + intervalMinutes * 60_000
  };
  await initScheduler();
  schedules.push(newSchedule);
  await persist();
  return newSchedule;
}

export async function removeSchedule(id: string) {
  await initScheduler();
  schedules = schedules.filter((s) => s.id !== id);
  await persist();
}
