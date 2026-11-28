import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  QrCode,
  Search,
  Clock3,
  BookMarked,
  Library,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Palette,
  Briefcase,
  LayoutGrid,
  CalendarClock,
  AlertTriangle,
  X,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { LoanService } from '../services/loanService';
import { ActivityLog, Book, LoanRecord, UserRole } from '../types/library';
import { formatIsbn } from '../services/isbnValidator';
import { getLoanDuration, getLoanStatus, loanStatusLabel, toLocalDateString } from '../lib/loans';
import { getActiveLoanCountByBook, getBookStockInfo } from '../lib/stock';
import { BookCard } from '../components/BookCard';
import {
  EmptyNotesAccent,
  EmptySearchIllustration,
  LoanEmptyCardAccent,
  ReadingCornerEmptyIllustration,
} from '../components/LibraryIllustrations';

interface DashboardPageProps {
  userRole: UserRole;
  onNavigate: (tab: string) => void;
  onLendBook?: (book: Book) => void;
}

const getCategoryIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('tech') || lower.includes('comp') || lower.includes('code')) return Cpu;
  if (lower.includes('design') || lower.includes('art')) return Palette;
  if (lower.includes('busi') || lower.includes('econ') || lower.includes('money')) return Briefcase;
  if (lower.includes('fic') || lower.includes('novel') || lower.includes('lit')) return BookOpen;
  return BookMarked;
};

const CATEGORY_SWATCHES = [
  { bg: 'bg-[#E5F2EE] group-hover:bg-[#D6EAE4]', fg: 'text-[#165243]' },
  { bg: 'bg-[#F7EDD6] group-hover:bg-[#EFE0BC]', fg: 'text-[#7A510B]' },
  { bg: 'bg-[#F2EBF6] group-hover:bg-[#E7DBF0]', fg: 'text-[#5F327A]' },
] as const;

const getCategorySwatch = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_SWATCHES[hash % CATEGORY_SWATCHES.length];
};

const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  BOOK_ADDED: 'Buku ditambahkan',
  BOOK_UPDATED: 'Data buku diubah',
  BOOK_ARCHIVED: 'Buku diarsipkan',
  BOOK_RESTORED: 'Buku dipulihkan',
  LOAN_CREATED: 'Pinjaman baru',
  LOAN_RETURNED: 'Pinjaman kembali',
  LOAN_REOPENED: 'Pinjaman dibuka lagi',
  LOAN_DELETED: 'Catatan pinjaman dihapus',
};

