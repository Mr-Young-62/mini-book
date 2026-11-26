import React, { useEffect, useState } from 'react';
import {
  Download,
  Printer,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { Book } from '../types/library';
import { downloadCsv } from '../lib/csv';

export const ReportsPage: React.FC = () => {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReportsData();
  }, []);

  const loadReportsData = async () => {
    setLoading(true);
    try {
      setBooks(await LibraryService.getAllBooks());
    } catch (err) {
      console.error('Error loading reports data:', err);
    } finally {
      setLoading(false);
    }
  };

  const categoryCounts: Record<string, number> = {};
  books.forEach((book) => {
    const category = book.categories[0]?.name || 'General Collection';
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });

  const handleExportCatalogCsv = () => {
    const headers = ['Category', 'Titles'];
    const rows = Object.entries(categoryCounts).map(([category, count]) => [category, String(count)]);
    downloadCsv('meeliefont_catalog_report', headers, rows);
  };

  return (
    <div className="space-y-7 pb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ECEEF2] pb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#14181F] sm:text-3xl">Reports</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-[#6E737D]">
            Catalog summary by subject.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex min-h-[40px] items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#E5E7EB] hover:bg-[#F5F6F8] text-[#14181F] text-xs font-semibold rounded-xl transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-[#ECEEF2] rounded-2xl p-5 shadow-2xs">
          <span className="text-[11px] font-medium text-[#6E737D] block mb-1">Total Titles</span>
          <div className="text-2xl font-bold font-mono text-[#14181F] tabular-nums">{books.length}</div>
          <span className="text-[11px] text-[#9CA3AF]">Cataloged books</span>
        </div>

        <div className="bg-white border border-[#ECEEF2] rounded-2xl p-5 shadow-2xs">
          <span className="text-[11px] font-medium text-[#6E737D] block mb-1">Subjects</span>
          <div className="text-2xl font-bold font-mono text-[#14181F] tabular-nums">{Object.keys(categoryCounts).length}</div>
          <span className="text-[11px] text-[#9CA3AF]">Categories in use</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white border border-[#ECEEF2] rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#ECEEF2]">
            <div>
              <h3 className="text-sm font-bold text-[#14181F]">Catalog by Subject</h3>
              <p className="text-xs text-[#6E737D]">Titles per category</p>
            </div>
            <button
              onClick={handleExportCatalogCsv}
              className="text-xs text-[#18362F] hover:text-[#112822] font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>

          <div className="space-y-3">
            {loading ? (
              <p className="text-xs text-[#6E737D]">Loading...</p>
            ) : Object.entries(categoryCounts).length === 0 ? (
              <p className="text-xs text-[#6E737D]">No titles cataloged yet.</p>
            ) : (
              Object.entries(categoryCounts).map(([category, count]) => (
                <div key={category} className="flex items-center justify-between text-xs py-1">
                  <span className="font-semibold text-[#14181F]">{category}</span>
                  <span className="font-mono text-[#4B5563] tabular-nums">{count} titles</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
