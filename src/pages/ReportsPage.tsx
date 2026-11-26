import React, { useEffect, useState } from 'react';
import {
  Download,
  Printer,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { Book } from '../types/library';
import { downloadCsv } from '../lib/csv';

export const ReportsPage: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadReportsData();
  }, []);

  const loadReportsData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      setBooks(await LibraryService.getAllBooks());
    } catch (err) {
      console.error('Error loading reports data:', err);
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat laporan koleksi.');
    } finally {
      setLoading(false);
    }
  };

  const categoryCounts: Record<string, number> = {};
  books.forEach((book) => {
    const category = book.categories[0]?.name || 'Umum';
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });

  const handleExportCatalogCsv = () => {
    const headers = ['Kategori', 'Jumlah Judul'];
    const rows = Object.entries(categoryCounts).map(([category, count]) => [category, String(count)]);
    downloadCsv('meeliefont_catalog_report', headers, rows);
  };

  return (
    <div className="space-y-6 sm:space-y-7 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-[28px] sm:text-[34px] font-bold tracking-[-0.02em] leading-[1.15] text-[#262925]">
            Laporan Koleksi
          </h1>
          <p className="mt-1 text-[15px] leading-[1.5] text-[#575B54]">
            Ringkasan jumlah judul buku berdasarkan kategori.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 px-4 bg-white hover:bg-[#F1EDE4] text-[#262925] text-sm font-semibold rounded-[10px]"
          >
            <Printer className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            <span>Cetak</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-[16px] p-4">
          <span className="text-[12px] sm:text-[13px] font-medium text-[#575B54] block mb-1">Total judul</span>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#262925] tabular-nums">{books.length}</div>
          <span className="mt-0.5 block text-[12px] font-medium text-[#575B54]">Buku tercatat</span>
        </div>

        <div className="bg-white rounded-[16px] p-4">
          <span className="text-[12px] sm:text-[13px] font-medium text-[#575B54] block mb-1">Jumlah kategori</span>
          <div className="text-2xl sm:text-3xl font-bold font-mono text-[#24483D] tabular-nums">{Object.keys(categoryCounts).length}</div>
          <span className="mt-0.5 block text-[12px] font-medium text-[#575B54]">Kategori dipakai</span>
        </div>
      </div>

      <div className="bg-white rounded-[16px] p-3.5 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 px-0.5">
          <div>
            <h2 className="text-[17px] sm:text-[19px] font-semibold tracking-[-0.01em] text-[#262925]">Koleksi per kategori</h2>
            <p className="text-[12px] sm:text-[13px] font-medium text-[#575B54]">Sebaran jumlah buku di setiap kategori</p>
          </div>
          <button
            type="button"
            onClick={handleExportCatalogCsv}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[10px] bg-[#E8EFEB] px-3.5 text-xs font-semibold text-[#24483D] hover:bg-[#DCE7E1]"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
            <span>Unduh CSV</span>
          </button>
        </div>

        <div className="space-y-2">
          {loading ? (
            <p className="text-[15px] text-[#575B54] px-0.5">Memuat ringkasan laporan...</p>
          ) : loadError ? (
            <div role="alert" className="rounded-[10px] bg-[#FDECEC] p-3.5 text-[15px] text-[#262925] space-y-2">
              <p className="font-semibold">Gagal memuat laporan: {loadError}</p>
              <button
                type="button"
                onClick={() => void loadReportsData()}
                className="min-h-[44px] rounded-[10px] bg-[#B3261E] px-5 text-xs font-bold text-white hover:bg-[#8E1D17]"
              >
                Coba lagi
              </button>
            </div>
          ) : Object.entries(categoryCounts).length === 0 ? (
            <p className="rounded-[10px] bg-[#FAF8F3] p-3.5 text-[15px] leading-[1.5] text-[#575B54]">
              Belum ada buku yang dicatat. Tambahkan buku lewat menu Scan ISBN untuk melihat ringkasan di sini.
            </p>
          ) : (
            Object.entries(categoryCounts).map(([category, count]) => (
              <div
                key={category}
                className="flex items-center justify-between rounded-[10px] bg-[#FAF8F3] px-3.5 py-3 text-[15px]"
              >
                <span className="font-semibold text-[#262925]">{category}</span>
                <span className="font-mono text-[13px] font-medium text-[#575B54] tabular-nums">{count} judul</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
