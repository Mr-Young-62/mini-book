#!/usr/bin/env node
// Prepare src-tauri for a tagged desktop build (Tahap F).

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
  const isGcs = url.hostname === 'storage.googleapis.com' && url.pathname.endsWith('/latest.json');
  const isSupabase = /^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)
    && /^\/storage\/v1\/object\/public\/[a-z0-9._-]+\/(?:[a-z0-9._-]+\/)*latest\.json$/i.test(url.pathname);
  const isGitHub = url.hostname === 'github.com'
    && /^\/[^/]+\/[^/]+\/releases\/(?:latest\/download|download\/v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?)\/[^/]+\.json$/.test(url.pathname);
  if (!isGcs && !isSupabase && !isGitHub) {
    fail('Endpoint must be a GCS, Supabase Storage public, or GitHub release JSON asset URL.');
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tag) fail('--tag is required (e.g. v1.2.3).');
  const updaterEnabled = args.updater !== 'false';
  if (updaterEnabled) {
    if (!args.endpoint) fail('--endpoint is required when the updater is enabled.');
    validateEndpoint(args.endpoint);
  }

  const { version } = parseVersion(args.tag);

  const conf = JSON.parse(await readFile(CONF, 'utf8'));
  conf.version = version;
  conf.bundle = conf.bundle || {};
  conf.bundle.createUpdaterArtifacts = updaterEnabled;
  conf.plugins = conf.plugins || {};
  if (updaterEnabled) {
    conf.plugins.updater = { ...(conf.plugins.updater || {}), endpoints: [args.endpoint] };
  } else {
    delete conf.plugins.updater;
  }
  await writeFile(CONF, `${JSON.stringify(conf, null, 2)}\n`, 'utf8');

  const cargo = await readFile(CARGO, 'utf8');
  const updated = cargo.replace(/^version = ".*"$/m, `version = "${version}"`);
  if (updated === cargo) fail(`Could not find package version line in ${CARGO}.`);
  await writeFile(CARGO, updated, 'utf8');

  process.stdout.write(`Desktop build prepared: version ${version}, updater ${updaterEnabled ? `endpoint ${args.endpoint}` : 'disabled'}\n`);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
