import path from 'path';
import { runAgents } from './agents-v2';
import { uploadFileToDrive, getEnvDriveCredentials } from './drive';
import { readSchedules, writeSchedules, StoredSchedule } from './storage';
import { addLogEntry } from './processLog';
import { updateArticleDrive } from './articleIndex';
import { autoCommitAndPush } from './autoPublish';
import { resolveQwenModel } from './ollama';

const CHECK_INTERVAL_MS = 60_000;
export const MIN_SCHEDULE_INTERVAL_MINUTES = 30;
export const MAX_SCHEDULE_INTERVAL_MINUTES = 60;

// Use globalThis to survive Next.js hot reloads in dev mode
const GLOBAL_INTERVAL_KEY = '__scheduler_interval__';
const GLOBAL_RUNNING_IDS_KEY = '__scheduler_running_ids__';
const GLOBAL_PERSIST_LOCK_KEY = '__scheduler_persist_lock__';
let schedules: StoredSchedule[] = [];
const runningIds: Set<string> =
  (globalThis as any)[GLOBAL_RUNNING_IDS_KEY] ||
  ((globalThis as any)[GLOBAL_RUNNING_IDS_KEY] = new Set<string>());

function clampIntervalMinutes(intervalMinutes: number) {
  return Math.max(MIN_SCHEDULE_INTERVAL_MINUTES, Math.min(MAX_SCHEDULE_INTERVAL_MINUTES, Math.round(intervalMinutes)));
}

function isQwen3Family(model?: string) {
  return !!model && /qwen3(\.5)?/i.test(model);
}

async function ensureScheduledQwenModel(model: string | undefined, role: 'planner' | 'writer') {
  const defaultModel = role === 'planner' ? 'qwen3.5:4b' : 'qwen3.5:9b';
  const preferred = isQwen3Family(model) ? (model as string) : defaultModel;
  return resolveQwenModel(preferred, role);
}

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

async function persist() {
  const g = globalThis as any;
  const prev: Promise<void> = g[GLOBAL_PERSIST_LOCK_KEY] || Promise.resolve();
  let release!: () => void;
  g[GLOBAL_PERSIST_LOCK_KEY] = new Promise<void>((resolve) => {
    release = resolve;
  });

  await prev;
  try {
    // Merge with disk to avoid stale in-memory snapshots overwriting newer run state.
    const disk = await readSchedules().catch(() => [] as StoredSchedule[]);
    const byId = new Map(disk.map((s) => [s.id, s] as const));
    const merged = schedules.map((mem) => {
      const existing = byId.get(mem.id);
      if (!existing) return mem;
      const memLast = mem.lastRunAt || 0;
      const diskLast = existing.lastRunAt || 0;
      if (diskLast <= memLast) return mem;
      return {
        ...mem,
        lastRunAt: existing.lastRunAt,
        lastResult: existing.lastResult,
        nextRunAt: existing.nextRunAt || mem.nextRunAt
      };
    });

    for (const existing of disk) {
      if (!merged.some((m) => m.id === existing.id)) {
        merged.push(existing);
      }
    }

    schedules = merged;
    await writeSchedules(merged);
  } finally {
    release();
  }
}

