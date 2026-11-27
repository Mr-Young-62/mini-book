#!/usr/bin/env node
// ReadOwl updater — sign latest.json with Ed25519 (Tahap E, S7).
//
// Signs the canonical JSON of the manifest (excluding the signature field) and
// writes `signature` (base64url, 64 bytes) into the output. The public key is
// pinned in the app (src/services/updateService.ts); the private key lives only
// in the CI secret UPDATER_SIGNING_PRIVATE_KEY.
//
// Modes:
//   Generate a keypair (bootstrap):
//     node scripts/sign-manifest.mjs --gen-key --out-key private.b64 --out-pub public.b64
//   Sign a manifest:
//     node scripts/sign-manifest.mjs --in latest.json --key private.b64 --out signed.json
//
// The private key file contains the raw 32-byte Ed25519 seed, base64url encoded.

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

function toBase64Url(buffer) {
  return buffer.toString('base64url');
}

function fromBase64Url(text) {
  return Buffer.from(String(text), 'base64url');
}

function buildPrivateKey(seed) {
  if (seed.length !== 32) throw new Error('Ed25519 private key seed must be 32 bytes.');
  const der = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

function buildPublicKey(seed) {
  const priv = buildPrivateKey(seed);
  const der = createPublicKey(priv).export({ type: 'spki', format: 'der' });
  return der.subarray(der.length - 32);
}

async function genKey(outKey, outPub) {
  const { privateKey } = generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  const seed = privateKey.subarray(privateKey.length - 32);
  await writeFile(outKey, `${toBase64Url(seed)}\n`, 'utf8');
  await writeFile(outPub, `${toBase64Url(buildPublicKey(seed))}\n`, 'utf8');
  process.stdout.write(`Wrote ${outKey} and ${outPub}\nPublic key (pin in app): ${toBase64Url(buildPublicKey(seed))}\n`);
}

async function signManifest(inPath, keyPath, outPath, expectedPublicKey) {
  const manifest = JSON.parse(await readFile(inPath, 'utf8'));
  const seed = fromBase64Url((await readFile(keyPath, 'utf8')).trim());
  const privateKey = buildPrivateKey(seed);
  const publicKey = toBase64Url(buildPublicKey(seed));
  if (expectedPublicKey && expectedPublicKey !== publicKey) {
    throw new Error(
      `Signing key does not match the public key pinned in the app.\n` +
        `  derived : ${publicKey}\n` +
        `  pinned  : ${expectedPublicKey}\n` +
        `The app would reject this manifest. Pin the derived key in src/services/updateService.ts or use the matching private key.`,
    );
  }
  const data = Buffer.from(canonicalJson(manifest), 'utf8');
  const signature = sign(null, data, privateKey);
  const signed = { ...manifest, signature: toBase64Url(signature) };
  await writeFile(outPath, `${JSON.stringify(signed, null, 2)}\n`, 'utf8');
  process.stdout.write(`Signed ${inPath} -> ${outPath}\n  versionCode: ${signed.versionCode}\n  publicKey  : ${publicKey}\n  signature  : ${signed.signature.slice(0, 16)}...\n`);
}

function parseArgs(argv) {
  const args = { genKey: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--gen-key') { args.genKey = true; continue; }
    if (!token.startsWith('--')) throw new Error(`Unexpected argument "${token}".`);
    const key = token.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for --${key}.`);
    args[key] = value;
    i += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args['help'] || args.h) {
    process.stdout.write(
      [
        'Usage:',
        '  node scripts/sign-manifest.mjs --gen-key --out-key <path> --out-pub <path>',
        '  node scripts/sign-manifest.mjs --in <latest.json> --key <private.b64> --out <signed.json> [--expect-pub <base64url>]',
        '',
      ].join('\n'),
    );
    return;
  }
  if (args.genKey) {
    if (!args['out-key'] || !args['out-pub']) throw new Error('--gen-key requires --out-key and --out-pub.');
    await genKey(args['out-key'], args['out-pub']);
    return;
  }
  if (!args.in || !args.key || !args.out) throw new Error('--in, --key and --out are required to sign.');
  await signManifest(args.in, args.key, args.out, args['expect-pub']);
}

try {
  await main();
} catch (error) {
  process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
