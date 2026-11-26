import { getErrorMessage } from '../lib/errorMessage';

const APP_ID = 'org.readowl.library';
const HOST_ALLOWLIST = new Set(['storage.googleapis.com', 'github.com']);
const APK_PATH_RE = /^(\/[a-z0-9._-]+\/MeelieFont-v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?\.apk|\/[^/]+\/[^/]+\/releases\/download\/v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?\/MeelieFont-v\d+\.\d+\.\d+([.-][A-Za-z0-9.-]+)?\.apk)$/i;
const SHA256_RE = /^[0-9a-f]{64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_APK_BYTES = 500 * 1024 * 1024;

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MANIFEST_TTL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;

const STORAGE_CHECK = 'readowl_update_check';
const STORAGE_MANIFEST = 'readowl_update_manifest';

// Ed25519 public key pinned in the app (Tahap E, S7). Private key lives only in
// the CI secret UPDATER_SIGNING_PRIVATE_KEY; regenerate with
// `node scripts/sign-manifest.mjs --gen-key` and replace this value if rotated.
const UPDATER_PUBLIC_KEY_B64 = 'Y2nWfBUAzPtIWgxncXUwHeKVBtjo9NualiVS94hhARs';

export interface UpdateManifest {
  schemaVersion: number;
  app: string;
  version: string;
  versionCode: number;
  releaseDate: string;
  minimumSupportedVersionCode?: number;
  downloadUrl: string;
  sha256: string;
  fileSize: number;
  changelog: string[];
  forceUpdate: boolean;
  signature?: string;
}

export interface UpdateCheckResult {
  status: 'disabled' | 'unavailable' | 'up_to_date' | 'available';
  manifest: UpdateManifest | null;
  forced: boolean;
  dismissed: boolean;
}

interface CheckState {
  lastCheckAt: string;
  failures: number;
  lastSeenVersionCode: number;
}

interface CachedManifest {
  fetchedAt: string;
  manifest: UpdateManifest;
}

const EMPTY_STATE: CheckState = { lastCheckAt: '', failures: 0, lastSeenVersionCode: 0 };
let inFlight: Promise<UpdateCheckResult> | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function verifySignatureWithKey(manifest: UpdateManifest, publicKeyB64: string): Promise<boolean> {
  if (!manifest.signature) return false;
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return false;
  try {
    const { signature, ...unsigned } = manifest;
    const data = new TextEncoder().encode(canonicalJson(unsigned));
    const publicKey = await subtle.importKey(
      'raw',
      base64UrlToBytes(publicKeyB64),
      { name: 'Ed25519' },
      false,
      ['verify'],
    );
    return await subtle.verify('Ed25519', publicKey, base64UrlToBytes(signature), data);
  } catch {
    return false;
  }
}

export function verifyManifestSignature(manifest: UpdateManifest): Promise<boolean> {
  return verifySignatureWithKey(manifest, UPDATER_PUBLIC_KEY_B64);
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as T;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private mode; caching is optional.
  }
}

export function isAllowedDownloadUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || !HOST_ALLOWLIST.has(url.hostname)) return false;
  return APK_PATH_RE.test(url.pathname);
}

