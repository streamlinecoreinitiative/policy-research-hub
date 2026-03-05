import { NextResponse } from 'next/server';
import { getLogEntries, getLogStats, addLogEntry } from '@/lib/processLog';
import { getQueuedPosts } from '@/lib/socialPostAgent';
import { getNewsletters, getSubscriberCount } from '@/lib/newsletterAgent';
import { getPublishedArticles, readIndex } from '@/lib/articleIndex';
import { maskCredentials, readCredentials } from '@/lib/socialCredentials';
import { getEnvDriveCredentials } from '@/lib/drive';
import {
  MIN_SCHEDULE_INTERVAL_MINUTES,
  MAX_SCHEDULE_INTERVAL_MINUTES
} from '@/lib/scheduler';
import { resolveQwenModel } from '@/lib/ollama';
import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

/**
 * GET /api/admin/status — Full system overview for the admin dashboard.
 * Returns stats on articles, social queue, newsletters, subscribers, schedules, logs.
 */
export async function GET(req: Request) {
  // Localhost-only guard
  const host = req.headers.get('host') || '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  if (!isLocal) {
    return NextResponse.json({ error: 'Admin access is only available on localhost' }, { status: 403 });
  }

  try {
    // Parallel fetch of all data
    const [
      logStats,
      recentLogs,
      socialPosts,
      newsletters,
      subscriberCount,
      articlesData,
      fullIndex,
      schedules,
      autoPublishLog,
      ollamaStatus,
      socialCreds,
    ] = await Promise.all([
      getLogStats(),
      getLogEntries({ limit: 100 }),
      getQueuedPosts().catch(() => []),
      getNewsletters().catch(() => []),
      getSubscriberCount().catch(() => 0),
      getPublishedArticles({ limit: 5 }).catch(() => ({ articles: [], total: 0 })),
      readIndex().catch(() => ({ articles: [] as any[], lastUpdated: '', totalPublished: 0 })),
      readSchedules(),
      readAutoPublishLog(),
      checkOllamaStatus(),
      readCredentials().catch(() => ({ updatedAt: '' })),
    ]);

    const pendingSocial = (socialPosts as any[]).filter((p: any) => p.status === 'pending').length;
    const postedSocial = (socialPosts as any[]).filter((p: any) => p.status === 'posted').length;
    const skippedSocial = (socialPosts as any[]).filter((p: any) => p.status === 'skipped').length;

    // Determine agent statuses from recent logs
    const runningLogs = (recentLogs as any[]).filter((l: any) => l.status === 'running');
    const writerRunning = runningLogs.some((l: any) =>
      l.type === 'pipeline-run' || l.type === 'schedule'
    );
    const reviewerRunning = runningLogs.some((l: any) =>
      l.title?.toLowerCase().includes('fact-check') || l.title?.toLowerCase().includes('qa')
    );
    const socialRunning = runningLogs.some((l: any) =>
      l.type === 'social-post'
    );

    // Check last activity times
    const allLogs = recentLogs as any[];
    const lastWriterLog = allLogs.find((l: any) => l.type === 'pipeline-run' || l.type === 'schedule');
    const lastReviewerLog = allLogs.find((l: any) => l.type === 'pipeline-run' && l.details?.includes('quality'));
    const lastSocialLog = allLogs.find((l: any) => l.type === 'social-post' || (l.type === 'pipeline-run' && l.details?.includes('social')));

    return NextResponse.json({
      isLocal,
      agents: {
        writer: {
          name: 'Writer Agent',
          status: writerRunning ? 'active' : 'idle',
          model: 'qwen3.5:4b / qwen3.5:9b',
          role: 'Research, planning & writing articles',
          lastActivity: lastWriterLog?.timestamp || null,
          lastTitle: lastWriterLog?.title || null,
        },
        reviewer: {
          name: 'Review Agent',
          status: writerRunning ? 'active' : 'idle', // reviewer runs during pipeline
          model: 'bespoke-minicheck:7b',
          role: 'Fact-checking & QA validation',
          lastActivity: lastReviewerLog?.timestamp || lastWriterLog?.timestamp || null,
          lastTitle: lastReviewerLog?.title || null,
        },
        social: {
          name: 'Social Agent',
          status: socialRunning ? 'active' : 'idle',
          model: 'qwen3.5:4b',
          role: 'Generates social media posts',
          lastActivity: lastSocialLog?.timestamp || null,
          lastTitle: lastSocialLog?.title || null,
          pendingPosts: pendingSocial,
        },
      },
      socialCredentials: isLocal ? maskCredentials(socialCreds as any) : null,
      system: {
        ollamaRunning: ollamaStatus.running,
        ollamaModels: ollamaStatus.models,
        autoPublishConfigured: true, // script exists
        lastAutoPublish: autoPublishLog.lastEntry,
        autoPublishLog: autoPublishLog.entries,
      },
      articles: {
        total: articlesData.total,
        onDrive: (fullIndex as any).articles.filter((a: any) => a.driveFileId).length,
        recent: (articlesData as any).articles.map((a: any) => ({
          title: a.title,
          slug: a.slug,
          publishedAt: a.publishedAt,
          status: a.status,
          wordCount: a.wordCount,
        })),
      },
      social: {
        total: socialPosts.length,
        pending: pendingSocial,
        posted: postedSocial,
        skipped: skippedSocial,
        posts: socialPosts.slice(0, 30), // Last 30
      },
      newsletters: {
        total: newsletters.length,
        drafts: (newsletters as any[]).filter((n: any) => n.status === 'draft').length,
        sent: (newsletters as any[]).filter((n: any) => n.status === 'sent').length,
        list: newsletters.slice(0, 10),
      },
      subscribers: {
        count: subscriberCount,
      },
      schedules: {
        active: schedules.filter((s: any) => !s.paused).length,
        paused: schedules.filter((s: any) => s.paused).length,
        envDriveConfigured: !!getEnvDriveCredentials(),
        list: schedules.map((s: any) => ({
          ...s,
          drive: s.drive ? {
            clientId: s.drive.clientId ? s.drive.clientId.substring(0, 12) + '...' : '',
            clientSecret: s.drive.clientSecret ? '••••' + s.drive.clientSecret.slice(-4) : '',
            refreshToken: s.drive.refreshToken ? '••••' + s.drive.refreshToken.slice(-8) : '',
            folderId: s.drive.folderId || '',
            configured: !!(s.drive.clientId && s.drive.clientSecret && s.drive.refreshToken),
          } : { configured: !!getEnvDriveCredentials(), source: 'env' },
        })),
      },
      logs: {
        stats: logStats,
        recent: recentLogs,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

async function readSchedules() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'data/schedules.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function readAutoPublishLog(): Promise<{ entries: string[]; lastEntry: string | null }> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), 'data/auto-publish.log'), 'utf8');
    const lines = raw.trim().split('\n').filter(l => l.trim());
    return {
      entries: lines.slice(-20), // Last 20 entries
      lastEntry: lines[lines.length - 1] || null,
    };
  } catch {
    return { entries: [], lastEntry: null };
  }
}

async function checkOllamaStatus(): Promise<{ running: boolean; models: string[] }> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { running: false, models: [] };
    const data = await res.json();
    const models = (data.models || []).map((m: { name: string }) => m.name);
    return { running: true, models };
  } catch {
    return { running: false, models: [] };
  }
}

