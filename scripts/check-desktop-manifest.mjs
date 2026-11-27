import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'desktop-manifest-'));
try {
  // 1. Default Tauri v2 macOS filename (MeelieFont.app.tar.gz) + Supabase Storage base-url
  const input1 = join(root, 'artifacts-1');
  await mkdir(input1);
  await writeFile(join(input1, 'MeelieFont_1.2.5_x64-setup.exe'), 'installer');
  await writeFile(join(input1, 'MeelieFont_1.2.5_x64-setup.exe.sig'), 'windows-signature');
  await writeFile(join(input1, 'MeelieFont.app.tar.gz'), 'mac-installer');
  await writeFile(join(input1, 'MeelieFont.app.tar.gz.sig'), 'mac-signature');
  const out1 = join(root, 'manifest-1.json');
  const res1 = spawnSync(process.execPath, [
    'scripts/generate-desktop-manifest.mjs', '--version', '1.2.5', '--in', input1,
    '--base-url', 'https://proj123.supabase.co/storage/v1/object/public/app-updates/desktop', '--out', out1,
  ], { encoding: 'utf8' });
  assert.equal(res1.status, 0, res1.stderr);
  const m1 = JSON.parse(await readFile(out1, 'utf8'));
  assert.equal(m1.platforms['windows-x86_64'].url, 'https://proj123.supabase.co/storage/v1/object/public/app-updates/desktop/MeelieFont_1.2.5_x64-setup.exe');
  assert.equal(m1.platforms['darwin-aarch64'].url, 'https://proj123.supabase.co/storage/v1/object/public/app-updates/desktop/MeelieFont.app.tar.gz');
  assert.equal(m1.platforms['darwin-aarch64'].signature, 'mac-signature');

  // 2. Android latest.json generator with Supabase URL + OTA bundle zip
  const bundleZip = join(root, 'MeelieFont-bundle-v1.2.5.zip');
  await writeFile(bundleZip, 'zip-bytes');
  const apkManifestOut = join(root, 'latest.json');
  const res2 = spawnSync(process.execPath, [
    'scripts/generate-latest-manifest.mjs',
    '--tag', 'v1.2.5',
    '--sha256', 'a'.repeat(64),
    '--size', '25000000',
    '--url', 'https://proj123.supabase.co/storage/v1/object/public/app-updates/MeelieFont-v1.2.5.apk',
    '--bundle', bundleZip,
    '--bundle-url', 'https://proj123.supabase.co/storage/v1/object/public/app-updates/MeelieFont-bundle-v1.2.5.zip',
    '--out', apkManifestOut,
  ], { encoding: 'utf8' });
  assert.equal(res2.status, 0, res2.stderr);
  const m2 = JSON.parse(await readFile(apkManifestOut, 'utf8'));
  assert.equal(m2.versionCode, 1002005);
  assert.equal(m2.bundleFileSize, 9);
  assert.equal(m2.bundleVersionCode, 1002005);
} finally {
  await rm(root, { recursive: true, force: true });
}
