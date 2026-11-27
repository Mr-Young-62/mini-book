import React from 'react';
import { Download } from 'lucide-react';
import type { UpdateManifest } from '../../services/updateService';

interface UpdateBannerProps {
  manifest: UpdateManifest;
  forced: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({ manifest, forced, onOpen, onDismiss }) => (
  <div className="fixed inset-x-4 top-4 z-[90] mx-auto flex max-w-lg items-center justify-between gap-4 rounded-[18px] bg-white p-4 shadow-xl">
    <div className="min-w-0">
      <p className="text-sm font-bold text-[#262925]">Pembaruan v{manifest.version} tersedia</p>
      <p className="truncate text-xs text-[#737770]">{manifest.changelog[0] || 'Perbaikan dan penyempurnaan aplikasi.'}</p>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {!forced && (
        <button type="button" onClick={onDismiss} className="rounded-[12px] px-2.5 py-1.5 text-xs font-medium text-[#686C65] hover:bg-[#F2EFE8]">
          Nanti
        </button>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="btn-primary-tactile inline-flex items-center gap-1 rounded-[12px] px-3.5 py-2 text-xs font-semibold"
      >
        <Download className="h-3.5 w-3.5" />
        Lihat
      </button>
    </div>
  </div>
);
