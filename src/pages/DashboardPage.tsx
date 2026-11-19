import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ArrowRight, QrCode, Plus, Sparkles, Search, Clock3, BookMarked, Library } from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { ActivityLog, Book, UserRole } from '../types/library';
import { formatIsbn } from '../services/isbnValidator';
import { formatAddedAt } from '../lib/datetime';

interface DashboardPageProps {
  userRole: UserRole;
  onNavigate: (tab: string) => void;
}

interface ShelfBook {
  title: string;
  author: string;
  cover_url?: string;
  isbn_13?: string;
  id: string;
}

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
      <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-[#EAE5DE] via-[#F7F3EE] to-[#D8C9B4] text-[#4F3D32] ${className}`}>
        <div className="flex max-w-[80%] flex-col items-center justify-center text-center">
          <BookOpen className="mb-2 h-6 w-6 text-[#8C7E72]" />
          <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#8C7E72]">Cover</div>
          <div className="mt-1 line-clamp-3 text-[10px] font-semibold leading-tight">{title || 'No cover'}</div>
          {author && <div className="mt-1 text-[8px] text-[#7E6F64]">{author}</div>}
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
      className={`${className} h-full w-full ${fit === 'contain' ? 'object-contain' : 'object-cover'} ${failed ? 'hidden' : ''}`}
      onError={() => setFailed(true)}
    />
  );
};

const toShelfBook = (book: Book): ShelfBook => ({
  id: book.id,
  title: book.title,
  author: book.authors?.[0]?.name || 'Unknown Author',
  cover_url: book.cover_url,
  isbn_13: book.isbn_13,
});

