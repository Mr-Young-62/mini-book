import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  ArrowRight,
  QrCode,
  Search,
  Clock3,
  BookMarked,
  Library,
  ChevronRight,
  SlidersHorizontal,
  Cpu,
  Palette,
  Briefcase,
  Sparkles,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { ActivityLog, Book, UserRole } from '../types/library';
import { formatIsbn } from '../services/isbnValidator';
import { formatAddedAt } from '../lib/datetime';

interface DashboardPageProps {
  userRole: UserRole;
  onNavigate: (tab: string) => void;
}

const getCategoryIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes('tech') || lower.includes('comp') || lower.includes('code')) return Cpu;
  if (lower.includes('design') || lower.includes('art')) return Palette;
  if (lower.includes('busi') || lower.includes('econ') || lower.includes('money')) return Briefcase;
  if (lower.includes('fic') || lower.includes('novel') || lower.includes('lit')) return BookOpen;
  return Sparkles;
};

const normalizeCoverUrl = (url?: string): string | undefined => {
  if (!url) return undefined;
  const value = String(url).trim();
  if (!value) return undefined;
  if (value.startsWith('//')) return `https:${value}`;
  return value.replace(/^http:\/\//i, 'https://');
};

const BookCover: React.FC<{
  coverUrl?: string;
  title: string;
  author?: string;
  className?: string;
}> = ({ coverUrl, title, author, className = '' }) => {
  const [src, setSrc] = useState<string | undefined>(normalizeCoverUrl(coverUrl));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(normalizeCoverUrl(coverUrl));
    setFailed(false);
  }, [coverUrl]);

  if (!src || failed) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-[#EFECE4] via-[#F9F8F5] to-[#DDD7C5] p-3 text-[#14181F] ${className}`}
      >
        <div className="flex max-w-[85%] flex-col items-center justify-center text-center">
          <BookOpen className="mb-2 h-6 w-6 text-[#6E737D]" />
          <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#6E737D]">Book</div>
          <div className="mt-1 line-clamp-3 text-[11px] font-bold leading-tight text-[#14181F]">
            {title || 'No cover'}
          </div>
          {author && <div className="mt-1 line-clamp-1 text-[9px] text-[#6E737D]">{author}</div>}
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
      className={`h-full w-full object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  );
};

export const DashboardPage: React.FC<DashboardPageProps> = ({
  userRole,
  onNavigate,
}) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryName, setLibraryName] = useState('MeelieFont Library');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const [libraryBooks, recentLogs] = await Promise.all([
          LibraryService.getAllBooks(),
          LibraryService.getLogs(),
        ]);
        setBooks(libraryBooks);
        setLogs(recentLogs);
        const settings = LibraryService.getSettings();
        setLibraryName(settings.library_info?.name || 'MeelieFont Library');
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, [userRole]);

  const categories = useMemo(() => {
    const counts = new Map<string, { name: string; count: number; coverUrl?: string }>();
    books.forEach((book) => {
      const catName = book.categories[0]?.name || 'General';
      const existing = counts.get(catName);
      if (existing) {
        existing.count += 1;
        if (!existing.coverUrl && book.cover_url) existing.coverUrl = book.cover_url;
      } else {
        counts.set(catName, { name: catName, count: 1, coverUrl: book.cover_url });
      }
    });
    return Array.from(counts.values()).slice(0, 4);
  }, [books]);

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...books]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .filter((book) => {
        const matchesCat =
          selectedCategory === 'all' ||
          book.categories.some((c) => c.name.toLowerCase() === selectedCategory.toLowerCase());
        if (!matchesCat) return false;
        if (!q) return true;
        return (
          book.title.toLowerCase().includes(q) ||
          book.isbn_13.includes(q) ||
          book.authors.some((a) => a.name.toLowerCase().includes(q))
        );
      });
  }, [books, searchQuery, selectedCategory]);

  const featuredBooks = useMemo(() => filteredBooks.slice(0, 4), [filteredBooks]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() && selectedCategory === 'all') {
      onNavigate('books');
    }
  };

  return (
    <div className="space-y-8 pb-6">
      {/* ── Warm Sand Hero & Overlapping Book Showcase (Dribbble Style) ── */}
      <div className="relative">
        {/* Sand backdrop */}
        <div className="rounded-[24px] md:rounded-bl-[44px] md:rounded-br-[24px] md:rounded-tl-[24px] md:rounded-tr-[24px] bg-[#E4DFCE] px-5 pt-6 pb-24 sm:px-8 sm:pt-8 sm:pb-28">
          <div className="flex flex-col gap-5">
            {/* Title Row */}
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#6E737D]">
                  {libraryName}
                </p>
                <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-[#14181F] sm:text-3xl">
                  Discover
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-xs font-semibold text-[#14181F] shadow-2xs">
                  <Library className="h-3.5 w-3.5 text-[#18362F]" />
                  <span className="font-mono tabular-nums">{books.length}</span> titles cataloged
                </span>
              </div>
            </div>

            {/* Pill Search Bar */}
            <form
              onSubmit={handleSearchSubmit}
              className="flex flex-col gap-2 rounded-2xl bg-white p-2 shadow-[0_12px_28px_-8px_rgba(20,24,31,0.1)] sm:max-w-2xl sm:flex-row sm:items-center sm:gap-0 sm:rounded-full sm:p-1.5"
            >
              <div className="relative flex items-center sm:border-r sm:border-[#ECEEF2] sm:pr-2">
                <select
                  aria-label="Filter by category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full appearance-none bg-transparent py-2 pl-3 pr-7 text-xs font-semibold text-[#14181F] outline-none sm:w-auto"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat.name} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex flex-1 items-center">
                <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[#9CA3AF]" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Find the book you like..."
                  className="w-full bg-transparent py-2 pl-9 pr-3 text-xs text-[#14181F] placeholder-[#9CA3AF] outline-none"
                />
              </div>

              <button
                type="submit"
                className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-[#18362F] px-5 py-2 text-xs font-bold text-white shadow-[0_6px_14px_-4px_rgba(24,54,47,0.35)] transition hover:bg-[#112822] hover:shadow-[0_8px_18px_-4px_rgba(24,54,47,0.45)] active:scale-95 sm:rounded-full"
              >
                Search
              </button>
            </form>

            <div className="mt-2 flex items-center justify-between">
              <h2 className="text-base font-bold tracking-tight text-[#14181F] sm:text-lg">
                {searchQuery || selectedCategory !== 'all' ? 'Search Results' : 'Recently Added'}
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('books')}
                className="inline-flex items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-[#18362F] shadow-xs transition hover:bg-[#18362F] hover:text-white active:scale-95"
              >
                <span>View all</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Overlapping Book Covers */}
        <div className="-mt-20 px-4 sm:px-8">
          {loading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-[#ECEEF2]" />
              ))}
            </div>
          ) : featuredBooks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D5D8DF] bg-white p-8 text-center shadow-sm">
              <BookOpen className="mx-auto mb-2 h-8 w-8 text-[#9CA3AF]" />
              <p className="text-sm font-bold text-[#14181F]">No matching books found</p>
              <p className="mt-1 text-xs text-[#6E737D]">
                Scan an ISBN or adjust your search filter to populate your library.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('scanner')}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#18362F] px-4 py-2 text-xs font-bold text-white hover:bg-[#112822]"
              >
                <QrCode className="h-4 w-4" />
                <span>Scan ISBN</span>
              </button>
            </div>
          ) : (
            <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4 sm:grid sm:grid-cols-4 sm:gap-5 sm:overflow-visible sm:pb-0">
              {featuredBooks.map((book) => (
                <article
                  key={book.id}
                  onClick={() => onNavigate('books')}
                  className="group w-[150px] shrink-0 snap-start cursor-pointer sm:w-auto"
                >
                  <div className="relative aspect-[2/3] overflow-hidden rounded-2xl border border-black/5 bg-[#F5F6F8] shadow-[0_14px_24px_-6px_rgba(20,24,31,0.22)] transition duration-200 group-hover:-translate-y-1.5">
                    <BookCover
                      coverUrl={book.cover_url}
                      title={book.title}
                      author={book.authors?.[0]?.name}
                    />
                  </div>
                  <div className="mt-2.5 px-0.5">
                    <h3 className="line-clamp-1 text-xs font-bold text-[#14181F] group-hover:text-[#18362F] sm:text-sm">
                      {book.title}
                    </h3>
                    <p className="line-clamp-1 text-[11px] text-[#6E737D]">
                      {book.authors?.map((a) => a.name).join(', ') || 'Unknown Author'}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Book Category Section (Dribbble Card Backplates) ── */}
      <section className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight text-[#14181F] sm:text-lg">
            Book Category
          </h2>
          <button
            type="button"
            onClick={() => onNavigate('books')}
            aria-label="Browse all categories"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white text-[#6E737D] transition hover:bg-[#F5F6F8] hover:text-[#14181F]"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        </div>

        <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-3 sm:grid sm:grid-cols-4 sm:gap-5 sm:overflow-visible sm:pb-0">
          {(categories.length > 0
            ? categories
            : [
                { name: 'Fiction', count: 0, coverUrl: undefined },
                { name: 'Technology', count: 0, coverUrl: undefined },
                { name: 'Design', count: 0, coverUrl: undefined },
                { name: 'Business', count: 0, coverUrl: undefined },
              ]
          ).map((cat) => {
            const CatIcon = getCategoryIcon(cat.name);
            return (
              <button
                key={cat.name}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.name);
                  onNavigate('books');
                }}
                className="group flex w-[144px] shrink-0 snap-start flex-col items-center text-center sm:w-auto"
              >
                <div className="relative flex h-24 w-full items-end justify-center rounded-2xl bg-[#F5F6F8] pb-3 pt-4 transition group-hover:bg-[#ECEEF2]">
                  {cat.coverUrl ? (
                    <div className="-mt-6 h-20 w-14 overflow-hidden rounded-lg border border-black/5 bg-white shadow-[0_8px_16px_-4px_rgba(20,24,31,0.18)] transition group-hover:-translate-y-1">
                      <BookCover coverUrl={cat.coverUrl} title={cat.name} />
                    </div>
                  ) : (
                    <div className="-mt-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[#ECEEF2] bg-white text-[#18362F] shadow-[0_8px_18px_-4px_rgba(20,24,31,0.12)] transition group-hover:-translate-y-1 group-hover:text-[#F06449]">
                      <CatIcon className="h-6 w-6" />
                    </div>
                  )}
                </div>
                <span className="mt-3 line-clamp-1 text-xs font-bold text-[#14181F] sm:text-sm">
                  {cat.name}
                </span>
                <span className="mt-0.5 text-[11px] font-mono tabular-nums text-[#6E737D]">
                  {cat.count} {cat.count === 1 ? 'title' : 'titles'}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Lower Grid: Recent Activities & Quick Actions ── */}
      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        {/* Quick Catalog List */}
        <section className="rounded-2xl border border-[#ECEEF2] bg-white p-5 shadow-2xs">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-bold tracking-tight text-[#14181F]">Quick Actions</h2>
            <button
              type="button"
              onClick={() => onNavigate('books')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#18362F] hover:underline"
            >
              <span>Open catalog</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Scan ISBN / Barcode', desc: 'Use camera or manual code', icon: QrCode, onClick: () => onNavigate('scanner') },
              { label: 'Add Book Manually', desc: 'Enter bibliographic details', icon: BookMarked, onClick: () => onNavigate('scanner') },
              { label: 'Browse Book Shelf', desc: 'Shelf, grid & table views', icon: Library, onClick: () => onNavigate('books') },
            ].map(({ label, desc, icon: Icon, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={onClick}
                className="flex items-start gap-3 rounded-xl border border-[#ECEEF2] bg-[#FAFBFD] p-3.5 text-left transition hover:border-[#18362F]/30 hover:bg-[#F5F6F8]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EEF5F1] text-[#18362F]">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#14181F]">{label}</div>
                  <div className="mt-0.5 text-[11px] text-[#6E737D]">{desc}</div>
                </div>
              </button>
            ))}
          </div>

          {recentlyAddedSummary(books) > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#ECEEF2] pt-3 text-[11px] text-[#6E737D]">
              <span>Latest entry:</span>
              <span className="font-semibold text-[#14181F]">{books[0]?.title}</span>
              <span className="font-mono">({formatIsbn(books[0]?.isbn_13 || '')})</span>
              <span>· {formatAddedAt(books[0]?.created_at)}</span>
            </div>
          )}
        </section>

        {/* Recent Activities */}
        <section className="rounded-2xl border border-[#ECEEF2] bg-white p-5 shadow-2xs">
          <div className="mb-4 flex items-center gap-2 text-[#14181F]">
            <Clock3 className="h-4 w-4 text-[#18362F]" />
            <h2 className="text-base font-bold tracking-tight">Recent Activities</h2>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-xl bg-[#F5F6F8] p-4 text-xs text-[#6E737D]">
              No recent library activity yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {logs.slice(0, 4).map((log) => (
                <div key={log.id} className="rounded-xl border border-[#ECEEF2] bg-[#FAFBFD] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#18362F]">
                      {log.action}
                    </span>
                    <span className="text-[10px] text-[#9CA3AF]">
                      {new Date(log.created_at).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#374151]">{log.description}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

function recentlyAddedSummary(books: Book[]): number {
  return books.length;
}
