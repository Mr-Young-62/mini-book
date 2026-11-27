import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import {
  canApplyWebBundle,
  checkForUpdate,
  dismissUpdate,
  getCurrentVersion,
  getUpdateConfigStatus,
  openDownloadUrl,
  type UpdateCheckResult,
  type UpdateConfigStatus,
  type UpdateManifest,
} from '../services/updateService';
import {
  cancelApkDownload,
  cleanupOldDownloads,
  confirmOtaBundle,
  downloadAndApplyBundle,
  downloadApk,
  getInstalledInfo,
  installApk as installApkBridge,
  isNativeUpdaterAvailable,
  onDownloadProgress,
  openInstallerSettings,
} from '../services/updaterBridge';
import { getErrorMessage } from '../lib/errorMessage';
import type { AndroidUpdateMode, DownloadResult } from '../types/updater';

export interface DownloadState {
  phase: 'idle' | 'downloading' | 'verifying' | 'ready' | 'error';
  received: number;
  total: number;
  error: string | null;
  result: DownloadResult | null;
}

export interface DesktopUpdateState {
  available: boolean;
  dismissed: boolean;
  currentVersion: string | null;
  version: string | null;
  notes: string;
  downloading: boolean;
  received: number;
  total: number;
  error: string | null;
  manualStatus: 'idle' | 'available' | 'up_to_date' | 'error';
}

export type UpdaterPlatform = 'android' | 'desktop' | 'web';

export interface UpdaterApi {
  platform: UpdaterPlatform;
  checking: boolean;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  status: UpdateCheckResult['status'];
  statusReason: string | null;
  statusMessage: string | null;
  config: UpdateConfigStatus;
  manifest: UpdateManifest | null;
  updateMode: AndroidUpdateMode;
  forced: boolean;
  dismissed: boolean;
  currentVersion: string;
  currentVersionCode: number;
  checkManually: () => Promise<void>;
  dismiss: () => void;
  notifyFromPush: () => void;
  download: DownloadState;
  startDownload: (forceApk?: boolean) => Promise<void>;
  cancelDownload: () => Promise<void>;
  installError: string | null;
  installPermissionRequired: boolean;
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
  reason: null,
  message: null,
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
  dismissed: false,
  currentVersion: null,
  version: null,
  notes: '',
  downloading: false,
  received: 0,
  total: 0,
  error: null,
  manualStatus: 'idle',
};

