import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock3,
  Package,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  User,
  X,
} from 'lucide-react';
import {
  addDaysToDateString,
  formatShortDateId,
  getLoanDuration,
  getLoanStatus,
  loanStatusLabel,
  toLocalDateString,
} from '../lib/loans';
import { getActiveLoanCountByBook, getBookStockInfo } from '../lib/stock';
import { LibraryService } from '../services/libraryService';
import { LoanService } from '../services/loanService';
import { Book, LoanRecord, LoanStatus } from '../types/library';
import { BookCard } from '../components/BookCard';
import { useToast } from '../components/ToastProvider';
import {
  EmptyLoansIllustration,
  EmptySearchIllustration,
} from '../components/LibraryIllustrations';

type FilterTab = 'all' | LoanStatus;
type PickerMode = 'catalog' | 'manual';

const QUICK_DURATIONS = [3, 7, 14] as const;

interface LoansPageProps {
  initialBook?: Book | null;
  onClearInitialBook?: () => void;
  initialFilterTab?: FilterTab;
  onClearInitialFilter?: () => void;
  onLoansChanged?: (loans: LoanRecord[]) => void;
}

const formatBookAuthors = (book: Book): string => {
  const clean = (book.authors ?? [])
    .map((author) => author.name.trim())
    .filter((name) => {
      const lower = name.toLowerCase();
      return Boolean(name) && lower !== 'unknown author' && lower !== 'unknown';
    });
  return clean.length > 0 ? clean.join(', ') : 'Penulis belum dicatat';
};

