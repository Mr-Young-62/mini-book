#!/usr/bin/env node
// Assemble the Tauri v2 updater manifest (desktop/latest.json) from signed
// artifacts produced by the Windows and macOS build jobs (Tahap F).
//
// Manifest shape (Tauri updater v2):
//   { version, notes, pub_date, platforms: { "<target>": { signature, url } } }
//
// The `signature` value is the verbatim content of the artifact's .sig file
// (minisign, base64). The manifest is uploaded only AFTER every artifact it
// references is on the public bucket (same golden rule as the APK manifest).
//
// Usage:
//   node scripts/generate-desktop-manifest.mjs \
//     --version 1.2.3 --in build-artifacts --base-url https://storage.googleapis.com/BUCKET/desktop \
//     --notes-file changes.txt --out latest.json

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const REQUIRED_TARGETS = ['darwin-aarch64', 'windows-x86_64'];

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

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function targetFor(fileName) {
  if (/\.exe$/i.test(fileName)) return 'windows-x86_64';
  if (/\.app\.tar\.gz$/i.test(fileName)) {
    if (/_aarch64\./i.test(fileName) || /aarch64/i.test(fileName)) return 'darwin-aarch64';
    if (/_x64\.|x86_64/i.test(fileName)) return 'darwin-x86_64';
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.version || !args['base-url'] || !args.in || !args.out) {
    fail('--version, --in, --base-url and --out are required.');
  }
  if (!/^\d+\.\d+\.\d+$/.test(args.version)) fail('--version must be MAJOR.MINOR.PATCH.');
  const baseUrl = new URL(args['base-url']);
  const isGcs = baseUrl.protocol === 'https:' && baseUrl.hostname === 'storage.googleapis.com';
  const isGitHub = baseUrl.protocol === 'https:'
    && baseUrl.hostname === 'github.com'
    && /^\/[^/]+\/[^/]+\/releases\/download\/v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?$/.test(baseUrl.pathname);
  if (!isGcs && !isGitHub) {
    fail('--base-url must be an https://storage.googleapis.com/... or GitHub release download URL.');
  }

  const files = await walk(args.in);
  const signatures = new Map();
  for (const file of files) {
    if (!file.toLowerCase().endsWith('.sig')) continue;
    const target = targetFor(file.replace(/\.sig$/i, ''));
    if (!target || signatures.has(target)) continue;
    signatures.set(target, {
      artifact: file.replace(/\.sig$/i, ''),
      signature: (await readFile(file, 'utf8')).trim(),
    });
  }

  const platforms = {};
  for (const target of REQUIRED_TARGETS) {
    const found = signatures.get(target);
    if (!found) fail(`Missing signed artifact for target "${target}".`);
    const artifactName = found.artifact.split('/').pop().split('\\').pop();
    platforms[target] = {
      signature: found.signature,
      url: `${baseUrl.origin}${baseUrl.pathname.replace(/\/$/, '')}/${encodeURIComponent(artifactName)}`,
    };
  }

  const notes = args['notes-file'] ? (await readFile(args['notes-file'], 'utf8')).trim() : '';
  const manifest = {
    version: args.version,
    notes,
    pub_date: args['pub-date'] || new Date().toISOString(),
    platforms,
  };
  await writeFile(args.out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `Wrote ${args.out}\n  version  : ${manifest.version}\n  platforms: ${Object.keys(platforms).join(', ')}\n`,
  );
}

try {
  await main();
} catch (error) {
  process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