export function useAppUpdater(): UpdaterApi {
  const envVersion = getCurrentVersion();
  const [checking, setChecking] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult>(initialResult);
  const [download, setDownload] = useState<DownloadState>(initialDownload);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installPermissionRequired, setInstallPermissionRequired] = useState(false);
  const [desktop, setDesktop] = useState<DesktopUpdateState>(initialDesktop);
  const [effectiveVersion, setEffectiveVersion] = useState(envVersion.version);
  const [effectiveVersionCode, setEffectiveVersionCode] = useState(envVersion.versionCode);
  const [nativeVersionCode, setNativeVersionCode] = useState(envVersion.versionCode);
  const effectiveCodeRef = useRef(envVersion.versionCode);

  const platform: UpdaterPlatform = isTauriPlatform()
    ? 'desktop'
    : Capacitor.getPlatform() === 'android'
      ? 'android'
      : 'web';

  const runCheck = useCallback(async (manual: boolean, force = false, versionCodeOverride?: number) => {
    setChecking(true);
    try {
      const next = await checkForUpdate({
        manual,
        force,
        currentVersionCode: versionCodeOverride ?? effectiveCodeRef.current,
      });
      setResult(next);
      if (next.status === 'available' && (!next.dismissed || manual)) {
        setDialogOpen(true);
      }
    } catch (error) {
      console.warn('Update check failed:', getErrorMessage(error));
      setResult({
        status: 'unavailable',
        manifest: null,
        forced: false,
        dismissed: false,
        reason: 'check-failed',
        message: getErrorMessage(error),
      });
    } finally {
      setChecking(false);
    }
  }, []);

  const runDesktopCheck = useCallback(async (manual: boolean) => {
    setChecking(true);
    if (manual) {
      setDesktop((prev) => ({ ...prev, error: null }));
    }
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (update) {
        const version = update.version;
        const currentVersion = update.currentVersion || null;
        const notes = update.body || '';
        await update.close().catch(() => {});

        let dismissedVersion = '';
        try {
          if (manual) {
            window.localStorage.removeItem(DESKTOP_DISMISS_KEY);
          } else {
            dismissedVersion = window.localStorage.getItem(DESKTOP_DISMISS_KEY) || '';
          }
        } catch {}

        const isDismissed = !manual && version === dismissedVersion;
        setDesktop((prev) => ({
          ...prev,
          available: true,
          dismissed: isDismissed,
          currentVersion,
          version,
          notes,
          error: null,
          manualStatus: 'available',
        }));
        if (!isDismissed) {
          setDialogOpen(true);
        }
      } else {
        setDesktop((prev) => ({
          ...prev,
          available: false,
          dismissed: false,
          error: null,
          manualStatus: manual ? 'up_to_date' : prev.manualStatus,
        }));
      }
    } catch (error) {
      const message = getErrorMessage(error);
      console.warn('Desktop update check failed:', message);
      setDesktop((prev) => ({
        ...prev,
        available: false,
        dismissed: false,
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
      }, 2000);
      return () => window.clearTimeout(timer);
    }
    if (Capacitor.getPlatform() !== 'android') return;

    let cancelled = false;
    let timer = 0;

    void confirmOtaBundle().catch(() => {});
    void cleanupOldDownloads().catch((error: unknown) => {
      console.warn('Could not clean old downloads:', error);
    });

    const bootstrapAndroid = async () => {
      let resolvedCode = envVersion.versionCode;
      try {
        const info = await getInstalledInfo();
        if (cancelled) return;
        const nativeCode = Number.isInteger(info.versionCode) && info.versionCode > 0
          ? info.versionCode
          : envVersion.versionCode;
        const bundleCode = Number.isInteger(info.activeBundleVersionCode) && (info.activeBundleVersionCode ?? 0) > 0
          ? info.activeBundleVersionCode!
          : 0;
        resolvedCode = Math.max(envVersion.versionCode, nativeCode, bundleCode);
        const resolvedVersion = bundleCode >= envVersion.versionCode && info.activeBundleVersion
          ? info.activeBundleVersion
          : envVersion.versionCode > 0
            ? envVersion.version
            : info.versionName || envVersion.version;
        effectiveCodeRef.current = resolvedCode;
        setNativeVersionCode(nativeCode);
        setEffectiveVersionCode(resolvedCode);
        setEffectiveVersion(resolvedVersion);
      } catch (error) {
        console.warn('Could not read installed app info:', getErrorMessage(error));
      }

      if (cancelled) return;
      timer = window.setTimeout(() => {
        void runCheck(false, false, resolvedCode);
      }, 2000);
    };

    void bootstrapAndroid();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [platform, envVersion.version, envVersion.versionCode, runCheck, runDesktopCheck]);

  // Keep checking while the app stays open so a release published later still
  // raises the "update / later" popup without needing a restart.
  useEffect(() => {
    if (platform === 'desktop') return;
    const interval = window.setInterval(() => {
      void runCheck(false);
    }, 6 * 60 * 60 * 1000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runCheck(false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [platform, runCheck]);

  const config = useMemo(
    () => getUpdateConfigStatus(effectiveVersionCode),
    [effectiveVersionCode],
  );

  const checkManually = useCallback(() => {
    if (platform === 'desktop') return runDesktopCheck(true);
    return runCheck(true);
  }, [platform, runCheck, runDesktopCheck]);

  const notifyFromPush = useCallback(() => {
    if (platform === 'desktop') {
      void runDesktopCheck(false);
      return;
    }
    void runCheck(false, true);
  }, [platform, runCheck, runDesktopCheck]);

  const dismiss = useCallback(() => {
    if (result.manifest) dismissUpdate(result.manifest.versionCode);
    setResult((prev) => ({ ...prev, dismissed: true }));
    setDialogOpen(false);
  }, [result.manifest]);

  const updateMode: AndroidUpdateMode = useMemo(() => {
    if (
      isNativeUpdaterAvailable() &&
      result.manifest &&
      canApplyWebBundle(result.manifest, nativeVersionCode, effectiveVersionCode)
    ) {
      return 'ota';
    }
    return 'apk';
  }, [result.manifest, nativeVersionCode, effectiveVersionCode]);

  const installApk = useCallback(async (explicitPath?: string) => {
    const path = explicitPath ?? download.result?.path;
    if (!path) {
      setInstallError('APK path is not available');
      return;
    }
    setInstallError(null);
    setInstallPermissionRequired(false);
    try {
      const installResult = await installApkBridge(path);
      if (installResult && installResult.action === 'openSettings') {
        setInstallPermissionRequired(true);
        setInstallError(installResult.error || 'Izin memasang aplikasi dari sumber ini belum diberikan.');
      }
    } catch (error) {
      setInstallError(getErrorMessage(error));
    }
  }, [download.result]);

  const startDownload = useCallback(async (forceApk = false) => {
    const manifest = result.manifest;
    if (!manifest) return;

    if (!isNativeUpdaterAvailable()) {
      await openDownloadUrl(manifest.downloadUrl);
      return;
    }

    const useOta =
      !forceApk &&
      updateMode === 'ota' &&
      Boolean(manifest.bundleUrl && manifest.bundleSha256 && manifest.bundleFileSize);

    setInstallError(null);
    setInstallPermissionRequired(false);

    if (useOta && manifest.bundleUrl && manifest.bundleSha256 && manifest.bundleFileSize) {
      const targetCode = manifest.bundleVersionCode ?? manifest.versionCode;
      const targetVersion = manifest.bundleVersion ?? manifest.version;
      setDownload({
        phase: 'downloading',
        received: 0,
        total: manifest.bundleFileSize,
        error: null,
        result: null,
      });
      const handle = await onDownloadProgress((event) => {
        if (event.versionCode !== targetCode) return;
        setDownload((prev) => prev.phase === 'downloading'
          ? { ...prev, received: event.received, total: event.total || prev.total }
          : prev);
      });
      try {
        await downloadAndApplyBundle({
          url: manifest.bundleUrl,
          sha256: manifest.bundleSha256,
          fileSize: manifest.bundleFileSize,
          version: targetVersion,
          versionCode: targetCode,
        });
        setDownload({
          phase: 'ready',
          received: manifest.bundleFileSize,
          total: manifest.bundleFileSize,
          error: null,
          result: null,
        });
        // Native bridge reloads the WebView automatically via setServerBasePath;
        // trigger a fallback reload in case the page hasn't navigated yet.
        window.setTimeout(() => {
          window.location.reload();
        }, 500);
      } catch (error) {
        setDownload((prev) => ({
          ...prev,
          phase: 'error',
          error: getErrorMessage(error),
        }));
      } finally {
        await handle.remove();
      }
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
      await installApk(downloaded.path);
    } catch (error) {
      setDownload((prev) => ({
        ...prev,
        phase: 'error',
        error: getErrorMessage(error),
      }));
    } finally {
      await handle.remove();
    }
  }, [result.manifest, updateMode, installApk]);

  const cancelDownload = useCallback(async () => {
    try {
      await cancelApkDownload();
    } catch (error) {
      console.warn('Could not cancel download:', error);
    }
    setDownload({ ...initialDownload });
    setInstallError(null);
    setInstallPermissionRequired(false);
  }, []);

  const handleOpenInstallerSettings = useCallback(async () => {
    try {
      await openInstallerSettings();
    } catch (error) {
      setInstallError(getErrorMessage(error));
    }
  }, []);

  const startDesktopUpdate = useCallback(async () => {
    setDesktop((prev) => ({ ...prev, downloading: true, received: 0, total: 0, error: null }));
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check();
      if (!update) {
        setDesktop((prev) => ({
          ...prev,
          available: false,
          dismissed: false,
          downloading: false,
          manualStatus: 'up_to_date',
        }));
        setDialogOpen(false);
        return;
      }

      let downloadedBytes = 0;
      await update.downloadAndInstall(
        (event) => {
          if (event.event === 'Started') {
            downloadedBytes = 0;
            setDesktop((prev) => ({
              ...prev,
              received: 0,
              total: event.data.contentLength || 0,
            }));
          } else if (event.event === 'Progress') {
            downloadedBytes += event.data.chunkLength;
            setDesktop((prev) => ({
              ...prev,
              received: downloadedBytes,
            }));
          } else if (event.event === 'Finished') {
            setDesktop((prev) => ({
              ...prev,
              received: prev.total || downloadedBytes,
            }));
          }
        },
        { restartAfterInstall: true },
      );

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
        error: getErrorMessage(error),
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
      return { ...prev, dismissed: true };
    });
    setDialogOpen(false);
  }, []);

  const openDialog = useCallback(() => {
    setResult((prev) => (prev.dismissed ? { ...prev, dismissed: false } : prev));
    setDesktop((prev) => (prev.dismissed ? { ...prev, dismissed: false } : prev));
    setDialogOpen(true);
  }, []);
  const closeDialog = useCallback(() => setDialogOpen(false), []);

  return useMemo(() => ({
    platform,
    checking,
    dialogOpen,
    openDialog,
    closeDialog,
    status: result.status,
    statusReason: result.reason,
    statusMessage: result.message,
    config,
    manifest: result.manifest,
    updateMode,
    forced: result.forced,
    dismissed: result.dismissed,
    currentVersion: platform === 'desktop' ? desktop.currentVersion || effectiveVersion : effectiveVersion,
    currentVersionCode: effectiveVersionCode,
    checkManually,
    dismiss,
    notifyFromPush,
    download,
    startDownload,
    cancelDownload,
    installError,
    installPermissionRequired,
    installApk: () => installApk(),
    openInstallerSettings: handleOpenInstallerSettings,
    desktop,
    startDesktopUpdate,
    dismissDesktopUpdate,
  }), [
    platform,
    checking,
    dialogOpen,
    openDialog,
    closeDialog,
    result,
    config,
    updateMode,
    effectiveVersion,
    effectiveVersionCode,
    checkManually,
    dismiss,
    notifyFromPush,
    download,
    startDownload,
    cancelDownload,
    installError,
    installPermissionRequired,
    installApk,
    handleOpenInstallerSettings,
    desktop,
    startDesktopUpdate,
    dismissDesktopUpdate,
  ]);
}
