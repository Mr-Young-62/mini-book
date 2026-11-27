#!/usr/bin/env node
// ReadOwl updater — generate latest.json release manifest (Tahap A + OTA bundle).

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { parseVersion, assertNextVersionCode } from './version-utils.mjs';

const APP_ID = 'org.readowl.library';
const DEFAULT_SCHEMA_VERSION = 1;
const MAX_APK_BYTES = 500 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 150 * 1024 * 1024;
const HEX64_RE = /^[0-9a-f]{64}$/;
const SUPABASE_HOST_RE = /^[a-z0-9-]+\.supabase\.co$/i;
const GCS_APK_PATH_RE = /^\/[a-z0-9._-]+\/MeelieFont-v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?\.apk$/i;
const SUPABASE_APK_PATH_RE = /^\/storage\/v1\/object\/public\/[a-z0-9._-]+\/(?:[a-z0-9._-]+\/)*MeelieFont-v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?\.apk$/i;
const GITHUB_APK_PATH_RE = /^\/[^/]+\/[^/]+\/releases\/download\/v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?\/MeelieFont-v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?\.apk$/i;

const GCS_BUNDLE_PATH_RE = /^\/[a-z0-9._-]+\/MeelieFont-bundle-v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?\.zip$/i;
const SUPABASE_BUNDLE_PATH_RE = /^\/storage\/v1\/object\/public\/[a-z0-9._-]+\/(?:[a-z0-9._-]+\/)*MeelieFont-bundle-v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?\.zip$/i;
const GITHUB_BUNDLE_PATH_RE = /^\/[^/]+\/[^/]+\/releases\/download\/v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?\/MeelieFont-bundle-v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?\.zip$/i;

function fail(message) {
  process.exitCode = 1;
  throw new Error(message);
}

function usage() {
  process.stderr.write(
    [
      'Usage: node scripts/generate-latest-manifest.mjs --tag <vX.Y.Z> [options]',
      '',
      'Required (one of):',
      '  --apk <path>               APK file: computes sha256 + fileSize automatically',
      '  --sha256 <hex> --size <n>  Provide checksum/size directly',
      '',
      'Required:',
      '  --tag <vX.Y.Z>             Release tag (SemVer, no pre-release suffixes)',
      '',
      'Download URL (one of):',
      '  --bucket <name>            Build https://storage.googleapis.com/<bucket>/MeelieFont-<tag>.apk',
      '  --url <https-url>          Full APK URL (GCS, Supabase Storage public, or GitHub Releases)',
      '',
      'Optional OTA web bundle:',
      '  --bundle <zip-path>        Zipped dist/ bundle: computes bundleSha256 + bundleFileSize',
      '  --bundle-url <https-url>   Full bundle zip URL',
      '  --bundle-sha256 <hex>      Bundle SHA-256 (when --bundle is omitted)',
      '  --bundle-size <n>          Bundle size in bytes (when --bundle is omitted)',
      '  --min-native-version-code <n> Minimum APK versionCode required for OTA bundle',
      '',
      'Optional:',
      '  --out <path>               Output file (default: latest.json)',
      '  --published <path>         Previous latest.json: enforce versionCode monotonicity',
      '  --changelog-file <path>    One entry per line (blank lines/# comments ignored)',
      '  --changelog <a,b,c>        Inline comma-separated changelog entries',
      '  --min-version-code <n>     minimumSupportedVersionCode (default: none)',
      '  --force                    Set forceUpdate=true',
      '  --app <id>                 App id (default: org.readowl.library)',
      '  --date <YYYY-MM-DD>        releaseDate (default: today, UTC)',
      '',
      'Exit codes: 0 ok · 1 validation/monotonicity failure',
    ].join('\n') + '\n',
  );
}

function parseArgs(argv) {
  const args = {};
  if (argv.includes('--help') || argv.includes('-h')) args.help = true;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') continue;
    if (!token.startsWith('--')) fail(`Unexpected argument "${token}".`);
    const key = token.slice(2);
    if (key === 'force') {
      args.force = true;
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) fail(`Missing value for --${key}.`);
    args[key] = value;
    i += 1;
  }
  return args;
}

