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
      setBooks(await LibraryService.getBooks({ limit: 20, skip: 0 }));
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE5DE] pb-4">
        <div>
          <p className="text-xs text-[#7E6F64]">
            Catalog summary by subject.
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
          <span className="text-[11px] text-[#7E6F64] block mb-1">Total Titles</span>
          <div className="text-xl font-bold font-mono text-[#2C221E] tabular-nums">{books.length}</div>
          <span className="text-[10px] text-[#A89F91]">Cataloged books</span>
        </div>

        <div className="bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs">
          <span className="text-[11px] text-[#7E6F64] block mb-1">Subjects</span>
          <div className="text-xl font-bold font-mono text-[#2C221E] tabular-nums">{Object.keys(categoryCounts).length}</div>
          <span className="text-[10px] text-[#A89F91]">Categories in use</span>
        </div>

      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
            <div>
              <h3 className="text-sm font-bold text-[#2C221E]">Catalog by Subject</h3>
              <p className="text-xs text-[#7E6F64]">Titles per category</p>
            </div>
            <button
              onClick={handleExportCatalogCsv}
              className="text-xs text-[#c62828] hover:text-[#a61f1f] font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>

          <div className="space-y-3">
            {loading ? (
              <p className="text-xs text-[#7E6F64]">Loading...</p>
            ) : Object.entries(categoryCounts).length === 0 ? (
              <p className="text-xs text-[#7E6F64]">No titles cataloged yet.</p>
            ) : (
              Object.entries(categoryCounts).map(([category, count]) => (
                <div key={category} className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#2C221E]">{category}</span>
                  <span className="font-mono text-[#5A4D44] tabular-nums">{count} titles</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
