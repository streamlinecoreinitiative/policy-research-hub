/**
 * Newsletter Agent
 * 
 * Composes weekly digest emails from recently published articles.
 * Uses Qwen3 to write an engaging intro and per-article summaries.
 * Outputs HTML email ready to copy into any email sender.
 */

import fs from 'fs/promises';
import path from 'path';
import { callOllamaChat } from './ollama';
import { getPublishedArticles, ArticleMeta } from './articleIndex';

const NEWSLETTER_DIR = path.join(process.cwd(), 'data/newsletters');
const SUBSCRIBERS_PATH = path.join(process.cwd(), 'data/subscribers.json');

export type NewsletterDraft = {
  id: string;
  subject: string;
  introText: string;
  articles: {
    title: string;
    summary: string;
    url: string;
    tags: string[];
  }[];
  htmlContent: string;
  createdAt: string;
  status: 'draft' | 'sent';
  sentAt?: string;
  recipientCount?: number;
};

async function readSubscribers(): Promise<string[]> {
  try {
    const raw = await fs.readFile(SUBSCRIBERS_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function getSubscriberCount(): Promise<number> {
  const subs = await readSubscribers();
  return subs.length;
}

export async function getNewsletters(): Promise<NewsletterDraft[]> {
  try {
    await fs.mkdir(NEWSLETTER_DIR, { recursive: true });
    const files = await fs.readdir(NEWSLETTER_DIR);
    const newsletters: NewsletterDraft[] = [];
    for (const f of files.filter(f => f.endsWith('.json'))) {
      const raw = await fs.readFile(path.join(NEWSLETTER_DIR, f), 'utf8');
      newsletters.push(JSON.parse(raw));
    }
    return newsletters.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch {
    return [];
  }
}

export async function generateNewsletter(
  model: string = 'qwen3:4b',
  daysBack: number = 7
): Promise<NewsletterDraft> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://policy-research-hub.vercel.app';
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Get recently published articles
  const { articles } = await getPublishedArticles({ limit: 200 });
  const recent = articles.filter(a => 
    new Date(a.publishedAt) >= cutoff
  ).slice(0, 10);

  if (recent.length === 0) {
    throw new Error(`No articles published in the last ${daysBack} days.`);
  }

  // Use LLM to write the newsletter intro
  const articleList = recent.map((a, i) => 
    `${i + 1}. "${a.title}" — ${a.summary.slice(0, 150)}`
  ).join('\n');

  const messages = [
    {
      role: 'system' as const,
      content: `You write weekly newsletter intros for the Open Policy Research Hub. 
Write a 2-3 paragraph engaging intro that highlights themes across the articles listed.
Be professional, warm, and concise. Mention 2-3 key findings or themes.
Also suggest a catchy email subject line.

Format:
SUBJECT: [subject line]

[intro paragraphs]
/no_think`
    },
    {
      role: 'user' as const,
      content: `Write a newsletter intro for these ${recent.length} articles published this week:\n\n${articleList}`
    }
  ];

  let response = await callOllamaChat({
    model,
    messages,
    temperature: 0.5,
    topP: 0.9
  });
  response = response.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  // Parse subject and intro
  const subjectMatch = response.match(/SUBJECT:\s*(.+)/i);
  const subject = subjectMatch?.[1]?.trim() || `This Week in Policy Research — ${recent.length} New Reports`;
  const introText = response
    .replace(/SUBJECT:\s*.+\n?/i, '')
    .trim();

  // Build article entries
  const newsletterArticles = recent.map(a => ({
    title: a.title,
    summary: a.summary.slice(0, 200),
    url: `${siteUrl}/article/${a.slug}`,
    tags: a.tags.slice(0, 4),
  }));

  // Generate HTML email
  const htmlContent = buildNewsletterHTML(subject, introText, newsletterArticles, siteUrl);

  const draft: NewsletterDraft = {
    id: `newsletter-${Date.now()}`,
    subject,
    introText,
    articles: newsletterArticles,
    htmlContent,
    createdAt: new Date().toISOString(),
    status: 'draft',
  };

  // Save draft
  await fs.mkdir(NEWSLETTER_DIR, { recursive: true });
  await fs.writeFile(
    path.join(NEWSLETTER_DIR, `${draft.id}.json`),
    JSON.stringify(draft, null, 2),
    'utf8'
  );

  return draft;
}

function buildNewsletterHTML(
  subject: string,
  intro: string,
  articles: { title: string; summary: string; url: string; tags: string[] }[],
  siteUrl: string
): string {
  const articleCards = articles.map(a => `
    <tr>
      <td style="padding: 16px 0; border-bottom: 1px solid #e5e7eb;">
        <a href="${a.url}" style="color: #1a56db; font-size: 16px; font-weight: 600; text-decoration: none; text-transform: capitalize;">${a.title}</a>
        <p style="color: #6b7280; font-size: 14px; margin: 6px 0 8px; line-height: 1.5;">${a.summary}</p>
        <div>
          ${a.tags.map(t => `<span style="display: inline-block; background: #e7eefc; color: #1a56db; font-size: 11px; padding: 2px 8px; border-radius: 4px; margin-right: 4px;">${t}</span>`).join('')}
        </div>
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f3f4f6; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background: #1a56db; padding: 32px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 22px;">Open Policy Research Hub</h1>
              <p style="color: #bfdbfe; margin: 8px 0 0; font-size: 14px;">Weekly Research Digest</p>
            </td>
          </tr>
          <!-- Intro -->
          <tr>
            <td style="padding: 32px 32px 16px;">
              <h2 style="color: #111827; font-size: 20px; margin: 0 0 16px;">${subject}</h2>
              ${intro.split('\n\n').map(p => `<p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 12px;">${p.trim()}</p>`).join('')}
            </td>
          </tr>
          <!-- Articles -->
          <tr>
            <td style="padding: 0 32px 16px;">
              <h3 style="color: #111827; font-size: 16px; margin: 0 0 8px; text-transform: uppercase; letter-spacing: 0.5px;">This Week's Reports</h3>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${articleCards}
              </table>
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td style="padding: 16px 32px 32px; text-align: center;">
              <a href="${siteUrl}/library" style="background: #1a56db; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">Browse Full Library →</a>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background: #f9fafb; padding: 24px 32px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                Open Policy Research Hub — AI-powered policy research for the public good.<br/>
                <a href="${siteUrl}" style="color: #6b7280;">${siteUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
