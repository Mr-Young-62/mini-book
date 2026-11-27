export interface DownloadOptions {
  url: string;
  sha256: string;
  fileSize: number;
  versionCode: number;
}

export interface BundleDownloadOptions {
  url: string;
  sha256: string;
  fileSize: number;
  version: string;
  versionCode: number;
}

export interface DownloadProgress {
  received: number;
  total: number;
  versionCode: number;
}

export interface DownloadResult {
  path: string;
  sha256: string;
  fileSize: number;
}

export interface InstallBundleResult {
  path: string;
  version: string;
  versionCode: number;
}

export interface InstalledAppInfo {
  versionName: string;
  versionCode: number;
  activeBundleVersion?: string;
  activeBundleVersionCode?: number;
}

export interface FetchManifestResult {
  text: string;
}

export interface InstallResult {
  error?: string;
  action?: 'openSettings';
  settingsIntent?: string;
}

export type AndroidUpdateMode = 'ota' | 'apk';
