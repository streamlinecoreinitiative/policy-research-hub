import { NextResponse } from 'next/server';
import { getLogEntries, getLogStats, addLogEntry } from '@/lib/processLog';
import { getQueuedPosts } from '@/lib/socialPostAgent';
import { getNewsletters, getSubscriberCount } from '@/lib/newsletterAgent';
import { getPublishedArticles } from '@/lib/articleIndex';
import { maskCredentials, readCredentials } from '@/lib/socialCredentials';
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
          model: 'qwen3:4b / qwen3:8b',
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
          model: 'qwen3:4b',
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
        active: schedules.length,
        list: schedules.map((s: any) => ({
          ...s,
          drive: s.drive ? {
            clientId: s.drive.clientId ? s.drive.clientId.substring(0, 12) + '...' : '',
            clientSecret: s.drive.clientSecret ? '••••' + s.drive.clientSecret.slice(-4) : '',
            refreshToken: s.drive.refreshToken ? '••••' + s.drive.refreshToken.slice(-8) : '',
            folderId: s.drive.folderId || '',
            configured: !!(s.drive.clientId && s.drive.clientSecret && s.drive.refreshToken),
          } : null,
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
      // Fix broken schedules by updating models
      const schedulesPath = path.join(process.cwd(), 'data/schedules.json');
      const raw = await fs.readFile(schedulesPath, 'utf8');
      const schedules = JSON.parse(raw);
      let fixed = 0;
      for (const s of schedules) {
        if (s.plannerModel === 'qwen2.5:3b' || !s.plannerModel.includes('qwen3')) {
          s.plannerModel = 'qwen3:4b';
          fixed++;
        }
        if (s.writerModel === 'llama3.1:8b' || s.writerModel === 'llama3:8b') {
          s.writerModel = 'qwen3:8b';
          fixed++;
        }
        if (!s.factCheckerModel) {
          s.factCheckerModel = 'bespoke-minicheck:7b';
          fixed++;
        }
      }
      await fs.writeFile(schedulesPath, JSON.stringify(schedules, null, 2), 'utf8');
      await addLogEntry({
        type: 'system',
        status: 'success',
        title: `Fixed ${fixed} schedule model references`,
        details: 'Updated to qwen3:4b (planner), qwen3:8b (writer), bespoke-minicheck:7b (fact-checker)',
      });
      return NextResponse.json({ success: true, fixed, schedules });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
