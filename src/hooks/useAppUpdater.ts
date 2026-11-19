import { useCallback, useEffect, useMemo, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  checkForUpdate,
  dismissUpdate,
  getCurrentVersion,
  openDownloadUrl,
  type UpdateCheckResult,
  type UpdateManifest,
} from '../services/updateService';
import {
  cancelApkDownload,
  cleanupOldDownloads,
  downloadApk,
  installApk as installApkBridge,
  isNativeUpdaterAvailable,
  onDownloadProgress,
  openInstallerSettings,
} from '../services/updaterBridge';
import type { DownloadResult } from '../types/updater';

export interface DownloadState {
  phase: 'idle' | 'downloading' | 'verifying' | 'ready' | 'error';
  received: number;
  total: number;
  error: string | null;
  result: DownloadResult | null;
}

export interface DesktopUpdateState {
  available: boolean;
  version: string | null;
  notes: string;
  downloading: boolean;
  error: string | null;
  manualStatus: 'idle' | 'available' | 'up_to_date' | 'error';
}

export type UpdaterPlatform = 'android' | 'desktop' | 'web';

export interface UpdaterApi {
  platform: UpdaterPlatform;
  checking: boolean;
  status: UpdateCheckResult['status'];
  manifest: UpdateManifest | null;
  forced: boolean;
  dismissed: boolean;
  currentVersion: string;
  currentVersionCode: number;
  checkManually: () => Promise<void>;
  dismiss: () => void;
  notifyFromPush: () => void;
  download: DownloadState;
  startDownload: () => Promise<void>;
  cancelDownload: () => Promise<void>;
  installError: string | null;
  installApk: () => Promise<void>;
  openInstallerSettings: () => Promise<void>;
  desktop: DesktopUpdateState;
  startDesktopUpdate: () => Promise<void>;
  dismissDesktopUpdate: () => void;
}

const DESKTOP_DISMISS_KEY = 'readowl_update_dismissed_desktop';

