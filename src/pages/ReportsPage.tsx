import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Download,
  Printer,
  FileSpreadsheet,
  FileText,
  DollarSign,
  Clock,
  Layers,
  BookOpen,
  Users,
  CheckCircle2,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { Book, BookCopy, Member, BorrowTransaction, UserRole } from '../types/library';

interface ReportsPageProps {
  userRole: UserRole;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ userRole }) => {
  const [metrics, setMetrics] = useState<any>(null);
  const [books, setBooks] = useState<Book[]>([]);
  const [copies, setCopies] = useState<BookCopy[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loans, setLoans] = useState<BorrowTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReportsData();
  }, []);

  const loadReportsData = async () => {
    setLoading(true);
    try {
      const [m, b, c, mem, l] = await Promise.all([
        LibraryService.getDashboardMetrics(),
        LibraryService.getBooks(),
        LibraryService.getCopies(),
        LibraryService.getMembers(),
        LibraryService.getLoans(),
      ]);
      setMetrics(m);
      setBooks(b);
      setCopies(c);
      setMembers(mem);
      setLoans(l);
    } catch (err) {
      console.error('Error loading reports data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Group copies by category for valuation
  const categoryValuationMap: Record<string, { count: number; totalCost: number }> = {};
  copies.forEach((copy) => {
    const cat = copy.book?.categories[0]?.name || 'General Collection';
    if (!categoryValuationMap[cat]) {
      categoryValuationMap[cat] = { count: 0, totalCost: 0 };
    }
    categoryValuationMap[cat].count += 1;
    categoryValuationMap[cat].totalCost += copy.acquisition_price || 0;
  });

  const overdueLoans = loans.filter((l) => l.status === 'Overdue');

  const exportCsv = (filename: string, headers: string[], rows: (string | number)[][]) => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.map((c) => `"${c}"`).join(','))].join('\n');
    const encoded = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encoded);
    link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportOverdueCsv = () => {
    const headers = ['Transaction Code', 'Member Name', 'Member Code', 'Due Date', 'Late Fee ($)'];
    const rows = overdueLoans.map((l) => [
      l.transaction_code,
      l.member?.full_name || 'N/A',
      l.member?.member_code || 'N/A',
      l.due_date,
      l.items.reduce((sum, i) => sum + (i.late_fee || 0), 0).toFixed(2),
    ]);
    exportCsv('readowl_overdue_report', headers, rows);
  };

  const handleExportValuationCsv = () => {
    const headers = ['Category', 'Physical Copies Count', 'Total Acquired Value ($)'];
    const rows = Object.entries(categoryValuationMap).map(([cat, data]) => [
      cat,
      data.count,
      data.totalCost.toFixed(2),
    ]);
    exportCsv('readowl_valuation_report', headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE5DE] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2C221E] font-sans">
            Reports & Analytics
          </h1>
          <p className="text-xs text-[#7E6F64]">
            Circulation auditing, overdue debt analysis, collection valuation, and exportable ledger files.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#D4CDC3] hover:bg-[#F5F2EB] text-[#2C221E] text-xs font-semibold rounded-lg transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
          <span className="text-[11px] text-[#7E6F64] block mb-1">Total Valuation</span>
          <div className="text-xl font-bold font-mono text-[#2C221E] tabular-nums">
            ${metrics?.totalValuation?.toFixed(2) || '0.00'}
          </div>
          <span className="text-[10px] text-[#A89F91]">{copies.length} cataloged assets</span>
        </div>

        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
          <span className="text-[11px] text-[#7E6F64] block mb-1">Circulation Rate</span>
          <div className="text-xl font-bold font-mono text-[#2C221E] tabular-nums">
            {metrics ? Math.round((metrics.borrowedCopies / (metrics.totalCopies || 1)) * 100) : 0}%
          </div>
          <span className="text-[10px] text-emerald-700 font-medium">Currently on loan</span>
        </div>

        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
          <span className="text-[11px] text-[#7E6F64] block mb-1">Overdue Accounts</span>
          <div className="text-xl font-bold font-mono text-rose-700 tabular-nums">
            {overdueLoans.length}
          </div>
          <span className="text-[10px] text-rose-600 font-medium">Requires follow-up</span>
        </div>

        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
          <span className="text-[11px] text-[#7E6F64] block mb-1">Active Patron Base</span>
          <div className="text-xl font-bold font-mono text-[#2C221E] tabular-nums">
            {members.length}
          </div>
          <span className="text-[10px] text-[#A89F91]">Registered borrowers</span>
        </div>
      </div>

      {/* Two Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Valuation Breakdown */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
            <div>
              <h3 className="text-sm font-bold text-[#2C221E]">Collection Valuation by Subject</h3>
              <p className="text-xs text-[#7E6F64]">Capital asset breakdown</p>
            </div>
            <button
              onClick={handleExportValuationCsv}
              className="text-xs text-[#EA580C] hover:text-[#C2410C] font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>

          <div className="space-y-3">
            {Object.entries(categoryValuationMap).map(([category, data]) => {
              const totalVal = metrics?.totalValuation || 1;
              const percent = Math.round((data.totalCost / totalVal) * 100);
              return (
                <div key={category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#2C221E]">{category}</span>
                    <span className="font-mono text-[#5A4D44] tabular-nums">
                      ${data.totalCost.toFixed(2)} ({data.count} copies)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#FAF8F5] overflow-hidden border border-[#E8E2D9]">
                    <div
                      style={{ width: `${percent}%` }}
                      className="h-full bg-[#EA580C] rounded-full"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Overdue Accounts & Late Fees Ledger */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
            <div>
              <h3 className="text-sm font-bold text-[#2C221E]">Overdue Accounts Ledger</h3>
              <p className="text-xs text-[#7E6F64]">Transactions past due date</p>
            </div>
            <button
              onClick={handleExportOverdueCsv}
              className="text-xs text-[#EA580C] hover:text-[#C2410C] font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>

          <div className="space-y-2.5">
            {overdueLoans.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#7E6F64]">
                No loans currently past due date.
              </div>
            ) : (
              overdueLoans.map((loan) => (
                <div
                  key={loan.id}
                  className="p-3 rounded-lg border border-rose-200 bg-rose-50/40 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-[#2C221E]">{loan.member?.full_name}</div>
                    <div className="text-[11px] text-[#7E6F64] font-mono">
                      Code: {loan.transaction_code} · Due: {loan.due_date}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-rose-700">
                      ${loan.items.reduce((s, i) => s + (i.late_fee || 0), 0).toFixed(2)}
                    </span>
                    <span className="block text-[10px] text-rose-600">Late Fee</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
