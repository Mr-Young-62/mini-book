import React, { useEffect, useState } from 'react';
import {
  BookOpen,
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

const normalizeCoverUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  const value = String(url).trim();
  if (!value) return undefined;
  if (value.startsWith('//')) return `https:${value}`;
  return value.replace(/^http:\/\//i, 'https://');
};

const BookCoverThumbnail: React.FC<{
  coverUrl?: string;
  title: string;
  author?: string;
  className?: string;
  fit?: 'cover' | 'contain';
}> = ({ coverUrl, title, author, className = '', fit = 'cover' }) => {
  const [src, setSrc] = useState<string | undefined>(normalizeCoverUrl(coverUrl));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(normalizeCoverUrl(coverUrl));
    setFailed(false);
  }, [coverUrl]);

  if (!src || failed) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-[#ECEEF2] via-[#F9F8F5] to-[#DDD7C5] text-[#4F3D32] ${className}`}>
        <div className="flex max-w-[80%] flex-col items-center justify-center text-center">
          <BookOpen className="mb-2 h-6 w-6 text-[#6E737D]" />
          <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#6E737D]">Cover</div>
          <div className="mt-1 line-clamp-3 text-[10px] font-semibold leading-tight">{title || 'No cover'}</div>
          {author && <div className="mt-1 text-[8px] text-[#6E737D]">{author}</div>}
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      referrerPolicy="no-referrer"
      loading="lazy"
      className={`${className} h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'}`}
      onError={() => setFailed(true)}
    />
  );
};

interface EditBookFormProps {
  book: Book;
  onSave: (metadata: ScannedBookMetadata) => void;
}

