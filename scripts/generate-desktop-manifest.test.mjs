import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'desktop-manifest-'));
try {
  const input = join(root, 'artifacts');
  await mkdir(input);
  await writeFile(join(input, 'MeelieFont_1.2.5_x64-setup.exe'), 'installer');
  await writeFile(join(input, 'MeelieFont_1.2.5_x64-setup.exe.sig'), 'windows-signature');
  await writeFile(join(input, 'MeelieFont_1.2.5_aarch64.app.tar.gz'), 'mac-installer');
  await writeFile(join(input, 'MeelieFont_1.2.5_aarch64.app.tar.gz.sig'), 'mac-signature');
  const out = join(root, 'manifest.json');
  const result = spawnSync(process.execPath, [
    'scripts/generate-desktop-manifest.mjs', '--version', '1.2.5', '--in', input,
    '--base-url', 'https://storage.googleapis.com/test/desktop', '--out', out,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(out, 'utf8'));
  assert.match(manifest.platforms['windows-x86_64'].url, /MeelieFont_1\.2\.5_x64-setup\.exe$/);
  assert.equal(manifest.platforms['windows-x86_64'].signature, 'windows-signature');
  assert.equal(manifest.platforms['darwin-aarch64'].signature, 'mac-signature');
} finally {
  await rm(root, { recursive: true, force: true });
}