async function processSchedule(s: StoredSchedule) {
  if (runningIds.has(s.id)) return;
  if (s.paused) return;
  const startedAt = Date.now();
  if (s.nextRunAt > startedAt) return;
  runningIds.add(s.id);
  let runSucceeded = false;
  s.intervalMinutes = clampIntervalMinutes(s.intervalMinutes || MIN_SCHEDULE_INTERVAL_MINUTES);

  try {
    const plannerModel = await ensureScheduledQwenModel(s.plannerModel, 'planner');
    const writerModel = await ensureScheduledQwenModel(s.writerModel, 'writer');
    if (plannerModel !== s.plannerModel || writerModel !== s.writerModel) {
      addLogEntry({
        type: 'system',
        status: 'warning',
        title: 'Adjusted schedule models to available Qwen variants',
        details: `Schedule ${s.id}: ${s.plannerModel}/${s.writerModel} → ${plannerModel}/${writerModel}`,
      }).catch(() => {});
      s.plannerModel = plannerModel;
      s.writerModel = writerModel;
    }

    addLogEntry({
      type: 'schedule',
      status: 'running',
      title: `Schedule run: ${s.topic.substring(0, 60)}`,
      details: `Schedule ${s.id} triggered. Models: ${plannerModel}/${writerModel}`,
    }).catch(() => {});

    const result = await runAgents({
      topic: s.topic,
      plannerModel,
      writerModel
    });

    let driveRes:
      | { fileId?: string; webViewLink?: string; fileName?: string }
      | undefined;

    if (s.autoUpload) {
      const creds = s.drive || getEnvDriveCredentials();
      if (!creds) {
        const warn = `Drive upload skipped for schedule ${s.id}: autoUpload is enabled but credentials are missing.`;
        result.warnings.push(warn);
        addLogEntry({
          type: 'schedule',
          status: 'warning',
          title: `Drive upload skipped: ${s.topic.substring(0, 60)}`,
          details: warn,
        }).catch(() => {});
      } else {
        try {
          // Upload the HTML version for better formatting
          const htmlPath = result.articlePathHTML;
          const resolved = path.isAbsolute(htmlPath)
            ? htmlPath
            : path.join(process.cwd(), htmlPath);
          const uploaded = await uploadFileToDrive({
            filePath: resolved,
            drive: creds,
            mimeType: 'text/html'
          });
          driveRes = {
            fileId: uploaded.id || undefined,
            webViewLink: uploaded.webViewLink || undefined,
            fileName: uploaded.name || undefined
          };

          // Update the article index with Drive metadata
          if (driveRes.fileId) {
            const slug = path.basename(result.articlePath, '.md');
            try {
              await updateArticleDrive(slug, driveRes.fileId, driveRes.webViewLink);
            } catch (indexErr) {
              result.warnings.push(
                `Drive index update failed: ${(indexErr as Error).message}`
              );
            }
          }
        } catch (err) {
          driveRes = { fileName: undefined, fileId: undefined, webViewLink: undefined };
          result.warnings.push(
            `Drive upload failed for schedule ${s.id}: ${(err as Error).message}`
          );
        }
      }
    }

    const finishedAt = Date.now();
    s.lastRunAt = finishedAt;
    s.lastResult = {
      articlePath: result.articlePath,
      fileId: driveRes?.fileId,
      webViewLink: driveRes?.webViewLink,
      ranAt: finishedAt
    };
    runSucceeded = true;
  } catch (err) {
    const message = (err as Error).message;
    addLogEntry({
      type: 'schedule',
      status: 'error',
      title: `Schedule failed: ${s.topic.substring(0, 60)}`,
      details: message,
    }).catch(() => {});
    const failedAt = Date.now();
    s.lastRunAt = failedAt;
    s.lastResult = {
      error: message,
      ranAt: failedAt
    };
  } finally {
    // Keep cadence anchored to run-start time; if processing overruns, run again soon.
    const targetFromStart = startedAt + s.intervalMinutes * 60_000;
    s.nextRunAt = Math.max(targetFromStart, Date.now() + CHECK_INTERVAL_MS);
    runningIds.delete(s.id);
    await persist();

    // Auto-commit only after successful generation.
    if (runSucceeded) {
      try {
        await autoCommitAndPush();
      } catch (commitErr) {
        addLogEntry({
          type: 'system',
          status: 'error',
          title: 'Auto-commit failed',
          details: (commitErr as Error).message,
        }).catch(() => {});
      }
    }
  }
}

async function tick() {
  // Re-read schedules from disk only if nothing is currently running
  // (avoids overwriting in-memory refs that processSchedule is updating)
  if (runningIds.size === 0) {
    try { schedules = await readSchedules(); } catch {}
  }
  const now = Date.now();
  const due = schedules.filter((s) => !s.paused && s.nextRunAt <= now);
  for (const s of due) {
    void processSchedule(s);
  }
}

