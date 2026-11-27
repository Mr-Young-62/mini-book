import React from 'react';
import { Download, RefreshCw, X } from 'lucide-react';

interface DesktopUpdateBannerProps {
  version: string | null;
  notes: string;
  downloading: boolean;
  error: string | null;
  onUpdate: () => void;
  onDismiss: () => void;
}

export const DesktopUpdateBanner: React.FC<DesktopUpdateBannerProps> = ({
  version,
  notes,
  downloading,
  error,
  onUpdate,
  onDismiss,
}) => (
  <div className="fixed inset-x-4 top-4 z-[90] mx-auto flex max-w-lg items-center justify-between gap-4 rounded-[18px] bg-white p-4 shadow-xl">
    <div className="min-w-0">
      <p className="text-sm font-bold text-[#262925]">
        {version ? `Pembaruan v${version} tersedia` : 'Pembaruan tersedia'}
      </p>
      <p className="truncate text-xs text-[#737770]">
        {error ? error : downloading ? 'Mengunduh dan memasang...' : notes || 'Perbaikan dan penyempurnaan aplikasi.'}
      </p>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {!downloading && (
        <button type="button" onClick={onDismiss} className="rounded-[12px] px-2.5 py-1.5 text-xs font-medium text-[#686C65] hover:bg-[#F2EFE8]">
          Nanti
        </button>
      )}
      <button
        type="button"
        onClick={onUpdate}
        disabled={downloading}
        className="btn-primary-tactile inline-flex items-center gap-1 rounded-[12px] px-3.5 py-2 text-xs font-semibold disabled:opacity-60"
      >
        {downloading ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        {downloading ? 'Memperbarui' : 'Perbarui'}
      </button>
    </div>
  </div>
);
