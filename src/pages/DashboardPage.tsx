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
import { BookCard } from '../components/BookCard';

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
  { bg: 'bg-[#E8EFEB] group-hover:bg-[#DCE7E1]', fg: 'text-[#24483D]', spine: 'bg-[#24483D]' },
  { bg: 'bg-[#F7EAE4] group-hover:bg-[#F0DDD4]', fg: 'text-[#9E4028]', spine: 'bg-[#B9543A]' },
  { bg: 'bg-[#F5EEDB] group-hover:bg-[#EDE2C5]', fg: 'text-[#6B4A14]', spine: 'bg-[#9A6D1F]' },
  { bg: 'bg-[#E9EEF4] group-hover:bg-[#DDE5EE]', fg: 'text-[#284566]', spine: 'bg-[#284566]' },
  { bg: 'bg-[#F1EAF6] group-hover:bg-[#E5DAF0]', fg: 'text-[#55386E]', spine: 'bg-[#55386E]' },
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
  const [libraryName, setLibraryName] = useState('Perpustakaan MeelieFont');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const carouselRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [libraryBooks, recentLogs, loanRes] = await Promise.all([
          LibraryService.getAllBooks(),
          userRole === 'Member' ? Promise.resolve([]) : LibraryService.getLogs(),
          LoanService.getLoans().catch(() => ({ loans: [] as LoanRecord[], localFallback: false })),
        ]);
        setBooks(libraryBooks);
        setLogs(recentLogs);
        setLoans(loanRes.loans);
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
    <div className="space-y-7 sm:space-y-8 pb-6">
      {loadError && (
        <div role="alert" className="rounded-[16px] bg-[#FDECEC] p-4 sm:p-5 text-[15px] leading-[1.5] text-[#262925]">
          <p className="font-semibold">Gagal memuat data perpustakaan</p>
          <p className="mt-1 text-[13px] font-medium text-[#575B54]">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 min-h-[44px] rounded-[10px] bg-[#B3261E] px-5 text-xs font-bold text-white hover:bg-[#8E1D17]"
          >
            Muat ulang
          </button>
        </div>
      )}

      {/* Header + Search + Category Spine Strip */}
      <section className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[28px] sm:text-[34px] font-bold tracking-[-0.02em] leading-[1.15] text-[#262925]">
              {libraryName}
            </h1>
            <p className="mt-1.5 text-[15px] sm:text-[16px] leading-[1.5] text-[#575B54]">
              Cari koleksi, saring per kategori, atau tambah buku lewat scan ISBN.
            </p>
          </div>

          <div className="inline-flex w-fit items-center gap-2 rounded-[10px] bg-white px-3.5 py-2 text-[12px] sm:text-[13px] font-medium text-[#262925]">
            <Library className="h-4 w-4 text-[#24483D]" strokeWidth={1.5} aria-hidden="true" />
            <span className="font-mono tabular-nums font-semibold">{books.length}</span>
            <span>buku tercatat</span>
          </div>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="flex items-center gap-2 sm:max-w-2xl"
        >
          <div className="relative flex flex-1 items-center h-[48px] rounded-[12px] bg-white px-3.5">
            <Search
              className="pointer-events-none h-4 w-4 shrink-0 text-[#575B54]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul, penulis, atau nomor ISBN..."
              className="w-full bg-transparent pl-2.5 pr-2 text-[15px] text-[#262925] placeholder-[#575B54]"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Hapus kata kunci"
                onClick={() => setSearchQuery('')}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#575B54] hover:bg-[#F1EDE4] hover:text-[#262925]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            )}
          </div>

          <button
            type="submit"
            aria-label="Cari buku"
            className="inline-flex h-[48px] w-[48px] sm:w-auto sm:px-6 shrink-0 items-center justify-center gap-2 rounded-[12px] bg-[#24483D] text-[15px] font-semibold text-white hover:bg-[#19382F]"
          >
            <Search className="h-4 w-4 sm:hidden" strokeWidth={1.5} aria-hidden="true" />
            <span className="hidden sm:inline">Cari</span>
          </button>
        </form>

        {/* Horizontal Category Tiles with Subtle Book-Spine Bar */}
        <div className="-mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 pt-1 no-scrollbar sm:mx-0 sm:gap-2.5 sm:px-0">
          <button
            type="button"
            aria-pressed={selectedCategory === 'all'}
            onClick={() => setSelectedCategory('all')}
            className="group flex min-w-[70px] max-w-[92px] shrink-0 snap-start flex-col items-center gap-1.5 px-1 text-center"
          >
            <span
              className={`relative flex h-13 w-13 items-center justify-center rounded-[12px] transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-[#24483D] text-white'
                  : 'bg-white text-[#24483D] group-hover:bg-[#F1EDE4]'
              }`}
            >
              <span
                aria-hidden="true"
                className={`absolute left-1.5 top-2.5 bottom-2.5 w-[3px] rounded-full ${
                  selectedCategory === 'all' ? 'bg-white/45' : 'bg-[#24483D]/35'
                }`}
              />
              <LayoutGrid className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </span>
            <span
              className={`line-clamp-1 w-full text-[12px] font-medium ${
                selectedCategory === 'all' ? 'font-semibold text-[#262925]' : 'text-[#575B54]'
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
                className="group flex min-w-[70px] max-w-[92px] shrink-0 snap-start flex-col items-center gap-1.5 px-1 text-center"
              >
                <span
                  className={`relative flex h-13 w-13 items-center justify-center rounded-[12px] transition-colors ${
                    isSelected
                      ? 'bg-[#24483D] text-white'
                      : `${swatch.bg} ${swatch.fg}`
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute left-1.5 top-2.5 bottom-2.5 w-[3px] rounded-full opacity-55 ${
                      isSelected ? 'bg-white/55' : swatch.spine
                    }`}
                  />
                  <CatIcon className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
                </span>
                <span
                  className={`line-clamp-1 w-full text-[12px] font-medium ${
                    isSelected ? 'font-semibold text-[#262925]' : 'text-[#575B54]'
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
            <h2 className="text-[18px] sm:text-[20px] font-semibold tracking-[-0.01em] leading-[1.3] text-[#262925]">
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
                className="rounded-[8px] bg-[#E8EFEB] px-3 py-1 text-[12px] font-semibold text-[#24483D] hover:bg-[#DCE7E1]"
              >
                Reset
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onNavigate('books')}
              className="inline-flex h-9 items-center rounded-[10px] bg-white px-3.5 text-[13px] font-semibold text-[#262925] hover:bg-[#F1EDE4]"
            >
              Lihat semua
            </button>
            {featuredBooks.length > 0 && (
              <>
                <button
                  type="button"
                  aria-label="Geser ke kiri"
                  onClick={() => scrollCarousel('left')}
                  className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-[#262925] hover:bg-[#F1EDE4]"
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Geser ke kanan"
                  onClick={() => scrollCarousel('right')}
                  className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-[#262925] hover:bg-[#F1EDE4]"
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
              <div key={i} className="aspect-[136/223] animate-pulse rounded-[16px] bg-[#F1EDE4]" />
            ))}
          </div>
        ) : featuredBooks.length === 0 ? (
          <div className="rounded-[16px] bg-white p-6 sm:p-8 text-center">
            <BookOpen className="mx-auto mb-2.5 h-8 w-8 text-[#575B54]" strokeWidth={1.5} aria-hidden="true" />
            <p className="text-[16px] font-semibold text-[#262925]">
              {books.length === 0 ? 'Belum ada buku di rak' : 'Tidak ada buku yang cocok'}
            </p>
            <p className="mt-1 text-[15px] leading-[1.5] text-[#575B54]">
              {books.length === 0
                ? 'Mulai dengan memindai barcode ISBN atau isi data buku manual.'
                : 'Coba kata kunci lain atau pilih kategori Semua.'}
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
              className="mt-5 inline-flex min-h-[50px] items-center gap-2 rounded-full bg-[#24483D] px-6 text-sm font-semibold text-white hover:bg-[#19382F]"
            >
              {books.length === 0 ? (
                <>
                  <QrCode className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                  <span>Scan ISBN</span>
                </>
              ) : (
                <span>Tampilkan semua</span>
              )}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            <div
              ref={carouselRef}
              className="-mx-3 flex snap-x snap-mandatory scroll-px-3 gap-3.5 sm:gap-4 overflow-x-auto overscroll-x-contain px-3 pb-1 no-scrollbar sm:mx-0 sm:scroll-px-0 sm:px-0"
            >
              {featuredBooks.map((book) => {
                const authorsLabel = formatAuthorList(book.authors);
                return (
                  <button
                    key={book.id}
                    type="button"
                    onClick={() => setSelectedBook(book)}
                    className="group w-[126px] sm:w-[156px] md:w-[168px] shrink-0 snap-start snap-always text-left"
                  >
                    <BookCard
                      coverUrl={book.cover_url}
                      title={book.title}
                      author={authorsLabel}
                      seed={book.id}
                      size="md"
                      priority
                    />
                    <div className="mt-2.5 px-0.5 space-y-0.5">
                      <h3 className="book-title book-title--reserve text-[#262925] group-hover:text-[#24483D]">
                        {book.title}
                      </h3>
                      <p className="book-author line-clamp-1">
                        {authorsLabel}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="h-[2px] w-full rounded-full bg-[#E2DCCF]" aria-hidden="true" />
          </div>
        )}
      </section>

      {/* Secondary Focus: White Card Loan Summary with Terracotta Attention Role */}
      <section className="relative overflow-hidden rounded-[16px] bg-white p-4 sm:p-5">
        <span
          aria-hidden="true"
          className={`absolute inset-y-4 left-0 w-[3px] rounded-r-full ${
            overdueCount > 0 ? 'bg-[#B9543A]' : 'bg-[#24483D]'
          }`}
        />
        <div className="grid gap-4 sm:gap-5 lg:grid-cols-[0.9fr_1.1fr] items-center pl-2">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <h2 className="text-[18px] sm:text-[20px] font-semibold tracking-[-0.01em] leading-[1.3] text-[#262925]">
                {activeLoans.length > 0
                  ? `${activeLoans.length} pinjaman sedang berjalan`
                  : 'Pemantauan pinjaman barang'}
              </h2>
              {overdueCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-[8px] bg-[#F7EAE4] px-2 py-0.5 text-[11px] font-semibold text-[#9E4028]">
                  <AlertTriangle className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                  <span>{overdueCount} terlambat</span>
                </span>
              )}
            </div>
            <p className="text-[15px] leading-[1.5] text-[#575B54]">
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
                className="inline-flex min-h-[50px] w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-[#24483D] px-6 text-sm font-semibold text-white hover:bg-[#19382F]"
              >
                <CalendarClock className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                <span>Kelola pinjaman</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('books')}
                className="inline-flex min-h-[46px] w-full sm:w-auto items-center justify-center rounded-[10px] bg-[#F1EDE4] px-5 text-sm font-semibold text-[#262925] hover:bg-[#E7E1D5]"
              >
                Buka Rak Buku
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {activeLoans.length === 0 ? (
              <div className="rounded-[10px] bg-[#FAF8F3] p-3.5 sm:p-4">
                <p className="text-[15px] font-semibold text-[#262925]">Belum ada pinjaman aktif</p>
                <p className="mt-1 text-[13px] font-medium leading-[1.5] text-[#575B54]">
                  Semua barang berada di tempatnya. Gunakan menu Pinjaman saat ada peminjaman baru.
                </p>
              </div>
            ) : (
              activeLoans.slice(0, 3).map(({ loan, status, duration }) => (
                <button
                  key={loan.id}
                  type="button"
                  onClick={() => onNavigate('loans')}
                  className="flex w-full items-center justify-between gap-3 rounded-[10px] bg-[#FAF8F3] p-3 text-left transition-colors hover:bg-[#F1EDE4]"
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
                    className={`inline-flex shrink-0 items-center gap-1 rounded-[8px] px-2.5 py-1 text-[12px] font-semibold ${
                      status === 'overdue'
                        ? 'bg-[#F7EAE4] text-[#9E4028]'
                        : 'bg-[#E8EFEB] text-[#24483D]'
                    }`}
                  >
                    {status === 'overdue' && (
                      <AlertTriangle className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                    )}
                    <span>{loanStatusLabel[status]}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Tertiary Editorial Feed Directly on Warm Paper (Lower Visual Weight & Rhythm Contrast) */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-2 text-[#262925]">
          <Clock3 className="h-4 w-4 text-[#24483D]" strokeWidth={1.5} aria-hidden="true" />
          <h2 className="text-[16px] sm:text-[18px] font-semibold tracking-[-0.01em] leading-[1.3]">
            Aktivitas terbaru
          </h2>
        </div>

        {logs.length === 0 ? (
          <div className="rounded-[12px] bg-white p-3.5 text-[14px] leading-[1.5] text-[#575B54]">
            Belum ada catatan aktivitas. Penambahan, perubahan, atau pengarsipan buku akan tercatat di sini.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {logs.slice(0, 4).map((log) => (
              <div key={log.id} className="rounded-[12px] bg-white px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-[#24483D]">
                    {formatActivityAction(log.action)}
                  </span>
                  <span className="text-[12px] font-medium text-[#575B54]">
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
      </section>

      {/* Interactive Quick Book Preview Sheet */}
      {selectedBook && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedBook.title}
          onClick={() => setSelectedBook(null)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-t-[20px] bg-white p-4 sm:rounded-[16px] sm:p-5"
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="font-mono text-[13px] font-medium text-[#575B54] tabular-nums">
                ISBN {formatIsbn(selectedBook.isbn_13)}
              </span>
              <button
                type="button"
                aria-label="Tutup ringkasan buku"
                onClick={() => setSelectedBook(null)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#F1EDE4] text-[#262925] hover:bg-[#E7E1D5]"
              >
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            <div className="flex gap-4">
              <div className="w-24 shrink-0">
                <BookCard
                  coverUrl={selectedBook.cover_url}
                  title={selectedBook.title}
                  author={selectedBook.authors?.[0]?.name}
                  seed={selectedBook.id}
                  size="sm"
                  showRibbon
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <h3 className="book-title-lg text-[#262925]">
                  {selectedBook.title}
                </h3>
                {selectedBook.subtitle && (
                  <p className="text-[13px] font-normal text-[#575B54]">{selectedBook.subtitle}</p>
                )}
                <p className="text-[15px] leading-[1.5] text-[#363A34]">
                  {formatAuthorList(selectedBook.authors)}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-[13px] font-normal text-[#575B54]">
                  <span>{selectedBook.publisher?.name || 'Penerbit tidak tercatat'}</span>
                  {selectedBook.publication_year && <span>{selectedBook.publication_year}</span>}
                  {selectedBook.page_count && <span>{selectedBook.page_count} hlm</span>}
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
                className="min-h-[46px] w-full sm:w-auto rounded-[10px] bg-[#F1EDE4] px-5 text-sm font-semibold text-[#262925] hover:bg-[#E7E1D5]"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = selectedBook;
                  setSelectedBook(null);
                  if (onLendBook) {
                    onLendBook(target);
                  } else {
                    onNavigate('loans');
                  }
                }}
                className="inline-flex min-h-[46px] w-full sm:w-auto items-center justify-center gap-2 rounded-[10px] bg-[#E8EFEB] px-5 text-sm font-semibold text-[#24483D] hover:bg-[#DCE7E1]"
              >
                <CalendarClock className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                <span>Pinjamkan</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedBook(null);
                  onNavigate('books');
                }}
                className="min-h-[50px] w-full sm:w-auto rounded-full bg-[#24483D] px-6 text-sm font-semibold text-white hover:bg-[#19382F]"
              >
                Buka di Rak Buku
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
