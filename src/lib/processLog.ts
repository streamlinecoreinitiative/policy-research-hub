/**
 * Process Log — Unified logging for all agent activities.
 * Tracks pipeline runs, auto-publishes, social posts, newsletter generation,
 * schedule executions, and errors. Everything in one place.
 */

import fs from 'fs/promises';
import path from 'path';

const LOG_PATH = path.join(process.cwd(), 'data/process-log.json');
const MAX_ENTRIES = 500;

export type ProcessLogEntry = {
  id: string;
  timestamp: string;
  type: 'pipeline-run' | 'auto-publish' | 'social-post' | 'newsletter' | 'schedule' | 'error' | 'system';
  status: 'success' | 'warning' | 'error' | 'info' | 'running';
  title: string;
  details?: string;
  meta?: Record<string, unknown>;
};

export type ProcessLog = {
  entries: ProcessLogEntry[];
  lastUpdated: string;
};

async function readLog(): Promise<ProcessLog> {
  try {
    const raw = await fs.readFile(LOG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { entries: [], lastUpdated: new Date().toISOString() };
  }
}

async function writeLog(log: ProcessLog): Promise<void> {
  log.lastUpdated = new Date().toISOString();
  // Keep only the last MAX_ENTRIES
  if (log.entries.length > MAX_ENTRIES) {
    log.entries = log.entries.slice(0, MAX_ENTRIES);
  }
  await fs.mkdir(path.dirname(LOG_PATH), { recursive: true });
  await fs.writeFile(LOG_PATH, JSON.stringify(log, null, 2), 'utf8');
}

export async function addLogEntry(entry: Omit<ProcessLogEntry, 'id' | 'timestamp'>): Promise<ProcessLogEntry> {
  const log = await readLog();
  const full: ProcessLogEntry = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  };
  log.entries.unshift(full); // newest first
  await writeLog(log);
  return full;
}

export async function getLogEntries(opts?: {
  type?: string;
  status?: string;
  limit?: number;
}): Promise<ProcessLogEntry[]> {
  const log = await readLog();
  let entries = log.entries;
  if (opts?.type) entries = entries.filter(e => e.type === opts.type);
  if (opts?.status) entries = entries.filter(e => e.status === opts.status);
  if (opts?.limit) entries = entries.slice(0, opts.limit);
  return entries;
}

export async function getLogStats(): Promise<{
  total: number;
  last24h: number;
  last7d: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  lastActivity: string | null;
}> {
  const log = await readLog();
  const now = Date.now();
  const h24 = now - 24 * 60 * 60 * 1000;
  const d7 = now - 7 * 24 * 60 * 60 * 1000;

  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  let last24h = 0;
  let last7d = 0;

  for (const e of log.entries) {
    const t = new Date(e.timestamp).getTime();
    if (t >= h24) last24h++;
    if (t >= d7) last7d++;
    byType[e.type] = (byType[e.type] || 0) + 1;
    byStatus[e.status] = (byStatus[e.status] || 0) + 1;
  }

  return {
    total: log.entries.length,
    last24h,
    last7d,
    byType,
    byStatus,
    lastActivity: log.entries[0]?.timestamp || null,
  };
}
