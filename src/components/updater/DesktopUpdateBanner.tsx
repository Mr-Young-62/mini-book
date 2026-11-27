import React from 'react';
import { Download, RefreshCw, X } from 'lucide-react';

interface DesktopUpdateBannerProps {
  version: string | null;
  notes: string;
  downloading: boolean;
  error: string | null;
  onOpen: () => void;
  onUpdate: () => void;
  onDismiss: () => void;
}

interface DesktopUpdateDialogProps {
  currentVersion: string;
  version: string | null;
  notes: string;
  downloading: boolean;
  received: number;
  total: number;
  error: string | null;
  onUpdate: () => void;
  onClose: () => void;
  onDismiss: () => void;
}

function formatBytes(value: number): string {
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export const DesktopUpdateBanner: React.FC<DesktopUpdateBannerProps> = ({
  version,
  notes,
  downloading,
  error,
  onOpen,
  onUpdate,
  onDismiss,
}) => (
  <div className="fixed inset-x-4 top-4 z-[90] mx-auto flex max-w-lg items-center justify-between gap-4 rounded-[18px] bg-white p-4 shadow-xl">
    <button type="button" onClick={onOpen} className="min-w-0 text-left">
      <p className="text-sm font-bold text-[#262925]">
        {version ? `Pembaruan v${version} tersedia` : 'Pembaruan tersedia'}
      </p>
      <p className="truncate text-xs text-[#737770]">
        {error ? error : downloading ? 'Mengunduh dan memasang...' : notes || 'Klik untuk melihat detail pembaruan.'}
      </p>
    </button>
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

export const DesktopUpdateDialog: React.FC<DesktopUpdateDialogProps> = ({
  currentVersion,
  version,
  notes,
  downloading,
  received,
  total,
  error,
  onUpdate,
  onClose,
  onDismiss,
}) => {
  const noteLines = notes.split('\n').map((line) => line.trim()).filter(Boolean);
  const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !downloading) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [downloading, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pembaruan aplikasi tersedia"
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-md overflow-hidden rounded-[18px] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#ECE7DD] bg-white px-5 py-3.5">
          <h2 className="text-sm font-bold text-[#262925]">Pembaruan aplikasi tersedia</h2>
          {!downloading && (
            <button
              type="button"
              aria-label="Tutup dialog pembaruan"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#F2EFE8] text-[#686C65] hover:bg-[#E7E2D7] hover:text-[#262925]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="divide-y divide-[#ECE7DD] text-xs text-[#363A34]">
          <div className="grid grid-cols-2 divide-x divide-[#ECE7DD] tabular-nums">
            <div className="px-5 py-3.5">
              <div className="text-[11px] font-medium text-[#737770]">Terpasang</div>
              <div className="mt-0.5 font-semibold text-[#262925]">{currentVersion}</div>
            </div>
            <div className="px-5 py-3.5">
              <div className="text-[11px] font-medium text-[#737770]">Terbaru</div>
              <div className="mt-0.5 font-semibold text-[#165243]">{version || '-'}</div>
            </div>
          </div>

          <div className="space-y-3 p-5">
            {noteLines.length > 0 && (
              <div>
                <h3 className="mb-1.5 text-xs font-semibold text-[#686C65]">Catatan rilis</h3>
                <ul className="list-disc space-y-1 pl-4">
                  {noteLines.map((line, index) => (
                    <li key={`${index}-${line}`}>{line.replace(/^-+\s*/, '')}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="rounded-[12px] bg-[#F5F3EE] p-3 text-[11px] text-[#575B54]">
              Pembaruan akan diunduh, dipasang ke dalam aplikasi, dan aplikasi akan dimulai ulang secara otomatis.
            </p>

            {downloading && (
              <div className="space-y-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-[#ECE7DD]">
                  <div
                    className={`h-full bg-[#1F6F5B] transition-[width] ${total === 0 ? 'animate-pulse w-2/3' : ''}`}
                    style={total > 0 ? { width: `${percent}%` } : undefined}
                  />
                </div>
                <div className="flex justify-between tabular-nums text-[11px] font-medium text-[#737770]">
                  <span>{total > 0 ? `Mengunduh & memasang ${percent}%` : 'Mengunduh & memasang...'}</span>
                  {total > 0 && <span>{formatBytes(received)} / {formatBytes(total)}</span>}
                </div>
              </div>
            )}

            {error && <p className="text-[11px] text-[#B3261E]">{error}</p>}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#ECE7DD] bg-white px-5 py-3.5">
          {!downloading && (
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-[12px] px-3 py-2 text-xs font-medium text-[#686C65] hover:bg-[#F2EFE8]"
            >
              Nanti
            </button>
          )}
          <button
            type="button"
            onClick={onUpdate}
            disabled={downloading}
            className="btn-primary-tactile inline-flex items-center gap-1.5 rounded-[12px] px-4 py-2 text-xs font-semibold disabled:opacity-60"
          >
            {downloading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            <span>{downloading ? 'Memperbarui...' : 'Perbarui Sekarang'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
