import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Search,
  Filter,
  Grid,
  List,
  Library,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle,
  Clock,
  Layers,
  MapPin,
  X,
  Sparkles,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { Book, BookCopy, UserRole } from '../types/library';
import { formatIsbn } from '../services/isbnValidator';

interface BookshelfPageProps {
  userRole: UserRole;
  onNavigateToBorrow: (copyId?: string) => void;
  onNavigateToScanner: () => void;
}

export const BookshelfPage: React.FC<BookshelfPageProps> = ({
  userRole,
  onNavigateToBorrow,
  onNavigateToScanner,
}) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'borrowed'>('all');
  const [viewMode, setViewMode] = useState<'shelf' | 'grid' | 'table'>('shelf');

  // Selected book for detailed inspection modal
  const [activeBook, setActiveBook] = useState<Book | null>(null);

  // Modal to add a new physical copy to active book
  const [showAddCopyModal, setShowAddCopyModal] = useState(false);
  const [newCopyShelf, setNewCopyShelf] = useState('Shelf Tech A');
  const [newCopyRack, setNewCopyRack] = useState('Rack 01');
  const [newCopyCondition, setNewCopyCondition] = useState('Good');
  const [newCopyPrice, setNewCopyPrice] = useState('25.00');

  useEffect(() => {
    loadBooks();
  }, []);

  const loadBooks = async () => {
    setLoading(true);
    try {
      const data = await LibraryService.getBooks();
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
      book.authors.some((a) => a.name.toLowerCase().includes(query)) ||
      book.copies?.some((c) => c.inventory_code.toLowerCase().includes(query));

    // Category filter
    const matchesCategory =
      selectedCategory === 'all' ||
      book.categories.some((c) => c.name.toLowerCase() === selectedCategory.toLowerCase());

    // Availability filter
    const availableCopies = book.copies?.filter((c) => c.status === 'Available') || [];
    const matchesAvailability =
      availabilityFilter === 'all' ||
      (availabilityFilter === 'available' && availableCopies.length > 0) ||
      (availabilityFilter === 'borrowed' && availableCopies.length === 0);

    return matchesSearch && matchesCategory && matchesAvailability;
  });

  const handleDeleteBook = async (bookId: string) => {
    if (!window.confirm('Are you sure you want to remove this book and all its physical copies from the library?')) {
      return;
    }
    await LibraryService.deleteBook(bookId);
    setActiveBook(null);
    loadBooks();
  };

  const handleAddCopySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBook) return;

    await LibraryService.addBookWithCopies(
      {
        title: activeBook.title,
        authors: activeBook.authors.map((a) => a.name),
        isbn13: activeBook.isbn_13,
        isbn10: activeBook.isbn_10,
        coverUrl: activeBook.cover_url,
        categories: activeBook.categories.map((c) => c.name),
        source: 'manual',
      },
      {
        copyCount: 1,
        shelfLocation: newCopyShelf,
        rackNumber: newCopyRack,
        condition: newCopyCondition,
        acquisitionPrice: parseFloat(newCopyPrice) || 0,
      }
    );

    setShowAddCopyModal(false);
    await loadBooks();
    // Refresh active book
    const updated = await LibraryService.getBooks();
    const current = updated.find((b) => b.id === activeBook.id);
    if (current) setActiveBook(current);
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#EAE5DE] pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2C221E] font-sans">
            Bookshelf & Catalog
          </h1>
          <p className="text-xs text-[#7E6F64]">
            Browse bibliographic entries and manage physical shelf copies ({filteredBooks.length} titles listed)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-[#F0ECE4] p-1 rounded-lg">
            <button
              onClick={() => setViewMode('shelf')}
              className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                viewMode === 'shelf'
                  ? 'bg-white text-[#2C221E] shadow-2xs'
                  : 'text-[#7E6F64] hover:text-[#2C221E]'
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
                  ? 'bg-white text-[#2C221E] shadow-2xs'
                  : 'text-[#7E6F64] hover:text-[#2C221E]'
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
                  ? 'bg-white text-[#2C221E] shadow-2xs'
                  : 'text-[#7E6F64] hover:text-[#2C221E]'
              }`}
              title="Table Record View"
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Table</span>
            </button>
          </div>

          {userRole !== 'Member' && (
            <button
              onClick={onNavigateToScanner}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Catalog New Book</span>
            </button>
          )}
        </div>
      </div>

      {/* Search and Filters Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#E8E2D9] shadow-2xs">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#A89F91] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, author, ISBN, or inventory code..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg focus:outline-hidden focus:border-[#EA580C]"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A89F91] hover:text-[#2C221E]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category & Status Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-[#4A3E35] focus:outline-hidden"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={availabilityFilter}
            onChange={(e) => setAvailabilityFilter(e.target.value as any)}
            className="px-3 py-2 text-xs bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-[#4A3E35] focus:outline-hidden"
          >
            <option value="all">All Status</option>
            <option value="available">Available on Shelf</option>
            <option value="borrowed">All Copies Borrowed</option>
          </select>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-64 bg-[#F0ECE4] rounded-xl" />
          ))}
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E8E2D9] rounded-2xl p-8 max-w-lg mx-auto">
          <BookOpen className="w-12 h-12 mx-auto text-[#A89F91] mb-3" />
          <h3 className="text-base font-bold text-[#2C221E]">
            {books.length === 0 ? 'Digital Bookshelf is Empty' : 'No books found'}
          </h3>
          <p className="text-xs text-[#7E6F64] max-w-sm mx-auto mb-4">
            {books.length === 0
              ? 'There are no books cataloged in the library. Use the smart ISBN scanner to add real books and physical copies.'
              : 'No bibliographic items match your current filter criteria.'}
          </p>
          {books.length === 0 ? (
            <button
              onClick={onNavigateToScanner}
              className="px-4 py-2 bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold rounded-lg shadow-2xs"
            >
              Scan & Add First Book
            </button>
          ) : (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
                setAvailabilityFilter('all');
              }}
              className="px-4 py-2 bg-[#F0ECE4] hover:bg-[#E5E0D8] text-xs font-semibold rounded-lg text-[#2C221E]"
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
                  {shelfBooks.map((book) => {
                    const availableCount = book.copies?.filter((c) => c.status === 'Available').length || 0;
                    return (
                      <div
                        key={book.id}
                        onClick={() => setActiveBook(book)}
                        className="group relative cursor-pointer flex flex-col items-center shrink-0 w-32 sm:w-36 transition-all hover:-translate-y-2"
                      >
                        {/* Book 3D spine & cover effect */}
                        <div className="relative aspect-2/3 w-full rounded-xs overflow-hidden shadow-[3px_6px_14px_rgba(44,34,30,0.25)] border-r-2 border-[#1C1613]/30 bg-[#3E322B]">
                          {book.cover_url ? (
                            <img
                              src={book.cover_url}
                              alt={book.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:brightness-105 transition-all"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : null}

                          {/* Fallback book design if image fails */}
                          <div className="absolute inset-0 p-2.5 flex flex-col justify-between bg-gradient-to-br from-[#4A3B34] to-[#241A16] text-white">
                            <div>
                              <div className="text-[10px] uppercase tracking-wider text-[#FDBA74] font-semibold line-clamp-1">
                                {book.authors[0]?.name || 'Author'}
                              </div>
                              <h4 className="text-xs font-bold leading-tight line-clamp-3 mt-1 font-sans">
                                {book.title}
                              </h4>
                            </div>
                            <span className="text-[9px] font-mono text-[#D7CEC7]">{book.publication_year}</span>
                          </div>

                          {/* Status ribbon overlay */}
                          <div className="absolute top-1.5 right-1.5">
                            <span
                              className={`text-[9px] font-semibold font-mono px-1.5 py-0.5 rounded shadow-xs ${
                                availableCount > 0
                                  ? 'bg-emerald-600/90 text-white'
                                  : 'bg-rose-700/90 text-white'
                              }`}
                            >
                              {availableCount > 0 ? `${availableCount} on shelf` : 'Loaned'}
                            </span>
                          </div>
                        </div>

                        {/* Minimal Title label below book on shelf */}
                        <div className="mt-2 text-center w-full">
                          <h4 className="text-[11px] font-bold text-[#2C221E] line-clamp-1 group-hover:text-[#EA580C] transition-colors">
                            {book.title}
                          </h4>
                          <span className="text-[10px] text-[#7E6F64] line-clamp-1 font-mono">
                            {book.copies?.[0]?.shelf_location || 'Main Floor'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Wooden Bookshelf Board */}
                <div className="relative w-full h-4 bg-gradient-to-b from-[#8C6239] via-[#6F4E2C] to-[#533A1F] rounded-xs shadow-[0_6px_10px_rgba(0,0,0,0.18)] border-t border-[#A87B4C]/40">
                  {/* Wood grain highlight line */}
                  <div className="h-[2px] w-full bg-[#B88A58]/50" />
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
          {filteredBooks.map((book) => {
            const availableCount = book.copies?.filter((c) => c.status === 'Available').length || 0;
            return (
              <div
                key={book.id}
                onClick={() => setActiveBook(book)}
                className="group cursor-pointer bg-white border border-[#E8E2D9] rounded-xl p-3 hover:border-[#EA580C]/40 hover:shadow-xs transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-2/3 rounded-lg overflow-hidden bg-[#F0ECE4] mb-2.5 relative shadow-2xs">
                    {book.cover_url && (
                      <img
                        src={book.cover_url}
                        alt={book.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-103 transition-transform"
                      />
                    )}
                    <span
                      className={`absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-sm shadow-2xs ${
                        availableCount > 0
                          ? 'bg-emerald-600 text-white'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      {availableCount} avail
                    </span>
                  </div>

                  <h3 className="text-xs font-bold text-[#2C221E] group-hover:text-[#EA580C] line-clamp-1 transition-colors">
                    {book.title}
                  </h3>
                  <p className="text-[11px] text-[#7E6F64] line-clamp-1">
                    {book.authors.map((a) => a.name).join(', ')}
                  </p>
                </div>

                <div className="mt-3 pt-2 border-t border-[#F0ECE4] flex items-center justify-between text-[10px] font-mono text-[#A89F91]">
                  <span>ISBN {book.isbn_13.slice(-5)}</span>
                  <span>{book.copies?.length || 0} copies</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* =================== VIEW 3: DENSE TABULAR INVENTORY =================== */
        <div className="bg-white border border-[#E8E2D9] rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8F5] border-b border-[#E8E2D9] text-[#7E6F64] font-medium">
                <tr>
                  <th className="py-3 px-4">Title & Author</th>
                  <th className="py-3 px-4 font-mono">ISBN-13</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Publisher / Year</th>
                  <th className="py-3 px-4 text-center">Copies</th>
                  <th className="py-3 px-4 text-center">Available</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0ECE4]">
                {filteredBooks.map((book) => {
                  const availableCount = book.copies?.filter((c) => c.status === 'Available').length || 0;
                  return (
                    <tr
                      key={book.id}
                      onClick={() => setActiveBook(book)}
                      className="hover:bg-[#FAF8F5] cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#2C221E]">{book.title}</div>
                        <div className="text-[11px] text-[#7E6F64]">
                          {book.authors.map((a) => a.name).join(', ')}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#5A4D44] tabular-nums">
                        {formatIsbn(book.isbn_13)}
                      </td>
                      <td className="py-3 px-4 text-[#5A4D44]">
                        {book.categories[0]?.name || 'General'}
                      </td>
                      <td className="py-3 px-4 text-[#7E6F64]">
                        {book.publisher?.name || 'Unknown'} · {book.publication_year || 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-center font-mono font-medium tabular-nums">
                        {book.copies?.length || 0}
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums">
                        <span
                          className={`font-semibold ${
                            availableCount > 0 ? 'text-emerald-700' : 'text-rose-600'
                          }`}
                        >
                          {availableCount}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveBook(book);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-[#EA580C] hover:bg-[#FFEDD5] rounded transition-colors"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================== BOOK DETAIL MODAL =================== */}
      {activeBook && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-[#E5E0D8] shadow-xl overflow-hidden my-8">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#EAE5DE] bg-[#FAF8F5]">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#EA580C] uppercase tracking-wider font-mono">
                  Bibliographic Details
                </span>
                <span>·</span>
                <span className="text-xs text-[#7E6F64] font-mono tabular-nums">
                  ISBN: {activeBook.isbn_13}
                </span>
              </div>
              <button
                onClick={() => setActiveBook(null)}
                className="p-1 rounded-lg text-[#7E6F64] hover:text-[#2C221E] hover:bg-[#EAE5DE]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              {/* Split Top: Cover + Info */}
              <div className="flex flex-col sm:flex-row gap-5">
                <div className="w-28 sm:w-36 aspect-2/3 rounded-lg overflow-hidden bg-[#F2EDE4] shrink-0 shadow-sm border border-[#E5E0D8]">
                  {activeBook.cover_url && (
                    <img
                      src={activeBook.cover_url}
                      alt={activeBook.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <h2 className="text-lg font-bold text-[#2C221E] leading-tight">
                    {activeBook.title}
                  </h2>
                  {activeBook.subtitle && (
                    <p className="text-xs font-medium text-[#7E6F64] italic">
                      {activeBook.subtitle}
                    </p>
                  )}
                  <p className="text-xs text-[#4A3E35]">
                    By <span className="font-semibold">{activeBook.authors.map((a) => a.name).join(', ')}</span>
                  </p>

                  <div className="pt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#7E6F64] border-t border-[#F0ECE4]">
                    <div>
                      Publisher:{' '}
                      <span className="font-medium text-[#2C221E]">
                        {activeBook.publisher?.name || 'N/A'}
                      </span>
                    </div>
                    <div>
                      Year:{' '}
                      <span className="font-medium text-[#2C221E] font-mono tabular-nums">
                        {activeBook.publication_year || 'N/A'}
                      </span>
                    </div>
                    <div>
                      Pages:{' '}
                      <span className="font-medium text-[#2C221E] font-mono tabular-nums">
                        {activeBook.page_count || 'N/A'}
                      </span>
                    </div>
                    <div>
                      Language:{' '}
                      <span className="font-medium text-[#2C221E] uppercase">
                        {activeBook.language || 'EN'}
                      </span>
                    </div>
                  </div>

                  {activeBook.description && (
                    <p className="pt-2 text-xs text-[#5A4D44] line-clamp-3 leading-relaxed">
                      {activeBook.description}
                    </p>
                  )}
                </div>
              </div>

              {/* Physical Inventory Copies Section */}
              <div className="border-t border-[#EAE5DE] pt-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-xs font-bold text-[#2C221E] uppercase tracking-wider">
                      Physical Inventory ({activeBook.copies?.length || 0} copies)
                    </h3>
                    <p className="text-[11px] text-[#7E6F64]">
                      Every physical book has a unique internal inventory code and shelf location
                    </p>
                  </div>

                  {userRole !== 'Member' && (
                    <button
                      onClick={() => setShowAddCopyModal(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#F0ECE4] hover:bg-[#E5E0D8] text-[#2C221E] text-xs font-semibold rounded-md transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Copy</span>
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {activeBook.copies?.map((copy) => (
                    <div
                      key={copy.id}
                      className="flex items-center justify-between p-2.5 rounded-lg border border-[#EAE5DE] bg-[#FAF8F5] text-xs"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-[#EA580C] bg-[#FFEDD5] px-2 py-0.5 rounded">
                          {copy.inventory_code}
                        </span>
                        <div>
                          <div className="flex items-center gap-1.5 text-[#2C221E] font-medium">
                            <MapPin className="w-3 h-3 text-[#A89F91]" />
                            <span>
                              {copy.shelf_location} · {copy.rack_number}
                            </span>
                          </div>
                          <span className="text-[10px] text-[#7E6F64]">
                            Condition: {copy.condition} · Acquired: {copy.acquisition_date}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                            copy.status === 'Available'
                              ? 'bg-emerald-100 text-emerald-800'
                              : copy.status === 'Borrowed'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {copy.status}
                        </span>

                        {copy.status === 'Available' && userRole !== 'Member' && (
                          <button
                            onClick={() => {
                              setActiveBook(null);
                              onNavigateToBorrow(copy.id);
                            }}
                            className="px-2.5 py-1 bg-[#EA580C] hover:bg-[#C2410C] text-white text-[11px] font-semibold rounded transition-colors"
                          >
                            Check Out
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Form to Add Physical Copy */}
              {showAddCopyModal && (
                <form
                  onSubmit={handleAddCopySubmit}
                  className="bg-[#FAF8F5] border border-[#EA580C]/40 rounded-xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[#2C221E]">Add Physical Copy</h4>
                    <button
                      type="button"
                      onClick={() => setShowAddCopyModal(false)}
                      className="text-[#7E6F64] hover:text-[#2C221E]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                        Shelf Location
                      </label>
                      <input
                        type="text"
                        value={newCopyShelf}
                        onChange={(e) => setNewCopyShelf(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-[#E5E0D8] rounded-md text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                        Rack Number
                      </label>
                      <input
                        type="text"
                        value={newCopyRack}
                        onChange={(e) => setNewCopyRack(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-[#E5E0D8] rounded-md text-xs"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                        Condition
                      </label>
                      <select
                        value={newCopyCondition}
                        onChange={(e) => setNewCopyCondition(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-[#E5E0D8] rounded-md text-xs"
                      >
                        <option>Good</option>
                        <option>Like New</option>
                        <option>Fair</option>
                        <option>Worn</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                        Acquisition Price ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={newCopyPrice}
                        onChange={(e) => setNewCopyPrice(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-[#E5E0D8] rounded-md text-xs"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowAddCopyModal(false)}
                      className="px-3 py-1.5 text-xs text-[#7E6F64] hover:text-[#2C221E]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold rounded-md shadow-2xs"
                    >
                      Save Copy
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-[#EAE5DE] bg-[#FAF8F5] flex items-center justify-between">
              {userRole === 'Administrator' ? (
                <button
                  onClick={() => handleDeleteBook(activeBook.id)}
                  className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-800 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Record</span>
                </button>
              ) : (
                <div />
              )}

              <button
                onClick={() => setActiveBook(null)}
                className="px-4 py-2 bg-white border border-[#D4CDC3] text-xs font-semibold rounded-lg text-[#2C221E] hover:bg-[#F5F2EB]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