export function validateManifest(raw: unknown): UpdateManifest | null {
  if (!isRecord(raw)) return null;
  if (raw.schemaVersion !== 1 || raw.app !== APP_ID) return null;
  if (typeof raw.version !== 'string' || !raw.version.trim()) return null;
  if (!Number.isInteger(raw.versionCode) || (raw.versionCode as number) <= 0) return null;
  if (typeof raw.releaseDate !== 'string' || !DATE_RE.test(raw.releaseDate)) return null;
  if (!isAllowedDownloadUrl(raw.downloadUrl)) return null;
  if (typeof raw.sha256 !== 'string' || !SHA256_RE.test(raw.sha256)) return null;
  if (!Number.isInteger(raw.fileSize) || (raw.fileSize as number) <= 0 || (raw.fileSize as number) > MAX_APK_BYTES) return null;

  let minimumSupportedVersionCode: number | undefined;
  if (raw.minimumSupportedVersionCode !== undefined) {
    if (!Number.isInteger(raw.minimumSupportedVersionCode)) return null;
    minimumSupportedVersionCode = raw.minimumSupportedVersionCode as number;
    if (minimumSupportedVersionCode < 1 || minimumSupportedVersionCode > (raw.versionCode as number)) return null;
  }
  if (raw.forceUpdate !== undefined && typeof raw.forceUpdate !== 'boolean') return null;
  const changelog = raw.changelog === undefined ? [] : raw.changelog;
  if (!Array.isArray(changelog) || !changelog.every((entry) => typeof entry === 'string')) return null;

  return {
    schemaVersion: 1,
    app: APP_ID,
    version: raw.version,
    versionCode: raw.versionCode as number,
    releaseDate: raw.releaseDate,
    ...(minimumSupportedVersionCode !== undefined ? { minimumSupportedVersionCode } : {}),
    downloadUrl: raw.downloadUrl,
    sha256: raw.sha256,
    fileSize: raw.fileSize as number,
    changelog: changelog as string[],
    forceUpdate: raw.forceUpdate === true,
    ...(typeof raw.signature === 'string' ? { signature: raw.signature } : {}),
  };
}

export function getCurrentVersion(): { version: string; versionCode: number } {
  const rawCode = Number(import.meta.env.VITE_APP_VERSION_CODE || 0);
  const versionCode = Number.isInteger(rawCode) && rawCode > 0 ? rawCode : 0;
  const rawVersion = String(import.meta.env.VITE_APP_VERSION || '').trim();
  return { version: versionCode > 0 && rawVersion ? rawVersion : '0.0.0', versionCode };
}

export function getManifestUrl(): string {
  const value = String(import.meta.env.VITE_UPDATE_MANIFEST_URL || '').trim();
  if (!value) return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' || !HOST_ALLOWLIST.has(url.hostname)) return '';
  if (!url.pathname.endsWith('/latest.json')) return '';
  return url.toString();
}

export function evaluateManifest(
  manifest: UpdateManifest | null,
  currentVersionCode: number,
  dismissedVersionCode: number,
): UpdateCheckResult {
  if (!manifest) return { status: 'unavailable', manifest: null, forced: false, dismissed: false };
  if (manifest.versionCode <= currentVersionCode) {
    return { status: 'up_to_date', manifest, forced: false, dismissed: false };
  }
  const forced = manifest.forceUpdate
    || (manifest.minimumSupportedVersionCode !== undefined && currentVersionCode < manifest.minimumSupportedVersionCode);
  return {
    status: 'available',
    manifest,
    forced,
    dismissed: dismissedVersionCode >= manifest.versionCode,
  };
}

function readState(): CheckState {
  const stored = readJson<CheckState>(STORAGE_CHECK);
  if (!stored) return { ...EMPTY_STATE };
  return {
    lastCheckAt: typeof stored.lastCheckAt === 'string' ? stored.lastCheckAt : '',
    failures: Number.isInteger(stored.failures) && stored.failures! >= 0 ? stored.failures! : 0,
    lastSeenVersionCode: Number.isInteger(stored.lastSeenVersionCode) && stored.lastSeenVersionCode! > 0
      ? stored.lastSeenVersionCode!
      : 0,
  };
}

function readCached(): CachedManifest | null {
  const stored = readJson<CachedManifest>(STORAGE_MANIFEST);
  if (!stored || typeof stored.fetchedAt !== 'string') return null;
  const manifest = validateManifest(stored.manifest);
  if (!manifest) return null;
  return { fetchedAt: stored.fetchedAt, manifest };
}