const formatActivityAction = (action: string): string => {
  const mapped = ACTIVITY_ACTION_LABELS[action];
  if (mapped) return mapped;
  return action
    .toLowerCase()
    .split('_')
    .map((part, idx) => (idx === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
};

const formatAuthorList = (authors?: { name: string }[]): string => {
  const clean = (authors ?? [])
    .map((a) => a.name.trim())
    .filter((name) => {
      const lower = name.toLowerCase();
      return Boolean(name) && lower !== 'unknown author' && lower !== 'unknown';
    });
  return clean.length > 0 ? clean.join(', ') : 'Penulis belum dicatat';
};

export const DashboardPage: React.FC<DashboardPageProps> = ({
  userRole,
  onNavigate,
  onLendBook,
}) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Track loan-loading failure separately from a successful empty result.
  const [loansError, setLoansError] = useState<string | null>(null);
  const [libraryName, setLibraryName] = useState('Perpustakaan MeelieFont');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setLoadError(null);
      setLoansError(null);
      try {
        // allSettled so a loan-loading failure is surfaced separately and
        // never disguised as zero active loans.
        const [booksRes, logsRes, loansRes] = await Promise.allSettled([
          LibraryService.getAllBooks(),
          userRole === 'Member' ? Promise.resolve([] as ActivityLog[]) : LibraryService.getLogs(),
          LoanService.getLoans(),
        ]);

        if (booksRes.status === 'fulfilled') {
          setBooks(booksRes.value);
        } else {
          throw booksRes.reason;
        }

        setLogs(logsRes.status === 'fulfilled' ? logsRes.value : []);
        if (logsRes.status === 'rejected') {
          console.error('Error loading activity logs:', logsRes.reason);
        }

        if (loansRes.status === 'fulfilled') {
          setLoans(loansRes.value.loans);
        } else {
          const err = loansRes.reason;
          console.error('Error loading loan data:', err);
          setLoans([]);
          setLoansError(err instanceof Error ? err.message : 'Gagal memuat data pinjaman.');
        }

        const settings = LibraryService.getSettings();
        setLibraryName(settings.library_info?.name || 'Perpustakaan MeelieFont');
      } catch (error) {
        console.error('Error loading dashboard data:', error);
        setLoadError(error instanceof Error ? error.message : 'Gagal memuat data perpustakaan.');
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, [userRole]);

  useEffect(() => {
    if (!selectedBook) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedBook(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedBook]);

  const categories = useMemo(() => {
    const counts = new Map<string, { name: string; count: number; coverUrl?: string }>();
    books.forEach((book) => {
      const catName = book.categories[0]?.name || 'Umum';
      const existing = counts.get(catName);
      if (existing) {
        existing.count += 1;
        if (!existing.coverUrl && book.cover_url) existing.coverUrl = book.cover_url;
      } else {
        counts.set(catName, { name: catName, count: 1, coverUrl: book.cover_url });
      }
    });
    return Array.from(counts.values()).slice(0, 8);
  }, [books]);

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...books]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .filter((book) => {
        const matchesCat =
          selectedCategory === 'all' ||
          book.categories.some((c) => c.name.toLowerCase() === selectedCategory.toLowerCase()) ||
          (selectedCategory === 'Umum' && book.categories.length === 0);
        if (!matchesCat) return false;
        if (!q) return true;
        return (
          book.title.toLowerCase().includes(q) ||
          book.isbn_13.includes(q) ||
          book.authors.some((a) => a.name.toLowerCase().includes(q))
        );
      });
  }, [books, searchQuery, selectedCategory]);

  const featuredBooks = useMemo(() => filteredBooks.slice(0, 8), [filteredBooks]);

  const todayStr = toLocalDateString();
  const activeLoans = useMemo(
    () =>
      loans
        .map((loan) => ({
          loan,
          status: getLoanStatus(loan, todayStr),
          duration: getLoanDuration(loan, todayStr),
        }))
        .filter((item) => item.status !== 'returned'),
    [loans, todayStr],
  );
  const overdueCount = useMemo(
    () => activeLoans.filter((item) => item.status === 'overdue').length,
    [activeLoans],
  );
  const activeLoanCountMap = useMemo(
    () => getActiveLoanCountByBook(loans),
    [loans],
  );

  const scrollCarousel = (direction: 'left' | 'right') => {
    const container = carouselRef.current;
    if (!container) return;
    const firstCard = container.firstElementChild as HTMLElement | null;
    const gap = parseFloat(getComputedStyle(container).columnGap) || 16;
    const step = (firstCard?.offsetWidth ?? 168) + gap;
    container.scrollBy({
      left: direction === 'left' ? -step : step,
      behavior: 'smooth',
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() && selectedCategory === 'all') {
      onNavigate('books');
    }
  };

  return (
    <div className="space-y-8 sm:space-y-9 pb-6">
      {loadError && (
        <div role="alert" className="rounded-[18px] bg-[#FDECEC] p-4 sm:p-5 text-[15px] leading-[1.5] text-[#262925]">
          <p className="font-semibold">Gagal memuat data perpustakaan</p>
          <p className="mt-1 text-[13px] font-medium text-[#686C65]">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 min-h-[44px] rounded-[12px] bg-[#B3261E] px-5 text-xs font-bold text-white hover:bg-[#8E1D17]"
          >
            Muat ulang
          </button>
        </div>
      )}

      {loansError && !loading && (
        <div role="alert" className="rounded-[18px] bg-[#F7EAE4] px-4 py-3 text-xs font-medium text-[#9E4028]">
          Gagal memuat data pinjaman ({loansError}). Status pinjaman &amp; ketersediaan mungkin tidak akurat.
        </div>
      )}

      {/* Header + Search + Category Strip */}
      <section className="space-y-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="page-title">
              {libraryName}
            </h1>
            <p className="mt-1.5 text-[13px] sm:text-[15px] leading-[1.55] text-[#686C65]">
              Cari koleksi, saring per kategori, atau tambah buku lewat pindai <span className="acronym">ISBN</span>.
            </p>
          </div>

          <div className="inline-flex w-fit items-center gap-2 rounded-[12px] bg-white shadow-[0_1px_2px_rgba(38,41,37,0.04)] px-3 py-1.5 sm:px-3.5 sm:py-2 text-[12px] sm:text-[13px] font-medium text-[#262925]">
            <Library className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-[#1F6F5B]" strokeWidth={1.5} aria-hidden="true" />
            <span className="tabular-nums font-semibold">{books.length}</span>
            <span>buku tercatat</span>
          </div>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="flex items-center gap-2 sm:max-w-2xl"
        >
          <div className="relative flex flex-1 items-center h-[44px] sm:h-[48px] rounded-[12px] bg-white shadow-[0_1px_3px_rgba(38,41,37,0.05)] px-3.5 focus-within:ring-2 focus-within:ring-[#1F6F5B]/20 transition-shadow">
            <Search
              className="pointer-events-none h-4 w-4 shrink-0 text-[#686C65]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul, penulis, atau nomor ISBN..."
              className="w-full bg-transparent pl-2.5 pr-2 text-[13.5px] sm:text-[15px] text-[#262925] placeholder-[#686C65] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Hapus kata kunci"
                onClick={() => setSearchQuery('')}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#686C65] hover:bg-[#ECE8DF] hover:text-[#262925]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            )}
          </div>

          <button
            type="submit"
            aria-label="Cari buku"
            className="btn-primary-tactile inline-flex h-[44px] w-[44px] sm:h-[48px] sm:w-auto sm:px-6 shrink-0 items-center justify-center gap-2 rounded-[12px] text-[14px] sm:text-[15px] font-semibold"
          >
            <Search className="h-4 w-4 sm:hidden" strokeWidth={1.5} aria-hidden="true" />
            <span className="hidden sm:inline">Cari</span>
          </button>
        </form>

        {/* Horizontal Category Tiles */}
        <div className="-mx-3 flex snap-x snap-mandatory gap-2.5 sm:gap-3 overflow-x-auto px-3 pt-1 no-scrollbar sm:mx-0 sm:px-0">
          <button
            type="button"
            aria-pressed={selectedCategory === 'all'}
            onClick={() => setSelectedCategory('all')}
            className="group flex min-w-[64px] max-w-[84px] sm:min-w-[70px] sm:max-w-[92px] shrink-0 snap-start flex-col items-center gap-1.5 px-1 text-center"
          >
            <span
              className={`flex h-11 w-11 sm:h-13 sm:w-13 items-center justify-center rounded-[14px] transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-[#1F6F5B] text-white'
                  : 'bg-white shadow-[0_1px_2px_rgba(38,41,37,0.05)] text-[#1F6F5B] group-hover:bg-[#ECE8DF]'
              }`}
            >
              <LayoutGrid className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span
              className={`line-clamp-1 w-full text-[11px] sm:text-[12px] font-semibold ${
                selectedCategory === 'all' ? 'text-[#262925]' : 'text-[#686C65]'
              }`}
            >
              Semua
            </span>
          </button>

          {categories.map((cat) => {
            const CatIcon = getCategoryIcon(cat.name);
            const isSelected = selectedCategory.toLowerCase() === cat.name.toLowerCase();
            const swatch = getCategorySwatch(cat.name);
            return (
              <button
                key={cat.name}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setSelectedCategory(isSelected ? 'all' : cat.name)}
                className="group flex min-w-[64px] max-w-[84px] sm:min-w-[70px] sm:max-w-[92px] shrink-0 snap-start flex-col items-center gap-1.5 px-1 text-center"
              >
                <span
                  className={`flex h-11 w-11 sm:h-13 sm:w-13 items-center justify-center rounded-[14px] transition-colors ${
                    isSelected
                      ? 'bg-[#1F6F5B] text-white'
                      : `${swatch.bg} ${swatch.fg}`
                  }`}
                >
                  <CatIcon className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={1.5} aria-hidden="true" />
                </span>
                <span
                  className={`line-clamp-1 w-full text-[11px] sm:text-[12px] font-semibold ${
                    isSelected ? 'text-[#262925]' : 'text-[#686C65]'
                  }`}
                >
                  {cat.name}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Primary Focus: Featured Book Carousel with Subtle Shelf Ledge */}
      <section className="space-y-4 pt-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[16px] sm:text-[19px] font-semibold tracking-[-0.01em] leading-[1.3] text-[#262925]">
              {searchQuery || selectedCategory !== 'all'
                ? `Hasil pencarian (${filteredBooks.length})`
                : 'Baru ditambahkan'}
            </h2>
            {(searchQuery || selectedCategory !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                className="rounded-full bg-[#E5F2EE] px-3.5 py-1 text-[12px] font-semibold text-[#165243] hover:bg-[#D6EAE4]"
              >
                Atur ulang
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onNavigate('books')}
              className="inline-flex min-h-[36px] sm:min-h-[40px] items-center rounded-[12px] bg-white shadow-[0_1px_2px_rgba(38,41,37,0.06)] px-3.5 text-[12px] sm:text-[13px] font-semibold text-[#262925] hover:bg-[#ECE8DF]"
            >
              Lihat semua
            </button>
            {featuredBooks.length > 0 && (
              <>
                <button
                  type="button"
                  aria-label="Geser ke kiri"
                  onClick={() => scrollCarousel('left')}
                  className="hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-white shadow-[0_1px_2px_rgba(38,41,37,0.06)] text-[#262925] hover:bg-[#ECE8DF]"
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Geser ke kanan"
                  onClick={() => scrollCarousel('right')}
                  className="hidden sm:inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-white shadow-[0_1px_2px_rgba(38,41,37,0.06)] text-[#262925] hover:bg-[#ECE8DF]"
                >
                  <ChevronRight className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-[136/223] animate-pulse rounded-[14px] bg-[#ECE8DF]" />
            ))}
          </div>
        ) : featuredBooks.length === 0 ? (
          <div className="rounded-[18px] bg-white shadow-[0_1px_3px_rgba(38,41,37,0.04)] p-6 sm:p-8 text-center">
            {books.length === 0 ? (
              <ReadingCornerEmptyIllustration compact className="mb-3" />
            ) : (
              <EmptySearchIllustration className="mb-3" />
            )}
            <p className="text-[15px] sm:text-[16px] font-semibold text-[#262925]">
              {books.length === 0 ? 'Belum ada buku di rak' : 'Tidak ada buku yang cocok'}
            </p>
            <p className="mt-1 text-[13px] sm:text-[14px] leading-[1.55] text-[#737770]">
              {books.length === 0
                ? <>Mulai dengan memindai barcode <span className="acronym">ISBN</span> atau isi data buku manual.</>
                : searchQuery.trim()
                ? `Tidak ada hasil untuk “${searchQuery.trim()}”. Coba kata kunci lain atau pilih kategori “Semua”.`
                : 'Coba kata kunci lain atau pilih kategori “Semua”.'}
            </p>
            <button
              type="button"
              onClick={() => {
                if (books.length === 0) {
                  onNavigate('scanner');
                } else {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }
              }}
              className={`mt-5 inline-flex min-h-[46px] items-center gap-2 rounded-[12px] px-6 text-sm ${
                books.length === 0 ? 'btn-hero-marigold font-bold' : 'btn-primary-tactile font-semibold'
              }`}
            >
              {books.length === 0 ? (
                <>
                  <QrCode className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  <span>
                    Pindai <span className="acronym">ISBN</span>
                  </span>
                </>
              ) : (
                <span>Tampilkan semua</span>
              )}
            </button>
          </div>
        ) : (
          <div>
            <div
              ref={carouselRef}
              className="-mx-3 flex snap-x snap-mandatory scroll-px-3 gap-4 sm:gap-5 overflow-x-auto overscroll-x-contain px-3 pt-1 no-scrollbar sm:mx-0 sm:scroll-px-0 sm:px-0"
            >
              {featuredBooks.map((book) => {
                const authorsLabel = formatAuthorList(book.authors);
                const stock = getBookStockInfo(book, activeLoanCountMap.get(book.id) ?? 0);
                return (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => setSelectedBook(book)}
                    className="group w-[124px] sm:w-[152px] md:w-[164px] shrink-0 snap-start snap-always pb-3 text-left"
                  >
                    <div className="relative">
                      <BookCard
                        coverUrl={book.cover_url}
                        title={book.title}
                        author={authorsLabel}
                        seed={book.id}
                        unavailable={stock.isOutOfStock}
                        size="md"
                        priority
                      />
                      {stock.isOutOfStock && (
                        <span className="absolute top-2 left-2 rounded-[8px] bg-[#262925]/85 px-2 py-0.5 text-[10px] font-bold text-white">
                          Habis
                        </span>
                      )}
                    </div>
                    <div className="mt-2.5 px-0.5 space-y-1">
                      <h3 className="book-title book-title--reserve text-[#262925] group-hover:text-[#165243]">
                        {book.title}
                      </h3>
                      <p className="book-author line-clamp-1">
                        {authorsLabel}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-[8px] px-2 py-0.5 text-[10.5px] font-semibold tabular-nums ${
                          stock.isOutOfStock
                            ? 'bg-[#ECE8DF] text-[#686C65]'
                            : stock.borrowed > 0
                            ? 'bg-[#F7EDD6] text-[#7A510B]'
                            : 'bg-[#E5F2EE] text-[#165243]'
                        }`}
                      >
                        {stock.isOutOfStock
                          ? `Habis · 0/${stock.total}`
                          : stock.borrowed > 0
                          ? `Sisa ${stock.available}/${stock.total}`
                          : `Tersedia ${stock.available}/${stock.total}`}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="h-px w-full bg-[#ECE7DD]" aria-hidden="true" />
          </div>
        )}
      </section>

      {/* Secondary Focus: iOS Grouped Loan Summary */}
      <section className="relative overflow-hidden rounded-[18px] bg-white shadow-[0_1px_3px_rgba(38,41,37,0.04)] grid lg:grid-cols-[0.9fr_1.1fr] divide-y lg:divide-y-0 lg:divide-x divide-[#ECE7DD]">
        {overdueCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute inset-y-4 left-0 w-[3px] rounded-r-full bg-[#B9543A]"
          />
        )}
        <div className={`p-4 sm:p-5 space-y-2.5 flex flex-col justify-center ${overdueCount > 0 ? 'pl-5 sm:pl-6' : ''}`}>
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] sm:text-[19px] font-semibold tracking-[-0.01em] leading-[1.3] text-[#262925]">
              {activeLoans.length > 0
                ? `${activeLoans.length} pinjaman sedang berjalan`
                : 'Pemantauan pinjaman barang'}
            </h2>
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-[10px] bg-[#F7EAE4] px-2.5 py-0.5 text-[11px] font-semibold text-[#9E4028]">
                <AlertTriangle className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                <span>{overdueCount} terlambat</span>
              </span>
            )}
          </div>
          <p className="text-[13px] sm:text-[14.5px] leading-[1.55] text-[#737770]">
            {overdueCount > 0
              ? `${overdueCount} pinjaman sudah melewati batas pengembalian. Segera periksa di menu Pinjaman.`
              : activeLoans.length > 0
              ? 'Pantau nama peminjam, lama peminjaman, dan tenggat pengembalian barang secara langsung.'
              : 'Catat barang atau buku yang dipinjam agar durasi dan tanggal kembalinya selalu terpantau.'}
          </p>
          <div className="pt-1.5 grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('loans')}
              className="btn-primary-tactile inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-[12px] px-5 text-[13.5px] sm:text-sm font-semibold"
            >
              <CalendarClock className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              <span>Kelola pinjaman</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('books')}
              className="inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center rounded-[12px] bg-[#F2EFE8] px-5 text-[13.5px] sm:text-sm font-semibold text-[#262925] hover:bg-[#E7E2D7]"
            >
              Buka Rak Buku
            </button>
          </div>
        </div>

        <div className="flex flex-col justify-center">
          {activeLoans.length === 0 ? (
            <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
              <div className="min-w-0 flex-1">
                <p className="text-[14px] sm:text-[15px] font-semibold text-[#262925]">Belum ada pinjaman aktif</p>
                <p className="mt-1 text-[12.5px] sm:text-[13px] font-medium leading-[1.5] text-[#737770]">
                  Semua barang berada di tempatnya. Gunakan menu Pinjaman saat ada peminjaman baru.
                </p>
              </div>
              <LoanEmptyCardAccent className="hidden sm:flex" />
            </div>
          ) : (
            <div className="divide-y divide-[#ECE7DD]">
              {activeLoans.slice(0, 3).map(({ loan, status, duration }) => (
                <button
                  key={loan.id}
                  type="button"
                  onClick={() => onNavigate('loans')}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3.5 sm:px-5 text-left transition-colors hover:bg-[#FAF9F5]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="book-title text-[#262925]">
                      {loan.item_name}
                    </div>
                    <div className="book-author truncate">
                      {loan.borrower_name} · {duration.durationLabel}
                    </div>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-[10px] px-2.5 py-1 text-[12px] font-semibold ${
                      status === 'overdue'
                        ? 'bg-[#F7EAE4] text-[#9E4028]'
                        : 'bg-[#F7EDD6] text-[#7A510B]'
                    }`}
                  >
                    {status === 'overdue' && (
                      <AlertTriangle className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                    )}
                    <span>{loanStatusLabel[status]}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Tertiary Activity Feed as iOS Grouped Inset List */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-2 text-[#262925]">
          <Clock3 className="h-4 w-4 text-[#1F6F5B]" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="text-[15px] sm:text-[18px] font-semibold tracking-[-0.01em] leading-[1.3]">
            Aktivitas terbaru
          </h2>
        </div>

        <div className="rounded-[18px] bg-white shadow-[0_1px_3px_rgba(38,41,37,0.04)] overflow-hidden">
          {logs.length === 0 ? (
            <div className="flex items-center gap-3.5 px-4 py-4 sm:px-5 text-[13px] sm:text-[14px] leading-[1.55] text-[#737770]">
              <EmptyNotesAccent />
              <p>
                Belum ada catatan aktivitas. Penambahan, perubahan, atau pengarsipan buku akan tercatat di sini.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#ECE7DD]">
              {logs.slice(0, 4).map((log) => (
                <div key={log.id} className="px-4 py-3 sm:px-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-[#165243]">
                      {formatActivityAction(log.action)}
                    </span>
                    <span className="text-[12px] font-medium text-[#686C65] tabular-nums">
                      {new Date(log.created_at).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-[14px] leading-[1.5] text-[#363A34]">{log.description}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Interactive Quick Book Preview Sheet */}
      {selectedBook && (() => {
        const selectedStock = getBookStockInfo(selectedBook, activeLoanCountMap.get(selectedBook.id) ?? 0);
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={selectedBook.title}
            onClick={() => setSelectedBook(null)}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-t-[22px] bg-white p-4 sm:rounded-[18px] sm:p-5 shadow-xl"
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="font-mono text-[13px] font-medium text-[#686C65] tabular-nums">
                  <span className="acronym">ISBN</span> {formatIsbn(selectedBook.isbn_13)}
                </span>
                <button
                  type="button"
                  aria-label="Tutup ringkasan buku"
                  onClick={() => setSelectedBook(null)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#F2EFE8] text-[#262925] hover:bg-[#E7E2D7]"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>

              <div className="flex gap-4">
                <div className="relative w-24 shrink-0">
                  <BookCard
                    coverUrl={selectedBook.cover_url}
                    title={selectedBook.title}
                    author={selectedBook.authors?.[0]?.name}
                    seed={selectedBook.id}
                    unavailable={selectedStock.isOutOfStock}
                    size="sm"
                  />
                  {selectedStock.isOutOfStock && (
                    <span className="absolute top-1.5 left-1.5 rounded-[8px] bg-[#262925]/85 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      Habis
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <h3 className="book-title-lg text-[#262925]">
                    {selectedBook.title}
                  </h3>
                  {selectedBook.subtitle && (
                    <p className="text-[13px] font-normal text-[#737770]">{selectedBook.subtitle}</p>
                  )}
                  <p className="text-[15px] leading-[1.5] text-[#363A34]">
                    {formatAuthorList(selectedBook.authors)}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-[13px] font-normal text-[#686C65]">
                    <span>{selectedBook.publisher?.name || 'Penerbit tidak tercatat'}</span>
                    {selectedBook.publication_year && <span className="tabular-nums">{selectedBook.publication_year}</span>}
                    {selectedBook.page_count && <span className="tabular-nums">{selectedBook.page_count} hlm</span>}
                    <span
                      className={`inline-flex items-center rounded-[8px] px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                        selectedStock.isOutOfStock
                          ? 'bg-[#ECE8DF] text-[#686C65]'
                          : selectedStock.borrowed > 0
                          ? 'bg-[#F7EDD6] text-[#7A510B]'
                          : 'bg-[#E5F2EE] text-[#165243]'
                      }`}
                    >
                      {selectedStock.isOutOfStock
                        ? `Habis · 0/${selectedStock.total}`
                        : `Tersedia ${selectedStock.available}/${selectedStock.total}`}
                    </span>
                  </div>
                </div>
              </div>

              {selectedBook.description && (
                <p className="mt-4 line-clamp-4 text-[15px] leading-[1.5] text-[#363A34]">
                  {selectedBook.description}
                </p>
              )}

              <div className="mt-5 flex flex-col-reverse sm:flex-row sm:flex-wrap sm:items-center sm:justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedBook(null)}
                  className="min-h-[44px] w-full sm:w-auto rounded-[12px] bg-[#F2EFE8] px-5 text-sm font-semibold text-[#262925] hover:bg-[#E7E2D7]"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  disabled={selectedStock.isOutOfStock}
                  onClick={() => {
                    const target = selectedBook;
                    setSelectedBook(null);
                    if (onLendBook) {
                      onLendBook(target);
                    } else {
                      onNavigate('loans');
                    }
                  }}
                  className={`inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-[12px] px-5 text-sm font-semibold ${
                    selectedStock.isOutOfStock
                      ? 'bg-[#ECE8DF] text-[#686C65] cursor-not-allowed'
                      : 'bg-[#E5F2EE] text-[#165243] hover:bg-[#D6EAE4]'
                  }`}
                >
                  <CalendarClock className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                  <span>{selectedStock.isOutOfStock ? 'Stok habis' : 'Pinjamkan'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBook(null);
                    onNavigate('books');
                  }}
                  className="btn-primary-tactile min-h-[44px] w-full sm:w-auto rounded-[12px] px-6 text-sm font-semibold"
                >
                  Buka di Rak Buku
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
