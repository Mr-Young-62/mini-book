import React, { useEffect, useState } from 'react';
import {
  Download,
  Printer,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { BookCopy } from '../types/library';
import { downloadCsv } from '../lib/csv';

export const ReportsPage: React.FC = () => {
  const currency = LibraryService.getSettings().library_info.currency || 'IDR';
  const [copies, setCopies] = useState<BookCopy[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReportsData();
  }, []);

  const loadReportsData = async () => {
    setLoading(true);
    try {
      const [c, members] = await Promise.all([
        LibraryService.getCopies(),
        LibraryService.countMembers(),
      ]);
      setCopies(c);
      setMemberCount(members);
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

  const totalValuation = copies.reduce((sum, copy) => sum + (copy.acquisition_price || 0), 0);
  const maintenanceCount = copies.filter((copy) => copy.status === 'Maintenance' || copy.status === 'Damaged').length;

  const handleExportValuationCsv = () => {
    const headers = ['Category', 'Physical Copies Count', `Total Acquired Value (${currency})`];
    const rows = Object.entries(categoryValuationMap).map(([cat, data]) => [
      cat,
      data.count,
      data.totalCost.toFixed(2),
    ]);
    downloadCsv('meeliefont_valuation_report', headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE5DE] pb-4">
        <div>
          <p className="text-xs text-[#7E6F64]">
            Collection valuation, inventory status, and exportable catalog summaries.
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
          <span className="text-[11px] text-[#7E6F64] block mb-1">Total Valuation</span>
          <div className="text-xl font-bold font-mono text-[#2C221E] tabular-nums">
            {currency} {totalValuation.toFixed(2)}
          </div>
          <span className="text-[10px] text-[#A89F91]">{loading ? 'Loading...' : `${copies.length} cataloged assets`}</span>
        </div>

        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
          <span className="text-[11px] text-[#7E6F64] block mb-1">Copies Needing Attention</span>
          <div className="text-xl font-bold font-mono text-[#2C221E] tabular-nums">{maintenanceCount}</div>
          <span className="text-[10px] text-[#A89F91]">Maintenance or damaged</span>
        </div>

        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
          <span className="text-[11px] text-[#7E6F64] block mb-1">Registered Members</span>
          <div className="text-xl font-bold font-mono text-[#2C221E] tabular-nums">{memberCount}</div>
          <span className="text-[10px] text-[#A89F91]">Library membership records</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Category Valuation Breakdown */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
            <div>
              <h3 className="text-sm font-bold text-[#2C221E]">Collection Valuation by Subject</h3>
              <p className="text-xs text-[#7E6F64]">Capital asset breakdown</p>
            </div>
            <button
              onClick={handleExportValuationCsv}
              className="text-xs text-[#c62828] hover:text-[#a61f1f] font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>

          <div className="space-y-3">
            {Object.entries(categoryValuationMap).map(([category, data]) => {
              const totalVal = totalValuation || 1;
              const percent = Math.round((data.totalCost / totalVal) * 100);
              return (
                <div key={category} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#2C221E]">{category}</span>
                    <span className="font-mono text-[#5A4D44] tabular-nums">
                      {currency} {data.totalCost.toFixed(2)} ({data.count} copies)
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-[#FAF8F5] overflow-hidden border border-[#E8E2D9]">
                    <div
                      style={{ width: `${percent}%` }}
                      className="h-full bg-[#c62828] rounded-full"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
};