export const LoansPage: React.FC<LoansPageProps> = ({
  initialBook,
  onClearInitialBook,
  initialFilterTab,
  onClearInitialFilter,
  onLoansChanged,
}) => {
  const { notify } = useToast();
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [localFallback, setLocalFallback] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal state
  const [showForm, setShowForm] = useState(false);
  const [pickerMode, setPickerMode] = useState<PickerMode>('catalog');
  const [bookPickerQuery, setBookPickerQuery] = useState('');
  const [showAllPickerBooks, setShowAllPickerBooks] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState('');
  const [itemTitle, setItemTitle] = useState('');
  const [borrowerName, setBorrowerName] = useState('');
  const [loanDate, setLoanDate] = useState(() => toLocalDateString());
  const [dueDate, setDueDate] = useState(() =>
    addDaysToDateString(toLocalDateString(), 7),
  );
  // Whether the user manually overrode the due date; if so, changing the
  // borrowed date must not silently clobber it.
  const [dueDateTouched, setDueDateTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [loanResult, bookRows] = await Promise.all([
        LoanService.getLoans(),
        LibraryService.getAllBooks(),
      ]);
      setLoans(loanResult.loans);
      onLoansChanged?.(loanResult.loans);
      setLocalFallback(loanResult.localFallback);
      setBooks(bookRows);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : 'Gagal memuat data pinjaman.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!initialFilterTab) return;
    setFilterTab(initialFilterTab);
    onClearInitialFilter?.();
  }, [initialFilterTab, onClearInitialFilter]);

  useEffect(() => {
    if (!initialBook) return;
    const today = toLocalDateString();
    setPickerMode('catalog');
    setSelectedBookId(initialBook.id);
    setItemTitle(initialBook.title);
    setBookPickerQuery('');
    setShowAllPickerBooks(false);
    setBorrowerName('');
    setLoanDate(today);
    setDueDate(addDaysToDateString(today, 7));
    setDueDateTouched(false);
    setNotes('');
    setFormError(null);
    setShowForm(true);
    onClearInitialBook?.();
  }, [initialBook, onClearInitialBook]);

  useEffect(() => {
    if (!showForm) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowForm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showForm]);

  const enrichedLoans = useMemo(() => {
    const today = toLocalDateString();
    return loans.map((loan) => ({
      ...loan,
      status: getLoanStatus(loan, today),
      duration: getLoanDuration(loan, today),
    }));
  }, [loans]);

  const counts = useMemo(() => {
    let borrowed = 0;
    let overdue = 0;
    let returned = 0;
    for (const loan of enrichedLoans) {
      if (loan.status === 'returned') returned += 1;
      else if (loan.status === 'overdue') overdue += 1;
      else borrowed += 1;
    }
    return {
      all: enrichedLoans.length,
      active: borrowed + overdue,
      borrowed,
      overdue,
      returned,
    };
  }, [enrichedLoans]);

  const bookById = useMemo(
    () => new Map(books.map((book) => [book.id, book])),
    [books],
  );

  const activeLoanCountMap = useMemo(
    () => getActiveLoanCountByBook(loans),
    [loans],
  );

  const matchingCatalogBooks = useMemo(() => {
    const query = bookPickerQuery.trim().toLowerCase();
    if (!query) return books;
    return books.filter((book) => {
      const authorText = formatBookAuthors(book).toLowerCase();
      return (
        book.title.toLowerCase().includes(query) ||
        authorText.includes(query) ||
        book.isbn_13.toLowerCase().includes(query) ||
        (book.isbn_10 ?? '').toLowerCase().includes(query)
      );
    });
  }, [books, bookPickerQuery]);

  const visiblePickerBooks = useMemo(
    () =>
      showAllPickerBooks
        ? matchingCatalogBooks
        : matchingCatalogBooks.slice(0, 5),
    [matchingCatalogBooks, showAllPickerBooks],
  );

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId) ?? null,
    [books, selectedBookId],
  );

  const filteredLoans = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return enrichedLoans.filter((loan) => {
      if (filterTab !== 'all' && loan.status !== filterTab) return false;
      if (!q) return true;
      return (
        loan.item_name.toLowerCase().includes(q) ||
        loan.borrower_name.toLowerCase().includes(q) ||
        (loan.notes ?? '').toLowerCase().includes(q)
      );
    });
  }, [enrichedLoans, filterTab, searchQuery]);

  const openNewLoanModal = () => {
    const today = toLocalDateString();
    setPickerMode(books.length > 0 ? 'catalog' : 'manual');
    setBookPickerQuery('');
    setShowAllPickerBooks(false);
    setSelectedBookId('');
    setItemTitle('');
    setBorrowerName('');
    setLoanDate(today);
    setDueDate(addDaysToDateString(today, 7));
    setDueDateTouched(false);
    setNotes('');
    setFormError(null);
    setShowForm(true);
  };

  const handleSelectPickerMode = (mode: PickerMode) => {
    setPickerMode(mode);
    setFormError(null);
    if (mode === 'manual') {
      setSelectedBookId('');
    }
  };

  const handlePickBook = (book: Book) => {
    if (selectedBookId === book.id) {
      setSelectedBookId('');
      setItemTitle('');
      return;
    }
    setSelectedBookId(book.id);
    setItemTitle(book.title);
    setFormError(null);
  };

  const handleUseQueryAsManual = () => {
    setPickerMode('manual');
    setSelectedBookId('');
    setItemTitle(bookPickerQuery.trim());
    setFormError(null);
  };

  const handleCreateLoan = async (event: React.FormEvent) => {
    event.preventDefault();
    const resolvedTitle =
      pickerMode === 'catalog' && selectedBook
        ? selectedBook.title
        : itemTitle.trim();

    if (!resolvedTitle) {
      setFormError(
        pickerMode === 'catalog'
          ? 'Pilih buku dari rak terlebih dahulu, atau ubah ke Barang Manual.'
          : 'Isi nama buku atau barang yang dipinjam.',
      );
      return;
    }
    if (!borrowerName.trim()) {
      setFormError('Isi nama peminjam terlebih dahulu.');
      return;
    }
    if (!loanDate || !dueDate) {
      setFormError('Lengkapi tanggal peminjaman dan batas pengembalian.');
      return;
    }
    if (dueDate < loanDate) {
      setFormError(
        'Tanggal pengembalian tidak boleh lebih awal dari tanggal pinjam.',
      );
      return;
    }

    if (pickerMode === 'catalog' && selectedBook) {
      const stock = getBookStockInfo(
        selectedBook,
        activeLoanCountMap.get(selectedBook.id) ?? 0,
      );
      if (stock.isOutOfStock) {
        setFormError(
          `Semua eksemplar “${selectedBook.title}” sedang dipinjam (${stock.borrowed}/${stock.total}). Tambah stok di Rak Buku atau tunggu pengembalian.`,
        );
        return;
      }
    }

    setSubmitting(true);
    setFormError(null);
    try {
      const result = await LoanService.createLoan({
        book_id:
          pickerMode === 'catalog' && selectedBook
            ? selectedBook.id
            : undefined,
        item_name: resolvedTitle,
        borrower_name: borrowerName.trim(),
        borrowed_at: loanDate,
        due_date: dueDate,
        notes: notes.trim() || undefined,
      });
      const nextLoans = [result.loan, ...loans];
      setLoans(nextLoans);
      onLoansChanged?.(nextLoans);
      setLocalFallback(result.localFallback);
      setShowForm(false);

      let stockHint = '';
      if (pickerMode === 'catalog' && selectedBook) {
        const afterStock = getBookStockInfo(
          selectedBook,
          (activeLoanCountMap.get(selectedBook.id) ?? 0) + 1,
        );
        stockHint = afterStock.isOutOfStock
          ? ' Stok di rak kini habis.'
          : ` Sisa di rak: ${afterStock.available}/${afterStock.total}.`;
      }
      notify({
        tone: 'loan',
        title: 'Peminjaman dicatat',
        description: `${borrowerName.trim()} meminjam “${resolvedTitle}” hingga ${formatShortDateId(dueDate)}.${stockHint}`,
      });
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : 'Gagal menyimpan catatan pinjaman.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkReturned = async (loanId: string) => {
    try {
      const result = await LoanService.markReturned(loanId);
      const nextLoans = loans.map((row) => (row.id === loanId ? result.loan : row));
      setLoans(nextLoans);
      onLoansChanged?.(nextLoans);
      setLocalFallback(result.localFallback);
      notify({
        tone: 'success',
        title: 'Pengembalian berhasil',
        description: `“${result.loan.item_name}” dari ${result.loan.borrower_name} telah kembali ke rak.`,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Gagal menandai pinjaman dikembalikan.';
      setPageError(message);
      notify({
        tone: 'error',
        title: 'Gagal mencatat pengembalian',
        description: message,
      });
    }
  };

  const handleReopenLoan = async (loanId: string) => {
    try {
      const result = await LoanService.reopenLoan(loanId);
      const nextLoans = loans.map((row) => (row.id === loanId ? result.loan : row));
      setLoans(nextLoans);
      onLoansChanged?.(nextLoans);
      setLocalFallback(result.localFallback);
      notify({
        tone: 'loan',
        title: 'Status pinjaman dibuka ulang',
        description: `“${result.loan.item_name}” kembali tercatat sedang dipinjam.`,
      });
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : 'Gagal membuka ulang status pinjaman.',
      );
    }
  };

  const handleDeleteLoan = async (loanId: string) => {
    try {
      await LoanService.deleteLoan(loanId);
      const nextLoans = loans.filter((row) => row.id !== loanId);
      setLoans(nextLoans);
      onLoansChanged?.(nextLoans);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : 'Gagal menghapus catatan pinjaman.',
      );
    }
  };

  const activeDurationDays = useMemo(() => {
    for (const days of QUICK_DURATIONS) {
      if (addDaysToDateString(loanDate, days) === dueDate) return days;
    }
    return null;
  }, [loanDate, dueDate]);

  const filterOptions: Array<{ key: FilterTab; label: string; count: number }> = [
    { key: 'all', label: 'Semua', count: counts.all },
    { key: 'borrowed', label: 'Dipinjam', count: counts.borrowed },
    { key: 'overdue', label: 'Terlambat', count: counts.overdue },
    { key: 'returned', label: 'Dikembalikan', count: counts.returned },
  ];

  const renderStatusBadge = (status: LoanStatus) => {
    if (status === 'returned') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#E5F2EE] px-2.5 py-1 text-xs font-semibold text-[#165243]">
          <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
          <span>{loanStatusLabel[status]}</span>
        </span>
      );
    }
    if (status === 'overdue') {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#F7EAE4] px-2.5 py-1 text-xs font-semibold text-[#9E4028]">
          <AlertTriangle className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
          <span>{loanStatusLabel[status]}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#F7EDD6] px-2.5 py-1 text-xs font-semibold text-[#7A510B]">
        <Clock3 className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
        <span>{loanStatusLabel[status]}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6 md:space-y-7 pb-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="page-title">
            Pinjaman
          </h1>
          <p className="text-[13px] md:text-[15px] leading-[1.55] text-[#686C65] mt-1">
            Catat peminjam, pantau durasi pinjam berjalan, dan pastikan buku kembali tepat waktu.
          </p>
        </div>

        <button
          type="button"
          onClick={openNewLoanModal}
          className="btn-hero-marigold inline-flex items-center justify-center gap-2 min-h-[44px] sm:min-h-[46px] w-full sm:w-auto px-5 text-[13.5px] sm:text-sm font-bold rounded-[12px] shrink-0"
        >
          <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
          <span>Catat pinjaman</span>
        </button>
      </div>

      {localFallback && (
        <div className="rounded-[18px] bg-[#F7EDD6] px-4 py-3 text-xs font-medium text-[#7A510B]">
          Tabel cloud pinjaman belum terpasang. Data pinjaman sementara disimpan di perangkat ini.
        </div>
      )}

      {pageError && (
        <div role="alert" className="rounded-[18px] bg-[#FDECEC] px-4 py-3 text-xs font-medium text-[#B3261E]">
          {pageError}
        </div>
      )}

      {counts.overdue > 0 && (
        <div
          role="alert"
          className="rounded-[18px] bg-[#F7EAE4] border-l-4 border-[#B9543A] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-[#B9543A] shrink-0 mt-0.5" strokeWidth={1.75} aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-[#9E4028]">
                {counts.overdue} pinjaman melewati batas pengembalian
              </p>
              <p className="text-xs text-[#9E4028]/85 mt-0.5">
                Segera ingatkan peminjam atau tandai sudah dikembalikan agar stok buku kembali tersedia di rak.
              </p>
            </div>
          </div>
          {filterTab !== 'overdue' && (
            <button
              type="button"
              onClick={() => setFilterTab('overdue')}
              className="inline-flex min-h-[38px] shrink-0 items-center justify-center rounded-[12px] bg-[#B9543A] px-4 text-xs font-semibold text-white hover:bg-[#9E4028]"
            >
              Lihat yang terlambat
            </button>
          )}
        </div>
      )}

      {/* Summary strip as iOS grouped surface */}
      <div className="rounded-[18px] overflow-hidden shadow-[0_1px_3px_rgba(38,41,37,0.04)] grid grid-cols-3 gap-px bg-[#ECE7DD]">
        <div className="bg-white p-3.5 sm:p-4 flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-medium text-[#686C65]">Dipinjam</span>
          <div className="mt-1 text-xl sm:text-2xl font-bold tracking-[-0.02em] tabular-nums text-[#262925]">
            {counts.active}
          </div>
          <span className="hidden sm:block text-xs text-[#737770] mt-1">Pinjaman aktif berjalan</span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 flex flex-col justify-between">
          <span
            className={`text-[11px] sm:text-xs font-medium ${
              counts.overdue > 0 ? 'text-[#9E4028]' : 'text-[#686C65]'
            }`}
          >
            Terlambat
          </span>
          <div
            className={`mt-1 text-xl sm:text-2xl font-bold tracking-[-0.02em] tabular-nums ${
              counts.overdue > 0 ? 'text-[#9E4028]' : 'text-[#262925]'
            }`}
          >
            {counts.overdue}
          </div>
          <span
            className={`hidden sm:block text-xs mt-1 ${
              counts.overdue > 0 ? 'text-[#9E4028]' : 'text-[#737770]'
            }`}
          >
            Lewat batas pengembalian
          </span>
        </div>

        <div className="bg-white p-3.5 sm:p-4 flex flex-col justify-between">
          <span className="text-[11px] sm:text-xs font-medium text-[#165243]">Kembali</span>
          <div className="mt-1 text-xl sm:text-2xl font-bold tracking-[-0.02em] tabular-nums text-[#1F6F5B]">
            {counts.returned}
          </div>
          <span className="hidden sm:block text-xs text-[#737770] mt-1">Selesai dikembalikan</span>
        </div>
      </div>

      {/* Filter pill chips + search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {filterOptions.map((tab) => {
            const active = filterTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilterTab(tab.key)}
                className={`min-h-[36px] px-4 rounded-full text-xs font-semibold transition-colors tabular-nums ${
                  active
                    ? 'bg-[#1F6F5B] text-white'
                    : 'bg-white shadow-[0_1px_2px_rgba(38,41,37,0.05)] text-[#363A34] hover:bg-[#ECE8DF] hover:text-[#262925]'
                }`}
              >
                <span className="reserve-bold items-center" data-label={`${tab.label} (${tab.count})`}>
                  {tab.label} ({tab.count})
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full md:w-72">
          <Search
            className="w-4 h-4 text-[#686C65] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama peminjam atau barang..."
            aria-label="Cari catatan pinjaman"
            className="w-full min-h-[44px] pl-10 pr-4 bg-white shadow-[0_1px_3px_rgba(38,41,37,0.05)] rounded-[12px] text-sm text-[#262925] placeholder:text-[#686C65] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/20 transition-shadow"
          />
        </div>
      </div>

      {/* Loans list */}
      {loading ? (
        <div className="rounded-[18px] bg-white shadow-[0_1px_3px_rgba(38,41,37,0.04)] divide-y divide-[#ECE7DD]">
          {[1, 2, 3].map((idx) => (
            <div key={idx} className="h-32 animate-pulse bg-white first:rounded-t-[18px] last:rounded-b-[18px]" />
          ))}
        </div>
      ) : filteredLoans.length === 0 ? (
        <div className="bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] px-5 py-10 text-center">
          {loans.length === 0 ? (
            <EmptyLoansIllustration className="mb-3" />
          ) : (
            <EmptySearchIllustration className="mb-3" />
          )}
          <h2 className="text-[15px] sm:text-base font-semibold text-[#262925]">
            {loans.length === 0
              ? 'Belum ada catatan pinjaman'
              : 'Tidak ada pinjaman yang cocok'}
          </h2>
          <p className="text-[13px] sm:text-sm leading-[1.55] text-[#737770] mt-1 max-w-md mx-auto">
            {loans.length === 0
              ? 'Mulai catat buku atau barang yang sedang dipinjam beserta nama peminjam dan batas kembalinya.'
              : 'Coba ubah filter status atau kata kunci pencarian.'}
          </p>
          {loans.length === 0 && (
            <button
              type="button"
              onClick={openNewLoanModal}
              className="btn-hero-marigold mt-4 inline-flex items-center gap-2 min-h-[46px] px-5 text-sm font-bold rounded-[12px]"
            >
              <Plus className="w-4 h-4" strokeWidth={1.75} aria-hidden="true" />
              <span>Catat pinjaman pertama</span>
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-[18px] bg-white shadow-[0_1px_3px_rgba(38,41,37,0.04)] overflow-hidden divide-y divide-[#ECE7DD]">
          {filteredLoans.map((loan) => {
            const linkedBook = loan.book_id ? bookById.get(loan.book_id) : undefined;
            const isOverdue = loan.status === 'overdue';
            return (
              <div
                key={loan.id}
                className="relative p-4 sm:p-5 flex flex-col justify-between gap-3.5 hover:bg-[#FAF9F5] transition-colors"
              >
                {isOverdue && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-[#B9543A]"
                  />
                )}
                <div className={isOverdue ? 'pl-2' : ''}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {linkedBook && (
                        <div className="w-10 shrink-0">
                          <BookCard
                            coverUrl={linkedBook.cover_url}
                            title={linkedBook.title}
                            author={linkedBook.authors?.[0]?.name}
                            seed={linkedBook.id}
                            size="xs"
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="book-title text-[#262925]">
                          {loan.item_name}
                        </h3>
                        <p className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] font-normal text-[#686C65]">
                          <User className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                          <span>Peminjam: {loan.borrower_name}</span>
                        </p>
                      </div>
                    </div>
                    {renderStatusBadge(loan.status)}
                  </div>

                  {/* Hairline-separated date & duration strip */}
                  <div className="mt-3.5 grid grid-cols-3 gap-3 border-t border-[#ECE7DD] pt-3">
                    <div>
                      <span className="block text-xs font-normal text-[#686C65]">
                        Dipinjam
                      </span>
                      <span className="mt-0.5 block text-xs font-medium text-[#262925] tabular-nums">
                        {formatShortDateId(loan.borrowed_at)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs font-normal text-[#686C65]">
                        Batas kembali
                      </span>
                      <span className="mt-0.5 block text-xs font-medium text-[#262925] tabular-nums">
                        {formatShortDateId(loan.due_date)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-xs font-normal text-[#686C65]">
                        Durasi
                      </span>
                      <span
                        className={`mt-0.5 block text-xs font-medium tabular-nums ${
                          isOverdue
                            ? 'text-[#9E4028]'
                            : loan.status === 'returned'
                            ? 'text-[#165243]'
                            : 'text-[#262925]'
                        }`}
                      >
                        {loan.duration.durationLabel} · {loan.duration.deadlineLabel}
                      </span>
                    </div>
                  </div>

                  {loan.notes && (
                    <p className="mt-2.5 text-xs text-[#737770] leading-relaxed">
                      Catatan: {loan.notes}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className={`flex items-center justify-between gap-2 ${isOverdue ? 'pl-2' : ''}`}>
                  {loan.status === 'returned' ? (
                    <button
                      type="button"
                      onClick={() => handleReopenLoan(loan.id)}
                      className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-[12px] bg-[#F2EFE8] text-xs font-semibold text-[#262925] hover:bg-[#E7E2D7]"
                    >
                      <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                      <span>Tandai dipinjam lagi</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleMarkReturned(loan.id)}
                      className="btn-primary-tactile inline-flex items-center gap-1.5 min-h-[42px] px-4 rounded-[12px] text-xs font-semibold"
                    >
                      <CheckCircle2 className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                      <span>Tandai dikembalikan</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteLoan(loan.id)}
                    aria-label={`Hapus catatan pinjaman ${loan.item_name}`}
                    className="inline-flex items-center justify-center w-10 h-10 rounded-[12px] bg-[#FDECEC]/70 text-[#B3261E] hover:bg-[#FDECEC]"
                  >
                    <Trash2 className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Loan Modal */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#262925]/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-loan-title"
          onClick={() => setShowForm(false)}
        >
          <div
            className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-[18px] bg-white p-4 sm:p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2
                  id="new-loan-title"
                  className="text-lg font-semibold text-[#262925]"
                >
                  Catat pinjaman baru
                </h2>
                <p className="text-xs text-[#737770] mt-0.5">
                  Pilih buku lewat pratinjau sampul atau catat barang manual.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                aria-label="Tutup form pinjaman"
                className="w-9 h-9 rounded-[12px] bg-[#F2EFE8] text-[#262925] hover:bg-[#E7E2D7] flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            <form onSubmit={handleCreateLoan} className="space-y-3.5">
              {/* Pill Segmented Control */}
              <div className="grid grid-cols-2 gap-1 rounded-full bg-[#E8E3D9] p-1">
                <button
                  type="button"
                  aria-pressed={pickerMode === 'catalog'}
                  onClick={() => handleSelectPickerMode('catalog')}
                  className={`inline-flex items-center justify-center gap-2 min-h-[38px] rounded-full px-3 text-xs font-semibold transition-all ${
                    pickerMode === 'catalog'
                      ? 'bg-white text-[#262925] shadow-[0_1px_2px_rgba(38,41,37,0.1)]'
                      : 'text-[#686C65] hover:text-[#262925]'
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                  <span className="reserve-bold items-center" data-label={`Pilih dari Rak (${books.length})`}>
                    Pilih dari Rak ({books.length})
                  </span>
                </button>
                <button
                  type="button"
                  aria-pressed={pickerMode === 'manual'}
                  onClick={() => handleSelectPickerMode('manual')}
                  className={`inline-flex items-center justify-center gap-2 min-h-[38px] rounded-full px-3 text-xs font-semibold transition-all ${
                    pickerMode === 'manual'
                      ? 'bg-white text-[#262925] shadow-[0_1px_2px_rgba(38,41,37,0.1)]'
                      : 'text-[#686C65] hover:text-[#262925]'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                  <span className="reserve-bold items-center" data-label="Barang Manual">
                    Barang Manual
                  </span>
                </button>
              </div>

              {pickerMode === 'catalog' ? (
                <div className="space-y-3">
                  {books.length === 0 ? (
                    <div className="rounded-[12px] bg-[#F2EFE8] p-4 text-center space-y-2.5">
                      <p className="text-xs text-[#686C65]">
                        Rak buku masih kosong. Kamu tetap bisa mencatat pinjaman secara manual.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleSelectPickerMode('manual')}
                        className="btn-primary-tactile min-h-[40px] px-4 rounded-[12px] text-xs font-semibold"
                      >
                        Isi nama barang manual
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Selected book strip */}
                      {selectedBook && (
                        <div className="rounded-[12px] bg-[#E5F2EE] p-2.5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 shrink-0">
                              <BookCard
                                coverUrl={selectedBook.cover_url}
                                title={selectedBook.title}
                                author={selectedBook.authors?.[0]?.name}
                                seed={selectedBook.id}
                                size="xs"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs text-[#165243] truncate">
                                <span className="font-normal">Dipilih:</span> <span className="font-book font-semibold">{selectedBook.title}</span>
                              </p>
                              <p className="text-[11px] text-[#363A34] truncate">
                                {formatBookAuthors(selectedBook)} ·{' '}
                                {(() => {
                                  const stock = getBookStockInfo(
                                    selectedBook,
                                    activeLoanCountMap.get(selectedBook.id) ?? 0,
                                  );
                                  return stock.isOutOfStock
                                    ? `Stok habis (0/${stock.total})`
                                    : `Tersedia ${stock.available}/${stock.total}`;
                                })()}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedBookId('');
                              setItemTitle('');
                            }}
                            className="shrink-0 min-h-[34px] px-3 rounded-[10px] bg-white text-xs font-semibold text-[#262925] hover:bg-[#ECE8DF]"
                          >
                            Ganti
                          </button>
                        </div>
                      )}

                      {/* Live book search */}
                      <div className="relative">
                        <Search
                          className="w-4 h-4 text-[#686C65] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                          strokeWidth={1.5}
                          aria-hidden="true"
                        />
                        <input
                          type="text"
                          value={bookPickerQuery}
                          onChange={(e) => {
                            setBookPickerQuery(e.target.value);
                            setShowAllPickerBooks(false);
                          }}
                          placeholder="Cari judul buku, penulis, atau ISBN..."
                          aria-label="Cari buku di rak"
                          className="w-full min-h-[44px] pl-10 pr-10 bg-[#F2EFE8] rounded-[12px] text-sm text-[#262925] placeholder:text-[#686C65] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 transition-colors"
                        />
                        {bookPickerQuery && (
                          <button
                            type="button"
                            onClick={() => setBookPickerQuery('')}
                            aria-label="Hapus kata kunci buku"
                            className="w-7 h-7 rounded-[10px] bg-white text-[#686C65] hover:text-[#262925] flex items-center justify-center absolute right-2 top-1/2 -translate-y-1/2"
                          >
                            <X className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                          </button>
                        )}
                      </div>

                      {/* Slide count header + Show All toggle */}
                      <div className="flex items-center justify-between gap-2 px-0.5">
                        <span className="text-xs font-medium text-[#686C65]">
                          {matchingCatalogBooks.length === 0
                            ? 'Tidak ada buku yang cocok'
                            : showAllPickerBooks || matchingCatalogBooks.length <= 5
                            ? `${matchingCatalogBooks.length} buku tersedia`
                            : `Menampilkan 5 dari ${matchingCatalogBooks.length} buku`}
                        </span>

                        {matchingCatalogBooks.length > 5 && (
                          <button
                            type="button"
                            onClick={() =>
                              setShowAllPickerBooks((prev) => !prev)
                            }
                            className="text-xs font-semibold text-[#165243] hover:text-[#1F6F5B] px-3 py-1 rounded-[10px] bg-[#E5F2EE] hover:bg-[#D6EAE4]"
                          >
                            {showAllPickerBooks
                              ? 'Ringkas daftar'
                              : `Lihat semua (${matchingCatalogBooks.length})`}
                          </button>
                        )}
                      </div>

                      {/* Empty search fallback or book cards */}
                      {matchingCatalogBooks.length === 0 ? (
                        <div className="rounded-[12px] bg-[#F2EFE8] p-4 text-center space-y-2.5">
                          <p className="text-xs text-[#686C65]">
                            Buku “{bookPickerQuery.trim()}” tidak ditemukan di rak.
                          </p>
                          <button
                            type="button"
                            onClick={handleUseQueryAsManual}
                            className="btn-primary-tactile min-h-[40px] px-4 rounded-[12px] text-xs font-semibold"
                          >
                            Gunakan sebagai barang manual
                          </button>
                        </div>
                      ) : showAllPickerBooks ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[260px] overflow-y-auto pr-1">
                          {visiblePickerBooks.map((book) => {
                            const isSelected = book.id === selectedBookId;
                            const stock = getBookStockInfo(
                              book,
                              activeLoanCountMap.get(book.id) ?? 0,
                            );
                            return (
                              <button
                                key={book.id}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => handlePickBook(book)}
                                className={`group relative rounded-[14px] p-2.5 text-left transition-colors ${
                                  isSelected
                                    ? 'bg-[#E5F2EE] ring-2 ring-[#1F6F5B]'
                                    : 'bg-[#F2EFE8]/70 hover:bg-[#ECE8DF]'
                                }`}
                              >
                                <div className="relative">
                                  <BookCard
                                    coverUrl={book.cover_url}
                                    title={book.title}
                                    author={book.authors?.[0]?.name}
                                    seed={book.id}
                                    unavailable={stock.isOutOfStock}
                                    size="sm"
                                  />
                                  {isSelected && (
                                    <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#1F6F5B] text-white flex items-center justify-center">
                                      <Check className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                                    </span>
                                  )}
                                  {stock.isOutOfStock ? (
                                    <span className="absolute top-2 left-2 rounded-[8px] bg-[#262925]/85 px-2 py-0.5 text-[10px] font-bold text-white tabular-nums">
                                      Habis
                                    </span>
                                  ) : stock.borrowed > 0 ? (
                                    <span className="absolute top-2 left-2 rounded-[8px] bg-[#F7EDD6] px-2 py-0.5 text-[10px] font-semibold text-[#7A510B] tabular-nums">
                                      Sisa {stock.available}/{stock.total}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-2">
                                  <div className="book-title book-title--reserve text-[#262925]">
                                    {book.title}
                                  </div>
                                  <div className="book-author mt-0.5 truncate">
                                    {formatBookAuthors(book)}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex gap-2.5 overflow-x-auto pb-1.5 snap-x snap-mandatory no-scrollbar">
                          {visiblePickerBooks.map((book) => {
                            const isSelected = book.id === selectedBookId;
                            const stock = getBookStockInfo(
                              book,
                              activeLoanCountMap.get(book.id) ?? 0,
                            );
                            return (
                              <button
                                key={book.id}
                                type="button"
                                aria-pressed={isSelected}
                                onClick={() => handlePickBook(book)}
                                className={`group relative w-[124px] shrink-0 snap-start rounded-[14px] p-2.5 text-left transition-colors ${
                                  isSelected
                                    ? 'bg-[#E5F2EE] ring-2 ring-[#1F6F5B]'
                                    : 'bg-[#F2EFE8]/70 hover:bg-[#ECE8DF]'
                                }`}
                              >
                                <div className="relative">
                                  <BookCard
                                    coverUrl={book.cover_url}
                                    title={book.title}
                                    author={book.authors?.[0]?.name}
                                    seed={book.id}
                                    unavailable={stock.isOutOfStock}
                                    size="sm"
                                  />
                                  {isSelected && (
                                    <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-[#1F6F5B] text-white flex items-center justify-center">
                                      <Check className="w-3.5 h-3.5" strokeWidth={1.75} aria-hidden="true" />
                                    </span>
                                  )}
                                  {stock.isOutOfStock ? (
                                    <span className="absolute top-2 left-2 rounded-[8px] bg-[#262925]/85 px-2 py-0.5 text-[10px] font-bold text-white tabular-nums">
                                      Habis
                                    </span>
                                  ) : stock.borrowed > 0 ? (
                                    <span className="absolute top-2 left-2 rounded-[8px] bg-[#F7EDD6] px-2 py-0.5 text-[10px] font-semibold text-[#7A510B] tabular-nums">
                                      Sisa {stock.available}/{stock.total}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="mt-2">
                                  <div className="book-title book-title--reserve text-[#262925]">
                                    {book.title}
                                  </div>
                                  <div className="book-author mt-0.5 truncate">
                                    {formatBookAuthors(book)}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="loan-item-title"
                    className="block text-xs font-medium text-[#686C65] mb-1.5"
                  >
                    Nama barang / judul buku
                  </label>
                  <div className="relative">
                    <Package
                      className="w-4 h-4 text-[#686C65] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                      <input
                        id="loan-item-title"
                        type="text"
                        value={itemTitle}
                        onChange={(e) => setItemTitle(e.target.value)}
                        placeholder="Contoh: Buku Paket Matematika atau Proyektor"
                        className="w-full min-h-[46px] pl-10 pr-4 bg-[#F2EFE8] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 rounded-[12px] text-sm text-[#262925] placeholder:text-[#686C65]"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="loan-borrower-name"
                    className="block text-xs font-medium text-[#686C65] mb-1.5"
                  >
                    Nama peminjam
                  </label>
                  <input
                    id="loan-borrower-name"
                    type="text"
                    value={borrowerName}
                    onChange={(e) => setBorrowerName(e.target.value)}
                    placeholder="Nama lengkap peminjam"
                    className="w-full min-h-[46px] px-4 bg-[#F2EFE8] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 rounded-[12px] text-sm text-[#262925] placeholder:text-[#686C65]"
                  />
                </div>

                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label
                        htmlFor="loan-date"
                        className="block text-xs font-medium text-[#686C65] mb-1.5"
                      >
                        Tanggal peminjaman
                      </label>
                      <input
                        id="loan-date"
                        type="date"
                        value={loanDate}
                        onChange={(e) => {
                          const nextLoanDate = e.target.value;
                          setLoanDate(nextLoanDate);
                          // Keep quick-duration sync, but never clobber a
                          // due date the user set manually.
                          if (!dueDateTouched && activeDurationDays !== null) {
                            setDueDate(
                              addDaysToDateString(nextLoanDate, activeDurationDays),
                            );
                          }
                        }}
                        className="w-full min-h-[46px] px-4 bg-[#F2EFE8] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 rounded-[12px] text-sm text-[#262925]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="loan-due-date"
                        className="block text-xs font-medium text-[#686C65] mb-1.5"
                      >
                        Tanggal pengembalian
                      </label>
                      <input
                        id="loan-due-date"
                        type="date"
                        value={dueDate}
                        onChange={(e) => {
                          setDueDate(e.target.value);
                          setDueDateTouched(true);
                        }}
                        className="w-full min-h-[46px] px-4 bg-[#F2EFE8] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 rounded-[12px] text-sm text-[#262925]"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-[#686C65]">
                      Durasi cepat:
                    </span>
                    {QUICK_DURATIONS.map((days) => {
                      const selected = !dueDateTouched && activeDurationDays === days;
                      return (
                        <button
                          key={days}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            setDueDate(addDaysToDateString(loanDate, days));
                            setDueDateTouched(false);
                          }}
                          className={`min-h-[34px] px-3.5 rounded-full text-xs font-semibold transition-colors ${
                            selected
                              ? 'bg-[#1F6F5B] text-white'
                              : 'bg-[#F2EFE8] text-[#262925] hover:bg-[#E7E2D7]'
                          }`}
                        >
                          <span className="reserve-bold items-center" data-label={`+${days} hari`}>
                            +{days} hari
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="loan-notes"
                    className="block text-xs font-medium text-[#686C65] mb-1.5"
                  >
                    Catatan (opsional)
                  </label>
                  <input
                    id="loan-notes"
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Kondisi barang atau keterangan tambahan"
                    className="w-full min-h-[46px] px-4 bg-[#F2EFE8] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 rounded-[12px] text-sm text-[#262925] placeholder:text-[#686C65]"
                  />
                </div>

                {formError && (
                  <div role="alert" className="rounded-[12px] bg-[#FDECEC] px-4 py-3 text-xs font-medium text-[#B3261E]">
                    {formError}
                  </div>
                )}

                <div className="pt-3 border-t border-[#ECE7DD] flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="min-h-[44px] w-full sm:w-auto px-5 rounded-[12px] bg-[#F2EFE8] text-sm font-semibold text-[#262925] hover:bg-[#E7E2D7]"
                  >
                    Batal
                  </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn-primary-tactile min-h-[44px] w-full sm:w-auto px-6 rounded-[12px] text-sm font-semibold disabled:opacity-60"
                >
                  {submitting ? 'Menyimpan...' : 'Simpan pinjaman'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
