/**
 * Social Media Credentials Manager
 * 
 * Stores and retrieves API credentials for social media platforms.
 * Credentials are saved locally in data/social-credentials.json.
 * This file should be in .gitignore to protect secrets.
 */

import fs from 'fs/promises';
import path from 'path';

const CREDS_PATH = path.join(process.cwd(), 'data/social-credentials.json');

export type TwitterCredentials = {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
};

export type LinkedInCredentials = {
  accessToken: string;
  organizationId?: string; // For company pages
};

export type BlueskyCredentials = {
  handle: string;      // e.g. yourname.bsky.social
  appPassword: string; // App-specific password from settings
};

export type SocialCredentials = {
  twitter?: TwitterCredentials & { enabled: boolean; lastPosted?: string };
  linkedin?: LinkedInCredentials & { enabled: boolean; lastPosted?: string };
  bluesky?: BlueskyCredentials & { enabled: boolean; lastPosted?: string };
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

export async function updatePlatformCredentials(
  platform: 'twitter' | 'linkedin' | 'bluesky',
  credentials: Record<string, string>,
  enabled: boolean
): Promise<SocialCredentials> {
  const creds = await readCredentials();

  if (platform === 'twitter') {
    creds.twitter = {
      apiKey: credentials.apiKey || '',
      apiSecret: credentials.apiSecret || '',
      accessToken: credentials.accessToken || '',
      accessTokenSecret: credentials.accessTokenSecret || '',
      enabled,
      lastPosted: creds.twitter?.lastPosted,
    };
  } else if (platform === 'linkedin') {
    creds.linkedin = {
      accessToken: credentials.accessToken || '',
      organizationId: credentials.organizationId,
      enabled,
      lastPosted: creds.linkedin?.lastPosted,
    };
  } else if (platform === 'bluesky') {
    creds.bluesky = {
      handle: credentials.handle || '',
      appPassword: credentials.appPassword || '',
      enabled,
      lastPosted: creds.bluesky?.lastPosted,
    };
  }

  await writeCredentials(creds);
  return creds;
}

/**
 * Returns a sanitized version of credentials (masks secrets for display).
 */
export function maskCredentials(creds: SocialCredentials): Record<string, unknown> {
  const mask = (s?: string) => s ? `${s.slice(0, 4)}${'•'.repeat(Math.max(0, s.length - 8))}${s.slice(-4)}` : '';

  return {
    twitter: creds.twitter ? {
      enabled: creds.twitter.enabled,
      apiKey: mask(creds.twitter.apiKey),
      hasSecret: !!creds.twitter.apiSecret,
      hasAccessToken: !!creds.twitter.accessToken,
      lastPosted: creds.twitter.lastPosted,
    } : null,
    linkedin: creds.linkedin ? {
      enabled: creds.linkedin.enabled,
      hasAccessToken: !!creds.linkedin.accessToken,
      organizationId: creds.linkedin.organizationId || null,
      lastPosted: creds.linkedin.lastPosted,
    } : null,
    bluesky: creds.bluesky ? {
      enabled: creds.bluesky.enabled,
      handle: creds.bluesky.handle,
      hasAppPassword: !!creds.bluesky.appPassword,
      lastPosted: creds.bluesky.lastPosted,
    } : null,
    updatedAt: creds.updatedAt,
  };
}
