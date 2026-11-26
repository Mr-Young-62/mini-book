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
  <div className="fixed inset-x-4 top-4 z-[90] mx-auto flex max-w-lg items-center justify-between gap-4 rounded-2xl border border-[#ECEEF2] bg-white p-4 shadow-xl">
    <div className="min-w-0">
      <p className="text-sm font-bold text-[#14181F]">Pembaruan v{manifest.version} tersedia</p>
      <p className="truncate text-xs text-[#6E737D]">{manifest.changelog[0] || 'Perbaikan dan penyempurnaan aplikasi.'}</p>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {!forced && (
        <button type="button" onClick={onDismiss} className="text-xs font-medium text-[#6E737D]">
          Nanti
        </button>
      )}
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex items-center gap-1 rounded-xl bg-[#18362F] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#112822]"
      >
        <Download className="h-3.5 w-3.5" />
        Lihat
      </button>
    </div>
  </div>
);