const EditBookForm: React.FC<EditBookFormProps> = ({ book, onSave }) => {
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

  const setField = (key: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const parsePositiveInt = (value: string): number | undefined => {
    const parsed = Number(value);
    return value.trim() && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const isbn13 = normalizeToIsbn13(form.isbn13.trim());
    if (!isValidIsbn(isbn13)) {
      window.alert('ISBN-13 tidak valid. Periksa kembali digit ISBN.');
      return;
    }
    if (!form.title.trim()) {
      window.alert('Judul buku wajib diisi.');
      return;
    }
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
    'w-full px-3 py-2 text-xs rounded-lg border border-[#E5E7EB] bg-white text-[#14181F] outline-none focus:border-[#18362F]';
  const labelClass = 'block text-[11px] font-semibold text-[#6E737D] mb-1';

  return (
    <form id="edit-book-form" onSubmit={submit} className="space-y-3">
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
}

export const BookshelfPage: React.FC<BookshelfPageProps> = ({
  onNavigateToScanner,
}) => {
  const currency = LibraryService.getSettings().library_info.currency || 'IDR';
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    setLoading(true);
    try {
      const data = await LibraryService.getAllBooks();
      setBooks(data);
    } catch (err) {
      console.error('Error fetching books:', err);
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
    try {
      const restored = await LibraryService.restoreBook(book.id);
      if (!restored) {
        window.alert('Gagal memulihkan. Mungkin sudah ada buku aktif dengan ISBN yang sama.');
        return;
      }
      await Promise.all([loadArchivedBooks(), loadBooks()]);
    } catch (err) {
      console.error('Error restoring book:', err);
      window.alert('Gagal memulihkan buku. Silakan coba lagi.');
    }
  };

  const handleDeleteBook = async (bookId: string) => {
    if (!window.confirm('Buku akan diarsipkan. Lanjutkan?')) {
      return;
    }
    await LibraryService.deleteBook(bookId);
    setActiveBook(null);
    setEditingBook(false);
    await loadBooks();
    if (showArchived) await loadArchivedBooks();
  };

  const closeBookDetail = () => {
    setActiveBook(null);
    setEditingBook(false);
  };

  const handleSaveEdit = async (metadata: ScannedBookMetadata) => {
    if (!activeBook) return;
    setSavingEdit(true);
    try {
      const updated = await LibraryService.updateBook(activeBook, metadata);
      setActiveBook(updated);
      setEditingBook(false);
      await loadBooks();
      if (showArchived) await loadArchivedBooks();
    } catch (err) {
      console.error('Error updating book:', err);
      window.alert('Gagal menyimpan perubahan buku. Silakan coba lagi.');
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div className="space-y-7 pb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#ECEEF2] pb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#14181F] font-sans sm:text-3xl">
            Bookshelf & Catalog
          </h1>
          <p className="mt-1.5 text-xs leading-relaxed text-[#6E737D]">
            Browse bibliographic entries in the catalog ({filteredBooks.length} titles listed)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-[#ECEEF2] p-1 rounded-lg">
            <button
              onClick={() => setViewMode('shelf')}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'shelf'
                  ? 'bg-white text-[#14181F] shadow-2xs'
                  : 'text-[#6E737D] hover:text-[#14181F]'
              }`}
              title="Bookshelf Wood View"
            >
              <Library className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Bookshelf</span>
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'grid'
                  ? 'bg-white text-[#14181F] shadow-2xs'
                  : 'text-[#6E737D] hover:text-[#14181F]'
              }`}
              title="Grid Card View"
            >
              <Grid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Grid</span>
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'table'
                  ? 'bg-white text-[#14181F] shadow-2xs'
                  : 'text-[#6E737D] hover:text-[#14181F]'
              }`}
              title="Table Record View"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>

          <button
            onClick={toggleArchived}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#ECEEF2] hover:bg-[#E5E7EB] text-[#14181F] text-xs font-semibold rounded-lg shadow-2xs transition-colors whitespace-nowrap"
          >
            <Archive className="w-3.5 h-3.5" />
            <span>Arsip</span>
          </button>

          <button
            onClick={onNavigateToScanner}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#18362F] hover:bg-[#112822] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Catalog New Book</span>
          </button>
        </div>
      </div>

      {showArchived && (
        <div className="bg-white border border-[#ECEEF2] rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Archive className="w-4 h-4 text-[#6E737D]" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#14181F]">Arsip Buku</h2>
              <span className="text-[11px] text-[#6E737D] font-mono">({archivedBooks.length})</span>
            </div>
            <button
              onClick={() => setShowArchived(false)}
              className="text-[11px] text-[#6E737D] hover:text-[#14181F]"
            >
              Tutup
            </button>
          </div>
          {archivedLoading ? (
            <div className="h-16 bg-[#ECEEF2] rounded-lg animate-pulse" />
          ) : archivedBooks.length === 0 ? (
            <p className="text-xs text-[#6E737D]">Tidak ada buku yang diarsipkan.</p>
          ) : (
            <div className="space-y-2">
              {archivedBooks.map((book) => (
                <div
                  key={book.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg border border-[#ECEEF2] bg-[#F5F6F8]"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#14181F] truncate">{book.title}</div>
                    <div className="text-[10px] text-[#6E737D] font-mono">
                      ISBN {book.isbn_13} ·
                      {' '}diarsipkan {book.deleted_at ? new Date(book.deleted_at).toLocaleDateString() : '-'}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRestoreBook(book)}
                    className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Pulihkan
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search and Filters Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#ECEEF2] shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#9CA3AF] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, author, or ISBN..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-[#F5F6F8] border border-[#E5E7EB] rounded-lg focus:outline-hidden focus:border-[#18362F]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#14181F]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Filter */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-xs bg-[#F5F6F8] border border-[#E5E7EB] rounded-lg text-[#374151] focus:outline-hidden"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 bg-[#ECEEF2] rounded-xl" />
          ))}
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#ECEEF2] rounded-2xl p-8 max-w-lg mx-auto">
          <BookOpen className="w-12 h-12 mx-auto text-[#9CA3AF] mb-3" />
          <h3 className="text-base font-bold text-[#14181F]">
            {books.length === 0 ? 'Digital Bookshelf is Empty' : 'No books found'}
          </h3>
          <p className="text-xs text-[#6E737D] max-w-sm mx-auto mb-4">
            {books.length === 0
              ? 'There are no books cataloged in the library. Use the smart ISBN scanner to add a book.'
              : 'No bibliographic items match your current filter criteria.'}
          </p>
          {books.length === 0 ? (
            <button
              onClick={onNavigateToScanner}
              className="px-4 py-2 bg-[#18362F] hover:bg-[#112822] text-white text-xs font-semibold rounded-lg shadow-2xs"
            >
              Scan & Add First Book
            </button>
          ) : (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="px-4 py-2 bg-[#ECEEF2] hover:bg-[#E5E7EB] text-xs font-semibold rounded-lg text-[#14181F]"
            >
              Clear Filters
            </button>
          )}
        </div>
      ) : viewMode === 'shelf' ? (
        /* =================== VIEW 1: BOOKSHELF VISUALIZATION =================== */
        <div className="space-y-10 py-4">
          {/* We group books by batches of 4-5 to simulate realistic library wooden shelves */}
          {Array.from({ length: Math.ceil(filteredBooks.length / 5) }).map((_, shelfIdx) => {
            const shelfBooks = filteredBooks.slice(shelfIdx * 5, shelfIdx * 5 + 5);
            return (
              <div key={shelfIdx} className="relative">
                {/* Book Row standing on shelf */}
                <div className="flex items-end justify-center sm:justify-start gap-4 sm:gap-6 px-4 pb-2 z-10 relative overflow-x-auto min-h-[220px]">
                  {shelfBooks.map((book) => (
                    <div
                        key={book.id}
                        onClick={() => setActiveBook(book)}
                        className="group relative cursor-pointer flex flex-col items-center shrink-0 w-32 sm:w-36 transition-all hover:-translate-y-2"
                      >
                        {/* Book 3D spine & cover effect */}
                        <div className="relative aspect-2/3 w-full rounded-xs overflow-hidden shadow-[3px_6px_14px_rgba(44,34,30,0.25)] border-r-2 border-[#14181F]/30 bg-[#18362F]">
                          <BookCoverThumbnail
                            coverUrl={book.cover_url}
                            title={book.title}
                            author={book.authors?.[0]?.name}
                            className="group-hover:brightness-105 transition-all"
                          />
                        </div>

                        {/* Minimal Title label below book on shelf */}
                        <div className="mt-2 text-center w-full">
                          <h4 className="text-[11px] font-bold text-[#14181F] line-clamp-1 group-hover:text-[#18362F] transition-colors">
                            {book.title}
                          </h4>
                        </div>
                      </div>
                  ))}
                </div>

                {/* Wooden Bookshelf Board */}
                <div className="relative w-full h-4 bg-gradient-to-b from-[#E4DFCE] via-[#DDD7C5] to-[#CFC8B4] rounded-xs shadow-[0_6px_10px_rgba(0,0,0,0.18)] border-t border-[#E4DFCE]/40">
                  {/* Wood grain highlight line */}
                  <div className="h-[2px] w-full bg-[#ECE7D8]/50" />
                </div>
                {/* Wall shadow below shelf */}
                <div className="h-2 w-full bg-gradient-to-b from-black/10 to-transparent" />
              </div>
            );
          })}
        </div>
      ) : viewMode === 'grid' ? (
        /* =================== VIEW 2: MODERN CARD GRID =================== */
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filteredBooks.map((book) => (
            <div
              key={book.id}
              onClick={() => setActiveBook(book)}
              className="group cursor-pointer bg-white border border-[#ECEEF2] rounded-xl p-3 hover:border-[#18362F]/40 hover:shadow-xs transition-all flex flex-col justify-between"
            >
              <div>
                <div className="aspect-2/3 rounded-lg overflow-hidden bg-[#ECEEF2] mb-2.5 relative shadow-2xs">
                  <BookCoverThumbnail
                    coverUrl={book.cover_url}
                    title={book.title}
                    author={book.authors?.[0]?.name}
                    className="group-hover:scale-103 transition-transform"
                  />
                </div>

                  <h3 className="text-xs font-bold text-[#14181F] group-hover:text-[#18362F] line-clamp-1 transition-colors">
                    {book.title}
                  </h3>
                  <p className="text-[11px] text-[#6E737D] line-clamp-1">
                    {book.authors.map((a) => a.name).join(', ')}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-[#ECEEF2] flex items-center justify-between text-[10px] font-mono text-[#9CA3AF]">
                  <span>ISBN {book.isbn_13.slice(-5)}</span>
                </div>
              </div>
          ))}
        </div>
      ) : (
        /* =================== VIEW 3: DENSE CATALOG TABLE =================== */
        <div className="bg-white border border-[#ECEEF2] rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F5F6F8] border-b border-[#ECEEF2] text-[#6E737D] font-medium">
                <tr>
                  <th className="py-3 px-4">Title & Author</th>
                  <th className="py-3 px-4 font-mono">ISBN-13</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Publisher / Year</th>
                  <th className="py-3 px-4">Ditambahkan</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ECEEF2]">
                {filteredBooks.map((book) => (
                  <tr
                      key={book.id}
                      onClick={() => setActiveBook(book)}
                      className="hover:bg-[#F5F6F8] cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#14181F]">{book.title}</div>
                        <div className="text-[11px] text-[#6E737D]">
                          {book.authors.map((a) => a.name).join(', ')}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#4B5563] tabular-nums">
                        {formatIsbn(book.isbn_13)}
                      </td>
                      <td className="py-3 px-4 text-[#4B5563]">
                        {book.categories[0]?.name || 'General'}
                      </td>
                      <td className="py-3 px-4 text-[#6E737D]">
                        {book.publisher?.name || 'Unknown'} · {book.publication_year || 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-[#6E737D] font-mono tabular-nums">
                        {formatAddedAt(book.created_at)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveBook(book);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-[#18362F] hover:bg-[#EEF5F1] rounded transition-colors"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
          ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================== BOOK DETAIL MODAL =================== */}
      {activeBook && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-[#E5E7EB] shadow-xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#ECEEF2] bg-[#F5F6F8]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#18362F] uppercase tracking-wider font-mono">
                  Bibliographic Details
                </span>
                <span>·</span>
                <span className="text-xs text-[#6E737D] font-mono tabular-nums">
                  ISBN: {activeBook.isbn_13}
                </span>
              </div>
              <button
                onClick={closeBookDetail}
                className="p-1 rounded-lg text-[#6E737D] hover:text-[#14181F] hover:bg-[#ECEEF2]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {editingBook ? (
                <EditBookForm
                  key={activeBook.id}
                  book={activeBook}
                  onSave={(metadata) => void handleSaveEdit(metadata)}
                />
              ) : (
                <>
              {/* Split Top: Cover + Info */}
              <div className="flex flex-col sm:flex-row gap-5">
                <div className="w-28 sm:w-36 aspect-2/3 rounded-lg overflow-hidden bg-[#ECEEF2] shrink-0 shadow-sm border border-[#E5E7EB]">
                  <BookCoverThumbnail
                    coverUrl={activeBook.cover_url}
                    title={activeBook.title}
                    author={activeBook.authors?.[0]?.name}
                    className="object-cover"
                  />
                </div>

                <div className="flex-1 space-y-2">
                  <h2 className="text-lg font-bold text-[#14181F] leading-tight">
                    {activeBook.title}
                  </h2>
                  {activeBook.subtitle && (
                    <p className="text-xs font-medium text-[#6E737D] italic">
                      {activeBook.subtitle}
                    </p>
                  )}
                  <p className="text-xs text-[#374151]">
                    By <span className="font-semibold">{activeBook.authors.map((a) => a.name).join(', ')}</span>
                  </p>

                  <div className="pt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#6E737D] border-t border-[#ECEEF2]">
                    <div>
                      Publisher:{' '}
                      <span className="font-medium text-[#14181F]">
                        {activeBook.publisher?.name || 'N/A'}
                      </span>
                    </div>
                    <div>
                      Year:{' '}
                      <span className="font-medium text-[#14181F] font-mono tabular-nums">
                        {activeBook.publication_year || 'N/A'}
                      </span>
                    </div>
                    <div>
                      Pages:{' '}
                      <span className="font-medium text-[#14181F] font-mono tabular-nums">
                        {activeBook.page_count || 'N/A'}
                      </span>
                    </div>
                    <div>
                      Language:{' '}
                      <span className="font-medium text-[#14181F] uppercase">
                        {activeBook.language || 'EN'}
                      </span>
                    </div>
                    <div>
                      Ditambahkan:{' '}
                      <span className="font-medium text-[#14181F] font-mono tabular-nums">
                        {formatAddedAt(activeBook.created_at)}
                      </span>
                    </div>
                  </div>

                  {activeBook.description && (
                    <p className="pt-2 text-xs text-[#4B5563] line-clamp-3 leading-relaxed">
                      {activeBook.description}
                    </p>
                  )}
                </div>
              </div>
                </>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-[#ECEEF2] bg-[#F5F6F8] flex items-center justify-between gap-3">
              {editingBook ? (
                <>
                  <span className="text-[11px] text-[#6E737D]">
                    Perubahan akan disimpan ke katalog.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={closeBookDetail}
                      disabled={savingEdit}
                      className="px-4 py-2 bg-white border border-[#E5E7EB] text-xs font-semibold rounded-lg text-[#14181F] hover:bg-[#F5F6F8] disabled:opacity-60"
                    >
                      Batal
                    </button>
                    <button
                      type="submit"
                      form="edit-book-form"
                      disabled={savingEdit}
                      className="px-4 py-2 bg-[#18362F] hover:bg-[#112822] text-white text-xs font-semibold rounded-lg disabled:opacity-60"
                    >
                      {savingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleDeleteBook(activeBook.id)}
                      className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Archive Record</span>
                    </button>
                    <button
                      onClick={() => setEditingBook(true)}
                      className="inline-flex items-center gap-1 text-xs text-[#14181F] hover:text-[#18362F] font-semibold"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>Edit Record</span>
                    </button>
                  </div>

                  <button
                    onClick={closeBookDetail}
                    className="px-4 py-2 bg-white border border-[#E5E7EB] text-xs font-semibold rounded-lg text-[#14181F] hover:bg-[#F5F6F8]"
                  >
                    Close
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