const ShelfSection: React.FC<{ title: string; books: ShelfBook[]; actionLabel?: string; onAction?: () => void }> = ({
  title,
  books,
  actionLabel,
  onAction,
}) => (
  <section className="space-y-4">
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-bold tracking-tight text-[#4F3D32]">{title}</h2>
      {actionLabel && (
        <button
          onClick={onAction}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#7f1d1d] hover:text-[#B45309]"
        >
          <span>{actionLabel}</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>

    <div className="relative overflow-hidden rounded-[22px] border border-[#E7DDD0] bg-[#F7F1E7] px-4 pb-4 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
      <div className="flex gap-5 overflow-x-auto pb-3">
        {books.length === 0 ? (
          <div className="w-full rounded-xl border border-dashed border-[#DCCDB9] bg-[#FBF6F1] px-4 py-6 text-sm text-[#7E6F64]">
            No books in this shelf yet.
          </div>
        ) : (
          books.map((book) => (
            <article key={`${title}-${book.id}`} className="group relative shrink-0 cursor-pointer">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2E261F] px-2 py-1 text-[10px] text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 z-20">
                {book.title}
              </div>
              <div className="relative w-[116px] overflow-hidden rounded-[10px_10px_12px_8px] border border-[#DCCDB9] bg-[#3E322B] shadow-[0_12px_18px_rgba(66,46,30,0.18)]">
                  <div className="relative aspect-[2/3] overflow-hidden">
                    <BookCover coverUrl={book.cover_url} title={book.title} author={book.author} className="object-cover" />
                    <div className="absolute inset-y-0 left-0 w-[8px] bg-black/10" />
                  </div>
                <div className="bg-[#F5EBDD] px-2 py-2 text-center">
                  <div className="line-clamp-2 text-[11px] font-bold text-[#2C221E]">{book.title}</div>
                  <div className="mt-1 text-[9px] text-[#7E6F64]">{book.author}</div>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
      <div className="absolute inset-x-4 bottom-0 h-4 rounded-b-[18px] bg-gradient-to-b from-[#D1B393] via-[#C19D75] to-[#B0885C] shadow-[0_10px_16px_rgba(86,63,43,0.14)]" />
    </div>
  </section>
);

export const DashboardPage: React.FC<DashboardPageProps> = ({
  userRole,
  onNavigate,
}) => {
  const [books, setBooks] = useState<Book[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryName, setLibraryName] = useState('MeelieFont Library');

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const [libraryBooks, recentLogs] = await Promise.all([
          LibraryService.getBooks(),
          userRole === 'Member' ? Promise.resolve([]) : LibraryService.getLogs(),
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

  const metrics = useMemo(() => ({ totalBooks: books.length }), [books]);

  const recentlyAdded = useMemo(
    () => [...books]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 4),
    [books]
  );

  const shelfBooks = useMemo(() => {
    const safeBooks = [...books].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    return {
      currentlyReading: safeBooks.slice(0, 3).map(toShelfBook),
      nextUp: safeBooks.slice(3, 7).map(toShelfBook),
      finished: safeBooks.slice(7, 11).map(toShelfBook),
    };
  }, [books]);

  const stats = [
    { label: 'Total titles', value: String(metrics.totalBooks), detail: 'cataloged books' },
  ];

  return (
    <div className="space-y-6 pb-6">
      <div className="rounded-[28px] bg-gradient-to-r from-[#2C221E] via-[#3A2D27] to-[#53453C] p-5 text-white shadow-[0_18px_32px_rgba(63,45,35,0.18)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-xl">
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#dc4444]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#FCD7A4]">
              <Sparkles className="w-3 h-3" />
              MeelieFont Library
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Welcome back to {libraryName}.
            </h1>
            <p className="mt-2 text-sm text-[#E7DCCF]">
              Keep your collection organized and catalog new titles in seconds.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {userRole !== 'Member' && (
              <button
                onClick={() => onNavigate('scanner')}
                className="inline-flex items-center gap-2 rounded-xl bg-[#c62828] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#a61f1f]"
              >
                <QrCode className="w-4 h-4" />
                Scan ISBN
              </button>
            )}
            <button
              onClick={() => onNavigate('books')}
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-4 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
            >
              <BookOpen className="w-4 h-4" />
              Add Book Manual
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-[#E8E2D9] bg-white p-4 shadow-[0_8px_18px_rgba(80,60,40,0.04)]">
            <div className="text-[11px] font-medium text-[#7E6F64]">{stat.label}</div>
            <div className="mt-2 text-2xl font-black tracking-tight text-[#2C221E]">{stat.value}</div>
            <div className="mt-1 text-[11px] text-[#7E6F64]">{stat.detail}</div>
          </div>
        ))}
      </div>

      <div className="rounded-[22px] border border-[#E7DDD0] bg-white p-4 shadow-[0_10px_20px_rgba(80,60,40,0.04)]">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-[#4F3D32]">
            <Search className="w-4 h-4 text-[#7E6F64]" />
            <span className="text-sm font-semibold">Quick access</span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('books')}
            className="inline-flex items-center gap-2 rounded-lg border border-[#E5E0D8] bg-[#F9F6F2] px-3 py-2 text-[11px] font-semibold text-[#4A3E35] hover:border-[#D8C7B7]"
          >
            Browse all books
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {['All books', 'Fiction', 'History', 'Technology', 'Design'].map((tag) => (
            <button
              key={tag}
              type="button"
              className={`rounded-full px-2.5 py-1.5 text-[11px] font-medium transition ${
                tag === 'All books'
                  ? 'bg-[#c62828] text-white'
                  : 'bg-[#F5F1EB] text-[#5B4A40] hover:bg-[#EAE2D8]'
              }`}
              onClick={() => onNavigate('books')}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="rounded-[24px] border border-[#E8E2D9] bg-white p-4 shadow-[0_10px_20px_rgba(80,60,40,0.04)]">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-[#4F3D32]">Recently added</h2>
            <button type="button" onClick={() => onNavigate('books')} className="text-[11px] font-semibold text-[#7f1d1d] hover:text-[#B45309]">
              View all
            </button>
          </div>

          {loading ? (
            <div className="rounded-xl bg-[#FAF8F5] p-4 text-sm text-[#7E6F64]">Loading recent books...</div>
          ) : recentlyAdded.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#DCCDB9] bg-[#FAF8F5] p-6 text-center text-sm text-[#7E6F64]">
              No books added yet. Start scanning a title to populate the collection.
            </div>
          ) : (
            <div className="space-y-3">
              {recentlyAdded.map((book) => {
                return (
                  <div key={book.id} className="flex items-center gap-3 rounded-xl border border-[#E8E2D9] bg-[#FAF8F5] p-2.5">
                    <div className="h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-[#E5E0D8] bg-[#F0ECE4]">
                      <BookCover coverUrl={book.cover_url} title={book.title} author={book.authors?.[0]?.name} className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-bold text-[#2C221E]">{book.title}</h3>
                          <p className="truncate text-[11px] text-[#7E6F64]">{book.authors?.map((author) => author.name).join(', ') || 'Unknown Author'}</p>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[#7E6F64]">
                        <span className="font-mono">{formatIsbn(book.isbn_13)}</span>
                        <span>•</span>
                        <span>{formatAddedAt(book.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[24px] border border-[#E8E2D9] bg-white p-4 shadow-[0_10px_20px_rgba(80,60,40,0.04)]">
          <div className="mb-4 flex items-center gap-2 text-[#4F3D32]">
            <Clock3 className="h-4 w-4 text-[#7E6F64]" />
            <h2 className="text-lg font-bold tracking-tight">Recent activities</h2>
          </div>

          {logs.length === 0 ? (
            <div className="rounded-xl bg-[#FAF8F5] p-4 text-sm text-[#7E6F64]">No recent library activity yet.</div>
          ) : (
            <div className="space-y-3">
              {logs.slice(0, 5).map((log) => (
                <div key={log.id} className="rounded-xl border border-[#E8E2D9] bg-[#FAF8F5] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#7E6F64]">{log.action}</span>
                    <span className="text-[10px] text-[#A89F91]">{new Date(log.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#3E2F29]">{log.description}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="space-y-6">
        <ShelfSection title="My collection" books={shelfBooks.currentlyReading.concat(shelfBooks.nextUp)} actionLabel="Open catalog" onAction={() => onNavigate('books')} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Scan ISBN / Barcode', icon: QrCode, onClick: () => onNavigate('scanner') },
          { label: 'Add Book Manually', icon: BookMarked, onClick: () => onNavigate('scanner') },
          { label: 'Open Catalog', icon: Library, onClick: () => onNavigate('books') },
        ].map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="flex items-center gap-3 rounded-[20px] border border-[#E8E2D9] bg-white p-3 text-left shadow-[0_8px_18px_rgba(80,60,40,0.04)] transition hover:border-[#DCCDB9] hover:-translate-y-0.5"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F6EDE4] text-[#7f1d1d]">
              <Icon className="h-4 w-4" />
            </div>
            <div className="text-sm font-semibold text-[#2C221E]">{label}</div>
          </button>
        ))}
      </div>
    </div>
  );
};
