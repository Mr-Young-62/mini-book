import type { CreateLoanInput, LoanRecord } from '../types/library';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { normalizeStockCount } from '../lib/stock';
import { LibraryService } from './libraryService';

const STORAGE_KEY_LOANS = 'readowl_data_loans';
const STORAGE_KEY_BOOKS = 'readowl_data_books';

function readLocalLoans(): LoanRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOANS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_LOANS, JSON.stringify([]));
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LoanRecord[]) : [];
  } catch (error) {
    throw new Error(
      `Tidak dapat membaca data pinjaman lokal: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function writeLocalLoans(loans: LoanRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_LOANS, JSON.stringify(loans));
  } catch (error) {
    throw new Error(
      `Tidak dapat menyimpan data pinjaman lokal: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function sortLoansNewest(loans: LoanRecord[]): LoanRecord[] {
  return [...loans].sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  );
}

function isMissingLoansTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  const message = 'message' in error ? String(error.message).toLowerCase() : '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (message.includes('loans') && (message.includes('does not exist') || message.includes('schema cache')))
  );
}

function isMissingRpcError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  const message = 'message' in error ? String(error.message).toLowerCase() : '';
  return (
    code === '42883' || // function does not exist
    code === 'PGRST202' || // function not found in schema cache
    message.includes('create_loan_atomic') &&
      (message.includes('does not exist') || message.includes('schema cache') || message.includes('not found'))
  );
}

function getLocalBookStock(bookId: string): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BOOKS);
    const books = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(books)) return null;
    const book = books.find((b) => b && b.id === bookId && !b.deleted_at);
    return book ? normalizeStockCount(book.stock_count) : null;
  } catch {
    return null;
  }
}

function countActiveLocalLoans(loans: LoanRecord[], bookId: string): number {
  return loans.reduce(
    (n, loan) => (loan.book_id === bookId && !loan.returned_at ? n + 1 : n),
    0,
  );
}

async function getCurrentUserId(): Promise<string> {
  if (!supabase) throw new Error('Koneksi Supabase belum aktif.');
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session?.user.id) throw new Error('Sesi login tidak ditemukan.');
  return session.user.id;
}

