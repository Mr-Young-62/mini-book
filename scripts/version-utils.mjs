#!/usr/bin/env node
// ReadOwl updater — version utilities (Tahap A).
//
// versionCode scheme (monotonic, SemVer-consistent):
//   versionCode = MAJOR * 1_000_000 + MINOR * 1_000 + PATCH
// Constraints:
//   - MINOR and PATCH must be 0..999 (three-digit slots keep the mapping lossless)
//   - versionCode must stay within the Android limit (2_100_000_000)
//   - Pre-release tags (e.g. 1.2.3-rc.1) are rejected: they would collide with the
//     release versionCode and break monotonicity.
//
// This module is imported by scripts/generate-latest-manifest.mjs and can also be
// used as a CLI:  node scripts/version-utils.mjs <version|tag>  -> prints versionCode.

import { pathToFileURL } from 'node:url';

/** Android's maximum supported versionCode. */
export const MAX_ANDROID_VERSION_CODE = 2_100_000_000;

const SEMVER_RE = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * Parse a strict SemVer core version (an optional leading "v" tag prefix is allowed).
 * @param {string} input e.g. "1.2.3" or tag "v1.2.3"
 * @returns {{major: number, minor: number, patch: number, version: string, versionCode: number}}
 */
export function parseVersion(input) {
  const raw = String(input ?? '').trim();
  const match = SEMVER_RE.exec(raw);
  if (!match) {
    throw new Error(
      `Invalid version "${raw}": expected MAJOR.MINOR.PATCH (optionally prefixed with "v"). ` +
        'Pre-release/build suffixes are not supported.',
    );
  }
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (minor > 999 || patch > 999) {
    throw new Error(
      `Invalid version "${raw}": MINOR and PATCH must be between 0 and 999 for the versionCode scheme.`,
    );
  }
  const versionCode = major * 1_000_000 + minor * 1_000 + patch;
  if (versionCode > MAX_ANDROID_VERSION_CODE) {
    throw new Error(
      `Invalid version "${raw}": versionCode ${versionCode} exceeds the Android maximum ` +
        `${MAX_ANDROID_VERSION_CODE}. Reduce MAJOR (max ${Math.floor(MAX_ANDROID_VERSION_CODE / 1_000_000)}).`,
    );
  }
  return { major, minor, patch, version: `${major}.${minor}.${patch}`, versionCode };
}

/**
 * Compute the numeric versionCode for a version or git tag.
 * @param {string} input e.g. "1.2.3" or "v1.2.3"
 * @returns {number}
 */
export function computeVersionCode(input) {
  return parseVersion(input).versionCode;
}

/**
 * Monotonicity gate: the next published versionCode must be strictly greater than the
 * currently published one. A missing published manifest (null) bootstraps the first release.
 *
 * @param {number | null | undefined} publishedVersionCode versionCode from the remote latest.json (null = none yet)
 * @param {number} nextVersionCode versionCode about to be published
 * @returns {{published: number | null, next: number}}
 * @throws when the remote manifest is unusable or the next code is not strictly greater
 */
export function assertNextVersionCode(publishedVersionCode, nextVersionCode) {
  if (!Number.isInteger(nextVersionCode) || nextVersionCode < 1) {
    throw new Error(`Next versionCode must be a positive integer (got ${JSON.stringify(nextVersionCode)}).`);
  }
  if (publishedVersionCode === null || publishedVersionCode === undefined) {
    return { published: null, next: nextVersionCode };
  }
  if (!Number.isInteger(publishedVersionCode) || publishedVersionCode < 1) {
    throw new Error(
      `Published manifest has an unusable versionCode (${JSON.stringify(publishedVersionCode)}); ` +
        'refusing to publish over it (fail closed).',
    );
  }
  if (nextVersionCode <= publishedVersionCode) {
    throw new Error(
      `versionCode must increase: next=${nextVersionCode} is not greater than published=${publishedVersionCode}.`,
    );
  }
  return { published: publishedVersionCode, next: nextVersionCode };
}

function usage() {
  process.stderr.write(
    'Usage: node scripts/version-utils.mjs <version|tag>\n' +
      '  Computes the updater versionCode (MAJOR*1e6 + MINOR*1e3 + PATCH).\n' +
      '  Example: node scripts/version-utils.mjs v1.2.3  ->  1002003\n',
  );
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    usage();
    process.exitCode = 0;
    return;
  }
  const input = argv.filter((a) => !a.startsWith('--'))[0];
  if (!input) {
    usage();
    process.exitCode = 1;
    return;
  }
  const { versionCode, version } = parseVersion(input);
  process.stdout.write(`${versionCode}\n`);
  if (version !== input.replace(/^v/, '')) {
    // Normalization note (e.g. accidental leading zeros already rejected by the regex).
    process.stderr.write(`normalized: ${input} -> ${version}\n`);
  }
}

// Run only when executed directly (importing as a module must have no side effects).
// pathToFileURL keeps this correct on Windows (C:\... -> file:///C:/...).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
