import React, { useEffect, useState } from 'react';
import {
  Download,
  Printer,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { LoanService } from '../services/loanService';
import { Book, LoanRecord } from '../types/library';
import { downloadCsv } from '../lib/csv';
import { getLoanStatus, toLocalDateString } from '../lib/loans';
import { EmptyNotesAccent } from '../components/LibraryIllustrations';

export const ReportsPage: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Track loan-loading failure separately from a successful empty result.
  const [loansError, setLoansError] = useState<string | null>(null);

  useEffect(() => {
    void loadReportsData();
  }, []);

  const loadReportsData = async () => {
    setLoading(true);
    setLoadError(null);
    setLoansError(null);
    try {
      // allSettled: a loan-loading failure must not be disguised as zero
      // active loans; it is surfaced separately and never swallowed.
      const [booksRes, loansRes] = await Promise.allSettled([
        LibraryService.getAllBooks(),
        LoanService.getLoans(),
      ]);

      if (booksRes.status === 'fulfilled') {
        setBooks(booksRes.value);
      } else {
        const err = booksRes.reason;
        console.error('Error loading reports data:', err);
        setLoadError(err instanceof Error ? err.message : 'Gagal memuat laporan koleksi.');
      }

      if (loansRes.status === 'fulfilled') {
        setLoans(loansRes.value.loans);
      } else {
        const err = loansRes.reason;
        console.error('Error loading loan data:', err);
        setLoans([]);
        setLoansError(err instanceof Error ? err.message : 'Gagal memuat data pinjaman.');
      }
    } finally {
      setLoading(false);
    }
  };

  const categoryCounts: Record<string, number> = {};
  books.forEach((book) => {
    const category = book.categories[0]?.name || 'Umum';
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });

  const sortedCategories = Object.entries(categoryCounts).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  const topCategory = sortedCategories[0];

  const booksWithCover = books.filter((book) => Boolean(book.cover_url?.trim())).length;
  const coverPct = books.length > 0 ? Math.round((booksWithCover / books.length) * 100) : 0;

  const completeMetadataCount = books.filter((book) => {
    const hasAuthor = book.authors.some((author) => {
      const name = author.name.trim().toLowerCase();
      return Boolean(name) && name !== 'unknown author' && name !== 'unknown';
    });
    return hasAuthor && Boolean(book.publisher?.name?.trim());
  }).length;

  const todayStr = toLocalDateString();
  const activeLoans = loans.filter((loan) => getLoanStatus(loan, todayStr) !== 'returned');
  const overdueCount = activeLoans.filter(
    (loan) => getLoanStatus(loan, todayStr) === 'overdue',
  ).length;

  const handleExportCatalogCsv = () => {
    const headers = ['Kategori', 'Jumlah Judul', 'Persentase'];
    const rows = sortedCategories.map(([category, count]) => {
      const pct = books.length > 0 ? Math.round((count / books.length) * 100) : 0;
      return [category, String(count), `${pct}%`];
    });
    downloadCsv('meeliefont_laporan_koleksi', headers, rows);
  };

  return (
    <div className="space-y-6 sm:space-y-7 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="page-title">
            Laporan Koleksi
          </h1>
          <p className="mt-1 text-[13px] sm:text-[15px] leading-[1.55] text-[#686C65]">
            Ringkasan katalog, kelengkapan data buku, dan status pinjaman aktif.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 px-4 bg-white shadow-[0_1px_2px_rgba(38,41,37,0.06)] hover:bg-[#ECE8DF] text-[#262925] text-sm font-semibold rounded-[12px]"
          >
            <Printer className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            <span>Cetak</span>
          </button>
        </div>
      </div>

      {loansError && !loading && (
        <div role="alert" className="rounded-[18px] bg-[#F7EAE4] px-4 py-3 text-xs font-medium text-[#9E4028]">
          Gagal memuat data pinjaman ({loansError}). Angka pinjaman aktif mungkin tidak akurat.
        </div>
      )}

      <div className="rounded-[18px] overflow-hidden shadow-[0_1px_3px_rgba(38,41,37,0.04)] grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#ECE7DD]">
        <div className="bg-white p-4 sm:p-5 flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-medium text-[#686C65]">Total judul</span>
          <div className="mt-1 text-2xl sm:text-[26px] font-bold tracking-[-0.02em] text-[#262925] tabular-nums">
            {books.length}
          </div>
          <span className="mt-1 text-[11px] sm:text-xs text-[#737770] truncate">
            {books.length > 0 ? `${booksWithCover} bersampul (${coverPct}%)` : 'Belum ada koleksi'}
          </span>
        </div>

        <div className="bg-white p-4 sm:p-5 flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-medium text-[#686C65]">Kategori aktif</span>
          <div className="mt-1 text-2xl sm:text-[26px] font-bold tracking-[-0.02em] text-[#1F6F5B] tabular-nums">
            {sortedCategories.length}
          </div>
          <span className="mt-1 text-[11px] sm:text-xs text-[#737770] truncate">
            {topCategory ? `Terbanyak: ${topCategory[0]} (${topCategory[1]})` : 'Belum ada kategori'}
          </span>
        </div>

        <div className="bg-white p-4 sm:p-5 flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-medium text-[#686C65]">Kelengkapan data</span>
          <div className="mt-1 text-2xl sm:text-[26px] font-bold tracking-[-0.02em] text-[#262925] tabular-nums">
            {completeMetadataCount}
            <span className="text-sm font-normal text-[#686C65]">/{books.length}</span>
          </div>
          <span className="mt-1 text-[11px] sm:text-xs text-[#737770] truncate">
            Penulis &amp; penerbit terisi
          </span>
        </div>

        <div className="bg-white p-4 sm:p-5 flex flex-col justify-between">
          <span
            className={`text-[11px] sm:text-xs font-medium ${
              overdueCount > 0 ? 'text-[#9E4028]' : 'text-[#686C65]'
            }`}
          >
            Pinjaman aktif
          </span>
          <div
            className={`mt-1 text-2xl sm:text-[26px] font-bold tracking-[-0.02em] tabular-nums ${
              overdueCount > 0 ? 'text-[#9E4028]' : 'text-[#262925]'
            }`}
          >
            {activeLoans.length}
          </div>
          <span
            className={`mt-1 text-[11px] sm:text-xs truncate ${
              overdueCount > 0 ? 'text-[#9E4028] font-medium' : 'text-[#737770]'
            }`}
          >
            {overdueCount > 0
              ? `${overdueCount} melewati tenggat`
              : activeLoans.length > 0
              ? 'Semua tepat waktu'
              : 'Tidak ada pinjaman aktif'}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4 border-b border-[#ECE7DD]">
          <div>
            <h2 className="text-[16px] sm:text-[18px] font-semibold tracking-[-0.01em] text-[#262925]">
              Koleksi per kategori
            </h2>
            <p className="text-[12px] sm:text-[13px] font-medium text-[#737770]">
              Diurutkan dari jumlah judul terbanyak
            </p>
          </div>
          <button
            type="button"
            onClick={handleExportCatalogCsv}
            disabled={sortedCategories.length === 0}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-[12px] bg-[#E5F2EE] px-3.5 text-xs font-semibold text-[#165243] hover:bg-[#D6EAE4] disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
            <span>
              Unduh <span className="acronym">CSV</span>
            </span>
          </button>
        </div>

        <div>
          {loading ? (
            <p className="text-[15px] text-[#737770] px-4 py-5 sm:px-5">Memuat ringkasan laporan...</p>
          ) : loadError ? (
            <div role="alert" className="m-4 rounded-[12px] bg-[#FDECEC] p-3.5 text-[15px] text-[#262925] space-y-2">
              <p className="font-semibold">Gagal memuat laporan: {loadError}</p>
              <button
                type="button"
                onClick={() => void loadReportsData()}
                className="min-h-[44px] rounded-[12px] bg-[#B3261E] px-5 text-xs font-bold text-white hover:bg-[#8E1D17]"
              >
                Coba lagi
              </button>
            </div>
          ) : sortedCategories.length === 0 ? (
            <div className="flex items-center gap-3.5 px-4 py-5 sm:px-5 text-[13px] sm:text-[14px] leading-[1.55] text-[#737770]">
              <EmptyNotesAccent />
              <p>
                Belum ada buku yang dicatat. Tambahkan buku lewat menu Pindai <span className="acronym">ISBN</span> untuk melihat ringkasan di sini.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#ECE7DD]">
              {sortedCategories.map(([category, count]) => {
                const pct = books.length > 0 ? Math.round((count / books.length) * 100) : 0;
                return (
                  <div
                    key={category}
                    className="px-4 py-3.5 sm:px-5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-[14px]">
                      <span className="font-semibold text-[#262925] truncate">{category}</span>
                      <span className="text-[12px] sm:text-[13px] font-medium text-[#686C65] tabular-nums shrink-0">
                        {count} judul · {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-[#ECE7DD] overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#1F6F5B]"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
