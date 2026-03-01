/**
 * Social Post Agent
 * 
 * Auto-generates platform-specific social media posts from published articles.
 * Posts are saved to a review queue (data/social-queue.json).
 * Supports: Twitter/X, LinkedIn, Bluesky
 */

import fs from 'fs/promises';
import path from 'path';
import { callOllamaChat } from './ollama';

const QUEUE_PATH = path.join(process.cwd(), 'data/social-queue.json');

type SocialPostInput = {
  title: string;
  topic: string;
  template: string;
  slug: string;
};

export type SocialPost = {
  id: string;
  articleSlug: string;
  articleTitle: string;
  platform: 'twitter' | 'linkedin' | 'bluesky';
  content: string;
  hashtags: string[];
  url: string;
  status: 'pending' | 'posted' | 'skipped';
  createdAt: string;
  postedAt?: string;
};

export type SocialQueue = {
  posts: SocialPost[];
  lastUpdated: string;
};

async function readQueue(): Promise<SocialQueue> {
  try {
    const raw = await fs.readFile(QUEUE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // Handle both formats: raw array or { posts: [...] }
    if (Array.isArray(parsed)) {
      return { posts: parsed, lastUpdated: new Date().toISOString() };
    }
    return { posts: parsed.posts || [], lastUpdated: parsed.lastUpdated || new Date().toISOString() };
  } catch {
    return { posts: [], lastUpdated: new Date().toISOString() };
  }
}

async function writeQueue(queue: SocialQueue): Promise<void> {
  queue.lastUpdated = new Date().toISOString();
  await fs.mkdir(path.dirname(QUEUE_PATH), { recursive: true });
  await fs.writeFile(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
}

export async function getQueuedPosts(filter?: {
  platform?: string;
  status?: string;
}): Promise<SocialPost[]> {
  const queue = await readQueue();
  let posts = queue.posts;
  if (filter?.platform) posts = posts.filter(p => p.platform === filter.platform);
  if (filter?.status) posts = posts.filter(p => p.status === filter.status);
  return posts;
}

export async function updatePostStatus(
  postId: string,
  status: 'posted' | 'skipped'
): Promise<void> {
  const queue = await readQueue();
  const post = queue.posts.find(p => p.id === postId);
  if (post) {
    post.status = status;
    if (status === 'posted') post.postedAt = new Date().toISOString();
    await writeQueue(queue);
  }
}

export async function generateSocialPosts(
  meta: SocialPostInput,
  articleContent: string,
  model: string = 'qwen3:4b'
): Promise<SocialPost[]> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://baseflow.institute';
  const articleUrl = `${siteUrl}/article/${meta.slug}`;

  // Extract key points from the article (first 2000 chars for context)
  const excerpt = articleContent
    .replace(/^#.*$/gm, '')
    .replace(/\*\*/g, '')
    .trim()
    .slice(0, 2000);

  const posts: SocialPost[] = [];

  // Generate all three platform posts in one call for efficiency
  const messages = [
    {
      role: 'system' as const,
      content: `You generate social media posts for a policy research organization. Write engaging, professional posts that highlight key findings.

Output EXACTLY this format with no other text:

---TWITTER---
[tweet text, max 250 chars, no hashtags in body]
HASHTAGS: tag1, tag2, tag3

---LINKEDIN---
[LinkedIn post, 100-200 words, professional tone, include a hook and key finding]
HASHTAGS: tag1, tag2, tag3

---BLUESKY---
[Bluesky post, max 280 chars, conversational but informed]
HASHTAGS: tag1, tag2, tag3
/no_think`
    },
    {
      role: 'user' as const,
      content: `Generate social media posts for this article:

Title: ${meta.title}
Topic: ${meta.topic}
Template: ${meta.template}

Key content:
${excerpt}

Article URL: ${articleUrl}`
    }
  ];

  try {
    let response = await callOllamaChat({
      model,
      messages,
      temperature: 0.5,
      topP: 0.9
    });
    // Strip thinking tags
    response = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    const now = new Date().toISOString();
    const baseId = Date.now().toString(36);

    // Parse Twitter
    const twitterMatch = response.match(/---TWITTER---\s*([\s\S]*?)(?=HASHTAGS:)/i);
    const twitterHashMatch = response.match(/---TWITTER---[\s\S]*?HASHTAGS:\s*(.+?)(?=\n|---)/i);
    if (twitterMatch) {
      const content = twitterMatch[1].trim().slice(0, 280);
      const hashtags = twitterHashMatch?.[1]?.split(',').map(t => t.trim().replace(/^#/, '')) || [meta.topic];
      posts.push({
        id: `${baseId}-tw`,
        articleSlug: meta.slug,
        articleTitle: meta.title,
        platform: 'twitter',
        content,
        hashtags,
        url: articleUrl,
        status: 'pending',
        createdAt: now
      });
    }

    // Parse LinkedIn
    const linkedinMatch = response.match(/---LINKEDIN---\s*([\s\S]*?)(?=HASHTAGS:)/i);
    const linkedinHashMatch = response.match(/---LINKEDIN---[\s\S]*?HASHTAGS:\s*(.+?)(?=\n|---)/i);
    if (linkedinMatch) {
      const content = linkedinMatch[1].trim();
      const hashtags = linkedinHashMatch?.[1]?.split(',').map(t => t.trim().replace(/^#/, '')) || [meta.topic];
      posts.push({
        id: `${baseId}-li`,
        articleSlug: meta.slug,
        articleTitle: meta.title,
        platform: 'linkedin',
        content,
        hashtags,
        url: articleUrl,
        status: 'pending',
        createdAt: now
      });
    }

    // Parse Bluesky
    const blueskyMatch = response.match(/---BLUESKY---\s*([\s\S]*?)(?=HASHTAGS:)/i);
    const blueskyHashMatch = response.match(/---BLUESKY---[\s\S]*?HASHTAGS:\s*(.+?)(?=\n|$)/i);
    if (blueskyMatch) {
      const content = blueskyMatch[1].trim().slice(0, 300);
      const hashtags = blueskyHashMatch?.[1]?.split(',').map(t => t.trim().replace(/^#/, '')) || [meta.topic];
      posts.push({
        id: `${baseId}-bs`,
        articleSlug: meta.slug,
        articleTitle: meta.title,
        platform: 'bluesky',
        content,
        hashtags,
        url: articleUrl,
        status: 'pending',
        createdAt: now
      });
    }
  } catch (err) {
    console.error('Social post generation failed:', err);
  }

  // Save to queue
  if (posts.length > 0) {
    const queue = await readQueue();
    // Don't duplicate — skip if posts already exist for this slug
    const existingSlugs = new Set(queue.posts.map(p => `${p.articleSlug}-${p.platform}`));
    const newPosts = posts.filter(p => !existingSlugs.has(`${p.articleSlug}-${p.platform}`));
    queue.posts = [...newPosts, ...queue.posts];
    await writeQueue(queue);
  }

  return posts;
}