export class LoanService {
  static async getLoans(): Promise<{ loans: LoanRecord[]; localFallback: boolean }> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase sudah dikonfigurasi tetapi klien gagal dimuat.');
      const { data, error } = await supabase
        .from('loans')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error) {
        return { loans: (data || []) as LoanRecord[], localFallback: false };
      }
      if (!isMissingLoansTableError(error)) {
        throw error;
      }
      return { loans: sortLoansNewest(readLocalLoans()), localFallback: true };
    }

    return { loans: sortLoansNewest(readLocalLoans()), localFallback: false };
  }

  static async createLoan(input: CreateLoanInput): Promise<{ loan: LoanRecord; localFallback: boolean }> {
    const itemName = input.item_name.trim();
    const borrowerName = input.borrower_name.trim();
    const borrowedAt = input.borrowed_at.slice(0, 10);
    const dueDate = input.due_date.slice(0, 10);
    const notes = input.notes?.trim() || undefined;

    if (!itemName) throw new Error('Nama barang atau buku wajib diisi.');
    if (!borrowerName) throw new Error('Nama peminjam wajib diisi.');
    if (!borrowedAt || !dueDate) throw new Error('Tanggal peminjaman dan pengembalian wajib diisi.');
    if (dueDate < borrowedAt) {
      throw new Error('Tanggal pengembalian tidak boleh lebih awal dari tanggal peminjaman.');
    }

    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase sudah dikonfigurasi tetapi klien gagal dimuat.');
      const ownerId = await getCurrentUserId();
      const bookId = input.book_id || null;

      // Prefer the atomic RPC (serializes per book + rechecks stock in one
      // transaction). `create_loan_atomic` raises on insufficient stock.
      const { data: rpcData, error: rpcError } = await supabase.rpc('create_loan_atomic', {
        p_book_id: bookId,
        p_item_name: itemName,
        p_borrower_name: borrowerName,
        p_borrowed_at: borrowedAt,
        p_due_date: dueDate,
        p_notes: notes || null,
      });

      if (!rpcError && rpcData) {
        await LibraryService.logActivity(
          'LOAN_CREATED',
          'loans',
          `${borrowerName} meminjam "${itemName}" hingga ${dueDate}`,
        );
        return { loan: rpcData as LoanRecord, localFallback: false };
      }
      // Insufficient stock / validation / not-authenticated from the RPC must
      // surface; only a *missing* RPC (migration not applied) falls through.
      if (rpcError && !isMissingRpcError(rpcError) && !isMissingLoansTableError(rpcError)) {
        throw rpcError;
      }

      // Fallback (RPC not deployed): manual insert. Re-check stock freshly to
      // reduce (not eliminate) the concurrency window; the DB RPC is the real fix.
      if (bookId) {
        const { count } = await supabase
          .from('loans')
          .select('*', { count: 'exact', head: true })
          .eq('book_id', bookId)
          .is('returned_at', null);
        const { data: bookRow } = await supabase
          .from('books')
          .select('stock_count')
          .eq('id', bookId)
          .is('deleted_at', null)
          .maybeSingle();
        const stock = normalizeStockCount((bookRow as { stock_count?: number } | null)?.stock_count);
        if ((count ?? 0) >= stock) {
          throw new Error('Semua eksemplar buku sedang dipinjam. Tunggu pengembalian atau tambah stok.');
        }
      }

      const { data, error } = await supabase
        .from('loans')
        .insert({
          owner_id: ownerId,
          book_id: bookId,
          item_name: itemName,
          borrower_name: borrowerName,
          borrowed_at: borrowedAt,
          due_date: dueDate,
          notes: notes || null,
        })
        .select()
        .single();

      if (!error && data) {
        await LibraryService.logActivity(
          'LOAN_CREATED',
          'loans',
          `${borrowerName} meminjam "${itemName}" hingga ${dueDate}`,
        );
        return { loan: data as LoanRecord, localFallback: false };
      }
      if (error && !isMissingLoansTableError(error)) {
        throw error;
      }
    }

    const now = new Date().toISOString();
    const newLoan: LoanRecord = {
      id: crypto.randomUUID(),
      book_id: input.book_id || undefined,
      item_name: itemName,
      borrower_name: borrowerName,
      borrowed_at: borrowedAt,
      due_date: dueDate,
      notes,
      created_at: now,
      updated_at: now,
    };

    const existing = readLocalLoans();
    // Re-verify stock against freshly-read data so concurrent local creations
    // cannot both slip past the earlier UI check for the last copy.
    if (newLoan.book_id) {
      const stock = getLocalBookStock(newLoan.book_id);
      if (stock !== null && countActiveLocalLoans(existing, newLoan.book_id) >= stock) {
        throw new Error('Semua eksemplar buku sedang dipinjam. Tunggu pengembalian atau tambah stok.');
      }
    }
    existing.unshift(newLoan);
    writeLocalLoans(existing);
    await LibraryService.logActivity(
      'LOAN_CREATED',
      'loans',
      `${borrowerName} meminjam "${itemName}" hingga ${dueDate}`,
    );
    return { loan: newLoan, localFallback: isSupabaseConfigured };
  }

  static async markReturned(loanId: string): Promise<{ loan: LoanRecord; localFallback: boolean }> {
    const returnedAt = new Date().toISOString();

    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase sudah dikonfigurasi tetapi klien gagal dimuat.');
      const { data, error } = await supabase
        .from('loans')
        .update({ returned_at: returnedAt, updated_at: returnedAt })
        .eq('id', loanId)
        .select()
        .single();

      if (!error && data) {
        const updated = data as LoanRecord;
        await LibraryService.logActivity(
          'LOAN_RETURNED',
          'loans',
          `${updated.borrower_name} mengembalikan "${updated.item_name}"`,
        );
        return { loan: updated, localFallback: false };
      }
      if (error && !isMissingLoansTableError(error)) {
        throw error;
      }
    }

    const loans = readLocalLoans();
    const idx = loans.findIndex((item) => item.id === loanId);
    if (idx === -1) throw new Error('Data pinjaman tidak ditemukan.');
    const updated: LoanRecord = {
      ...loans[idx],
      returned_at: returnedAt,
      updated_at: returnedAt,
    };
    loans[idx] = updated;
    writeLocalLoans(loans);
    await LibraryService.logActivity(
      'LOAN_RETURNED',
      'loans',
      `${updated.borrower_name} mengembalikan "${updated.item_name}"`,
    );
    return { loan: updated, localFallback: isSupabaseConfigured };
  }

  static async reopenLoan(loanId: string): Promise<{ loan: LoanRecord; localFallback: boolean }> {
    const updatedAt = new Date().toISOString();

    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase sudah dikonfigurasi tetapi klien gagal dimuat.');
      const { data, error } = await supabase
        .from('loans')
        .update({ returned_at: null, updated_at: updatedAt })
        .eq('id', loanId)
        .select()
        .single();

      if (!error && data) {
        const updated = data as LoanRecord;
        await LibraryService.logActivity(
          'LOAN_REOPENED',
          'loans',
          `Pinjaman "${updated.item_name}" oleh ${updated.borrower_name} dibuka kembali`,
        );
        return { loan: updated, localFallback: false };
      }
      if (error && !isMissingLoansTableError(error)) {
        throw error;
      }
    }

    const loans = readLocalLoans();
    const idx = loans.findIndex((item) => item.id === loanId);
    if (idx === -1) throw new Error('Data pinjaman tidak ditemukan.');
    const updated: LoanRecord = {
      ...loans[idx],
      returned_at: undefined,
      updated_at: updatedAt,
    };
    loans[idx] = updated;
    writeLocalLoans(loans);
    await LibraryService.logActivity(
      'LOAN_REOPENED',
      'loans',
      `Pinjaman "${updated.item_name}" oleh ${updated.borrower_name} dibuka kembali`,
    );
    return { loan: updated, localFallback: isSupabaseConfigured };
  }

  static async deleteLoan(loanId: string): Promise<{ localFallback: boolean }> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase sudah dikonfigurasi tetapi klien gagal dimuat.');
      const { error } = await supabase
        .from('loans')
        .delete()
        .eq('id', loanId);

      if (!error) {
        await LibraryService.logActivity('LOAN_DELETED', 'loans', `Menghapus catatan pinjaman ${loanId}`);
        return { localFallback: false };
      }
      if (!isMissingLoansTableError(error)) {
        throw error;
      }
    }

    const loans = readLocalLoans();
    const target = loans.find((item) => item.id === loanId);
    writeLocalLoans(loans.filter((item) => item.id !== loanId));
    await LibraryService.logActivity(
      'LOAN_DELETED',
      'loans',
      target ? `Menghapus catatan pinjaman "${target.item_name}"` : `Menghapus catatan pinjaman ${loanId}`,
    );
    return { localFallback: isSupabaseConfigured };
  }
}