async function sha256OfFile(path) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  return hash.digest('hex');
}

function isAllowedApkUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.hostname === 'storage.googleapis.com') return GCS_APK_PATH_RE.test(parsed.pathname);
  if (SUPABASE_HOST_RE.test(parsed.hostname)) return SUPABASE_APK_PATH_RE.test(parsed.pathname);
  if (parsed.hostname === 'github.com') return GITHUB_APK_PATH_RE.test(parsed.pathname);
  return false;
}

function isAllowedBundleUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  if (parsed.hostname === 'storage.googleapis.com') return GCS_BUNDLE_PATH_RE.test(parsed.pathname);
  if (SUPABASE_HOST_RE.test(parsed.hostname)) return SUPABASE_BUNDLE_PATH_RE.test(parsed.pathname);
  if (parsed.hostname === 'github.com') return GITHUB_BUNDLE_PATH_RE.test(parsed.pathname);
  return false;
}

function buildDownloadUrl(args, tag) {
  if (args.url) {
    if (!isAllowedApkUrl(args.url)) {
      fail(`--url "${args.url}" does not match the required HTTPS APK pattern for GCS, Supabase Storage, or GitHub Releases.`);
    }
    return args.url;
  }
  if (!args.bucket) fail('Provide --bucket or --url for the download location.');
  if (!/^[a-z0-9._-]+$/i.test(args.bucket)) fail(`Invalid bucket name "${args.bucket}".`);
  return `https://storage.googleapis.com/${args.bucket}/MeelieFont-${tag}.apk`;
}

function parseChangelog(args) {
  return args.changelog
    ? args.changelog.split(',').map((s) => s.trim()).filter(Boolean)
    : [];
}

