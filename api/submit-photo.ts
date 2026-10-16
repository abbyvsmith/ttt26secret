// Vercel serverless function: POST /api/submit-photo
//
// The browser has already uploaded the (compressed) photo to the private
// Supabase "photos" bucket. This function checks who is calling, copies the
// photo into Google Drive (one subfolder per task), and records the completion.
// Google credentials and the Supabase service key never reach the browser.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { auth as googleAuth, drive as driveApi } from '@googleapis/drive';
import { Readable } from 'node:stream';

const ALLOWED_EMAIL_DOMAIN = 'viget.com';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const env = readEnv();
    const sb = createClient(env.supabaseUrl, env.serviceKey, {
      auth: { persistSession: false },
    });

    // --- who is calling? ---
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const { data: userData } = await sb.auth.getUser(token);
    const user = userData.user;
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    if (!user.email?.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      return res.status(403).json({ error: `Only @${ALLOWED_EMAIL_DOMAIN} accounts can play.` });
    }

    // --- validate input ---
    const { taskId, storagePath, albumName } = (req.body ?? {}) as {
      taskId?: string;
      storagePath?: string;
      albumName?: string | null;
    };
    if (!taskId || !storagePath || !storagePath.startsWith(`${user.id}/`)) {
      return res.status(400).json({ error: 'Bad request.' });
    }
    const cleanAlbum = albumName?.trim().slice(0, 120) || null;

    const [{ data: task }, { data: player }, { data: previous }] = await Promise.all([
      sb.from('tasks').select('id, kind, label').eq('id', taskId).maybeSingle(),
      sb.from('players').select('people(name)').eq('user_id', user.id).maybeSingle(),
      sb
        .from('completions')
        .select('drive_file_id, storage_path')
        .eq('user_id', user.id)
        .eq('task_id', taskId)
        .maybeSingle(),
    ]);
    if (!task || task.kind !== 'photo') return res.status(400).json({ error: 'Unknown photo task.' });
    const personName = (player?.people as unknown as { name: string } | null)?.name;
    if (!personName) return res.status(400).json({ error: 'Pick your name first.' });

    // --- read the photo back from Supabase Storage ---
    const { data: blob, error: dlError } = await sb.storage.from('photos').download(storagePath);
    if (dlError || !blob) return res.status(400).json({ error: 'Photo upload not found.' });
    const bytes = Buffer.from(await blob.arrayBuffer());

    // --- copy to Google Drive ---
    const drive = driveApi({
      version: 'v3',
      auth: new googleAuth.GoogleAuth({
        credentials: env.googleCredentials,
        scopes: ['https://www.googleapis.com/auth/drive'],
      }),
    });

    const folderId = await findOrCreateFolder(drive, env.driveFolderId, task.label);
    const fileName = [personName, cleanAlbum, timestamp()].filter(Boolean).join(' – ') + '.jpg';
    const { data: file } = await drive.files.create({
      supportsAllDrives: true,
      fields: 'id, webViewLink',
      requestBody: {
        name: fileName,
        parents: [folderId],
        description: [
          `Player: ${personName} (${user.email})`,
          `Task: ${task.label}`,
          cleanAlbum ? `Album: ${cleanAlbum}` : null,
        ]
          .filter(Boolean)
          .join('\n'),
        appProperties: { userId: user.id, taskId },
      },
      media: { mimeType: 'image/jpeg', body: Readable.from(bytes) },
    });

    // --- record the completion (service role bypasses RLS) ---
    const { error: upsertError } = await sb.from('completions').upsert({
      user_id: user.id,
      task_id: taskId,
      person_id: null,
      album_name: cleanAlbum,
      storage_path: storagePath,
      drive_file_id: file.id,
      drive_url: file.webViewLink,
    });
    if (upsertError) throw upsertError;

    // --- a re-upload replaces the old photo (Drive copy goes to the trash, recoverable for 30 days) ---
    if (previous?.drive_file_id && previous.drive_file_id !== file.id) {
      await drive.files
        .update({ fileId: previous.drive_file_id, supportsAllDrives: true, requestBody: { trashed: true } })
        .catch((e) => console.warn('Could not trash old Drive file', e?.message));
    }
    if (previous?.storage_path && previous.storage_path !== storagePath) {
      await sb.storage.from('photos').remove([previous.storage_path]);
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Something went wrong saving your photo. Please try again.' });
  }
}

function readEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const googleJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const driveFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!supabaseUrl || !serviceKey || !googleJson || !driveFolderId) {
    throw new Error('Missing server environment variables (see .env.example).');
  }
  return { supabaseUrl, serviceKey, driveFolderId, googleCredentials: JSON.parse(googleJson) };
}

type Drive = ReturnType<typeof driveApi>;

async function findOrCreateFolder(drive: Drive, parentId: string, name: string): Promise<string> {
  const escaped = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const { data } = await drive.files.list({
    q: `'${parentId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
    corpora: 'allDrives',
  });
  if (data.files?.[0]?.id) return data.files[0].id;

  const { data: folder } = await drive.files.create({
    supportsAllDrives: true,
    fields: 'id',
    requestBody: { name, parents: [parentId], mimeType: 'application/vnd.google-apps.folder' },
  });
  return folder.id!;
}

/** e.g. "2026-10-16 14.32" in US Eastern time */
function timestamp(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}.${get('minute')}`;
}
