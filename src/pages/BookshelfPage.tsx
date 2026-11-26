import React, { useEffect, useState } from 'react';
import {
  BookOpen,
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
import { Book, ScannedBookMetadata } from '../types/library';
import { formatIsbn, isValidIsbn, normalizeToIsbn13 } from '../services/isbnValidator';
import { formatAddedAt } from '../lib/datetime';
import { BookCard } from '../components/BookCard';

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
    setValidationError(null);
    onSave({
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || undefined,
      authors: form.authors.split(',').map((name) => name.trim()).filter(Boolean),
      publisher: form.publisher.trim() || undefined,
      publicationYear: parsePositiveInt(form.publicationYear),
      language: form.language.trim() || 'en',
      pageCount: parsePositiveInt(form.pageCount),
      isbn10: form.isbn10.trim() || undefined,
      isbn13,
      description: form.description.trim() || undefined,
      coverUrl: form.coverUrl.trim() || undefined,
      categories: form.categories.split(',').map((name) => name.trim()).filter(Boolean),
      source: 'manual',
    });
  };

  const inputClass =
    'w-full px-3 py-2 text-xs rounded-[10px] bg-[#FAF8F3] text-[#262925] focus:bg-white';
  const labelClass = 'block text-xs font-medium text-[#575B54] mb-1';

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
          <span className={labelClass}>ISBN-10</span>
          <input className={inputClass} value={form.isbn10} onChange={(e) => setField('isbn10', e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>ISBN-13</span>
          <input className={`${inputClass} font-mono`} value={form.isbn13} onChange={(e) => setField('isbn13', e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>Tahun Terbit</span>
          <input className={`${inputClass} font-mono`} value={form.publicationYear} onChange={(e) => setField('publicationYear', e.target.value)} />
        </label>
        <label>
          <span className={labelClass}>Jumlah Halaman</span>
          <input className={`${inputClass} font-mono`} value={form.pageCount} onChange={(e) => setField('pageCount', e.target.value)} />
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
          <span className={labelClass}>URL Cover</span>
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
  const currency = LibraryService.getSettings().library_info.currency || 'IDR';
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'shelf' | 'grid' | 'table'>('shelf');
  const [showArchived, setShowArchived] = useState(false);
  const [archivedBooks, setArchivedBooks] = useState<Book[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);

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
    try {
      const data = await LibraryService.getAllBooks();
      setBooks(data);
    } catch (err) {
      console.error('Error fetching books:', err);
      setLoadError(err instanceof Error ? err.message : 'Gagal memuat daftar buku.');
    } finally {
      setLoading(false);
    }
  };

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
    } catch (err) {
      console.error('Error restoring book:', err);
      setActionError('Gagal memulihkan buku. Silakan coba lagi.');
    }
  };

  const handleDeleteBook = async (bookId: string) => {
    setActionError(null);
    try {
      await LibraryService.deleteBook(bookId);
      setActiveBook(null);
      setEditingBook(false);
      setConfirmingArchive(false);
      await loadBooks();
      if (showArchived) await loadArchivedBooks();
    } catch (err) {
      console.error('Error archiving book:', err);
      setActionError('Gagal mengarsipkan buku. Silakan coba lagi.');
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
          <h1 className="text-[28px] sm:text-[34px] font-bold tracking-[-0.02em] leading-[1.15] text-[#262925] font-sans">
            Rak Buku
          </h1>
          <p className="mt-1 text-[15px] leading-[1.5] text-[#575B54]">
            {filteredBooks.length} buku tersedia di katalog.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center bg-white p-1 rounded-[12px]">
            <button
              type="button"
              onClick={() => setViewMode('shelf')}
              className={`px-3 py-2 rounded-[8px] text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'shelf'
                  ? 'bg-[#E8EFEB] text-[#24483D]'
                  : 'text-[#575B54] hover:text-[#262925]'
              }`}
              title="Tampilan Rak"
            >
              <Library className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
              <span className="hidden sm:inline">Rak</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`px-3 py-2 rounded-[8px] text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[#E8EFEB] text-[#24483D]'
                  : 'text-[#575B54] hover:text-[#262925]'
              }`}
              title="Tampilan Grid"
            >
              <Grid className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`px-3 py-2 rounded-[8px] text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                viewMode === 'table'
                  ? 'bg-[#E8EFEB] text-[#24483D]'
                  : 'text-[#575B54] hover:text-[#262925]'
              }`}
              title="Tampilan Daftar"
            >
              <List className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
              <span className="hidden sm:inline">Daftar</span>
            </button>
          </div>

          <button
            type="button"
            onClick={toggleArchived}
            className="inline-flex min-h-[44px] items-center gap-1.5 px-4 bg-white hover:bg-[#F1EDE4] text-[#262925] text-xs font-semibold rounded-[10px] whitespace-nowrap"
          >
            <Archive className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
            <span>Arsip</span>
          </button>

          <button
            type="button"
            onClick={onNavigateToScanner}
            className="inline-flex min-h-[50px] items-center gap-1.5 px-5 bg-[#24483D] hover:bg-[#19382F] text-white text-sm font-semibold rounded-full whitespace-nowrap"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            <span>Tambah buku</span>
          </button>
        </div>
      </div>

      {showArchived && (
        <div className="bg-white rounded-[16px] p-3.5 sm:p-4 space-y-2.5">
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-[#575B54]" strokeWidth={1.5} aria-hidden="true" />
              <h2 className="text-xs font-bold text-[#262925]">Arsip buku</h2>
              <span className="text-[11px] text-[#575B54] font-mono">({archivedBooks.length})</span>
            </div>
            <button
              type="button"
              onClick={() => setShowArchived(false)}
              className="text-xs font-semibold text-[#575B54] hover:text-[#262925]"
            >
              Tutup
            </button>
          </div>
          {actionError && !activeBook && (
            <div role="alert" className="rounded-[10px] bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#B3261E]">
              {actionError}
            </div>
          )}
          {archivedLoading ? (
            <div className="h-16 bg-[#FAF8F3] rounded-[10px] animate-pulse" />
          ) : archivedBooks.length === 0 ? (
            <p className="text-xs text-[#575B54] px-0.5">Belum ada buku yang diarsipkan.</p>
          ) : (
            <div className="space-y-2">
              {archivedBooks.map((book) => (
                <div
                  key={book.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-[10px] bg-[#FAF8F3]"
                >
                  <div className="min-w-0">
                    <div className="book-title text-[#262925]">{book.title}</div>
                    <div className="text-[11px] text-[#575B54] font-mono">
                      ISBN {book.isbn_13} ·
                      {' '}diarsipkan {book.deleted_at ? new Date(book.deleted_at).toLocaleDateString('id-ID') : '-'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestoreBook(book)}
                    className="inline-flex shrink-0 items-center gap-1 min-h-[36px] px-3 py-1.5 text-xs font-semibold text-[#24483D] bg-[#E8EFEB] hover:bg-[#DCE7E1] rounded-[8px]"
                  >
                    <RotateCcw className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                    Pulihkan
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-white p-1.5 rounded-[12px]">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#575B54] absolute left-3.5 top-1/2 -translate-y-1/2" strokeWidth={1.5} aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari judul, penulis, atau ISBN..."
            className="w-full pl-10 pr-11 py-2.5 text-xs bg-transparent rounded-[8px] text-[#262925] placeholder-[#575B54]"
          />
          {searchQuery && (
            <button
              type="button"
              aria-label="Hapus pencarian"
              onClick={() => setSearchQuery('')}
              className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-[8px] text-[#575B54] hover:bg-[#F1EDE4] hover:text-[#262925]"
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
            className="w-full sm:w-auto px-3.5 py-2.5 text-xs font-semibold bg-[#FAF8F3] rounded-[8px] text-[#262925]"
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

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 bg-[#F1EDE4] rounded-[16px]" />
          ))}
        </div>
      ) : loadError ? (
        <div role="alert" className="rounded-[16px] bg-[#FDECEC] p-5 text-sm text-[#262925]">
          <p className="font-bold">Gagal memuat rak buku</p>
          <p className="mt-1 text-xs text-[#575B54]">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadBooks()}
            className="mt-3 rounded-[10px] bg-[#B3261E] px-4 py-2 text-xs font-bold text-white hover:bg-[#8E1D17]"
          >
            Coba lagi
          </button>
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="text-center py-14 bg-white rounded-[16px] p-8 max-w-lg mx-auto">
          <BookOpen className="w-10 h-10 mx-auto text-[#575B54] mb-3" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="text-base font-bold text-[#262925]">
            {books.length === 0 ? 'Rak buku masih kosong' : 'Buku tidak ditemukan'}
          </h3>
          <p className="text-xs text-[#575B54] max-w-sm mx-auto mt-1 mb-5">
            {books.length === 0
              ? 'Belum ada buku di katalog. Pindai barcode ISBN untuk menambahkan buku pertama.'
              : 'Tidak ada buku yang cocok dengan kata kunci atau kategori yang dipilih.'}
          </p>
          {books.length === 0 ? (
            <button
              type="button"
              onClick={onNavigateToScanner}
              className="min-h-[50px] px-6 bg-[#24483D] hover:bg-[#19382F] text-white text-sm font-semibold rounded-full"
            >
              Mulai scan buku pertama
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="min-h-[46px] px-6 bg-[#F1EDE4] hover:bg-[#E7E1D5] text-sm font-semibold rounded-[10px] text-[#262925]"
            >
              Hapus filter
            </button>
          )}
        </div>
      ) : viewMode === 'shelf' ? (
        <div className="space-y-10 py-2">
          {Array.from({ length: Math.ceil(filteredBooks.length / 5) }).map((_, shelfIdx) => {
            const shelfBooks = filteredBooks.slice(shelfIdx * 5, shelfIdx * 5 + 5);
            return (
              <div key={shelfIdx} className="relative">
                <div className="flex items-end justify-center sm:justify-start gap-3.5 sm:gap-6 px-2 pb-3 z-10 relative overflow-x-auto min-h-[184px] sm:min-h-[210px] no-scrollbar">
                  {shelfBooks.map((book) => (
                    <button
                      type="button"
                      key={book.id}
                      onClick={() => openBookDetail(book)}
                      className="group relative flex flex-col items-center shrink-0 w-[114px] sm:w-32 md:w-36 text-left"
                    >
                      <BookCard
                        coverUrl={book.cover_url}
                        title={book.title}
                        author={book.authors?.[0]?.name}
                        seed={book.id}
                        size="md"
                        className="w-full"
                      />

                      <div className="mt-2.5 w-full px-0.5 space-y-0.5 text-left">
                        <h4 className="book-title book-title--reserve text-[#262925] group-hover:text-[#24483D]">
                          {book.title}
                        </h4>
                        <p className="book-author line-clamp-1">
                          {formatAuthorList(book.authors)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="w-full h-[2px] bg-[#E2DCCF] rounded-full" aria-hidden="true" />
              </div>
            );
          })}
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {filteredBooks.map((book) => (
            <button
              type="button"
              key={book.id}
              onClick={() => openBookDetail(book)}
              className="group bg-white rounded-[16px] p-2.5 sm:p-3 hover:bg-[#F1EDE4] transition-colors flex flex-col justify-between text-left"
            >
              <div className="w-full">
                <BookCard
                  coverUrl={book.cover_url}
                  title={book.title}
                  author={book.authors?.[0]?.name}
                  seed={book.id}
                  size="md"
                  className="mb-2 w-full"
                />

                <div className="mt-2.5 space-y-0.5">
                  <h3 className="book-title book-title--reserve text-[#262925] group-hover:text-[#24483D]">
                    {book.title}
                  </h3>
                  <p className="book-author line-clamp-1">
                    {formatAuthorList(book.authors)}
                  </p>
                </div>
              </div>

              <div className="mt-2 pt-0.5 flex items-center justify-between text-xs font-mono font-normal text-[#575B54]">
                <span>ISBN {book.isbn_13.slice(-5)}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 lg:hidden">
            {filteredBooks.map((book) => (
              <button
                type="button"
                key={book.id}
                onClick={() => openBookDetail(book)}
                aria-label={`Lihat detail ${book.title}`}
                className="group w-full min-h-[44px] bg-white hover:bg-[#F1EDE4] active:bg-[#EFECE4] rounded-[16px] p-3.5 text-left transition-colors flex items-start gap-3.5 min-w-0"
              >
                <div className="w-11 shrink-0 pt-0.5">
                  <BookCard
                    coverUrl={book.cover_url}
                    title={book.title}
                    author={book.authors?.[0]?.name}
                    seed={book.id}
                    size="xs"
                    showRibbon={false}
                    className="w-full"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="book-title text-[#262925] group-hover:text-[#24483D]">
                      {book.title}
                    </div>
                    <span className="shrink-0 rounded-[8px] bg-[#FAF8F3] px-2 py-0.5 text-[11px] font-medium text-[#575B54]">
                      {book.categories[0]?.name || 'Umum'}
                    </span>
                  </div>
                  <p className="book-author line-clamp-1">
                    {formatAuthorList(book.authors)}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-0.5 text-xs text-[#575B54]">
                    <span className="font-mono tabular-nums text-[#363A34]">
                      {formatIsbn(book.isbn_13)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="truncate max-w-full">
                      {book.publisher?.name || 'Tidak tercatat'}
                      {book.publication_year ? ` (${book.publication_year})` : ''}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="hidden lg:block bg-white rounded-[16px] overflow-hidden p-2">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-separate border-spacing-y-1.5">
                <thead className="text-[#575B54] font-semibold">
                  <tr>
                    <th className="py-3 px-4">Judul & Penulis</th>
                    <th className="py-3 px-4 font-mono">ISBN-13</th>
                    <th className="py-3 px-4">Kategori</th>
                    <th className="py-3 px-4">Penerbit / Tahun</th>
                    <th className="py-3 px-4">Ditambahkan</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBooks.map((book) => (
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
                      className="bg-[#FAF8F3]/60 hover:bg-[#FAF8F3] cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 rounded-l-[10px] max-w-[280px]">
                        <div className="book-title text-[#262925]">{book.title}</div>
                        <div className="book-author line-clamp-1">
                          {formatAuthorList(book.authors)}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#363A34] tabular-nums whitespace-nowrap">
                        {formatIsbn(book.isbn_13)}
                      </td>
                      <td className="py-3 px-4 text-[#363A34] whitespace-nowrap">
                        {book.categories[0]?.name || 'Umum'}
                      </td>
                      <td className="py-3 px-4 text-[#575B54] max-w-[220px]">
                        {book.publisher?.name || 'Tidak tercatat'} · {book.publication_year || '-'}
                      </td>
                      <td className="py-3 px-4 text-[#575B54] font-mono tabular-nums whitespace-nowrap">
                        {formatAddedAt(book.created_at)}
                      </td>
                      <td className="py-3 px-4 text-right rounded-r-[10px] whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openBookDetail(book);
                          }}
                          className="px-3 py-1.5 text-[11px] font-semibold text-[#24483D] bg-[#E8EFEB] hover:bg-[#DCE7E1] rounded-[8px]"
                        >
                          Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeBook && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={activeBook.title}
          onClick={closeBookDetail}
          className="fixed inset-0 z-50 bg-black/45 flex items-center justify-center p-4 overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-[16px] max-w-2xl w-full overflow-hidden my-8"
          >
            <div className="flex items-center justify-between px-4 py-3 sm:px-5 sm:py-3.5 bg-[#FAF8F3]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#24483D]">
                  Detail buku
                </span>
                <span className="text-[#575B54]">·</span>
                <span className="text-xs text-[#575B54] font-mono tabular-nums">
                  ISBN {activeBook.isbn_13}
                </span>
              </div>
              <button
                type="button"
                aria-label="Tutup detail buku"
                onClick={closeBookDetail}
                className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-white text-[#575B54] hover:text-[#262925]"
              >
                <X className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              {actionError && (
                <div role="alert" className="rounded-[10px] bg-[#FDECEC] px-3.5 py-2.5 text-xs font-medium text-[#B3261E]">
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
                  <div className="w-28 sm:w-36 shrink-0">
                    <BookCard
                      coverUrl={activeBook.cover_url}
                      title={activeBook.title}
                      author={activeBook.authors?.[0]?.name}
                      seed={activeBook.id}
                      size="lg"
                    />
                  </div>

                  <div className="flex-1 space-y-2">
                    <h2 className="book-title-lg text-[#262925]">
                      {activeBook.title}
                    </h2>
                    {activeBook.subtitle && (
                      <p className="text-[13px] font-normal text-[#575B54]">
                        {activeBook.subtitle}
                      </p>
                    )}
                    <p className="text-xs text-[#363A34]">
                      Oleh <span className="font-medium text-[#262925]">{formatAuthorList(activeBook.authors)}</span>
                    </p>

                    <div className="rounded-[10px] bg-[#FAF8F3] p-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#575B54]">
                      <div>
                        Penerbit:{' '}
                        <span className="font-medium text-[#262925]">
                          {activeBook.publisher?.name || 'Belum dicatat'}
                        </span>
                      </div>
                      <div>
                        Tahun:{' '}
                        <span className="font-medium text-[#262925] font-mono tabular-nums">
                          {activeBook.publication_year || 'Belum dicatat'}
                        </span>
                      </div>
                      <div>
                        Halaman:{' '}
                        <span className="font-medium text-[#262925] font-mono tabular-nums">
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
                        <span className="font-medium text-[#262925] font-mono tabular-nums">
                          {formatAddedAt(activeBook.created_at)}
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

            <div className="px-4 py-3 sm:px-5 sm:py-3.5 bg-[#FAF8F3] flex flex-wrap items-center justify-between gap-2.5">
              {editingBook ? (
                <>
                  <span className="text-[11px] text-[#575B54]">
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
                      className="min-h-[42px] px-4 bg-white text-xs font-semibold rounded-[10px] text-[#262925] hover:bg-[#F1EDE4] disabled:opacity-60"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      form="edit-book-form"
                      disabled={savingEdit}
                      className="min-h-[44px] px-5 bg-[#24483D] hover:bg-[#19382F] text-white text-xs font-semibold rounded-full disabled:opacity-60"
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
                      className="min-h-[42px] px-4 rounded-[10px] bg-white text-xs font-semibold text-[#262925] hover:bg-[#F1EDE4]"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteBook(activeBook.id)}
                      className="min-h-[42px] px-4 rounded-[10px] bg-[#B3261E] text-white text-xs font-semibold hover:bg-[#8E1D17]"
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
                      className="inline-flex min-h-[40px] items-center gap-1.5 text-xs text-[#262925] hover:text-[#24483D] font-semibold"
                    >
                      <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                      <span>Ubah data</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {onLendBook && (
                      <button
                        type="button"
                        onClick={() => {
                          const target = activeBook;
                          closeBookDetail();
                          onLendBook(target);
                        }}
                        className="inline-flex items-center gap-1.5 min-h-[44px] px-5 rounded-full bg-[#24483D] text-white text-xs font-semibold hover:bg-[#19382F]"
                      >
                        <CalendarClock className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                        <span>Pinjamkan</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={closeBookDetail}
                      className="min-h-[44px] px-4 bg-white text-xs font-semibold rounded-[10px] text-[#262925] hover:bg-[#F1EDE4]"
                    >
                      Tutup
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
