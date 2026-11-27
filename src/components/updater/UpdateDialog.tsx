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
      <div className="w-full max-w-md rounded-2xl border border-[#ECEEF2] bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-[#ECEEF2] bg-[#F5F6F8] px-5 py-3">
          <h2 className="text-sm font-bold text-[#14181F]">Pembaruan tersedia</h2>
          <button
            type="button"
            aria-label="Tutup dialog pembaruan"
            onClick={onClose}
            className="text-[#6E737D] hover:text-[#14181F]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-xs text-[#374151]">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#F5F6F8] p-3 font-mono">
            <div>
              <div className="text-[10px] uppercase text-[#6E737D]">Terpasang</div>
              <div>{currentVersion} ({currentVersionCode})</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#6E737D]">Terbaru</div>
              <div>{manifest.version} ({manifest.versionCode})</div>
            </div>
          </div>

          {manifest.changelog.length > 0 && (
            <div>
              <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#6E737D]">Catatan rilis</h3>
              <ul className="list-disc space-y-1 pl-4">
                {manifest.changelog.map((entry, index) => (
                  <li key={`${index}-${entry}`}>{entry}</li>
                ))}
              </ul>
            </div>
          )}

          {downloading && (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-[#ECEEF2]">
                <div className="h-full bg-[#18362F] transition-[width]" style={{ width: `${percent}%` }} />
              </div>
              <div className="flex justify-between font-mono text-[10px] text-[#6E737D]">
                <span>Mengunduh {percent}%</span>
                <span>{formatBytes(download.received)} / {formatBytes(download.total)}</span>
              </div>
            </div>
          )}

          {download.phase === 'ready' && (
            <p className="rounded-lg bg-emerald-50 p-2 text-[11px] text-emerald-800">
              APK terverifikasi dan siap dipasang.
            </p>
          )}

          {download.error && <p className="text-[11px] text-rose-700">Gagal mengunduh: {download.error}</p>}
          {installError && <p className="text-[11px] text-rose-700">Gagal memasang: {installError}</p>}
          {browserError && <p className="text-[11px] text-rose-700">{browserError}</p>}

          {forced && (
            <p className="rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900">
              Versi ini diperlukan. Tombol "Nanti" tidak tersedia.
            </p>
          )}

          <button
            type="button"
            onClick={() => void handleBrowserDownload()}
            className="text-[11px] text-[#7E6F64] underline-offset-2 hover:underline"
          >
            Unduh via browser sebagai ganti
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#ECEEF2] bg-[#F5F6F8] px-5 py-3">
          {!forced && !downloading && (
            <button type="button" onClick={onDismiss} className="px-3 py-1.5 text-xs font-medium text-[#6E737D]">
              Nanti
            </button>
          )}
          {downloading ? (
            <button
              type="button"
              onClick={onCancelDownload}
              className="rounded-xl border border-[#E5E7EB] px-3.5 py-1.5 text-xs font-semibold text-[#14181F]"
            >
              Batal
            </button>
          ) : download.phase === 'ready' ? (
            <button
              type="button"
              onClick={() => void onInstall()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#18362F] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#112822]"
            >
              <Download className="h-3.5 w-3.5" />
              Instal APK
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartDownload}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#18362F] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#112822]"
            >
              <Download className="h-3.5 w-3.5" />
              Unduh APK
            </button>
          )}
          {download.phase === 'ready' && installPermissionRequired && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="min-h-[44px] text-[11px] font-semibold text-[#18362F] underline-offset-2 hover:underline"
            >
              Buka Pengaturan Izin Install
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
