import type { PluginListenerHandle } from '@capacitor/core';

export interface DownloadOptions {
  url: string;
  sha256: string;
  fileSize: number;
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
