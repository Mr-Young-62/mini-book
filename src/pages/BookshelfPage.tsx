import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  Search,
  Grid,
  List,
  Library,
  Plus,
  Trash2,
  RotateCcw,
  Archive,
  Pencil,
  X,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { LoanService } from '../services/loanService';
import { Book, LoanRecord, ScannedBookMetadata } from '../types/library';
import { formatIsbn, isValidIsbn, normalizeToIsbn13 } from '../services/isbnValidator';
import { formatAddedAt } from '../lib/datetime';
import { BookStockInfo, getActiveLoanCountByBook, getBookStockInfo, normalizeStockCount } from '../lib/stock';
import { BookCard } from '../components/BookCard';
import { useToast } from '../components/ToastProvider';
import {
  EmptySearchIllustration,
  ReadingCornerEmptyIllustration,
} from '../components/LibraryIllustrations';

const formatAuthorList = (authors?: { name: string }[]): string => {
  const clean = (authors ?? [])
    .map((a) => a.name.trim())
    .filter((name) => {
      const lower = name.toLowerCase();
      return Boolean(name) && lower !== 'unknown author' && lower !== 'unknown';
    });
  return clean.length > 0 ? clean.join(', ') : 'Penulis belum dicatat';
};

interface EditBookFormProps {
  book: Book;
  onSave: (metadata: ScannedBookMetadata) => void;
}

