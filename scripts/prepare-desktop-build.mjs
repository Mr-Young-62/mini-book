#!/usr/bin/env node
// Prepare src-tauri for a tagged desktop build (Tahap F).
//
// 1. Writes the release version (from the git tag) into tauri.conf.json and
//    Cargo.toml so the updater compares real versions (stale 1.0.0 would make
//    every release look "newer" forever).
// 2. Injects the updater endpoint (public GCS URL) into tauri.conf.json. The
//    bucket name is a CI secret, so the endpoint cannot live in the repo; the
//    updater plugin fails closed when the endpoint is missing.
//
// Usage:
//   node scripts/prepare-desktop-build.mjs --tag v1.2.3 \
//     --endpoint https://storage.googleapis.com/BUCKET/desktop/latest.json

import { readFile, writeFile } from 'node:fs/promises';
import { parseVersion } from './version-utils.mjs';

const CONF = 'src-tauri/tauri.conf.json';
const CARGO = 'src-tauri/Cargo.toml';

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

function validateEndpoint(endpoint) {
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    fail(`Endpoint is not a valid URL: ${endpoint}`);
  }
  if (url.protocol !== 'https:') fail('Endpoint must use https://');
  if (url.hostname !== 'storage.googleapis.com') fail('Endpoint host must be storage.googleapis.com');
  if (!url.pathname.endsWith('/latest.json')) fail('Endpoint path must end with /latest.json');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tag) fail('--tag is required (e.g. v1.2.3).');
  if (!args.endpoint) fail('--endpoint is required (public updater manifest URL).');
  validateEndpoint(args.endpoint);

  const { version } = parseVersion(args.tag);

  const conf = JSON.parse(await readFile(CONF, 'utf8'));
  conf.version = version;
  conf.plugins = conf.plugins || {};
  conf.plugins.updater = { ...(conf.plugins.updater || {}), endpoints: [args.endpoint] };
  await writeFile(CONF, `${JSON.stringify(conf, null, 2)}\n`, 'utf8');

  const cargo = await readFile(CARGO, 'utf8');
  const updated = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
  if (updated === cargo) fail(`Could not find package version line in ${CARGO}.`);
  await writeFile(CARGO, updated, 'utf8');

  process.stdout.write(`Desktop build prepared: version ${version}, endpoint ${args.endpoint}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
