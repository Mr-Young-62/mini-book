import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type {
  BundleDownloadOptions,
  DownloadOptions,
  DownloadProgress,
  DownloadResult,
  FetchManifestResult,
  InstallBundleResult,
  InstalledAppInfo,
  InstallResult,
} from '../types/updater';
import type { UpdateManifest } from './updateService';

interface AppUpdaterBridge {
  fetchManifest(options: { url: string }): Promise<FetchManifestResult>;
  getInstalledInfo(): Promise<InstalledAppInfo>;
  download(options: DownloadOptions): Promise<DownloadResult>;
  downloadBundle(options: BundleDownloadOptions): Promise<InstallBundleResult>;
  confirmBundle(): Promise<void>;
  cancel(): Promise<void>;
  cleanup(): Promise<void>;
  install(options: { path: string }): Promise<InstallResult | void>;
  openSettings(): Promise<void>;
  addListener(eventName: 'downloadProgress', listenerFunc: (event: DownloadProgress) => void): Promise<PluginListenerHandle>;
}

const AppUpdater = registerPlugin<AppUpdaterBridge>('AppUpdater');

export function isNativeUpdaterAvailable(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export async function fetchManifestNative(url: string): Promise<string> {
  const result = await AppUpdater.fetchManifest({ url });
  return result.text;
}

export function getInstalledInfo(): Promise<InstalledAppInfo> {
  return AppUpdater.getInstalledInfo();
}

export function downloadApk(manifest: UpdateManifest): Promise<DownloadResult> {
  return AppUpdater.download({
    url: manifest.downloadUrl,
    sha256: manifest.sha256,
    fileSize: manifest.fileSize,
    versionCode: manifest.versionCode,
  });
}

export function downloadAndApplyBundle(options: BundleDownloadOptions): Promise<InstallBundleResult> {
  return AppUpdater.downloadBundle(options);
}

export function confirmOtaBundle(): Promise<void> {
  return AppUpdater.confirmBundle();
}

export function cancelApkDownload(): Promise<void> {
  return AppUpdater.cancel();
}

export function onDownloadProgress(listener: (event: DownloadProgress) => void): Promise<PluginListenerHandle> {
  return AppUpdater.addListener('downloadProgress', listener);
}

export function cleanupOldDownloads(): Promise<void> {
  return AppUpdater.cleanup();
}

export function installApk(path: string): Promise<InstallResult | void> {
  return AppUpdater.install({ path });
}

export function openInstallerSettings(): Promise<void> {
  return AppUpdater.openSettings();
}