export function isTauriPlatform(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

const initialResult: UpdateCheckResult = {
  status: 'disabled',
  manifest: null,
  forced: false,
  dismissed: false,
};

const initialDownload: DownloadState = {
  phase: 'idle',
  received: 0,
  total: 0,
  error: null,
  result: null,
};

const initialDesktop: DesktopUpdateState = {
  available: false,
  version: null,
  notes: '',
  downloading: false,
  error: null,
  manualStatus: 'idle',
};

export function useAppUpdater(): UpdaterApi {
  const current = getCurrentVersion();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult>(initialResult);
  const [download, setDownload] = useState<DownloadState>(initialDownload);
  const [installError, setInstallError] = useState<string | null>(null);
  const [desktop, setDesktop] = useState<DesktopUpdateState>(initialDesktop);
  const platform: UpdaterPlatform = isTauriPlatform()
    ? 'desktop'
    : Capacitor.getPlatform() === 'android'
      ? 'android'
      : 'web';

  const runCheck = useCallback(async (manual: boolean, force = false) => {
    setChecking(true);
    try {
      setResult(await checkForUpdate({ manual, force }));
    } catch (error) {
      console.warn('Update check failed:', error instanceof Error ? error.message : String(error));
      setResult({ status: 'unavailable', manifest: null, forced: false, dismissed: false });
    } finally {
      setChecking(false);
    }
  }, []);

  const runDesktopCheck = useCallback(async (manual: boolean) => {
    setChecking(true);
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      const dismissedVersion = window.localStorage.getItem(DESKTOP_DISMISS_KEY) || '';
      if (update && update.version !== dismissedVersion) {
        setDesktop((prev) => ({
          ...prev,
          available: true,
          version: update.version,
          notes: update.body || '',
          error: null,
          manualStatus: 'available',
        }));
      } else {
        setDesktop((prev) => ({
          ...prev,
          available: false,
          manualStatus: manual ? 'up_to_date' : prev.manualStatus,
        }));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('Desktop update check failed:', message);
      setDesktop((prev) => ({
        ...prev,
        error: manual ? message : prev.error,
        manualStatus: manual ? 'error' : prev.manualStatus,
      }));
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (platform === 'desktop') {
      const timer = window.setTimeout(() => {
        void runDesktopCheck(false);
      }, 3000);
      return () => window.clearTimeout(timer);
    }
    if (Capacitor.getPlatform() !== 'android') return;
    void cleanupOldDownloads().catch((error: unknown) => {
      console.warn('Could not clean old downloads:', error);
    });
    const timer = window.setTimeout(() => {
      void runCheck(false);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [platform, runCheck, runDesktopCheck]);

  const checkManually = useCallback(() => {
    if (platform === 'desktop') return runDesktopCheck(true);
    return runCheck(true);
  }, [platform, runCheck, runDesktopCheck]);
  const notifyFromPush = useCallback(() => {
    void runCheck(false, true);
  }, [runCheck]);

  const dismiss = useCallback(() => {
    if (result.manifest) dismissUpdate(result.manifest.versionCode);
    setResult((prev) => ({ ...prev, dismissed: true }));
  }, [result.manifest]);

  const startDownload = useCallback(async () => {
    const manifest = result.manifest;
    if (!manifest) return;

    if (!isNativeUpdaterAvailable()) {
      await openDownloadUrl(manifest.downloadUrl);
      return;
    }

    setDownload({
      phase: 'downloading',
      received: 0,
      total: manifest.fileSize,
      error: null,
      result: null,
    });
    const handle = await onDownloadProgress((event) => {
      if (event.versionCode !== manifest.versionCode) return;
      setDownload((prev) => prev.phase === 'downloading'
        ? { ...prev, received: event.received, total: event.total || prev.total }
        : prev);
    });
    try {
      const downloaded = await downloadApk(manifest);
      setDownload({
        phase: 'ready',
        received: downloaded.fileSize,
        total: downloaded.fileSize,
        error: null,
        result: downloaded,
      });
    } catch (error) {
      setDownload((prev) => ({
        ...prev,
        phase: 'error',
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      await handle.remove();
    }
  }, [result.manifest]);

  const cancelDownload = useCallback(async () => {
    try {
      await cancelApkDownload();
    } catch (error) {
      console.warn('Could not cancel download:', error);
    }
    setDownload({ ...initialDownload });
  }, []);

  const installApk = useCallback(async () => {
    const path = download.result?.path;
    if (!path) {
      setInstallError('APK path is not available');
      return;
    }
    setInstallError(null);
    try {
      await installApkBridge(path);
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : String(error));
    }
  }, [download.result]);

  const handleOpenInstallerSettings = useCallback(async () => {
    try {
      await openInstallerSettings();
    } catch (error) {
      setInstallError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const startDesktopUpdate = useCallback(async () => {
    setDesktop((prev) => ({ ...prev, downloading: true, error: null }));
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) {
        setDesktop((prev) => ({ ...prev, available: false, downloading: false, manualStatus: 'up_to_date' }));
        return;
      }
      await update.downloadAndInstall();
      try {
        const { relaunch } = await import('@tauri-apps/plugin-process');
        await relaunch();
      } catch {
        setDesktop((prev) => ({
          ...prev,
          downloading: false,
          error: 'Pembaruan sudah terpasang. Tutup dan buka kembali aplikasi untuk memuat versi baru.',
        }));
      }
    } catch (error) {
      setDesktop((prev) => ({
        ...prev,
        downloading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }, []);

  const dismissDesktopUpdate = useCallback(() => {
    setDesktop((prev) => {
      if (prev.version) {
        try {
          window.localStorage.setItem(DESKTOP_DISMISS_KEY, prev.version);
        } catch {}
      }
      return { ...prev, available: false };
    });
  }, []);

  return useMemo(() => ({
    platform,
    checking,
    status: result.status,
    manifest: result.manifest,
    forced: result.forced,
    dismissed: result.dismissed,
    currentVersion: current.version,
    currentVersionCode: current.versionCode,
    checkManually,
    dismiss,
    notifyFromPush,
    download,
    startDownload,
    cancelDownload,
    installError,
    installApk,
    openInstallerSettings: handleOpenInstallerSettings,
    desktop,
    startDesktopUpdate,
    dismissDesktopUpdate,
  }), [platform, checking, result, current.version, current.versionCode, checkManually, dismiss, notifyFromPush, download, startDownload, cancelDownload, installError, installApk, handleOpenInstallerSettings, desktop, startDesktopUpdate, dismissDesktopUpdate]);
}
