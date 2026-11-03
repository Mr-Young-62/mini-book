import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Layers,
  CheckCircle2,
  Clock,
  Users,
  AlertTriangle,
  ArrowRight,
  QrCode,
  ArrowUpRight,
  DollarSign,
  TrendingUp,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { Book, ActivityLog, UserRole } from '../types/library';

interface DashboardPageProps {
  userRole: UserRole;
  onNavigate: (tab: string) => void;
  onScanClick: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  userRole,
  onNavigate,
  onScanClick,
}) => {
  const [metrics, setMetrics] = useState<any>(null);
  const [recentBooks, setRecentBooks] = useState<Book[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [m, b, l] = await Promise.all([
        LibraryService.getDashboardMetrics(),
        LibraryService.getBooks(),
        LibraryService.getLogs(),
      ]);
      setMetrics(m);
      setRecentBooks(b.slice(0, 4));
      setActivities(l.slice(0, 5));
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !metrics) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-28 bg-[#F0ECE4] rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-[#F0ECE4] rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Circulation activity monthly chart mock data points
  const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'];
  const loanStats = [14, 22, 19, 31, 28, 42, 35];
  const maxStat = Math.max(...loanStats);

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#2C221E] via-[#3E322B] to-[#4A3B34] text-white p-6 sm:p-8 shadow-sm">
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#FDBA74] mb-2">
            <span>Library Circulation Hub</span>
            <span>·</span>
            <span>Active Session</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2 font-sans">
            Welcome to Readowl Library
          </h1>
          <p className="text-sm text-[#D7CEC7] leading-relaxed mb-6">
            Intelligent book inventory, instant ISBN scanning via Open Library & Google Books, and real-time circulation tracking.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            {userRole !== 'Member' && (
              <>
                <button
                  onClick={onScanClick}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold rounded-lg shadow-sm transition-all"
                >
                  <QrCode className="w-4 h-4" />
                  <span>Scan ISBN Barcode</span>
                </button>
                <button
                  onClick={() => onNavigate('circulation')}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg backdrop-blur-xs transition-colors"
                >
                  <span>Borrow & Return</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            <button
              onClick={() => onNavigate('books')}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-lg backdrop-blur-xs transition-colors"
            >
              <span>Explore Bookshelf</span>
            </button>
          </div>
        </div>

        {/* Decorative subtle background icon */}
        <BookOpen className="absolute -right-8 -bottom-8 w-64 h-64 text-white/5 pointer-events-none" />
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Titles */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[#7E6F64] mb-2">
            <span className="text-xs font-medium">Catalog Titles</span>
            <BookOpen className="w-4 h-4 text-[#EA580C]" />
          </div>
          <div className="text-2xl font-bold text-[#2C221E] font-mono tabular-nums">
            {metrics.totalBooks}
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[#7E6F64]">
            <span className="font-semibold text-[#2C221E] font-mono tabular-nums">{metrics.totalCopies}</span>
            <span>physical copies</span>
          </div>
        </div>

        {/* Available Copies */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[#7E6F64] mb-2">
            <span className="text-xs font-medium">Available Copies</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-[#2C221E] font-mono tabular-nums">
            {metrics.availableCopies}
          </div>
          <div className="mt-1 text-[11px] text-emerald-700 font-medium">
            {Math.round((metrics.availableCopies / (metrics.totalCopies || 1)) * 100)}% on shelves
          </div>
        </div>

        {/* Active & Overdue Borrowed */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[#7E6F64] mb-2">
            <span className="text-xs font-medium">Active Loans</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-[#2C221E] font-mono tabular-nums">
            {metrics.borrowedCopies}
          </div>
          <div className="mt-1 flex items-center gap-1 text-[11px]">
            {metrics.overdueLoansCount > 0 ? (
              <span className="text-rose-600 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {metrics.overdueLoansCount} overdue
              </span>
            ) : (
              <span className="text-slate-500">Zero overdue loans</span>
            )}
          </div>
        </div>

        {/* Total Members */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-[#7E6F64] mb-2">
            <span className="text-xs font-medium">Registered Members</span>
            <Users className="w-4 h-4 text-[#A16207]" />
          </div>
          <div className="text-2xl font-bold text-[#2C221E] font-mono tabular-nums">
            {metrics.totalMembers}
          </div>
          <div className="mt-1 text-[11px] text-[#7E6F64] font-mono tabular-nums">
            Valuation: ${metrics.totalValuation.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Analytics & Activity Split Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Circulation Monthly Chart (2 cols) */}
        <div className="lg:col-span-2 bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-[#2C221E]">Circulation Volume</h3>
              <p className="text-xs text-[#7E6F64]">Monthly book checkout transactions</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>+18.4% this quarter</span>
            </div>
          </div>

          {/* Clean minimal SVG Bar Chart */}
          <div className="h-44 flex items-end justify-between gap-3 pt-4 px-2 border-b border-[#F0ECE4]">
            {months.map((m, idx) => {
              const val = loanStats[idx];
              const heightPercent = Math.round((val / maxStat) * 100);
              const isCurrent = idx === months.length - 1;
              return (
                <div key={m} className="flex-1 flex flex-col items-center gap-2 h-full justify-end group">
                  <span className="text-[10px] font-mono text-[#7E6F64] opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                    {val}
                  </span>
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full max-w-[36px] rounded-t-md transition-all ${
                      isCurrent
                        ? 'bg-[#EA580C] shadow-xs'
                        : 'bg-[#EADECE] group-hover:bg-[#D5C6B5]'
                    }`}
                  />
                  <span className="text-[11px] font-medium text-[#7E6F64] group-hover:text-[#2C221E]">
                    {m}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-[#7E6F64]">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#EA580C]" /> Current Month
              <span className="w-2.5 h-2.5 rounded-xs bg-[#EADECE] ml-2" /> Previous Months
            </span>
            <button
              onClick={() => onNavigate('reports')}
              className="text-[#EA580C] hover:text-[#C2410C] font-semibold flex items-center gap-1"
            >
              <span>Detailed Report</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Recent Activity Timeline (1 col) */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#2C221E]">Recent Activity</h3>
              <span className="text-xs text-[#7E6F64]">Audit Stream</span>
            </div>

            {activities.length === 0 ? (
              <div className="py-6 text-center text-xs text-[#A89F91]">
                No recent activity recorded yet.
              </div>
            ) : (
              <div className="space-y-3.5">
                {activities.map((log) => {
                  const timeAgo = new Date(log.created_at).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  });
                  return (
                    <div key={log.id} className="flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 rounded-full bg-[#EA580C] mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[#2C221E] font-medium leading-snug line-clamp-2">
                          {log.description}
                        </p>
                        <span className="text-[11px] text-[#A89F91] font-mono">{timeAgo}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button
            onClick={() => onNavigate('inventory')}
            className="mt-4 pt-3 border-t border-[#F0ECE4] text-xs font-semibold text-[#5A4D44] hover:text-[#EA580C] flex items-center justify-between"
          >
            <span>View inventory records</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Recently Cataloged Books Showcase */}
      <div className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-bold text-[#2C221E]">Recently Cataloged Books</h3>
            <p className="text-xs text-[#7E6F64]">Latest additions to the digital library</p>
          </div>
          {recentBooks.length > 0 && (
            <button
              onClick={() => onNavigate('books')}
              className="text-xs font-semibold text-[#EA580C] hover:text-[#C2410C] flex items-center gap-1"
            >
              <span>View All ({metrics.totalBooks})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {recentBooks.length === 0 ? (
          <div className="text-center py-8 bg-[#FAF8F5] border border-dashed border-[#E5E0D8] rounded-lg p-6">
            <BookOpen className="w-8 h-8 mx-auto text-[#A89F91] mb-2" />
            <h4 className="text-xs font-bold text-[#2C221E] mb-1">No books cataloged yet</h4>
            <p className="text-[11px] text-[#7E6F64] max-w-xs mx-auto mb-3">
              Scan a book ISBN barcode or add your first book to begin building your library collection.
            </p>
            <button
              onClick={onScanClick}
              className="px-3.5 py-1.5 bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold rounded-lg shadow-2xs"
            >
              Scan First Book
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {recentBooks.map((book) => (
              <div
                key={book.id}
                onClick={() => onNavigate('books')}
                className="group cursor-pointer border border-[#EAE5DE] rounded-lg p-3 hover:border-[#EA580C]/40 hover:shadow-xs transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="aspect-2/3 rounded overflow-hidden bg-[#F2EDE4] mb-2.5 relative shadow-2xs">
                    {book.cover_url ? (
                      <img
                        src={book.cover_url}
                        alt={book.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-103 transition-transform duration-300"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : null}
                    <div className="absolute inset-0 flex flex-col justify-end p-2 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none">
                      <span className="text-[10px] text-white/90 font-mono tabular-nums">
                        {book.copies?.filter((c) => c.status === 'Available').length || 0} avail
                      </span>
                    </div>
                  </div>

                  <h4 className="text-xs font-bold text-[#2C221E] group-hover:text-[#EA580C] line-clamp-1 transition-colors">
                    {book.title}
                  </h4>
                  <p className="text-[11px] text-[#7E6F64] line-clamp-1">
                    {book.authors.map((a) => a.name).join(', ')}
                  </p>
                </div>

                <div className="mt-2 pt-2 border-t border-[#F0ECE4] text-[10px] text-[#A89F91] font-mono flex items-center justify-between">
                  <span>{book.publication_year || 'N/A'}</span>
                  <span>{book.categories[0]?.name || 'General'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
