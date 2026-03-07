/**
 * Auto-Publish: batches generated article changes before pushing to GitHub,
 * reducing Vercel deploy churn from high-frequency schedules.
 */

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { addLogEntry } from './processLog';

const execAsync = promisify(exec);

const REPO_DIR = process.cwd();
const STATE_PATH = path.join(REPO_DIR, 'data/auto-publish-state.json');

type AutoPublishState = {
  pendingRuns: number;
  firstPendingAt: number | null;
  lastCommitAt: number | null;
};

const DEFAULT_BATCH_SIZE = 4;
const DEFAULT_MAX_DELAY_MINUTES = 180;
const DEFAULT_MIN_COMMIT_INTERVAL_MINUTES = 15;

function readPositiveInt(envValue: string | undefined, fallback: number) {
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function getBatchSize() {
  return readPositiveInt(process.env.AUTO_PUBLISH_BATCH_SIZE, DEFAULT_BATCH_SIZE);
}

function getMaxDelayMs() {
  return readPositiveInt(process.env.AUTO_PUBLISH_MAX_DELAY_MINUTES, DEFAULT_MAX_DELAY_MINUTES) * 60_000;
}

function getMinCommitIntervalMs() {
  return readPositiveInt(
    process.env.AUTO_PUBLISH_MIN_COMMIT_INTERVAL_MINUTES,
    DEFAULT_MIN_COMMIT_INTERVAL_MINUTES
  ) * 60_000;
}

async function readState(): Promise<AutoPublishState> {
  try {
    const raw = await fs.readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      pendingRuns: Number(parsed.pendingRuns) || 0,
      firstPendingAt: Number(parsed.firstPendingAt) || null,
      lastCommitAt: Number(parsed.lastCommitAt) || null,
    };
  } catch {
    return {
      pendingRuns: 0,
      firstPendingAt: null,
      lastCommitAt: null,
    };
  }
}

async function writeState(state: AutoPublishState) {
  await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

export async function autoCommitAndPush(): Promise<{
  committed: boolean;
  message?: string;
  error?: string;
}> {
  const now = Date.now();

  try {
    // Check for changes in data/ directory
    const { stdout: changes } = await execAsync(
      'git status --porcelain data/output/ data/articles-index.json data/recent_titles.json data/recent_outlines.json 2>/dev/null',
      { cwd: REPO_DIR }
    );

    if (!changes.trim()) {
      return { committed: false, message: 'No new articles to publish' };
    }

    const changedLines = changes.trim().split('\n');
    const changedPaths = changedLines
      .map((line) => line.slice(3).trim())
      .filter(Boolean);

    const hasPublishArtifacts = changedPaths.some((p) =>
      p.startsWith('data/output/') ||
      p === 'data/articles-index.json' ||
      p === 'data/recent_titles.json'
    );
    if (!hasPublishArtifacts) {
      return { committed: false, message: 'Only non-publish metadata changed; skipping push' };
    }

    const state = await readState();
    state.pendingRuns += 1;
    state.firstPendingAt = state.firstPendingAt || now;

    const batchSize = getBatchSize();
    const maxDelayMs = getMaxDelayMs();
    const minCommitIntervalMs = getMinCommitIntervalMs();
    const pendingAgeMs = now - state.firstPendingAt;
    const commitDueToBatch = state.pendingRuns >= batchSize;
    const commitDueToAge = pendingAgeMs >= maxDelayMs;

    if (!commitDueToBatch && !commitDueToAge) {
      await writeState(state);
      const message = `Queued ${state.pendingRuns}/${batchSize} publish run(s); next deploy when batch fills or after ${Math.round(maxDelayMs / 60_000)} minutes`;
      addLogEntry({
        type: 'auto-publish',
        status: 'info',
        title: 'Auto-publish queued',
        details: message,
        meta: {
          pendingRuns: state.pendingRuns,
          batchSize,
          pendingAgeMinutes: Math.round(pendingAgeMs / 60_000),
        },
      }).catch(() => {});
      return { committed: false, message };
    }

    if (state.lastCommitAt && now - state.lastCommitAt < minCommitIntervalMs) {
      await writeState(state);
      return { committed: false, message: 'Skipped: minimum deploy interval has not elapsed' };
    }

    const newCount = changedLines.length;

    // Stage article data files
    await execAsync(
      'git add data/output/ data/articles-index.json data/recent_titles.json data/recent_outlines.json 2>/dev/null',
      { cwd: REPO_DIR }
    );

    // Commit
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const commitMsg = `Auto-publish: ${newCount} new/updated files — ${timestamp}`;
    await execAsync(`git commit -m "${commitMsg}"`, { cwd: REPO_DIR });

    // Push
    await execAsync('git push origin main', { cwd: REPO_DIR });

    state.pendingRuns = 0;
    state.firstPendingAt = null;
    state.lastCommitAt = Date.now();
    await writeState(state);

    addLogEntry({
      type: 'auto-publish',
      status: 'success',
      title: `Auto-published ${newCount} changes`,
      details: `Committed and pushed to GitHub after batching ${commitDueToBatch ? 'by count' : 'by max delay'}. Vercel will deploy automatically.`,
      meta: {
        batchSize,
        pendingRuns: state.pendingRuns,
      },
    }).catch(() => {});

    return { committed: true, message: commitMsg };
  } catch (err) {
    const errorMsg = (err as Error).message;

    addLogEntry({
      type: 'auto-publish',
      status: 'error',
      title: 'Auto-publish failed',
      details: errorMsg,
    }).catch(() => {});

    return { committed: false, error: errorMsg };
  }
}
