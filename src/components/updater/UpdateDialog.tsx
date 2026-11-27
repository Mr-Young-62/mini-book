import React from 'react';
import { Download, X } from 'lucide-react';
import type { DownloadState } from '../../hooks/useAppUpdater';
import { getErrorMessage } from '../../lib/errorMessage';
import { openDownloadUrl, type UpdateManifest } from '../../services/updateService';

interface UpdateDialogProps {
  manifest: UpdateManifest;
  currentVersion: string;
  currentVersionCode: number;
  forced: boolean;
  download: DownloadState;
  installError: string | null;
  installPermissionRequired: boolean;
  onStartDownload: () => void;
  onCancelDownload: () => void;
  onInstall: () => Promise<void>;
  onOpenSettings: () => void;
  onClose: () => void;
  onDismiss: () => void;
}

function formatBytes(value: number): string {
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export const UpdateDialog: React.FC<UpdateDialogProps> = ({
  manifest,
  currentVersion,
  currentVersionCode,
  forced,
  download,
  installError,
  installPermissionRequired,
  onStartDownload,
  onCancelDownload,
  onInstall,
  onOpenSettings,
  onClose,
  onDismiss,
}) => {
  const [browserError, setBrowserError] = React.useState<string | null>(null);
  const downloading = download.phase === 'downloading';
  const percent = download.total > 0 ? Math.min(100, Math.round((download.received / download.total) * 100)) : 0;

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !forced && !downloading) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [forced, downloading, onClose]);

  const handleBrowserDownload = async () => {
    setBrowserError(null);
    try {
      await openDownloadUrl(manifest.downloadUrl);
    } catch (error) {
      setBrowserError(getErrorMessage(error));
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pembaruan tersedia"
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md rounded-[18px] bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#ECE7DD] bg-white px-5 py-3.5">
          <h2 className="text-sm font-bold text-[#262925]">Pembaruan tersedia</h2>
          <button
            type="button"
            aria-label="Tutup dialog pembaruan"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F2EFE8] text-[#686C65] hover:bg-[#E7E2D7] hover:text-[#262925]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="divide-y divide-[#ECE7DD] text-xs text-[#363A34]">
          <div className="grid grid-cols-2 divide-x divide-[#ECE7DD] tabular-nums">
            <div className="px-5 py-3.5">
              <div className="text-[11px] font-medium text-[#737770]">Terpasang</div>
              <div className="mt-0.5 font-semibold text-[#262925]">{currentVersion} ({currentVersionCode})</div>
            </div>
            <div className="px-5 py-3.5">
              <div className="text-[11px] font-medium text-[#737770]">Terbaru</div>
              <div className="mt-0.5 font-semibold text-[#165243]">{manifest.version} ({manifest.versionCode})</div>
            </div>
          </div>

          <div className="space-y-3 p-5">
            {manifest.changelog.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-semibold text-[#686C65]">Catatan rilis</h3>
                <ul className="list-disc space-y-1 pl-4">
                  {manifest.changelog.map((entry, index) => (
                    <li key={`${index}-${entry}`}>{entry}</li>
                  ))}
                </ul>
              </div>
            )}

            {downloading && (
              <div className="space-y-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-[#ECE7DD]">
                  <div className="h-full bg-[#1F6F5B] transition-[width]" style={{ width: `${percent}%` }} />
                </div>
                <div className="flex justify-between tabular-nums text-[11px] font-medium text-[#737770]">
                  <span>Mengunduh {percent}%</span>
                  <span>{formatBytes(download.received)} / {formatBytes(download.total)}</span>
                </div>
              </div>
            )}

            {download.phase === 'ready' && (
              <p className="rounded-[12px] bg-[#E5F2EE] p-3 text-[11px] font-medium text-[#165243]">
                <span className="acronym">APK</span> terverifikasi dan siap dipasang.
              </p>
            )}

            {download.error && <p className="text-[11px] text-[#B3261E]">Gagal mengunduh: {download.error}</p>}
            {installError && <p className="text-[11px] text-[#B3261E]">Gagal memasang: {installError}</p>}
            {browserError && <p className="text-[11px] text-[#B3261E]">{browserError}</p>}

            {forced && (
              <p className="rounded-[12px] bg-[#F7EAE4] p-3 text-[11px] font-medium text-[#9E4028]">
                Versi ini diperlukan. Tombol “Nanti” tidak tersedia.
              </p>
            )}

            <button
              type="button"
              onClick={() => void handleBrowserDownload()}
              className="text-[11px] font-medium text-[#686C65] underline-offset-2 hover:text-[#1F6F5B] hover:underline"
            >
              Unduh via browser sebagai ganti
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#ECE7DD] bg-white px-5 py-3.5">
          {!forced && !downloading && (
            <button type="button" onClick={onDismiss} className="rounded-[12px] px-3 py-2 text-xs font-medium text-[#686C65] hover:bg-[#F2EFE8]">
              Nanti
            </button>
          )}
          {downloading ? (
            <button
              type="button"
              onClick={onCancelDownload}
              className="rounded-[12px] bg-[#F2EFE8] px-4 py-2 text-xs font-semibold text-[#262925] hover:bg-[#E7E2D7]"
            >
              Batal
            </button>
          ) : download.phase === 'ready' ? (
            <button
              type="button"
              onClick={() => void onInstall()}
              className="btn-primary-tactile inline-flex items-center gap-1.5 rounded-[12px] px-4 py-2 text-xs font-semibold"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Instal <span className="acronym">APK</span></span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartDownload}
              className="btn-primary-tactile inline-flex items-center gap-1.5 rounded-[12px] px-4 py-2 text-xs font-semibold"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Unduh <span className="acronym">APK</span></span>
            </button>
          )}
          {download.phase === 'ready' && installPermissionRequired && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="min-h-[44px] text-[11px] font-semibold text-[#165243] underline-offset-2 hover:underline"
            >
              Buka Pengaturan Izin Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