export async function initScheduler() {
  // Always reload schedules from disk (survives hot reloads)
  schedules = await readSchedules();

  // Normalize schedule constraints.
  let needsPersist = false;
  for (const s of schedules) {
    const clamped = clampIntervalMinutes(s.intervalMinutes || MIN_SCHEDULE_INTERVAL_MINUTES);
    if (s.intervalMinutes !== clamped) {
      s.intervalMinutes = clamped;
      needsPersist = true;
    }
    if (!s.plannerModel) {
      s.plannerModel = 'qwen3.5:4b';
      needsPersist = true;
    } else if (!isQwen3Family(s.plannerModel)) {
      s.plannerModel = 'qwen3.5:4b';
      needsPersist = true;
    }
    if (!s.writerModel) {
      s.writerModel = 'qwen3.5:9b';
      needsPersist = true;
    } else if (!isQwen3Family(s.writerModel)) {
      s.writerModel = 'qwen3.5:9b';
      needsPersist = true;
    }
    if (!Number.isFinite(s.nextRunAt) || s.nextRunAt <= 0) {
      s.nextRunAt = Date.now() + s.intervalMinutes * 60_000;
      needsPersist = true;
    }
  }
  if (needsPersist) {
    await persist();
    addLogEntry({
      type: 'system',
      status: 'warning',
      title: 'Normalized schedule configuration',
      details: 'Applied interval bounds (30-60 min) and ensured default model/next-run values.',
    }).catch(() => {});
  }

  // Ensure exactly one live interval exists across hot reloads.
  if (!(globalThis as any)[GLOBAL_INTERVAL_KEY]) {
    (globalThis as any)[GLOBAL_INTERVAL_KEY] = setInterval(() => void tick(), CHECK_INTERVAL_MS);
  }

  // Process overdue schedules immediately on init.
  void tick();
}

export async function listSchedules() {
  await initScheduler();
  // Always return fresh from disk
  return readSchedules();
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
  const normalizedInterval = clampIntervalMinutes(intervalMinutes);
  const normalizedPlannerModel = await ensureScheduledQwenModel(plannerModel, 'planner');
  const normalizedWriterModel = await ensureScheduledQwenModel(writerModel, 'writer');
  const newSchedule: StoredSchedule = {
    id: genId(),
    topic,
    plannerModel: normalizedPlannerModel,
    writerModel: normalizedWriterModel,
    autoUpload,
    drive: drive && autoUpload ? drive : undefined,
    intervalMinutes: normalizedInterval,
    nextRunAt: now + normalizedInterval * 60_000
  };
  await initScheduler();
  schedules.push(newSchedule);
  await persist();
  return newSchedule;
}

export async function pauseSchedule(id: string) {
  await initScheduler();
  const fresh = await readSchedules();
  const target = fresh.find((s) => s.id === id);
  if (!target) throw new Error(`Schedule ${id} not found`);
  target.paused = true;
  schedules = fresh;
  await persist();
  addLogEntry({
    type: 'schedule',
    status: 'info',
    title: `Schedule paused: ${target.topic.substring(0, 60)}`,
    details: `Schedule ${id} paused by user.`,
  }).catch(() => {});
  return target;
}

export async function resumeSchedule(id: string) {
  await initScheduler();
  const fresh = await readSchedules();
  const target = fresh.find((s) => s.id === id);
  if (!target) throw new Error(`Schedule ${id} not found`);
  target.intervalMinutes = clampIntervalMinutes(target.intervalMinutes || MIN_SCHEDULE_INTERVAL_MINUTES);
  target.paused = false;
  // Reset nextRunAt so it doesn't fire immediately for all missed ticks
  target.nextRunAt = Date.now() + target.intervalMinutes * 60_000;
  schedules = fresh;
  await persist();
  addLogEntry({
    type: 'schedule',
    status: 'info',
    title: `Schedule resumed: ${target.topic.substring(0, 60)}`,
    details: `Schedule ${id} resumed. Next run in ${target.intervalMinutes} minutes.`,
  }).catch(() => {});
  return target;
}

export async function removeSchedule(id: string) {
  await initScheduler();
  schedules = schedules.filter((s) => s.id !== id);
  await persist();
}
