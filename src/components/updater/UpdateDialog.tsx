import React from 'react';
import { Download, X } from 'lucide-react';
import type { DownloadState } from '../../hooks/useAppUpdater';
import { openDownloadUrl, type UpdateManifest } from '../../services/updateService';

interface UpdateDialogProps {
  manifest: UpdateManifest;
  currentVersion: string;
  currentVersionCode: number;
  forced: boolean;
  download: DownloadState;
  installError: string | null;
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

  const handleBrowserDownload = async () => {
    setBrowserError(null);
    try {
      await openDownloadUrl(manifest.downloadUrl);
    } catch (error) {
      setBrowserError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-md rounded-2xl border border-[#E5E0D8] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#EAE5DE] bg-[#FAF8F5] px-5 py-3">
          <h2 className="text-sm font-bold text-[#2C221E]">Pembaruan tersedia</h2>
          <button type="button" onClick={onClose} className="text-[#7E6F64] hover:text-[#2C221E]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-5 text-xs text-[#4A3E35]">
          <div className="grid grid-cols-2 gap-2 rounded-lg bg-[#FAF8F5] p-3 font-mono">
            <div>
              <div className="text-[10px] uppercase text-[#7E6F64]">Terpasang</div>
              <div>{currentVersion} ({currentVersionCode})</div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-[#7E6F64]">Terbaru</div>
              <div>{manifest.version} ({manifest.versionCode})</div>
            </div>
          </div>

          {manifest.changelog.length > 0 && (
            <div>
              <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[#7E6F64]">Catatan rilis</h3>
              <ul className="list-disc space-y-1 pl-4">
                {manifest.changelog.map((entry, index) => (
                  <li key={`${index}-${entry}`}>{entry}</li>
                ))}
              </ul>
            </div>
          )}

          {downloading && (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded-full bg-[#F0ECE4]">
                <div className="h-full bg-[#c62828] transition-all" style={{ width: `${percent}%` }} />
              </div>
              <div className="flex justify-between font-mono text-[10px] text-[#7E6F64]">
                <span>Mengunduh {percent}%</span>
                <span>{formatBytes(download.received)} / {formatBytes(download.total)}</span>
              </div>
            </div>
          )}

          {download.phase === 'ready' && (
            <p className="rounded-lg bg-emerald-50 p-2 text-[11px] text-emerald-800">
              APK terverifikasi. Pemasangan dalam aplikasi ditambahkan pada tahap berikutnya.
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

        <div className="flex items-center justify-end gap-2 border-t border-[#EAE5DE] bg-[#FAF8F5] px-5 py-3">
          {!forced && !downloading && (
            <button type="button" onClick={onDismiss} className="px-3 py-1.5 text-xs font-medium text-[#7E6F64]">
              Nanti
            </button>
          )}
          {downloading ? (
            <button
              type="button"
              onClick={onCancelDownload}
              className="rounded-lg border border-[#D4CDC3] px-3.5 py-1.5 text-xs font-semibold text-[#2C221E]"
            >
              Batal
            </button>
          ) : download.phase === 'ready' ? (
            <button
              type="button"
              onClick={() => void onInstall()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#c62828] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#a61f1f]"
            >
              <Download className="h-3.5 w-3.5" />
              Instal APK
            </button>
          ) : (
            <button
              type="button"
              onClick={onStartDownload}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#c62828] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#a61f1f]"
            >
              <Download className="h-3.5 w-3.5" />
              Unduh APK
            </button>
          )}
          {download.phase === 'ready' && (
            <button
              type="button"
              onClick={onOpenSettings}
              className="text-[11px] text-[#7E6F64] underline-offset-2 hover:underline"
            >
              Izin tidak diberikan? Buka Pengaturan
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