async function parseChangelogFile(path) {
  const text = await readFile(path, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

async function readPublished(path) {
  try {
    const raw = await readFile(path, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) fail('Published manifest is not an object.');
    if (parsed.app !== APP_ID) {
      fail(`Published manifest app id mismatch (${JSON.stringify(parsed.app)}); refusing to compare.`);
    }
    return parsed;
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    if (error instanceof SyntaxError) {
      fail(`Published manifest is not valid JSON (${error.message}); refusing to publish over it.`);
    }
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.tag) {
    usage();
    process.exitCode = args.help ? 0 : 1;
    return;
  }

  const { version, versionCode } = parseVersion(args.tag);
  const tag = `v${version}`;

  const downloadUrl = buildDownloadUrl(args, tag);

  let sha256 = args.sha256;
  let fileSize = args.size !== undefined ? Number(args.size) : null;
  if (args.apk) {
    if (sha256 || fileSize !== null) fail('Use either --apk or --sha256/--size, not both.');
    const info = await stat(args.apk);
    if (!info.isFile()) fail(`--apk path is not a file: ${args.apk}`);
    sha256 = await sha256OfFile(args.apk);
    fileSize = info.size;
  }
  if (!sha256 || fileSize === null) fail('Missing APK integrity data: provide --apk, or --sha256 and --size.');
  sha256 = sha256.toLowerCase();
  if (!HEX64_RE.test(sha256)) fail('--sha256 must be 64 lowercase hex characters.');
  if (!Number.isInteger(fileSize) || fileSize <= 0) fail('--size must be a positive integer (bytes).');
  if (fileSize > MAX_APK_BYTES) fail(`--size ${fileSize} exceeds the ${MAX_APK_BYTES} byte sanity cap.`);

  // Optional OTA bundle metadata
  let bundleUrl = args['bundle-url'] || null;
  let bundleSha256 = args['bundle-sha256'] || null;
  let bundleFileSize = args['bundle-size'] !== undefined ? Number(args['bundle-size']) : null;
  if (args.bundle) {
    if (bundleSha256 || bundleFileSize !== null) fail('Use either --bundle or --bundle-sha256/--bundle-size, not both.');
    const info = await stat(args.bundle);
    if (!info.isFile()) fail(`--bundle path is not a file: ${args.bundle}`);
    bundleSha256 = await sha256OfFile(args.bundle);
    bundleFileSize = info.size;
  }
  if (bundleUrl && !isAllowedBundleUrl(bundleUrl)) {
    fail(`--bundle-url "${bundleUrl}" does not match the required HTTPS zip pattern.`);
  }
  if (bundleUrl || bundleSha256 || bundleFileSize !== null) {
    if (!bundleUrl || !bundleSha256 || bundleFileSize === null) {
      fail('Incomplete bundle arguments: provide --bundle-url together with --bundle (or --bundle-sha256 and --bundle-size).');
    }
    bundleSha256 = bundleSha256.toLowerCase();
    if (!HEX64_RE.test(bundleSha256)) fail('--bundle-sha256 must be 64 lowercase hex characters.');
    if (!Number.isInteger(bundleFileSize) || bundleFileSize <= 0 || bundleFileSize > MAX_BUNDLE_BYTES) {
      fail(`--bundle-size must be between 1 and ${MAX_BUNDLE_BYTES} bytes.`);
    }
  }

  let minNativeVersionCode = null;
  if (args['min-native-version-code'] !== undefined) {
    minNativeVersionCode = Number(args['min-native-version-code']);
    if (!Number.isInteger(minNativeVersionCode) || minNativeVersionCode < 1 || minNativeVersionCode > versionCode) {
      fail('--min-native-version-code must be an integer between 1 and versionCode.');
    }
  }

  const published = args.published ? await readPublished(args.published) : null;
  const publishedCode = published ? published.versionCode : null;
  const gate = assertNextVersionCode(publishedCode, versionCode);

  let changelog = [];
  if (args['changelog-file']) changelog = await parseChangelogFile(args['changelog-file']);
  if (args.changelog) changelog = [...changelog, ...parseChangelog(args)];

  let minimumSupportedVersionCode = null;
  if (args['min-version-code'] !== undefined) {
    minimumSupportedVersionCode = Number(args['min-version-code']);
    if (!Number.isInteger(minimumSupportedVersionCode) || minimumSupportedVersionCode < 1) {
      fail('--min-version-code must be a positive integer.');
    }
    if (minimumSupportedVersionCode > versionCode) {
      fail(`--min-version-code (${minimumSupportedVersionCode}) must not exceed versionCode (${versionCode}).`);
    }
  }

  const releaseDate = args.date ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) fail('--date must be YYYY-MM-DD.');

  const manifest = {
    schemaVersion: args['schema-version'] ? Number(args['schema-version']) : DEFAULT_SCHEMA_VERSION,
    app: args.app ?? APP_ID,
    version,
    versionCode,
    releaseDate,
    downloadUrl,
    sha256,
    fileSize,
    changelog,
    forceUpdate: Boolean(args.force),
  };
  if (minimumSupportedVersionCode !== null) {
    manifest.minimumSupportedVersionCode = minimumSupportedVersionCode;
  }
  if (bundleUrl) {
    manifest.bundleUrl = bundleUrl;
    manifest.bundleSha256 = bundleSha256;
    manifest.bundleFileSize = bundleFileSize;
    manifest.bundleVersion = version;
    manifest.bundleVersionCode = versionCode;
    if (minNativeVersionCode !== null) {
      manifest.minNativeVersionCode = minNativeVersionCode;
    }
  }
  if (manifest.app !== APP_ID) fail(`--app must be "${APP_ID}" (got "${manifest.app}").`);
  if (!Number.isInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) fail('Invalid --schema-version.');

  const outPath = args.out ?? 'latest.json';
  await writeFile(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  process.stdout.write(
    [
      `Wrote ${outPath}`,
      `  version      : ${manifest.version}`,
      `  versionCode  : ${manifest.versionCode}` +
        (gate.published !== null ? ` (published: ${gate.published} -> OK, strictly increasing)` : ' (bootstrap: nothing published yet)'),
      `  downloadUrl  : ${manifest.downloadUrl}`,
      `  sha256       : ${manifest.sha256.slice(0, 16)}…`,
      `  fileSize     : ${manifest.fileSize}`,
      ...(manifest.bundleUrl ? [`  bundleUrl    : ${manifest.bundleUrl} (${manifest.bundleFileSize} bytes)`] : []),
      `  changelog    : ${manifest.changelog.length} entries`,
      '',
    ].join('\n'),
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
