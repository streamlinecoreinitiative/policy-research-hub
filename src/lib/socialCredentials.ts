/**
 * Social Media Credentials & Auto-Posting
 * 
 * Platform reality:
 * - Twitter/X: API posting costs $100+/month. We use share intent links instead.
 * - LinkedIn: API requires approved developer app. We use share intent links instead.
 * - Bluesky: FREE and open AT Protocol. Full auto-posting supported!
 * 
 * Only Bluesky credentials are stored (handle + app password).
 * Twitter/LinkedIn use pre-filled share URLs for one-click manual posting.
 */

import fs from 'fs/promises';
import path from 'path';

const CREDS_PATH = path.join(process.cwd(), 'data/social-credentials.json');

export type BlueskyCredentials = {
  handle: string;       // e.g. yourname.bsky.social
  appPassword: string;  // App-specific password from Settings > App Passwords
  enabled: boolean;
  lastPosted?: string;
  totalPosted?: number;
};

export type SocialCredentials = {
  bluesky?: BlueskyCredentials;
  updatedAt: string;
};

export async function readCredentials(): Promise<SocialCredentials> {
  try {
    const raw = await fs.readFile(CREDS_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { updatedAt: new Date().toISOString() };
  }
}

export async function writeCredentials(creds: SocialCredentials): Promise<void> {
  creds.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(CREDS_PATH), { recursive: true });
  await fs.writeFile(CREDS_PATH, JSON.stringify(creds, null, 2), 'utf8');
}

export async function saveBlueskyCredentials(
  handle: string,
  appPassword: string,
  enabled: boolean
): Promise<SocialCredentials> {
  const creds = await readCredentials();
  creds.bluesky = {
    handle: handle.trim(),
    appPassword: appPassword.trim(),
    enabled,
    lastPosted: creds.bluesky?.lastPosted,
    totalPosted: creds.bluesky?.totalPosted || 0,
  };
  await writeCredentials(creds);
  return creds;
}

/**
 * Post to Bluesky via the AT Protocol.
 * Returns the post URI on success, or throws on failure.
 */
export async function postToBluesky(text: string, url?: string): Promise<string> {
  const creds = await readCredentials();
  if (!creds.bluesky?.enabled || !creds.bluesky.handle || !creds.bluesky.appPassword) {
    throw new Error('Bluesky not configured. Add your handle and app password in the Accounts tab.');
  }

  const { handle, appPassword } = creds.bluesky;

  // Step 1: Create session (login)
  const sessionRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password: appPassword }),
  });

  if (!sessionRes.ok) {
    const err = await sessionRes.json().catch(() => ({}));
    throw new Error(`Bluesky login failed: ${(err as any).message || sessionRes.statusText}`);
  }

  const session = await sessionRes.json();
  const { did, accessJwt } = session;

  // Step 2: Build the post record
  const postText = url ? `${text}\n\n${url}` : text;
  
  // Detect facets (links) for rich text
  const facets: any[] = [];
  if (url) {
    const urlStart = postText.indexOf(url);
    if (urlStart >= 0) {
      const encoder = new TextEncoder();
      const byteStart = encoder.encode(postText.substring(0, urlStart)).length;
      const byteEnd = byteStart + encoder.encode(url).length;
      facets.push({
        index: { byteStart, byteEnd },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
      });
    }
  }

  const record: any = {
    $type: 'app.bsky.feed.post',
    text: postText.slice(0, 300), // Bluesky limit
    createdAt: new Date().toISOString(),
    langs: ['en'],
  };
  if (facets.length > 0) record.facets = facets;

  // Step 3: Create the post
  const postRes = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessJwt}`,
    },
    body: JSON.stringify({
      repo: did,
      collection: 'app.bsky.feed.post',
      record,
    }),
  });

  if (!postRes.ok) {
    const err = await postRes.json().catch(() => ({}));
    throw new Error(`Bluesky post failed: ${(err as any).message || postRes.statusText}`);
  }

  const result = await postRes.json();

  // Update last posted timestamp
  creds.bluesky.lastPosted = new Date().toISOString();
  creds.bluesky.totalPosted = (creds.bluesky.totalPosted || 0) + 1;
  await writeCredentials(creds);

  return result.uri;
}

/**
 * Test Bluesky credentials by creating a session (login) without posting.
 */
export async function testBlueskyConnection(handle: string, appPassword: string): Promise<{ success: boolean; did?: string; error?: string }> {
  try {
    const res = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: handle.trim(), password: appPassword.trim() }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: (err as any).message || res.statusText };
    }
    const data = await res.json();
    return { success: true, did: data.did };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

/**
 * Generate share URLs for platforms that don't allow free API posting.
 */
export function getShareUrls(text: string, url: string, hashtags: string[] = []) {
  const encodedText = encodeURIComponent(text);
  const encodedUrl = encodeURIComponent(url);
  const hashtagStr = hashtags.map(h => h.replace(/^#/, '')).join(',');

  return {
    twitter: `https://x.com/intent/tweet?text=${encodedText}&url=${encodedUrl}${hashtagStr ? '&hashtags=' + encodeURIComponent(hashtagStr) : ''}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
  };
}

/**
 * Returns a safe version of credentials for the dashboard (secrets masked).
 */
export function maskCredentials(creds: SocialCredentials): Record<string, unknown> {
  return {
    bluesky: creds.bluesky ? {
      enabled: creds.bluesky.enabled,
      handle: creds.bluesky.handle,
      hasAppPassword: !!creds.bluesky.appPassword,
      lastPosted: creds.bluesky.lastPosted,
      totalPosted: creds.bluesky.totalPosted || 0,
    } : null,
    updatedAt: creds.updatedAt,
  };
}
