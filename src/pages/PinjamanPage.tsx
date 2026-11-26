import React, { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { getErrorMessage } from '../lib/errorMessage';
import { LibraryService } from '../services/libraryService';
import { Book, Loan, LoanStatus } from '../types/library';

type LoanFilter = 'all' | 'active' | 'overdue' | 'returned';
type PendingAction = { type: 'return' | 'delete'; loan: Loan };

const STATUS_LABEL: Record<LoanStatus, string> = {
  active: 'Dipinjam',
  overdue: 'Terlambat',
  returned: 'Dikembalikan',
};

const STATUS_COLOR: Record<LoanStatus, string> = {
  active: 'bg-blue-50 text-blue-700 border-blue-100',
  overdue: 'bg-rose-50 text-rose-700 border-rose-100',
  returned: 'bg-emerald-50 text-emerald-700 border-emerald-100',
};

const FILTERS: { id: LoanFilter; label: string }[] = [
  { id: 'all', label: 'Semua' },
  { id: 'active', label: 'Dipinjam' },
  { id: 'overdue', label: 'Terlambat' },
  { id: 'returned', label: 'Kembali' },
];

function localDate(daysFromToday = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(value?: string): string {
  if (!value) return '-';
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export const PinjamanPage: React.FC = () => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [archivedBooks, setArchivedBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<LoanFilter>('all');
  const [openForm, setOpenForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const [borrowerName, setBorrowerName] = useState('');
  const [selectedBookId, setSelectedBookId] = useState('');
  const [loanDate, setLoanDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  const loadData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [loanList, bookList, archiveList] = await Promise.all([
        LibraryService.getLoans(),
        LibraryService.getAllBooks(),
        LibraryService.getArchivedBooks(),
      ]);
      setLoans(loanList);
      setBooks(bookList);
      setArchivedBooks(archiveList);
    } catch (error) {
      console.error('Error loading loans:', error);
      setLoadError('Data pinjaman tidak dapat dimuat. Periksa koneksi lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!pendingAction) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPendingAction(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingAction]);

  const filteredLoans = useMemo(() => {
    if (filter === 'all') return loans;
    return loans.filter((loan) => loan.status === filter);
  }, [loans, filter]);

  const availableBooks = useMemo(() => {
    const loanedBookIds = new Set(
      loans.filter((loan) => loan.status !== 'returned').map((loan) => loan.book_id),
    );
    return books.filter((book) => !loanedBookIds.has(book.id));
  }, [books, loans]);

  const overdueCount = loans.filter((loan) => loan.status === 'overdue').length;
  const activeCount = loans.filter((loan) => loan.status === 'active').length;

  const findBook = (loan: Loan): Book | undefined =>
    books.find((book) => book.id === loan.book_id)
    || archivedBooks.find((book) => book.id === loan.book_id);

  const openLoanForm = () => {
    setFormError(null);
    setNotice(null);
    setBorrowerName('');
    setSelectedBookId('');
    setLoanDate(localDate());
    setDueDate(localDate(7));
    setOpenForm(true);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!borrowerName.trim()) {
      setFormError('Nama peminjam wajib diisi.');
      return;
    }
    if (!selectedBookId) {
      setFormError('Pilih buku yang akan dipinjam.');
      return;
    }
    if (!loanDate) {
      setFormError('Tanggal pinjaman wajib diisi.');
      return;
    }
    if (!dueDate) {
      setFormError('Tanggal jatuh tempo wajib diisi.');
      return;
    }
    if (dueDate < loanDate) {
      setFormError('Tanggal jatuh tempo tidak boleh sebelum tanggal pinjaman.');
      return;
    }

    setFormBusy(true);
    try {
      const book = books.find((item) => item.id === selectedBookId);
      await LibraryService.addLoan({
        book_id: selectedBookId,
        borrower_name: borrowerName.trim(),
        book_title: book?.title,
        loan_date: loanDate,
        due_date: dueDate,
      });
      setOpenForm(false);
      setNotice(`Pinjaman "${book?.title || 'buku'}" untuk ${borrowerName.trim()} tersimpan.`);
      await loadData();
    } catch (error) {
      setFormError(getErrorMessage(error, 'Gagal menyimpan pinjaman.'));
    } finally {
      setFormBusy(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!pendingAction) return;
    setActionBusy(true);
    setActionError(null);
    try {
      if (pendingAction.type === 'return') {
        await LibraryService.returnLoan(pendingAction.loan.id);
        setNotice(`Pinjaman ${pendingAction.loan.borrower_name} ditandai sudah dikembalikan.`);
      } else {
        await LibraryService.deleteLoan(pendingAction.loan.id);
        setNotice('Data pinjaman dihapus.');
      }
      setPendingAction(null);
      await loadData();
    } catch (error) {
      setActionError(getErrorMessage(error, 'Gagal memproses pinjaman.'));
    } finally {
      setActionBusy(false);
    }
  };

  const statusBadge = (status: LoanStatus) => (
    <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${STATUS_COLOR[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-[#6E737D]">
        Memuat data pinjaman...
      </div>
    );
  }

  return (
    <div className="space-y-7 pb-6">
      <div className="flex flex-col gap-4 border-b border-[#ECEEF2] pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-sans text-2xl font-extrabold tracking-tight text-[#14181F] sm:text-3xl">
            Pinjaman Buku
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-[#6E737D]">
            Catat buku yang dipinjam, pantau jatuh tempo, dan tandai pengembalian.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2">
          <button
            type="button"
            onClick={openLoanForm}
            disabled={availableBooks.length === 0}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#18362F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#112822] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Pinjam Buku
          </button>
          {availableBooks.length === 0 && !loadError && (
            <p className="text-[11px] text-[#6E737D]">
              Belum ada buku yang bisa dipinjam. Tambahkan buku ke rak terlebih dahulu.
            </p>
          )}
        </div>
      </div>

      {notice && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          {notice}
        </div>
      )}

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
          <span>{loadError}</span>
          <button type="button" onClick={() => void loadData()} className="min-h-[36px] font-semibold underline">
            Coba lagi
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-[#ECEEF2] bg-white p-4 shadow-2xs">
          <span className="mb-1 block text-[11px] font-medium text-[#6E737D]">Total pinjaman</span>
          <div className="font-mono text-2xl font-bold tabular-nums text-[#14181F]">{loans.length}</div>
        </div>
        <div className="rounded-xl border border-[#ECEEF2] bg-white p-4 shadow-2xs">
          <span className="mb-1 block text-[11px] font-medium text-[#6E737D]">Sedang dipinjam</span>
          <div className={`font-mono text-2xl font-bold tabular-nums ${activeCount > 0 ? 'text-blue-700' : 'text-[#14181F]'}`}>
            {activeCount}
          </div>
        </div>
        <div className="rounded-xl border border-[#ECEEF2] bg-white p-4 shadow-2xs">
          <span className="mb-1 block text-[11px] font-medium text-[#6E737D]">Terlambat</span>
          <div className={`font-mono text-2xl font-bold tabular-nums ${overdueCount > 0 ? 'text-rose-700' : 'text-[#14181F]'}`}>
            {overdueCount}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[#ECEEF2] bg-white p-3 shadow-2xs">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              aria-pressed={filter === item.id}
              className={`min-h-[40px] whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === item.id
                  ? 'bg-[#18362F] text-white'
                  : 'bg-[#F5F6F8] text-[#14181F] hover:bg-[#ECEEF2]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {openForm && (
        <div className="space-y-4 rounded-xl border border-[#ECEEF2] bg-white p-5 shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-[#ECEEF2] pb-3">
            <h2 className="text-sm font-bold text-[#14181F]">Pinjam Buku Baru</h2>
            <button
              type="button"
              onClick={() => setOpenForm(false)}
              aria-label="Tutup form pinjaman"
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#6E737D] hover:bg-[#F5F6F8]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {formError && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
              {formError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-[11px] font-medium text-[#4B5563]">
                Nama peminjam
                <input
                  type="text"
                  value={borrowerName}
                  onChange={(event) => setBorrowerName(event.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  maxLength={100}
                  autoComplete="off"
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-[#E5E7EB] bg-[#F5F6F8] px-3 py-2 text-xs font-medium text-[#14181F]"
                />
              </label>
              <label className="block text-[11px] font-medium text-[#4B5563]">
                Pilih buku
                <select
                  value={selectedBookId}
                  onChange={(event) => setSelectedBookId(event.target.value)}
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-[#E5E7EB] bg-[#F5F6F8] px-3 py-2 text-xs font-medium text-[#14181F]"
                >
                  <option value="">-- Pilih buku --</option>
                  {availableBooks.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title} ({book.isbn_13})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-[11px] font-medium text-[#4B5563]">
                Tanggal pinjaman
                <input
                  type="date"
                  value={loanDate}
                  onChange={(event) => setLoanDate(event.target.value)}
                  required
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-[#E5E7EB] bg-[#F5F6F8] px-3 py-2 font-mono text-xs text-[#14181F]"
                />
              </label>
              <label className="block text-[11px] font-medium text-[#4B5563]">
                Tanggal jatuh tempo
                <input
                  type="date"
                  min={loanDate || undefined}
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  required
                  className="mt-1 min-h-[44px] w-full rounded-lg border border-[#E5E7EB] bg-[#F5F6F8] px-3 py-2 font-mono text-xs text-[#14181F]"
                />
              </label>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={() => setOpenForm(false)}
                className="min-h-[44px] rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-xs font-semibold text-[#14181F] hover:bg-[#F5F6F8]"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={formBusy}
                className="min-h-[44px] rounded-lg bg-[#18362F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#112822] disabled:opacity-60"
              >
                {formBusy ? 'Menyimpan...' : 'Simpan pinjaman'}
              </button>
            </div>
          </form>
        </div>
      )}

      {filteredLoans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#D9DDE5] bg-white p-8 text-center">
          <h2 className="text-sm font-bold text-[#14181F]">
            {loans.length === 0 ? 'Belum ada pinjaman' : 'Tidak ada pinjaman pada filter ini'}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-[#6E737D]">
            {loans.length === 0
              ? 'Catat pinjaman pertama setelah buku tersedia di rak.'
              : 'Pilih filter lain untuk melihat pinjaman yang tersimpan.'}
          </p>
          {loans.length === 0 && availableBooks.length > 0 && (
            <button
              type="button"
              onClick={openLoanForm}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#18362F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#112822]"
            >
              <Plus className="h-4 w-4" />
              Catat pinjaman
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#ECEEF2] bg-white shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="border-b border-[#ECEEF2] bg-[#F5F6F8] font-medium text-[#6E737D]">
                <tr>
                  <th className="px-4 py-3">Buku</th>
                  <th className="px-4 py-3">Peminjam</th>
                  <th className="px-4 py-3 font-mono">Tgl pinjam</th>
                  <th className="px-4 py-3 font-mono">Jatuh tempo</th>
                  <th className="px-4 py-3 font-mono">Tgl kembali</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEF2]">
                {filteredLoans.map((loan) => {
                  const book = findBook(loan);
                  return (
                    <tr key={loan.id} className="hover:bg-[#F5F6F8]">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#14181F]">
                          {book?.title || loan.book_title || 'Buku tidak diketahui'}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-[#6E737D]">
                          ISBN: {book?.isbn_13 || '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#14181F]">{loan.borrower_name}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-[#4B5563]">{formatDate(loan.loan_date)}</td>
                      <td className="px-4 py-3 font-mono tabular-nums">
                        <span className={loan.status === 'overdue' ? 'font-bold text-rose-700' : 'text-[#4B5563]'}>
                          {formatDate(loan.due_date)}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono tabular-nums text-[#4B5563]">{formatDate(loan.return_date)}</td>
                      <td className="px-4 py-3">{statusBadge(loan.status)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          {loan.status !== 'returned' && (
                            <button
                              type="button"
                              onClick={() => {
                                setActionError(null);
                                setPendingAction({ type: 'return', loan });
                              }}
                              aria-label={`Kembalikan buku ${loan.borrower_name}`}
                              className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              Kembalikan
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setActionError(null);
                              setPendingAction({ type: 'delete', loan });
                            }}
                            aria-label={`Hapus pinjaman ${loan.borrower_name}`}
                            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Hapus
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#14181F]/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-loan-title"
            className="w-full max-w-sm rounded-xl border border-[#ECEEF2] bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="confirm-loan-title" className="text-sm font-bold text-[#14181F]">
                  {pendingAction.type === 'return' ? 'Tandai pengembalian?' : 'Hapus pinjaman?'}
                </h2>
                <p className="mt-2 text-xs leading-relaxed text-[#6E737D]">
                  {pendingAction.type === 'return'
                    ? `Pinjaman ${pendingAction.loan.borrower_name} akan ditandai sudah dikembalikan hari ini.`
                    : `Data pinjaman ${pendingAction.loan.borrower_name} akan dihapus permanen.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                aria-label="Tutup konfirmasi"
                className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-[#6E737D] hover:bg-[#F5F6F8]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {actionError && (
              <div role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
                {actionError}
              </div>
            )}
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="min-h-[44px] rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-xs font-semibold text-[#14181F] hover:bg-[#F5F6F8]"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmAction()}
                disabled={actionBusy}
                autoFocus
                className={`min-h-[44px] rounded-lg px-4 py-2 text-xs font-semibold text-white disabled:opacity-60 ${
                  pendingAction.type === 'return'
                    ? 'bg-emerald-700 hover:bg-emerald-800'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {actionBusy ? 'Memproses...' : pendingAction.type === 'return' ? 'Ya, kembalikan' : 'Ya, hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PinjamanPage;
