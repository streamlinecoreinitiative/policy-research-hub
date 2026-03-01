import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';

export type DriveCredentials = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  folderId?: string;
};

/** Return Drive credentials from env vars, or undefined if not configured */
export function getEnvDriveCredentials(): DriveCredentials | undefined {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!clientId || !clientSecret || !refreshToken) return undefined;
  return { clientId, clientSecret, refreshToken, folderId };
}

export async function uploadFileToDrive(params: { filePath: string; drive?: DriveCredentials; mimeType?: string }) {
  const { filePath, mimeType } = params;
  // Use provided credentials, fall back to env vars
  const drive = params.drive ?? getEnvDriveCredentials();
  if (!drive) {
    throw new Error('Missing Drive credentials. Set GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN env vars or pass credentials.');
  }
  const { clientId, clientSecret, refreshToken, folderId } = drive;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Drive credentials. Set GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN env vars or pass credentials.');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const driveClient = google.drive({ version: 'v3', auth: oauth2Client });
  const fileName = path.basename(filePath);
  
  // Determine mime type from file extension if not provided
  const ext = path.extname(filePath).toLowerCase();
  const detectedMimeType = mimeType || (ext === '.html' ? 'text/html' : ext === '.md' ? 'text/markdown' : 'text/plain');

  const requestBody: { name: string; parents?: string[] } = { name: fileName };
  if (folderId) requestBody.parents = [folderId];

  try {
    const res = await driveClient.files.create({
      requestBody,
      media: {
        mimeType: detectedMimeType,
        body: fs.createReadStream(filePath)
      },
      fields: 'id,name,webViewLink'
    });

    return res.data;
  } catch (error: any) {
    if (error?.response?.data?.error === 'invalid_grant') {
      throw new Error(
        'Google OAuth error: invalid_grant. Your refresh token has expired or been revoked. ' +
        'Please generate a new refresh token from Google OAuth Playground (https://developers.google.com/oauthplayground/). ' +
        'Make sure to select the "Google Drive API v3" scope and authorize the app.'
      );
    }
    throw error;
  }
}
