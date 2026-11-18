import React, { useEffect, useState } from 'react';
import {
  Layers,
  Search,
  Filter,
  Download,
  Printer,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  X,
  MapPin,
  Barcode,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { BookCopy, CopyStatus, UserRole } from '../types/library';
import { downloadCsv } from '../lib/csv';

interface InventoryPageProps {
  userRole: UserRole;
}

export const InventoryPage: React.FC<InventoryPageProps> = ({ userRole }) => {
  const currency = LibraryService.getSettings().library_info.currency || 'IDR';
  const [copies, setCopies] = useState<BookCopy[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editingCopy, setEditingCopy] = useState<BookCopy | null>(null);
  const [printCopy, setPrintCopy] = useState<BookCopy | null>(null);

  // Edit form state
  const [editStatus, setEditStatus] = useState<CopyStatus>('Available');
  const [editCondition, setEditCondition] = useState('Good');

  useEffect(() => {
    loadCopies();
  }, []);

  const loadCopies = async () => {
    setLoading(true);
    try {
      const data = await LibraryService.getCopies();
      setCopies(data);
    } catch (err) {
      console.error('Error fetching inventory copies:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredCopies = copies.filter((copy) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      copy.inventory_code.toLowerCase().includes(q) ||
      copy.barcode.toLowerCase().includes(q) ||
      copy.shelf_location.toLowerCase().includes(q) ||
      copy.rack_number.toLowerCase().includes(q) ||
      copy.book?.title.toLowerCase().includes(q) ||
      copy.book?.isbn_13.includes(q);

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'Available' && copy.status === 'Available') ||
      (statusFilter === 'Maintenance' && (copy.status === 'Maintenance' || copy.status === 'Damaged'));

    return matchesSearch && matchesStatus;
  });

  const handleUpdateCopy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCopy) return;

    await LibraryService.updateCopyStatus(editingCopy.id, editStatus, editCondition);
    setEditingCopy(null);
    loadCopies();
  };

  const exportInventoryCsv = () => {
    const headers = ['Inventory Code', 'Title', 'ISBN-13', 'Shelf', 'Rack', 'Status', 'Condition', `Price (${currency})`, 'Acquisition Date'];
    const rows = filteredCopies.map((c) => [
      c.inventory_code,
      c.book?.title || '',
      c.book?.isbn_13 || '',
      c.shelf_location,
      c.rack_number,
      c.status,
      c.condition,
      c.acquisition_price?.toFixed(2) || '0.00',
      c.acquisition_date,
    ]);

    downloadCsv('meeliefont_inventory', headers, rows);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE5DE] pb-4">
        <div>
          <p className="text-xs text-[#7E6F64]">
            Every physical copy has an individual barcode, shelf rack location, condition, and inventory status.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportInventoryCsv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#D4CDC3] hover:bg-[#F5F2EB] text-[#2C221E] text-xs font-medium rounded-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[#E8E2D9] shadow-2xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#A89F91] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by inventory code (e.g. RDW-000001), book title, or shelf..."
            className="w-full pl-9 pr-4 py-2 text-xs bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg focus:outline-hidden focus:border-[#c62828]"
          />
        </div>

        {/* Status segmented filters */}
        <div className="flex items-center gap-1 bg-[#F2EDE4] p-1 rounded-lg text-xs overflow-x-auto">
          {['all', 'Available', 'Maintenance'].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 font-medium rounded-md transition-colors whitespace-nowrap ${
                statusFilter === s ? 'bg-white text-[#2C221E] shadow-2xs' : 'text-[#7E6F64] hover:text-[#2C221E]'
              }`}
            >
              {s === 'all' ? 'All Copies' : s}
            </button>
          ))}
        </div>
      </div>

      {/* Inventory Table */}
      <div className="bg-white border border-[#E8E2D9] rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#FAF8F5] border-b border-[#E8E2D9] text-[#7E6F64] font-medium">
              <tr>
                <th className="py-3 px-4 font-mono">Inventory Code</th>
                <th className="py-3 px-4">Book Title</th>
                <th className="py-3 px-4">Location</th>
                <th className="py-3 px-4">Condition</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right font-mono">Price ({currency})</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0ECE4]">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[#7E6F64]">
                    Loading inventory copies...
                  </td>
                </tr>
              ) : filteredCopies.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-[#7E6F64]">
                    <Layers className="w-8 h-8 mx-auto text-[#A89F91] mb-2" />
                    <p className="text-xs font-bold text-[#2C221E] mb-1">
                      {copies.length === 0 ? 'No Physical Inventory Copies Yet' : 'No matching copies found'}
                    </p>
                    <p className="text-[11px] text-[#A89F91]">
                      {copies.length === 0
                        ? 'Catalog books via the ISBN scanner to generate physical copies with unique RDW codes and shelf tags.'
                        : 'Try adjusting your search query or status filter.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredCopies.map((copy) => (
                  <tr key={copy.id} className="hover:bg-[#FAF8F5] transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-[#c62828]">{copy.inventory_code}</div>
                      <div className="text-[10px] text-[#A89F91] font-mono">{copy.barcode}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-[#2C221E] line-clamp-1 max-w-xs">
                        {copy.book?.title || 'Unknown Title'}
                      </div>
                      <div className="text-[11px] text-[#7E6F64] font-mono">
                        ISBN: {copy.book?.isbn_13}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-[#5A4D44]">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[#A89F91]" />
                        <span>{copy.shelf_location}</span>
                      </div>
                      <span className="text-[10px] text-[#A89F91]">{copy.rack_number}</span>
                    </td>
                    <td className="py-3 px-4 text-[#5A4D44] font-medium">
                      {copy.condition}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                          copy.status === 'Available'
                            ? 'bg-emerald-100 text-emerald-800'
                            : copy.status === 'Maintenance' || copy.status === 'Damaged'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {copy.status === 'Borrowed' || copy.status === 'Reserved' ? 'Unavailable' : copy.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-[#5A4D44]">
                      {currency} {copy.acquisition_price?.toFixed(2) || '0.00'}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => setPrintCopy(copy)}
                          className="p-1 text-[#7E6F64] hover:text-[#2C221E] hover:bg-[#F0ECE4] rounded"
                          title="Print Barcode Label"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        {userRole !== 'Member' && !['Borrowed', 'Reserved', 'Lost'].includes(copy.status) && (
                          <button
                            onClick={() => {
                              setEditingCopy(copy);
                              setEditStatus(copy.status);
                              setEditCondition(copy.condition);
                            }}
                            className="p-1 text-[#7E6F64] hover:text-[#c62828] hover:bg-[#F0ECE4] rounded"
                            title="Edit Status"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Copy Modal */}
      {editingCopy && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-[#E5E0D8] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#EAE5DE] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#2C221E]">
                  Edit Physical Copy {editingCopy.inventory_code}
                </h3>
                <p className="text-xs text-[#7E6F64]">{editingCopy.book?.title}</p>
              </div>
              <button
                onClick={() => setEditingCopy(null)}
                className="text-[#7E6F64] hover:text-[#2C221E]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateCopy} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                  Inventory Status
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as CopyStatus)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs"
                >
                  <option value="Available">Available</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Damaged">Damaged</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                  Physical Condition
                </label>
                <select
                  value={editCondition}
                  onChange={(e) => setEditCondition(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs"
                >
                  <option value="Like New">Like New</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Worn">Worn</option>
                  <option value="Damaged">Damaged</option>
                </select>
              </div>

              <div className="pt-3 border-t border-[#F0ECE4] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCopy(null)}
                  className="px-3 py-1.5 text-xs text-[#7E6F64] hover:text-[#2C221E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#c62828] hover:bg-[#a61f1f] text-white text-xs font-semibold rounded-lg shadow-2xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode Sticker Label Preview Modal */}
      {printCopy && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-[#E5E0D8] p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#EAE5DE] pb-3">
              <h3 className="text-sm font-bold text-[#2C221E]">Print Spine / Spine Label</h3>
              <button
                onClick={() => setPrintCopy(null)}
                className="text-[#7E6F64] hover:text-[#2C221E]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Simulated physical label sticker */}
            <div className="bg-[#FFFDF9] border-2 border-dashed border-[#B88A58] p-4 rounded-lg text-center space-y-2 shadow-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#7f1d1d]">
                MeelieFont Library
              </div>
              <div className="font-mono text-base font-extrabold text-[#2C221E] tracking-wider">
                {printCopy.inventory_code}
              </div>

              {/* Simulated barcode graphic */}
              <div className="py-2 flex items-center justify-center">
                <div className="w-48 h-12 bg-[#2C221E] flex items-center justify-center text-white text-[11px] font-mono tracking-widest px-2">
                  ||| | |||| | ||| || ||| | ||
                </div>
              </div>

              <div className="text-[11px] font-semibold text-[#2C221E] line-clamp-1">
                {printCopy.book?.title}
              </div>
              <div className="text-[10px] text-[#7E6F64] font-mono">
                {printCopy.shelf_location} · {printCopy.rack_number}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => setPrintCopy(null)}
                className="px-3 py-1.5 text-xs text-[#7E6F64] hover:text-[#2C221E]"
              >
                Close
              </button>
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-[#c62828] hover:bg-[#a61f1f] text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Sticker</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
