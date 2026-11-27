import { describe, expect, it } from 'vitest';
import {
  canApplyWebBundle,
  canonicalJson,
  evaluateManifest,
  getCurrentVersion,
  getUpdateConfigStatus,
  isAllowedBundleUrl,
  isAllowedDownloadUrl,
  validateManifest,
  verifySignatureWithKey,
  type UpdateManifest,
} from './updateService';

const baseManifest = {
  schemaVersion: 1,
  app: 'org.readowl.library',
  version: '1.2.3',
  versionCode: 1002003,
  releaseDate: '2026-11-19',
  downloadUrl: 'https://storage.googleapis.com/meeliefont/MeelieFont-v1.2.3.apk',
  sha256: 'a'.repeat(64),
  fileSize: 25_000_000,
  changelog: ['Perbaikan katalog'],
  forceUpdate: false,
};

const bundleManifest = {
  ...baseManifest,
  bundleUrl: 'https://proj.supabase.co/storage/v1/object/public/app-updates/MeelieFont-bundle-v1.2.3.zip',
  bundleSha256: 'b'.repeat(64),
  bundleFileSize: 1_500_000,
  bundleVersion: '1.2.3',
  bundleVersionCode: 1002003,
  minNativeVersionCode: 1002000,
};

describe('updateService manifest validation', () => {
  it('accepts a complete valid manifest', () => {
    expect(validateManifest(baseManifest)).toEqual(baseManifest);
  });

  it('accepts optional OTA web bundle fields', () => {
    expect(validateManifest(bundleManifest)).toEqual(bundleManifest);
  });

  it('rejects partial or invalid OTA bundle fields', () => {
    const { bundleSha256: _missingSha, ...partial } = bundleManifest;
    expect(validateManifest(partial)).toBeNull();
    expect(validateManifest({ ...bundleManifest, bundleUrl: 'https://evil.example/MeelieFont-bundle-v1.2.3.zip' })).toBeNull();
    expect(validateManifest({ ...bundleManifest, minNativeVersionCode: 2_000_000 })).toBeNull();
  });

  it('rejects wrong app id or schema version', () => {
    expect(validateManifest({ ...baseManifest, app: 'com.other.app' })).toBeNull();
    expect(validateManifest({ ...baseManifest, schemaVersion: 2 })).toBeNull();
  });

  it('rejects invalid versionCode, sha256, fileSize and date', () => {
    expect(validateManifest({ ...baseManifest, versionCode: 0 })).toBeNull();
    expect(validateManifest({ ...baseManifest, versionCode: 1.5 })).toBeNull();
    expect(validateManifest({ ...baseManifest, sha256: 'abc' })).toBeNull();
    expect(validateManifest({ ...baseManifest, fileSize: 600 * 1024 * 1024 })).toBeNull();
    expect(validateManifest({ ...baseManifest, releaseDate: '19-11-2026' })).toBeNull();
  });

  it('rejects invalid optional fields', () => {
    expect(validateManifest({ ...baseManifest, minimumSupportedVersionCode: 2_000_000 })).toBeNull();
    expect(validateManifest({ ...baseManifest, forceUpdate: 'yes' })).toBeNull();
    expect(validateManifest({ ...baseManifest, changelog: [1, 2] })).toBeNull();
  });

  it('fills optional defaults', () => {
    const { forceUpdate: _force, changelog: _changelog, ...required } = baseManifest;
    const parsed = validateManifest(required);
    expect(parsed?.forceUpdate).toBe(false);
    expect(parsed?.changelog).toEqual([]);
  });
});

describe('updateService download URL allowlist', () => {
  it('allows https GCS, Supabase public, and GitHub release APK paths', () => {
    expect(isAllowedDownloadUrl(baseManifest.downloadUrl)).toBe(true);
    expect(isAllowedDownloadUrl('https://abc123.supabase.co/storage/v1/object/public/app-updates/MeelieFont-v1.2.3.apk')).toBe(true);
    expect(isAllowedDownloadUrl('https://github.com/Mr-Young-62/mini-book/releases/download/v1.2.3/MeelieFont-v1.2.3.apk')).toBe(true);
    expect(isAllowedDownloadUrl('http://storage.googleapis.com/bucket/MeelieFont-v1.2.3.apk')).toBe(false);
    expect(isAllowedDownloadUrl('https://evil.example/bucket/MeelieFont-v1.2.3.apk')).toBe(false);
    expect(isAllowedDownloadUrl('https://storage.googleapis.com/bucket/other.apk')).toBe(false);
    expect(isAllowedDownloadUrl('https://github.com/Mr-Young-62/mini-book/releases/download/v1.2.3/other.apk')).toBe(false);
  });

  it('allows https GCS, Supabase public, and GitHub release bundle zip paths', () => {
    expect(isAllowedBundleUrl('https://storage.googleapis.com/meeliefont/MeelieFont-bundle-v1.2.3.zip')).toBe(true);
    expect(isAllowedBundleUrl('https://abc123.supabase.co/storage/v1/object/public/app-updates/MeelieFont-bundle-v1.2.3.zip')).toBe(true);
    expect(isAllowedBundleUrl('https://github.com/Mr-Young-62/mini-book/releases/download/v1.2.3/MeelieFont-bundle-v1.2.3.zip')).toBe(true);
    expect(isAllowedBundleUrl('https://abc123.supabase.co/storage/v1/object/sign/app-updates/MeelieFont-bundle-v1.2.3.zip')).toBe(false);
  });
});

