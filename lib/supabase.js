import crypto from 'node:crypto';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BUCKET = process.env.SUPABASE_BUCKET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !BUCKET) {
  throw new Error(
    'SUPABASE_URL, SUPABASE_SERVICE_KEY and SUPABASE_BUCKET must all be set',
  );
}

// The service role key bypasses row-level security. Server-only: it must never
// reach a view, a client script or a log line.
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const bucket = () => supabase.storage.from(BUCKET);

// `${userId}/${uuid}${ext}` — namespacing by user id makes bulk cleanup possible.
export function buildObjectPath(userId, originalName) {
  const ext = path.extname(originalName).toLowerCase().slice(0, 16);
  return `${userId}/${crypto.randomUUID()}${ext}`;
}

export async function uploadObject(buffer, objectPath, mimeType) {
  const { error } = await bucket().upload(objectPath, buffer, {
    contentType: mimeType,
    upsert: false,
  });
  if (error) throw error;
  return objectPath;
}

export async function createSignedUrl(objectPath, expiresInSeconds, downloadName) {
  const { data, error } = await bucket().createSignedUrl(
    objectPath,
    expiresInSeconds,
    // Makes the browser save the file under its original name, not the uuid.
    downloadName ? { download: downloadName } : undefined,
  );
  if (error) throw error;
  return data.signedUrl;
}

export async function removeObjects(objectPaths) {
  if (!objectPaths.length) return;
  const { error } = await bucket().remove(objectPaths);
  if (error) throw error;
}

export default supabase;