function freshnessInterval(failures: number): number {
  return Math.min(MAX_INTERVAL_MS, CHECK_INTERVAL_MS * 2 ** Math.min(failures, 2));
}

async function fetchOnce(url: string): Promise<UpdateManifest> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) throw new Error('Manifest is not JSON');
    const raw = await response.json();
    if (!isRecord(raw)) throw new Error('Manifest is not an object');
    // Verify signature on the raw payload BEFORE defaults are injected, so the
    // canonical JSON matches exactly what the server signed.
    if (!(await verifySignatureWithKey(raw as unknown as UpdateManifest, UPDATER_PUBLIC_KEY_B64))) {
      throw new Error('Manifest signature is invalid');
    }
    const manifest = validateManifest(raw);
    if (!manifest) throw new Error('Manifest failed validation');
    return manifest;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithRetry(url: string): Promise<UpdateManifest> {
  try {
    return await fetchOnce(url);
  } catch (firstError) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      return await fetchOnce(url);
    } catch {
      throw firstError;
    }
  }
}

async function runCheck(manual: boolean, force: boolean): Promise<UpdateCheckResult> {
  const current = getCurrentVersion();
  const url = getManifestUrl();
  if (!url || current.versionCode <= 0) {
    return { status: 'disabled', manifest: null, forced: false, dismissed: false };
  }

  let state = readState();
  const cached = readCached();
  const cacheAge = cached ? Date.now() - Date.parse(cached.fetchedAt) : Number.POSITIVE_INFINITY;
  const interval = freshnessInterval(state.failures);
  const skipFetch = !manual && !force
    && state.lastCheckAt
    && Date.now() - Date.parse(state.lastCheckAt) < interval;

  if (skipFetch) {
    return evaluateManifest(
      Number.isFinite(cacheAge) && cacheAge <= MANIFEST_TTL_MS ? cached?.manifest ?? null : null,
      current.versionCode,
      state.lastSeenVersionCode,
    );
  }

  try {
    const manifest = await fetchWithRetry(url);
    state = { lastCheckAt: new Date().toISOString(), failures: 0, lastSeenVersionCode: state.lastSeenVersionCode };
    writeJson(STORAGE_CHECK, state);
    writeJson(STORAGE_MANIFEST, { fetchedAt: state.lastCheckAt, manifest } satisfies CachedManifest);
    return evaluateManifest(manifest, current.versionCode, state.lastSeenVersionCode);
  } catch (error) {
    console.warn('Update manifest check failed:', getErrorMessage(error));
    state = {
      lastCheckAt: new Date().toISOString(),
      failures: state.failures + 1,
      lastSeenVersionCode: state.lastSeenVersionCode,
    };
    writeJson(STORAGE_CHECK, state);
    return evaluateManifest(
      Number.isFinite(cacheAge) && cacheAge <= MANIFEST_TTL_MS ? cached?.manifest ?? null : null,
      current.versionCode,
      state.lastSeenVersionCode,
    );
  }
}

export function checkForUpdate(options: { manual?: boolean; force?: boolean } = {}): Promise<UpdateCheckResult> {
  if (inFlight) return inFlight;
  const task = runCheck(Boolean(options.manual), Boolean(options.force));
  inFlight = task;
  void task.finally(() => {
    if (inFlight === task) inFlight = null;
  });
  return task;
}

export function dismissUpdate(versionCode: number): void {
  const state = readState();
  if (versionCode <= state.lastSeenVersionCode) return;
  writeJson(STORAGE_CHECK, {
    ...state,
    lastSeenVersionCode: versionCode,
    lastCheckAt: state.lastCheckAt || new Date().toISOString(),
  });
}

export function openDownloadUrl(url: string): Promise<unknown> {
  if (!isAllowedDownloadUrl(url)) return Promise.reject(new Error('Download URL is not allowed'));
  return import('@capacitor/browser').then(({ Browser }) => Browser.open({ url }));
}