const EditBookForm: React.FC<EditBookFormProps> = ({ book, onSave }) => {
  const [validationError, setValidationError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: book.title,
    subtitle: book.subtitle ?? '',
    authors: book.authors.map((author) => author.name).join(', '),
    publisher: book.publisher?.name ?? '',
    publicationYear: book.publication_year?.toString() ?? '',
    language: book.language ?? 'en',
    pageCount: book.page_count?.toString() ?? '',
    stockCount: normalizeStockCount(book.stock_count).toString(),
    isbn10: book.isbn_10 ?? '',
    isbn13: book.isbn_13,
    categories: book.categories.map((category) => category.name).join(', '),
    description: book.description ?? '',
    coverUrl: book.cover_url ?? '',
  });

  const setField = (key: keyof typeof form, value: string) => {
    if (validationError) setValidationError(null);
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const parsePositiveInt = (value: string): number | undefined => {
    const parsed = Number(value);
    return value.trim() && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const isbn13 = normalizeToIsbn13(form.isbn13.trim());
    if (!isValidIsbn(isbn13)) {
      setValidationError('ISBN-13 tidak valid. Periksa kembali digit ISBN.');
      return;
    }
    if (!form.title.trim()) {
      setValidationError('Judul buku wajib diisi.');
      return;
    }
    const parsedStock = parsePositiveInt(form.stockCount);
    if (!parsedStock) {
      setValidationError('Jumlah eksemplar minimal 1.');
      return;
    }
    setValidationError(null);
    onSave({
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      authors: form.authors.split(',').map((name) => name.trim()).filter(Boolean),
      publisher: form.publisher.trim() || undefined,
      publicationYear: parsePositiveInt(form.publicationYear),
      language: form.language.trim() || 'en',
      pageCount: parsePositiveInt(form.pageCount),
      stockCount: parsedStock,
      isbn10: form.isbn10.trim() || undefined,
      isbn13,
      description: form.description.trim() || undefined,
      coverUrl: form.coverUrl.trim() || undefined,
      categories: form.categories.split(',').map((name) => name.trim()).filter(Boolean),
      source: 'manual',
    });
  };

  const inputClass =
    'w-full px-3 py-2 text-xs rounded-[12px] bg-[#F2EFE8] text-[#262925] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25';
  const labelClass = 'block text-xs font-medium text-[#686C65] mb-1';

  return (
    <form id="edit-book-form" onSubmit={submit} className="space-y-3">
      {validationError && (
        <div
          role="alert"
          className="rounded-[10px] bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#B3261E]"
        >
          {validationError}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label>
          <span className={labelClass}>Judul</span>
          <input className={inputClass} value={form.title} onChange={(e) => setField('title', e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>Subjudul</span>
          <input className={inputClass} value={form.subtitle} onChange={(e) => setField('subtitle', e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>Penulis (pisahkan dengan koma)</span>
          <input className={inputClass} value={form.authors} onChange={(e) => setField('authors', e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>Penerbit</span>
          <input className={inputClass} value={form.publisher} onChange={(e) => setField('publisher', e.target.value)} />
        </label>
        <label>
          <span className={labelClass}><span className="acronym">ISBN-10</span></span>
          <input className={`${inputClass} font-mono`} value={form.isbn10} onChange={(e) => setField('isbn10', e.target.value)} />
        </label>
        <label>
          <span className={labelClass}><span className="acronym">ISBN-13</span></span>
          <input className={`${inputClass} font-mono`} value={form.isbn13} onChange={(e) => setField('isbn13', e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>Tahun Terbit</span>
          <input className={`${inputClass} tabular-nums`} value={form.publicationYear} onChange={(e) => setField('publicationYear', e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>Jumlah Halaman</span>
          <input className={`${inputClass} tabular-nums`} value={form.pageCount} onChange={(e) => setField('pageCount', e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>Jumlah Eksemplar</span>
          <input type="number" min={1} className={`${inputClass} tabular-nums`} value={form.stockCount} onChange={(e) => setField('stockCount', e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>Bahasa</span>
          <input className={inputClass} value={form.language} onChange={(e) => setField('language', e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>Kategori (pisahkan dengan koma)</span>
          <input className={inputClass} value={form.categories} onChange={(e) => setField('categories', e.target.value)} />
        </label>
        <label className="sm:col-span-2">
          <span className={labelClass}>URL Sampul</span>
          <input className={inputClass} value={form.coverUrl} onChange={(e) => setField('coverUrl', e.target.value)} />
        </label>
        <label className="sm:col-span-2">
          <span className={labelClass}>Deskripsi</span>
          <textarea
            className={`${inputClass} min-h-24 resize-y`}
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
          />
        </label>
      </div>
    </form>
  );
};

interface BookshelfPageProps {
  onNavigateToScanner: () => void;
  onLendBook?: (book: Book) => void;
}

export const BookshelfPage: React.FC<BookshelfPageProps> = ({
  onNavigateToScanner,
  onLendBook,
}) => {
  const { notify } = useToast();
  const currency = LibraryService.getSettings().library_info.currency || 'IDR';
  const [books, setBooks] = useState<Book[]>([]);
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Loan-loading failure is tracked separately so it is not disguised as
  // "zero active loans / everything available".
  const [loansError, setLoansError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'shelf' | 'grid' | 'table'>('shelf');
  const [showArchived, setShowArchived] = useState(false);
  const [archivedBooks, setArchivedBooks] = useState<Book[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const shelfContainerRef = useRef<HTMLDivElement>(null);
  const [booksPerShelf, setBooksPerShelf] = useState<number>(() => {
    if (typeof window === 'undefined') return 6;
    const w = window.innerWidth;
    if (w < 640) return Math.max(2, Math.floor((w - 40) / 130));
    if (w < 768) return Math.max(3, Math.floor((w - 56) / 152));
    return Math.max(4, Math.floor((w - 280) / 168));
  });

  // Selected book for detailed inspection modal
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const [editingBook, setEditingBook] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    loadBooks();
  }, []);

  useEffect(() => {
    if (!activeBook) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingEdit) {
        setActiveBook(null);
        setEditingBook(false);
        setConfirmingArchive(false);
        setActionError(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeBook, savingEdit]);

  const loadBooks = async () => {
    setLoading(true);
    setLoadError(null);
    setLoansError(null);
    try {
      // Books are the primary data; loans are secondary. Use allSettled so a
      // loan-loading failure is surfaced separately and never reported as an
      // empty (zero-loan) result that makes every copy look available.
      const [booksRes, loansRes] = await Promise.allSettled([
        LibraryService.getAllBooks(),
        LoanService.getLoans(),
      ]);

      if (booksRes.status === 'fulfilled') {
        setBooks(booksRes.value);
      } else {
        const err = booksRes.reason;
        console.error('Error fetching books:', err);
        setLoadError(err instanceof Error ? err.message : 'Gagal memuat daftar buku.');
      }

      if (loansRes.status === 'fulfilled') {
        setLoans(loansRes.value.loans);
      } else {
        const err = loansRes.reason;
        console.error('Error fetching loans:', err);
        setLoans([]);
        setLoansError(err instanceof Error ? err.message : 'Gagal memuat data pinjaman.');
      }
    } finally {
      setLoading(false);
    }
  };

  const activeLoanCountMap = useMemo(
    () => getActiveLoanCountByBook(loans),
    [loans],
  );

  const categories = Array.from(
    new Set(books.flatMap((b) => b.categories.map((c) => c.name)))
  );

  const filteredBooks = books.filter((book) => {
    // Search query
    const query = searchQuery.toLowerCase();
    const matchesSearch =
      !query ||
      book.title.toLowerCase().includes(query) ||
      book.isbn_13.includes(query) ||
      book.isbn_10?.includes(query) ||
      book.authors.some((a) => a.name.toLowerCase().includes(query));

    // Category filter
    const matchesCategory =
      selectedCategory === 'all' ||
      book.categories.some((c) => c.name.toLowerCase() === selectedCategory.toLowerCase());

    return matchesSearch && matchesCategory;
  });

  useEffect(() => {
    if (viewMode !== 'shelf' || loading || loadError || filteredBooks.length === 0) return;
    const container = shelfContainerRef.current;
    if (!container) return;

    const computePerShelf = (width: number) => {
      if (width <= 0) return;
      const vw = typeof window !== 'undefined' ? window.innerWidth : width;
      let itemWidth = 144;
      let gap = 24;
      let min = 4;
      if (vw < 640) {
        itemWidth = 114;
        gap = 16;
        min = 2;
      } else if (vw < 768) {
        itemWidth = 128;
        gap = 24;
        min = 3;
      }
      const usableWidth = Math.max(0, width - 16);
      const next = Math.max(min, Math.floor((usableWidth + gap) / (itemWidth + gap)));
      setBooksPerShelf((prev) => (prev === next ? prev : next));
    };

    computePerShelf(container.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        computePerShelf(entry.contentRect.width);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [viewMode, loading, loadError, filteredBooks.length]);

  const { totalCopies, totalAvailableCopies } = useMemo(() => {
    let total = 0;
    let available = 0;
    for (const book of filteredBooks) {
      const stock = getBookStockInfo(book, activeLoanCountMap.get(book.id) ?? 0);
      total += stock.total;
      available += stock.available;
    }
    return { totalCopies: total, totalAvailableCopies: available };
  }, [filteredBooks, activeLoanCountMap]);

  const renderStockBadge = (stock: BookStockInfo) => {
    if (stock.isOutOfStock) {
      return (
        <span className="inline-flex items-center rounded-[8px] bg-[#ECE8DF] px-2 py-0.5 text-[10.5px] font-semibold text-[#686C65] tabular-nums">
          Habis · 0/{stock.total}
        </span>
      );
    }
    if (stock.borrowed > 0) {
      return (
        <span className="inline-flex items-center rounded-[8px] bg-[#F7EDD6] px-2 py-0.5 text-[10.5px] font-semibold text-[#7A510B] tabular-nums">
          Sisa {stock.available}/{stock.total}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-[8px] bg-[#E5F2EE] px-2 py-0.5 text-[10.5px] font-semibold text-[#165243] tabular-nums">
        Tersedia {stock.available}/{stock.total}
      </span>
    );
  };

  const loadArchivedBooks = async () => {
    setArchivedLoading(true);
    try {
      setArchivedBooks(await LibraryService.getArchivedBooks());
    } catch (err) {
      console.error('Error fetching archived books:', err);
    } finally {
      setArchivedLoading(false);
    }
  };

  const toggleArchived = () => {
    const next = !showArchived;
    setShowArchived(next);
    if (next) void loadArchivedBooks();
  };

  const handleRestoreBook = async (book: Book) => {
    setActionError(null);
    try {
      const restored = await LibraryService.restoreBook(book.id);
      if (!restored) {
        setActionError('Gagal memulihkan. Mungkin sudah ada buku aktif dengan ISBN yang sama.');
        return;
      }
      await Promise.all([loadArchivedBooks(), loadBooks()]);
      notify({
        tone: 'success',
        title: 'Buku dipulihkan',
        description: `“${book.title}” kembali aktif di rak katalog.`,
      });
    } catch (err) {
      console.error('Error restoring book:', err);
      setActionError('Gagal memulihkan buku. Silakan coba lagi.');
    }
  };

  const handleDeleteBook = async (bookId: string) => {
    setActionError(null);
    const archivedTitle = activeBook?.title;
    try {
      await LibraryService.deleteBook(bookId);
      setActiveBook(null);
      setEditingBook(false);
      setConfirmingArchive(false);
      await loadBooks();
      if (showArchived) await loadArchivedBooks();
      notify({
        tone: 'success',
        title: 'Buku diarsipkan',
        description: archivedTitle ? `“${archivedTitle}” dipindahkan ke arsip.` : 'Buku dipindahkan ke arsip.',
      });
    } catch (err) {
      console.error('Error archiving book:', err);
      setActionError(err instanceof Error ? err.message : 'Gagal mengarsipkan buku. Silakan coba lagi.');
    }
  };

  const openBookDetail = (book: Book) => {
    setActiveBook(book);
    setEditingBook(false);
    setConfirmingArchive(false);
    setActionError(null);
  };

  const closeBookDetail = () => {
    setActiveBook(null);
    setEditingBook(false);
    setConfirmingArchive(false);
    setActionError(null);
  };

  const handleSaveEdit = async (metadata: ScannedBookMetadata) => {
    if (!activeBook) return;
    setSavingEdit(true);
    setActionError(null);
    try {
      const updated = await LibraryService.updateBook(activeBook, metadata);
      setActiveBook(updated);
      setEditingBook(false);
      await loadBooks();
      if (showArchived) await loadArchivedBooks();
      notify({
        tone: 'success',
        title: 'Data buku diperbarui',
        description: `“${updated.title}” (${normalizeStockCount(updated.stock_count)} eksemplar).`,
      });
    } catch (err) {
      console.error('Error updating book:', err);
      setActionError('Gagal menyimpan perubahan buku. Silakan coba lagi.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-7 pb-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="page-title">
            Rak Buku
          </h1>
          <p className="mt-1 text-[13px] sm:text-[15px] leading-[1.5] text-[#686C65] tabular-nums">
            {filteredBooks.length} judul · {totalAvailableCopies}/{totalCopies} eksemplar tersedia di rak.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-[#E8E3D9] p-1 rounded-full">
            <button
              type="button"
              onClick={() => setViewMode('shelf')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'shelf'
                  ? 'bg-white text-[#262925] shadow-[0_1px_2px_rgba(38,41,37,0.1)]'
                  : 'text-[#686C65] hover:text-[#262925]'
              }`}
              title="Tampilan Rak"
            >
              <Library className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
              <span className="hidden sm:inline-flex reserve-bold items-center" data-label="Rak">Rak</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'grid'
                  ? 'bg-white text-[#262925] shadow-[0_1px_2px_rgba(38,41,37,0.1)]'
                  : 'text-[#686C65] hover:text-[#262925]'
              }`}
              title="Tampilan Kotak"
            >
              <Grid className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
              <span className="hidden sm:inline-flex reserve-bold items-center" data-label="Kotak">Kotak</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-[#262925] shadow-[0_1px_2px_rgba(38,41,37,0.1)]'
                  : 'text-[#686C65] hover:text-[#262925]'
              }`}
              title="Tampilan Daftar"
            >
              <List className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
              <span className="hidden sm:inline-flex reserve-bold items-center" data-label="Daftar">Daftar</span>
            </button>
          </div>

          <button
            type="button"
            onClick={toggleArchived}
            className="inline-flex min-h-[40px] sm:min-h-[44px] items-center gap-1.5 px-3.5 sm:px-4 bg-white shadow-[0_1px_2px_rgba(38,41,37,0.06)] hover:bg-[#ECE8DF] text-[#262925] text-xs font-semibold rounded-[12px] whitespace-nowrap"
          >
            <Archive className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
            <span>Arsip</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToScanner}
            className="btn-hero-marigold inline-flex min-h-[44px] items-center gap-1.5 px-4 sm:px-5 text-[13px] sm:text-sm font-bold rounded-[12px] whitespace-nowrap"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            <span>Tambah buku</span>
          </button>
        </div>
      </div>

      {showArchived && (
        <div className="bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] overflow-hidden divide-y divide-[#ECE7DD]">
          <div className="flex items-center justify-between px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-[#686C65]" strokeWidth={1.5} aria-hidden="true" />
              <h2 className="text-xs font-bold text-[#262925]">Arsip buku</h2>
              <span className="text-[11px] text-[#686C65] tabular-nums">({archivedBooks.length})</span>
            </div>
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className="text-xs font-semibold text-[#686C65] hover:text-[#262925]"
            >
              Tutup
            </button>
          </div>
          {actionError && !activeBook && (
            <div role="alert" className="bg-[#FDECEC] px-4 py-2.5 sm:px-5 text-xs font-medium text-[#B3261E]">
              {actionError}
            </div>
          )}
          {archivedLoading ? (
            <div className="h-16 bg-white animate-pulse" />
          ) : archivedBooks.length === 0 ? (
            <p className="text-xs text-[#737770] px-4 py-3.5 sm:px-5">Belum ada buku yang diarsipkan.</p>
          ) : (
            archivedBooks.map((book) => (
              <div
                key={book.id}
                className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
              >
                <div className="min-w-0">
                  <div className="book-title text-[#262925]">{book.title}</div>
                  <div className="text-[11px] text-[#686C65] tabular-nums">
                    <span className="font-mono"><span className="acronym">ISBN</span> {book.isbn_13}</span> · diarsipkan{' '}
                    {book.deleted_at ? new Date(book.deleted_at).toLocaleDateString('id-ID') : '-'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRestoreBook(book)}
                  className="inline-flex shrink-0 items-center gap-1 min-h-[36px] px-3 py-1.5 text-xs font-semibold text-[#165243] bg-[#E5F2EE] hover:bg-[#D6EAE4] rounded-[12px]"
                >
                  <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                  Pulihkan
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-white shadow-[0_1px_3px_rgba(38,41,37,0.05)] focus-within:ring-2 focus-within:ring-[#1F6F5B]/20 p-1.5 rounded-[12px] transition-shadow">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#686C65] absolute left-3.5 top-1/2 -translate-y-1/2" strokeWidth={1.5} aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari judul, penulis, atau ISBN..."
            className="w-full pl-10 pr-11 py-2.5 text-xs bg-transparent rounded-[10px] text-[#262925] placeholder-[#686C65] focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Hapus pencarian"
              onClick={() => setSearchQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-[10px] text-[#686C65] hover:bg-[#ECE8DF] hover:text-[#262925]"
            >
              <X className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Filter kategori"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full sm:w-auto px-3.5 py-2.5 text-xs font-semibold bg-[#F2EFE8] rounded-[10px] text-[#262925] focus:outline-none"
          >
            <option value="all">Semua kategori</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loansError && !loading && (
        <div role="alert" className="rounded-[18px] bg-[#F7EAE4] px-4 py-3 text-xs font-medium text-[#9E4028]">
          Gagal memuat data pinjaman ({loansError}). Ketersediaan eksemplar mungkin tidak akurat.
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="aspect-[136/223] bg-[#ECE8DF] rounded-[14px]" />
          ))}
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-[18px] bg-[#FDECEC] p-5 text-sm text-[#262925]">
          <p className="font-bold">Gagal memuat rak buku</p>
          <p className="mt-1 text-xs text-[#686C65]">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadBooks()}
            className="mt-3 rounded-[12px] bg-[#B3261E] px-4 py-2 text-xs font-bold text-white hover:bg-[#8E1D17]"
          >
            Coba lagi
          </button>
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] p-6 sm:p-8 max-w-lg mx-auto">
          {books.length === 0 ? (
            <ReadingCornerEmptyIllustration className="mb-3" />
          ) : (
            <EmptySearchIllustration className="mb-3" />
          )}
          <h3 className="text-[15px] sm:text-base font-bold text-[#262925]">
            {books.length === 0 ? 'Rak buku masih kosong' : 'Buku tidak ditemukan'}
          </h3>
          <p className="text-[13px] text-[#737770] max-w-sm mx-auto mt-1 mb-5 leading-[1.55]">
            {books.length === 0
              ? <>Belum ada buku di katalog. Pindai barcode <span className="acronym">ISBN</span> untuk menambahkan buku pertama.</>
              : searchQuery.trim()
              ? `Tidak ada buku yang cocok dengan pencarian “${searchQuery.trim()}” atau kategori yang dipilih.`
              : 'Tidak ada buku yang cocok dengan kata kunci atau kategori yang dipilih.'}
          </p>
          {books.length === 0 ? (
            <button
              type="button"
              onClick={onNavigateToScanner}
              className="btn-hero-marigold min-h-[46px] px-6 text-sm font-bold rounded-[12px]"
            >
              Mulai pindai buku pertama
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="min-h-[44px] px-6 bg-[#F2EFE8] hover:bg-[#E7E2D7] text-sm font-semibold rounded-[12px] text-[#262925]"
            >
              Hapus filter
            </button>
          )}
        </div>
      ) : viewMode === 'shelf' ? (
        <div ref={shelfContainerRef} className="space-y-10 py-2">
          {Array.from({ length: Math.ceil(filteredBooks.length / booksPerShelf) }).map((_, shelfIdx) => {
            const shelfBooks = filteredBooks.slice(shelfIdx * booksPerShelf, (shelfIdx + 1) * booksPerShelf);
            return (
              <div key={shelfIdx} className="relative">
                <div className="flex items-end justify-start gap-4 sm:gap-6 px-2 pt-1 z-10 relative overflow-x-auto min-h-[184px] sm:min-h-[210px] no-scrollbar">
                  {shelfBooks.map((book) => {
                    const stock = getBookStockInfo(book, activeLoanCountMap.get(book.id) ?? 0);
                    return (
                      <button
                        type="button"
                        key={book.id}
                        onClick={() => openBookDetail(book)}
                        className="group relative flex flex-col items-start shrink-0 w-[114px] sm:w-32 md:w-36 pb-3 text-left"
                      >
                        <div className="relative w-full">
                          <BookCard
                            coverUrl={book.cover_url}
                            title={book.title}
                            author={book.authors?.[0]?.name}
                            seed={book.id}
                            unavailable={stock.isOutOfStock}
                            size="md"
                            className="w-full"
                          />
                          {stock.isOutOfStock && (
                            <span className="absolute top-2 left-2 rounded-[8px] bg-[#262925]/85 px-2 py-0.5 text-[10px] font-bold text-white">
                              Habis
                            </span>
                          )}
                        </div>

                        <div className="mt-2.5 w-full px-0.5 space-y-1 text-left">
                          <h4 className="book-title book-title--reserve text-[#262925] group-hover:text-[#165243]">
                            {book.title}
                          </h4>
                          <p className="book-author line-clamp-1">
                            {formatAuthorList(book.authors)}
                          </p>
                          {renderStockBadge(stock)}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="w-full h-px bg-[#ECE7DD]" aria-hidden="true" />
              </div>
            );
          })}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {filteredBooks.map((book) => {
            const stock = getBookStockInfo(book, activeLoanCountMap.get(book.id) ?? 0);
            return (
              <button
                type="button"
                key={book.id}
                onClick={() => openBookDetail(book)}
                className="group bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] p-3 hover:bg-[#FAF9F5] transition-colors flex flex-col justify-between text-left"
              >
                <div className="w-full">
                  <div className="relative mb-2 w-full">
                    <BookCard
                      coverUrl={book.cover_url}
                      title={book.title}
                      author={book.authors?.[0]?.name}
                      seed={book.id}
                      unavailable={stock.isOutOfStock}
                      size="md"
                      className="w-full"
                    />
                    {stock.isOutOfStock && (
                      <span className="absolute top-2 left-2 rounded-[8px] bg-[#262925]/85 px-2 py-0.5 text-[10px] font-bold text-white">
                        Habis
                      </span>
                    )}
                  </div>

                  <div className="mt-2.5 space-y-0.5">
                    <h3 className="book-title book-title--reserve text-[#262925] group-hover:text-[#165243]">
                      {book.title}
                    </h3>
                    <p className="book-author line-clamp-1">
                      {formatAuthorList(book.authors)}
                    </p>
                  </div>
                </div>

                <div className="mt-2 pt-0.5 flex items-center justify-between gap-2 text-xs font-mono font-normal text-[#686C65]">
                  <span><span className="acronym">ISBN</span> {book.isbn_13.slice(-5)}</span>
                  <span className="font-sans">{renderStockBadge(stock)}</span>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="rounded-[18px] overflow-hidden shadow-[0_1px_3px_rgba(38,41,37,0.04)] grid grid-cols-1 sm:grid-cols-2 gap-px bg-[#ECE7DD] lg:hidden">
            {filteredBooks.map((book) => {
              const stock = getBookStockInfo(book, activeLoanCountMap.get(book.id) ?? 0);
              return (
                <button
                  type="button"
                  key={book.id}
                  onClick={() => openBookDetail(book)}
                  aria-label={`Lihat detail ${book.title}`}
                  className="group w-full min-h-[44px] bg-white hover:bg-[#FAF9F5] active:bg-[#F2EFE8] p-3.5 text-left transition-colors flex items-start gap-3.5 min-w-0"
                >
                  <div className="w-11 shrink-0 pt-0.5">
                    <BookCard
                      coverUrl={book.cover_url}
                      title={book.title}
                      author={book.authors?.[0]?.name}
                      seed={book.id}
                      unavailable={stock.isOutOfStock}
                      size="xs"
                      className="w-full"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="book-title text-[#262925] group-hover:text-[#165243]">
                        {book.title}
                      </div>
                      <span className="shrink-0 rounded-[10px] bg-[#F2EFE8] px-2.5 py-0.5 text-[11px] font-medium text-[#686C65]">
                        {book.categories[0]?.name || 'Umum'}
                      </span>
                    </div>
                    <p className="book-author line-clamp-1">
                      {formatAuthorList(book.authors)}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs text-[#686C65]">
                      <span className="font-mono tabular-nums text-[#363A34]">
                        {formatIsbn(book.isbn_13)}
                      </span>
                      <span aria-hidden="true">·</span>
                      {renderStockBadge(stock)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="hidden lg:block bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="border-b border-[#ECE7DD] text-[#686C65] font-semibold">
                  <tr>
                    <th className="py-3.5 px-5">Judul & Penulis</th>
                    <th className="py-3.5 px-4 font-mono"><span className="acronym">ISBN-13</span></th>
                    <th className="py-3.5 px-4">Kategori</th>
                    <th className="py-3.5 px-4">Stok</th>
                    <th className="py-3.5 px-4">Penerbit / Tahun</th>
                    <th className="py-3.5 px-4">Ditambahkan</th>
                    <th className="py-3.5 px-5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#ECE7DD]">
                  {filteredBooks.map((book) => {
                    const stock = getBookStockInfo(book, activeLoanCountMap.get(book.id) ?? 0);
                    return (
                      <tr
                        key={book.id}
                        tabIndex={0}
                        role="button"
                        aria-label={`Lihat detail ${book.title}`}
                        onClick={() => openBookDetail(book)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openBookDetail(book);
                          }
                        }}
                        className="bg-white hover:bg-[#FAF9F5] cursor-pointer transition-colors"
                      >
                        <td className="py-3.5 px-5 max-w-[280px]">
                          <div className="book-title text-[#262925]">{book.title}</div>
                          <div className="book-author line-clamp-1">
                            {formatAuthorList(book.authors)}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#363A34] tabular-nums whitespace-nowrap">
                          {formatIsbn(book.isbn_13)}
                        </td>
                        <td className="py-3.5 px-4 text-[#363A34] whitespace-nowrap">
                          {book.categories[0]?.name || 'Umum'}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {renderStockBadge(stock)}
                        </td>
                        <td className="py-3.5 px-4 text-[#686C65] max-w-[220px]">
                          {book.publisher?.name || 'Tidak tercatat'} · {book.publication_year || '-'}
                        </td>
                        <td className="py-3.5 px-4 text-[#686C65] tabular-nums whitespace-nowrap">
                          {formatAddedAt(book.created_at)}
                        </td>
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openBookDetail(book);
                            }}
                            className="px-3 py-1.5 text-[11px] font-semibold text-[#165243] bg-[#E5F2EE] hover:bg-[#D6EAE4] rounded-[10px]"
                          >
                            Detail
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeBook && (() => {
        const activeBookStock = getBookStockInfo(activeBook, activeLoanCountMap.get(activeBook.id) ?? 0);
        return (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeBook.title}
          onClick={closeBookDetail}
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-[18px] shadow-xl max-w-2xl w-full overflow-hidden my-8"
          >
            <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-3.5 border-b border-[#ECE7DD] bg-white">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#165243]">
                  Detail buku
                </span>
                <span className="text-[#686C65]">·</span>
                <span className="text-xs text-[#686C65] font-mono tabular-nums">
                  <span className="acronym">ISBN</span> {activeBook.isbn_13}
                </span>
              </div>
              <button
                type="button"
                aria-label="Tutup detail buku"
                onClick={closeBookDetail}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#F2EFE8] text-[#262925] hover:bg-[#E7E2D7]"
              >
                <X className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {actionError && (
                <div role="alert" className="rounded-[12px] bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#B3261E]">
                  {actionError}
                </div>
              )}

              {editingBook ? (
                <EditBookForm
                  key={activeBook.id}
                  book={activeBook}
                  onSave={(metadata) => void handleSaveEdit(metadata)}
                />
              ) : (
                <div className="flex flex-col sm:flex-row gap-4 sm:gap-5">
                  <div className="relative w-28 sm:w-36 shrink-0">
                    <BookCard
                      coverUrl={activeBook.cover_url}
                      title={activeBook.title}
                      author={activeBook.authors?.[0]?.name}
                      seed={activeBook.id}
                      unavailable={activeBookStock.isOutOfStock}
                      size="lg"
                    />
                    {activeBookStock.isOutOfStock && (
                      <span className="absolute top-2 left-2 rounded-[8px] bg-[#262925]/85 px-2 py-0.5 text-[10px] font-bold text-white">
                        Habis
                      </span>
                    )}
                  </div>

                  <div className="flex-1 space-y-2.5">
                    <h2 className="book-title-lg text-[#262925]">
                      {activeBook.title}
                    </h2>
                    {activeBook.subtitle && (
                      <p className="text-[13px] font-normal text-[#737770]">
                        {activeBook.subtitle}
                      </p>
                    )}
                    <p className="text-xs text-[#363A34]">
                      Oleh <span className="font-medium text-[#262925]">{formatAuthorList(activeBook.authors)}</span>
                    </p>

                    <div className="border-y border-[#ECE7DD] py-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#686C65]">
                      <div>
                        Penerbit:{' '}
                        <span className="font-medium text-[#262925]">
                          {activeBook.publisher?.name || 'Belum dicatat'}
                        </span>
                      </div>
                      <div>
                        Tahun:{' '}
                        <span className="font-medium text-[#262925] tabular-nums">
                          {activeBook.publication_year || 'Belum dicatat'}
                        </span>
                      </div>
                      <div>
                        Halaman:{' '}
                        <span className="font-medium text-[#262925] tabular-nums">
                          {activeBook.page_count || 'Belum dicatat'}
                        </span>
                      </div>
                      <div>
                        Bahasa:{' '}
                        <span className="font-medium text-[#262925] uppercase">
                          {activeBook.language || 'ID'}
                        </span>
                      </div>
                      <div>
                        Ditambahkan:{' '}
                        <span className="font-medium text-[#262925] tabular-nums">
                          {formatAddedAt(activeBook.created_at)}
                        </span>
                      </div>
                      <div>
                        Persediaan:{' '}
                        <span className="font-medium text-[#262925] tabular-nums">
                          {activeBookStock.available}/{activeBookStock.total} eksemplar
                          {activeBookStock.borrowed > 0 ? ` (${activeBookStock.borrowed} dipinjam)` : ''}
                        </span>
                      </div>
                    </div>

                    {activeBook.description && (
                      <p className="pt-1 text-xs text-[#363A34] line-clamp-4 leading-relaxed">
                        {activeBook.description}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="px-4 py-3 sm:px-5 sm:py-3.5 border-t border-[#ECE7DD] bg-white flex flex-wrap items-center justify-between gap-2.5">
              {editingBook ? (
                <>
                  <span className="text-[11px] text-[#737770]">
                    Perubahan akan disimpan ke katalog.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingBook(false);
                        setActionError(null);
                      }}
                      disabled={savingEdit}
                      className="min-h-[42px] px-4 bg-[#F2EFE8] text-xs font-semibold rounded-[12px] text-[#262925] hover:bg-[#E7E2D7] disabled:opacity-60"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      form="edit-book-form"
                      disabled={savingEdit}
                      className="btn-primary-tactile min-h-[42px] px-5 text-xs font-semibold rounded-[12px] disabled:opacity-60"
                    >
                      {savingEdit ? 'Menyimpan...' : 'Simpan'}
                    </button>
                  </div>
                </>
              ) : confirmingArchive ? (
                <>
                  <span className="text-xs font-semibold text-[#B3261E]">
                    Arsipkan buku ini dari katalog aktif?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingArchive(false)}
                      className="min-h-[42px] px-4 rounded-[12px] bg-[#F2EFE8] text-xs font-semibold text-[#262925] hover:bg-[#E7E2D7]"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteBook(activeBook.id)}
                      className="min-h-[42px] px-4 rounded-[12px] bg-[#B3261E] text-white text-xs font-semibold hover:bg-[#8E1D17]"
                    >
                      Ya, arsipkan
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setConfirmingArchive(true)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 text-xs text-[#B3261E] hover:text-[#8E1D17] font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                      <span>Arsipkan</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingBook(true)}
                      className="inline-flex min-h-[40px] items-center gap-1.5 text-xs text-[#262925] hover:text-[#165243] font-semibold"
                    >
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                      <span>Ubah data</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {onLendBook && (
                      <button
                        type="button"
                        disabled={activeBookStock.isOutOfStock}
                        onClick={() => {
                          const target = activeBook;
                          closeBookDetail();
                          onLendBook(target);
                        }}
                        className={`inline-flex items-center gap-1.5 min-h-[44px] px-5 rounded-[12px] text-xs font-semibold ${
                          activeBookStock.isOutOfStock
                            ? 'bg-[#ECE8DF] text-[#686C65] cursor-not-allowed'
                            : 'btn-primary-tactile'
                        }`}
                      >
                        <CalendarClock className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                        <span>{activeBookStock.isOutOfStock ? 'Stok habis' : 'Pinjamkan'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={closeBookDetail}
                      className="min-h-[44px] px-4 bg-[#F2EFE8] text-xs font-semibold rounded-[12px] text-[#262925] hover:bg-[#E7E2D7]"
                    >
                      Tutup
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        );
      })()}
    </div>
  );
};
