/**
 * Auto-Publish: commits new articles to GitHub, triggering Vercel deploy.
 * Called by the scheduler after successful article generation.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { addLogEntry } from './processLog';

const execAsync = promisify(exec);

const REPO_DIR = process.cwd();

// Debounce: don't commit more often than every 2 minutes
let lastCommitTime = 0;
const MIN_COMMIT_INTERVAL_MS = 2 * 60_000;

export async function autoCommitAndPush(): Promise<{
  committed: boolean;
  message?: string;
  error?: string;
}> {
  const now = Date.now();
  if (now - lastCommitTime < MIN_COMMIT_INTERVAL_MS) {
    return { committed: false, message: 'Skipped: too soon since last commit' };
  }

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

    const newCount = changedLines.length;

    // Stage article data files
    await execAsync(
      'git add data/output/ data/articles-index.json data/recent_titles.json data/recent_outlines.json 2>/dev/null; git add -A data/ 2>/dev/null',
      { cwd: REPO_DIR }
    );

    // Commit
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 16);
    const commitMsg = `Auto-publish: ${newCount} new/updated files — ${timestamp}`;
    await execAsync(`git commit -m "${commitMsg}"`, { cwd: REPO_DIR });

    // Push
    await execAsync('git push origin main', { cwd: REPO_DIR });

    lastCommitTime = Date.now();

    addLogEntry({
      type: 'system',
      status: 'success',
      title: `Auto-published ${newCount} changes`,
      details: `Committed and pushed to GitHub. Vercel will deploy automatically.`,
    }).catch(() => {});

    return { committed: true, message: commitMsg };
  } catch (err) {
    const errorMsg = (err as Error).message;

    addLogEntry({
      type: 'system',
      status: 'error',
      title: 'Auto-publish failed',
      details: errorMsg,
    }).catch(() => {});

    return { committed: false, error: errorMsg };
  }
}
