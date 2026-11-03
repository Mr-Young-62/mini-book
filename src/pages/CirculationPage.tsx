import React, { useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  BookDown,
  BookUp,
  Search,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  User,
  Barcode,
  Layers,
  FileText,
  DollarSign,
  Printer,
  X,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { Member, BookCopy, BorrowTransaction, UserRole } from '../types/library';

interface CirculationPageProps {
  userRole: UserRole;
  initialCopyId?: string;
}

export const CirculationPage: React.FC<CirculationPageProps> = ({
  userRole,
  initialCopyId,
}) => {
  const [activeTab, setActiveTab] = useState<'borrow' | 'return' | 'history'>('borrow');

  // Shared Data
  const [members, setMembers] = useState<Member[]>([]);
  const [copies, setCopies] = useState<BookCopy[]>([]);
  const [loans, setLoans] = useState<BorrowTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  // BORROW STATE
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [memberSearchQuery, setMemberSearchQuery] = useState<string>('');
  const [selectedCopyIds, setSelectedCopyIds] = useState<string[]>(initialCopyId ? [initialCopyId] : []);
  const [copySearchQuery, setCopySearchQuery] = useState<string>('');
  const [loanDays, setLoanDays] = useState<number>(14);
  const [borrowProcessing, setBorrowProcessing] = useState(false);
  const [borrowResult, setBorrowResult] = useState<BorrowTransaction | null>(null);
  const [borrowError, setBorrowError] = useState<string | null>(null);

  // RETURN STATE
  const [returnCodeInput, setReturnCodeInput] = useState<string>('');
  const [returnCondition, setReturnCondition] = useState<string>('Good');
  const [returnNotes, setReturnNotes] = useState<string>('');
  const [returnProcessing, setReturnProcessing] = useState(false);
  const [returnResult, setReturnResult] = useState<any>(null);
  const [returnError, setReturnError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [m, c, l] = await Promise.all([
        LibraryService.getMembers(),
        LibraryService.getCopies(),
        LibraryService.getLoans(),
      ]);
      setMembers(m);
      setCopies(c);
      setLoans(l);

      if (initialCopyId) {
        setSelectedCopyIds([initialCopyId]);
        setActiveTab('borrow');
      }
    } catch (err) {
      console.error('Error loading circulation data:', err);
    } finally {
      setLoading(false);
    }
  };

  const selectedMember = members.find((m) => m.id === selectedMemberId);

  // Filter available copies for borrowing
  const availableCopies = copies.filter((c) => c.status === 'Available');
  const filteredAvailableCopies = availableCopies.filter((c) => {
    const q = copySearchQuery.toLowerCase();
    return (
      !q ||
      c.inventory_code.toLowerCase().includes(q) ||
      c.barcode.toLowerCase().includes(q) ||
      c.book?.title.toLowerCase().includes(q) ||
      c.book?.isbn_13.includes(q)
    );
  });

  // Filter members for borrowing lookup
  const filteredMembers = members.filter((m) => {
    const q = memberSearchQuery.toLowerCase();
    return (
      !q ||
      m.full_name.toLowerCase().includes(q) ||
      m.member_code.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    );
  });

  const handleExecuteBorrow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId || selectedCopyIds.length === 0) return;

    setBorrowProcessing(true);
    setBorrowError(null);
    setBorrowResult(null);

    try {
      const res = await LibraryService.borrowBooks(selectedMemberId, selectedCopyIds, loanDays);
      if (res.success && res.transaction) {
        setBorrowResult(res.transaction);
        setSelectedCopyIds([]);
        loadData();
      } else {
        setBorrowError(res.error || 'Failed to complete borrow transaction.');
      }
    } catch (err: any) {
      setBorrowError(err.message || 'Error occurred while issuing loan.');
    } finally {
      setBorrowProcessing(false);
    }
  };

  const handleExecuteReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnCodeInput.trim()) return;

    setReturnProcessing(true);
    setReturnError(null);
    setReturnResult(null);

    try {
      const res = await LibraryService.returnBookCopy(
        returnCodeInput.trim(),
        returnCondition,
        returnNotes
      );
      if (res.success) {
        setReturnResult(res);
        setReturnCodeInput('');
        setReturnNotes('');
        loadData();
      } else {
        setReturnError(res.error || 'Failed to process return.');
      }
    } catch (err: any) {
      setReturnError(err.message || 'Error occurred while processing return.');
    } finally {
      setReturnProcessing(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EAE5DE] pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#2C221E] font-sans">
            Circulation Desk
          </h1>
          <p className="text-xs text-[#7E6F64]">
            Issue book loans, process returns with automated late fee calculation, and audit borrowing history.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center gap-1 bg-[#F2EDE4] p-1 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setActiveTab('borrow')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-colors ${
              activeTab === 'borrow'
                ? 'bg-white text-[#2C221E] shadow-2xs'
                : 'text-[#7E6F64] hover:text-[#2C221E]'
            }`}
          >
            <BookUp className="w-3.5 h-3.5 text-[#EA580C]" />
            <span>Borrow Books</span>
          </button>
          <button
            onClick={() => setActiveTab('return')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-colors ${
              activeTab === 'return'
                ? 'bg-white text-[#2C221E] shadow-2xs'
                : 'text-[#7E6F64] hover:text-[#2C221E]'
            }`}
          >
            <BookDown className="w-3.5 h-3.5 text-emerald-600" />
            <span>Return Books</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md transition-colors ${
              activeTab === 'history'
                ? 'bg-white text-[#2C221E] shadow-2xs'
                : 'text-[#7E6F64] hover:text-[#2C221E]'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Active Loans & Ledger</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 1. BORROW WORKFLOW TAB */}
      {/* ==================================================================== */}
      {activeTab === 'borrow' && (
        <div className="space-y-6">
          {borrowResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between gap-3 text-xs text-emerald-950">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Loan Issued Successfully!</h4>
                  <p className="font-mono text-[11px] text-emerald-800">
                    Transaction Code: {borrowResult.transaction_code} · Due Date: {borrowResult.due_date}
                  </p>
                  <p className="mt-1 text-emerald-900">
                    {borrowResult.items.length} book copy(ies) checked out to {borrowResult.member?.full_name}.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBorrowResult(null)}
                className="text-emerald-700 hover:text-emerald-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {borrowError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{borrowError}</span>
            </div>
          )}

          <form onSubmit={handleExecuteBorrow} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Step 1: Member Selection (4 cols) */}
            <div className="lg:col-span-4 bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#F0ECE4]">
                <span className="text-xs font-bold text-[#2C221E] uppercase tracking-wider">
                  Step 1: Select Member
                </span>
                <User className="w-4 h-4 text-[#EA580C]" />
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#A89F91] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={memberSearchQuery}
                  onChange={(e) => setMemberSearchQuery(e.target.value)}
                  placeholder="Search name, code, email..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAF8F5] border border-[#E5E0D8] rounded-md focus:outline-hidden focus:border-[#EA580C]"
                />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1.5 divide-y divide-[#F0ECE4]">
                {filteredMembers.map((m) => {
                  const isSelected = selectedMemberId === m.id;
                  const isEligible = m.status === 'Active' && (m.active_loans_count || 0) < 5;
                  return (
                    <div
                      key={m.id}
                      onClick={() => isEligible && setSelectedMemberId(m.id)}
                      className={`pt-1.5 p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                        isSelected
                          ? 'bg-[#FFEDD5] border border-[#EA580C]/40 text-[#2C221E]'
                          : isEligible
                          ? 'hover:bg-[#FAF8F5] text-[#4A3E35]'
                          : 'opacity-50 cursor-not-allowed bg-rose-50/40 text-rose-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{m.full_name}</span>
                        <span className="font-mono text-[10px] text-[#7E6F64]">{m.member_code}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[#7E6F64] mt-0.5">
                        <span>Tier: {m.membership_type}</span>
                        <span
                          className={`font-mono tabular-nums ${
                            (m.active_loans_count || 0) >= 5 ? 'text-rose-600 font-bold' : ''
                          }`}
                        >
                          {m.active_loans_count || 0} / 5 loans
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedMember && (
                <div className="mt-3 p-2.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs space-y-1">
                  <div className="font-bold text-[#2C221E]">{selectedMember.full_name}</div>
                  <div className="text-[11px] text-[#7E6F64] font-mono">{selectedMember.email}</div>
                  <div className="text-[11px] text-[#7E6F64]">Status: {selectedMember.status}</div>
                </div>
              )}
            </div>

            {/* Step 2: Book Copies Selection (5 cols) */}
            <div className="lg:col-span-5 bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#F0ECE4]">
                <span className="text-xs font-bold text-[#2C221E] uppercase tracking-wider">
                  Step 2: Choose Available Copies
                </span>
                <Layers className="w-4 h-4 text-[#EA580C]" />
              </div>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#A89F91] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={copySearchQuery}
                  onChange={(e) => setCopySearchQuery(e.target.value)}
                  placeholder="Search copy code (RDW-...), barcode, title..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#FAF8F5] border border-[#E5E0D8] rounded-md focus:outline-hidden focus:border-[#EA580C]"
                />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2">
                {filteredAvailableCopies.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#7E6F64]">
                    No available physical copies match your search.
                  </div>
                ) : (
                  filteredAvailableCopies.map((copy) => {
                    const isSelected = selectedCopyIds.includes(copy.id);
                    return (
                      <div
                        key={copy.id}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedCopyIds(selectedCopyIds.filter((id) => id !== copy.id));
                          } else {
                            setSelectedCopyIds([...selectedCopyIds, copy.id]);
                          }
                        }}
                        className={`p-2.5 rounded-lg border cursor-pointer transition-colors text-xs ${
                          isSelected
                            ? 'bg-[#FFEDD5] border-[#EA580C] text-[#2C221E]'
                            : 'bg-[#FAF8F5] border-[#EAE5DE] hover:border-[#D4CDC3]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-[#EA580C]">
                            {copy.inventory_code}
                          </span>
                          <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-mono">
                            {copy.shelf_location}
                          </span>
                        </div>
                        <div className="font-semibold text-[#2C221E] line-clamp-1 mt-0.5">
                          {copy.book?.title}
                        </div>
                        <div className="text-[10px] text-[#7E6F64]">
                          Rack: {copy.rack_number} · Condition: {copy.condition}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Step 3: Transaction Review & Confirm (3 cols) */}
            <div className="lg:col-span-3 bg-white border border-[#E8E2D9] rounded-xl p-4 shadow-2xs flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-[#F0ECE4]">
                  <span className="text-xs font-bold text-[#2C221E] uppercase tracking-wider">
                    Step 3: Loan Terms
                  </span>
                  <Calendar className="w-4 h-4 text-[#EA580C]" />
                </div>

                <div className="space-y-3 mt-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                      Loan Duration (Days)
                    </label>
                    <select
                      value={loanDays}
                      onChange={(e) => setLoanDays(parseInt(e.target.value, 10))}
                      className="w-full px-2.5 py-1.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded-md text-xs font-mono"
                    >
                      <option value={7}>7 Days (1 Week)</option>
                      <option value={14}>14 Days (Standard 2 Weeks)</option>
                      <option value={21}>21 Days (3 Weeks)</option>
                      <option value={30}>30 Days (Extended)</option>
                    </select>
                  </div>

                  <div className="p-3 bg-[#FAF8F5] border border-[#EAE5DE] rounded-lg text-xs space-y-1">
                    <div className="flex justify-between text-[#7E6F64]">
                      <span>Selected Copies:</span>
                      <span className="font-mono font-bold text-[#2C221E]">
                        {selectedCopyIds.length}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#7E6F64]">
                      <span>Due Date:</span>
                      <span className="font-mono font-bold text-[#2C221E]">
                        {new Date(Date.now() + loanDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#7E6F64]">
                      <span>Daily Overdue Rate:</span>
                      <span className="font-mono text-[#2C221E]">$0.50 / day</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={borrowProcessing || !selectedMemberId || selectedCopyIds.length === 0}
                className="w-full py-2.5 bg-[#EA580C] hover:bg-[#C2410C] disabled:opacity-40 text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Issue Loan</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. RETURN WORKFLOW TAB */}
      {/* ==================================================================== */}
      {activeTab === 'return' && (
        <div className="max-w-2xl mx-auto space-y-6">
          {returnResult && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between gap-3 text-xs text-emerald-950">
              <div className="flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-sm">Book Returned Successfully!</h4>
                  <p className="font-mono text-[11px] text-emerald-800">
                    Copy: {returnResult.inventory_code} · {returnResult.bookTitle}
                  </p>
                  <div className="mt-1 flex items-center gap-3">
                    <span className="text-[#2C221E] font-medium">
                      Condition recorded: {returnResult.condition}
                    </span>
                    {returnResult.overdueDays > 0 ? (
                      <span className="font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded font-mono">
                        {returnResult.overdueDays} days overdue · Late Fee: ${returnResult.lateFee.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-emerald-700 font-semibold">Returned on time (No fee)</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setReturnResult(null)}
                className="text-emerald-700 hover:text-emerald-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {returnError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{returnError}</span>
            </div>
          )}

          <form
            onSubmit={handleExecuteReturn}
            className="bg-white border border-[#E8E2D9] rounded-xl p-6 shadow-2xs space-y-5"
          >
            <div className="text-center pb-2">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#FFEDD5] flex items-center justify-center text-[#EA580C] mb-2">
                <BookDown className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-[#2C221E]">Process Book Return</h3>
              <p className="text-xs text-[#7E6F64]">
                Scan or enter the book copy's internal inventory barcode or code (e.g. RDW-000002)
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#2C221E] mb-1">
                Copy Inventory Code or Barcode
              </label>
              <div className="relative">
                <Barcode className="w-4 h-4 text-[#A89F91] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={returnCodeInput}
                  onChange={(e) => setReturnCodeInput(e.target.value)}
                  placeholder="e.g. RDW-000002 or 9780132350884-02"
                  className="w-full pl-9 pr-4 py-2.5 text-sm font-mono bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg focus:outline-hidden focus:border-[#EA580C]"
                  required
                />
              </div>

              {copies.some((c) => c.status === 'Borrowed') && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#7E6F64]">
                  <span>Currently Borrowed Copies:</span>
                  {copies
                    .filter((c) => c.status === 'Borrowed')
                    .slice(0, 5)
                    .map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setReturnCodeInput(c.inventory_code)}
                        className="px-2 py-0.5 bg-[#FAF8F5] border border-[#E5E0D8] rounded font-mono hover:bg-[#FFEDD5] text-[#2C221E]"
                      >
                        {c.inventory_code}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                  Condition Upon Return
                </label>
                <select
                  value={returnCondition}
                  onChange={(e) => setReturnCondition(e.target.value)}
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs"
                >
                  <option value="Good">Good (Ready for shelf)</option>
                  <option value="Like New">Like New</option>
                  <option value="Fair">Fair (Minor wear)</option>
                  <option value="Damaged">Damaged (Send to maintenance)</option>
                  <option value="Lost">Lost by Member</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                  Staff Notes (Optional)
                </label>
                <input
                  type="text"
                  value={returnNotes}
                  onChange={(e) => setReturnNotes(e.target.value)}
                  placeholder="e.g. slight spine crease, fee paid"
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={returnProcessing || !returnCodeInput.trim()}
              className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold rounded-lg shadow-2xs flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Verify & Complete Return</span>
            </button>
          </form>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. ACTIVE LOANS & LEDGER TAB */}
      {/* ==================================================================== */}
      {activeTab === 'history' && (
        <div className="bg-white border border-[#E8E2D9] rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8F5] border-b border-[#E8E2D9] text-[#7E6F64] font-medium">
                <tr>
                  <th className="py-3 px-4 font-mono">Tx Code</th>
                  <th className="py-3 px-4">Borrower</th>
                  <th className="py-3 px-4">Book Copies</th>
                  <th className="py-3 px-4 font-mono">Borrowed Date</th>
                  <th className="py-3 px-4 font-mono">Due Date</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Late Fee</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0ECE4]">
                {loans.map((tx) => {
                  const isOverdue = tx.status === 'Overdue' || (tx.status === 'Active' && tx.due_date < today);
                  return (
                    <tr key={tx.id} className="hover:bg-[#FAF8F5] transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#EA580C]">
                        {tx.transaction_code}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#2C221E]">{tx.member?.full_name}</div>
                        <div className="text-[10px] text-[#7E6F64] font-mono">
                          {tx.member?.member_code}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          {tx.items.map((item) => (
                            <div key={item.id} className="flex items-center gap-1.5 font-mono text-[11px]">
                              <span className="font-semibold text-[#4A3E35]">{item.copy?.inventory_code}</span>
                              <span className="text-[#A89F91]">({item.status})</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-[#5A4D44]">
                        {tx.borrowed_at.slice(0, 10)}
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums">
                        <span className={isOverdue ? 'font-bold text-rose-700' : 'text-[#5A4D44]'}>
                          {tx.due_date}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold font-mono ${
                            tx.status === 'Completed'
                              ? 'bg-slate-100 text-slate-700'
                              : isOverdue
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {isOverdue ? 'Overdue' : tx.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-[#2C221E]">
                        ${tx.items.reduce((sum, i) => sum + (i.late_fee || 0), 0).toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
