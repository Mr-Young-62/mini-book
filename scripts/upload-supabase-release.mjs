#!/usr/bin/env node
// Upload a release artifact or manifest to a public Supabase Storage bucket
// and verify it is publicly reachable (used by CI when GCS is not configured).

import { readFile, stat } from 'node:fs/promises';
import { extname } from 'node:path';

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) fail(`Unexpected argument "${token}".`);
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for --${key}.`);
    args[key] = value;
    i += 1;
  }
  return args;
}

function inferContentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.json') return 'application/json';
  if (ext === '.apk') return 'application/vnd.android.package-archive';
  if (ext === '.zip') return 'application/zip';
  if (ext === '.gz') return 'application/gzip';
  if (ext === '.sig' || ext === '.txt') return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

async function ensurePublicBucket(supabaseUrl, serviceKey, bucket) {
  const headers = {
    Authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
  };
  const check = await fetch(`${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`, { headers });
  if (check.ok) {
    const info = await check.json();
    if (!info.public) {
      const update = await fetch(`${supabaseUrl}/storage/v1/bucket/${encodeURIComponent(bucket)}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ public: true }),
      });
      if (!update.ok) fail(`Failed to make bucket "${bucket}" public: ${update.status} ${await update.text()}`);
    }
    return;
  }

  const create = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: bucket, name: bucket, public: true }),
  });
  if (!create.ok && create.status !== 409) {
    fail(`Failed to create public bucket "${bucket}": ${create.status} ${await create.text()}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const bucket = (args.bucket || process.env.UPDATE_STORAGE_BUCKET || 'app-updates').trim();
  const filePath = args.file;
  const objectPath = (args.object || '').replace(/^\/+/, '');
  const cacheControl = args['cache-control'] || '3600';

  if (!supabaseUrl || !serviceKey) fail('SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.');
  if (!filePath || !objectPath) fail('--file and --object are required.');

  const info = await stat(filePath);
  if (!info.isFile()) fail(`Not a file: ${filePath}`);
  const payload = await readFile(filePath);
  const contentType = args['content-type'] || inferContentType(filePath);

  await ensurePublicBucket(supabaseUrl, serviceKey, bucket);

  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const uploadUrl = `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`;
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceKey}`,
      apikey: serviceKey,
      'x-upsert': 'true',
      'cache-control': String(cacheControl),
      'content-type': contentType,
    },
    body: payload,
  });
  if (!uploadRes.ok) {
    fail(`Upload failed for ${objectPath}: ${uploadRes.status} ${await uploadRes.text()}`);
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodedPath}`;
  const headRes = await fetch(publicUrl, { method: 'HEAD' });
  if (!headRes.ok) {
    fail(`Public verification failed for ${publicUrl}: HTTP ${headRes.status}`);
  }
  const remoteLength = Number(headRes.headers.get('content-length') || 0);
  if (remoteLength > 0 && remoteLength !== info.size) {
    fail(`Uploaded size mismatch for ${objectPath}: remote=${remoteLength} local=${info.size}`);
  }
  process.stdout.write(`Uploaded & verified ${publicUrl} (${info.size} bytes)\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