describe('updateService OTA bundle eligibility', () => {
  const parsed = validateManifest(bundleManifest) as UpdateManifest;

  it('allows OTA bundle when native version meets minNativeVersionCode', () => {
    expect(canApplyWebBundle(parsed, 1002000, 1002002)).toBe(true);
    expect(canApplyWebBundle(parsed, 1002001, 1002003)).toBe(false);
    expect(canApplyWebBundle(parsed, 1001999, 1001999)).toBe(false);
  });
});

describe('updateService version decisions', () => {
  const manifest = validateManifest(baseManifest) as UpdateManifest;

  it('reports up_to_date for equal or lower remote versionCode', () => {
    expect(evaluateManifest(manifest, 1002003, 0).status).toBe('up_to_date');
    expect(evaluateManifest(manifest, 1003000, 0).status).toBe('up_to_date');
  });

  it('reports available with forced from forceUpdate or minimum version', () => {
    expect(evaluateManifest(manifest, 1000000, 0)).toMatchObject({ status: 'available', forced: false, dismissed: false });
    expect(evaluateManifest({ ...manifest, forceUpdate: true }, 1000000, 0).forced).toBe(true);
    expect(evaluateManifest({ ...manifest, minimumSupportedVersionCode: 1002000 }, 1001000, 0).forced).toBe(true);
  });

  it('marks dismissed versions but still shows newer ones', () => {
    expect(evaluateManifest(manifest, 1000000, 1002003).dismissed).toBe(true);
    expect(evaluateManifest(manifest, 1000000, 1002002).dismissed).toBe(false);
  });

  it('treats missing manifest as unavailable', () => {
    expect(evaluateManifest(null, 1002003, 0).status).toBe('unavailable');
  });
});

describe('updateService build version', () => {
  it('disables the checker for local builds without injected version', () => {
    expect(getCurrentVersion()).toEqual({ version: '0.0.0', versionCode: 0 });
  });

  it('reports updater configuration as disabled without build env', () => {
    const status = getUpdateConfigStatus();
    expect(status.enabled).toBe(false);
    expect(status.manifestUrl).toBe('');
    expect(status.currentVersionCode).toBe(0);
  });
});

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signManifest(manifest: UpdateManifest, privateKey: CryptoKey): Promise<string> {
  const { signature: _ignored, ...unsigned } = manifest;
  const data = new TextEncoder().encode(canonicalJson(unsigned));
  const signature = await crypto.subtle.sign('Ed25519', privateKey, data);
  return bytesToBase64Url(new Uint8Array(signature));
}

describe('updateService manifest signature (S7)', () => {
  it('verifies a manifest signed with the matching key', async () => {
    const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
      'sign',
      'verify',
    ]);
    const publicB64 = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', publicKey)));
    const unsigned = validateManifest(baseManifest) as UpdateManifest;
    const signed: UpdateManifest = { ...unsigned, signature: await signManifest(unsigned, privateKey) };

    expect(await verifySignatureWithKey(signed, publicB64)).toBe(true);
  });

  it('rejects a tampered manifest', async () => {
    const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
      'sign',
      'verify',
    ]);
    const publicB64 = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', publicKey)));
    const unsigned = validateManifest(baseManifest) as UpdateManifest;
    const signed: UpdateManifest = { ...unsigned, signature: await signManifest(unsigned, privateKey) };
    const tampered: UpdateManifest = { ...signed, versionCode: 1002004 };

    expect(await verifySignatureWithKey(tampered, publicB64)).toBe(false);
  });

  it('rejects a missing or wrong-key signature', async () => {
    const { publicKey: keyA, privateKey: privA } = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
      'sign',
      'verify',
    ]);
    const { publicKey: keyB } = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
    const pubA = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', keyA)));
    const pubB = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', keyB)));
    const unsigned = validateManifest(baseManifest) as UpdateManifest;
    const signed: UpdateManifest = { ...unsigned, signature: await signManifest(unsigned, privA) };

    expect(await verifySignatureWithKey(unsigned, pubA)).toBe(false);
    expect(await verifySignatureWithKey(signed, pubB)).toBe(false);
  });
});