/**
 * POST /api/admin/status — Log a manual entry or trigger actions
 */
export async function POST(req: Request) {
  const host = req.headers.get('host') || '';
  const isLocal = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  if (!isLocal) {
    return NextResponse.json({ error: 'Admin access is only available on localhost' }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === 'log') {
      const entry = await addLogEntry({
        type: body.type || 'system',
        status: body.status || 'info',
        title: body.title || 'Manual log entry',
        details: body.details,
      });
      return NextResponse.json({ entry });
    }

    if (action === 'fix-schedule') {
      // Fix broken schedules by normalizing interval bounds and Qwen model variants.
      const schedulesPath = path.join(process.cwd(), 'data/schedules.json');
      const raw = await fs.readFile(schedulesPath, 'utf8');
      const schedules = JSON.parse(raw);
      let fixed = 0;
      for (const s of schedules) {
        const clamped = Math.max(
          MIN_SCHEDULE_INTERVAL_MINUTES,
          Math.min(MAX_SCHEDULE_INTERVAL_MINUTES, Number(s.intervalMinutes || MIN_SCHEDULE_INTERVAL_MINUTES))
        );
        if (s.intervalMinutes !== clamped) {
          s.intervalMinutes = clamped;
          fixed++;
        }

        const plannerRequested = /qwen3(\.5)?/i.test(String(s.plannerModel || ''))
          ? s.plannerModel
          : 'qwen3.5:4b';
        const writerRequested = /qwen3(\.5)?/i.test(String(s.writerModel || ''))
          ? s.writerModel
          : 'qwen3.5:9b';
        if (plannerRequested !== s.plannerModel) fixed++;
        if (writerRequested !== s.writerModel) fixed++;

        const plannerResolved = await resolveQwenModel(plannerRequested, 'planner');
        const writerResolved = await resolveQwenModel(writerRequested, 'writer');
        if (plannerResolved !== s.plannerModel) {
          s.plannerModel = plannerResolved;
          fixed++;
        }
        if (writerResolved !== s.writerModel) {
          s.writerModel = writerResolved;
          fixed++;
        }
      }
      await fs.writeFile(schedulesPath, JSON.stringify(schedules, null, 2), 'utf8');
      await addLogEntry({
        type: 'system',
        status: 'success',
        title: `Normalized ${fixed} schedule setting(s)`,
        details: `Applied interval bounds (${MIN_SCHEDULE_INTERVAL_MINUTES}-${MAX_SCHEDULE_INTERVAL_MINUTES} min) and resolved available Qwen planner/writer models.`,
      });
      return NextResponse.json({ success: true, fixed, schedules });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
