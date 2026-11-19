import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type {
  DownloadOptions,
  DownloadProgress,
  DownloadResult,
} from '../types/updater';
import type { UpdateManifest } from './updateService';

interface AppUpdaterBridge {
  download(options: DownloadOptions): Promise<DownloadResult>;
  cancel(): Promise<void>;
  cleanup(): Promise<void>;
  install(options: { path: string }): Promise<void>;
  openSettings(): Promise<void>;
  addListener(eventName: 'downloadProgress', listenerFunc: (event: DownloadProgress) => void): Promise<PluginListenerHandle>;
}

const AppUpdater = registerPlugin<AppUpdaterBridge>('AppUpdater');

export function isNativeUpdaterAvailable(): boolean {
  return Capacitor.getPlatform() === 'android';
}

export function downloadApk(manifest: UpdateManifest): Promise<DownloadResult> {
  return AppUpdater.download({
    url: manifest.downloadUrl,
    sha256: manifest.sha256,
    fileSize: manifest.fileSize,
    versionCode: manifest.versionCode,
  });
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

export function installApk(path: string): Promise<void> {
  return AppUpdater.install({ path });
}

export function openInstallerSettings(): Promise<void> {
  return AppUpdater.openSettings();
}
