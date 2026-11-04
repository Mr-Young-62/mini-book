import {
  Book,
  BookCopy,
  Member,
  BorrowTransaction,
  ActivityLog,
  LibrarySettings,
  ScannedBookMetadata,
  CopyStatus,
} from '../types/library';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { cleanIsbn, normalizeToIsbn13 } from './isbnValidator';

const STORAGE_KEY_BOOKS = 'readowl_data_books';
const STORAGE_KEY_COPIES = 'readowl_data_copies';
const STORAGE_KEY_MEMBERS = 'readowl_data_members';
const STORAGE_KEY_LOANS = 'readowl_data_loans';
const STORAGE_KEY_LOGS = 'readowl_data_logs';
const STORAGE_KEY_SETTINGS = 'readowl_data_settings';

// Default initial settings
export const defaultSettings: LibrarySettings = {
  library_info: {
    name: 'Readowl Community Library',
    code: 'RDW-01',
    address: '452 Bookkeeper Way, Alexandria, VA',
    phone: '+1 (555) 234-5678',
    email: 'contact@readowl.library',
    currency: '$',
  },
  circulation_rules: {
    default_loan_days: 14,
    max_loans_per_member: 5,
    daily_late_fee: 0.5,
    allow_renewals: true,
    max_renewals: 2,
  },
  inventory_config: {
    code_prefix: 'RDW',
    barcode_format: 'CODE128',
    default_shelf: 'Main Floor',
    default_rack: 'A-01',
  },
};

// Initial clean library state (zero dummy records)
const initialBooks: Book[] = [];
const initialCopies: BookCopy[] = [];
const initialMembers: Member[] = [];
const initialLoans: BorrowTransaction[] = [];
const initialLogs: ActivityLog[] = [];

// Automatic purge of legacy dummy records if detected in browser storage
if (typeof window !== 'undefined') {
  try {
    const rawBooks = localStorage.getItem(STORAGE_KEY_BOOKS);
    if (rawBooks && (rawBooks.includes('44444444-4444-4444-4444-444444444401') || rawBooks.includes('Clean Code'))) {
      localStorage.setItem(STORAGE_KEY_BOOKS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_COPIES, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_MEMBERS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_LOANS, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify([]));
    }
  } catch (_) {}
}

// Helper to load or initialize local storage database
function getLocal<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(defaultVal));
      return defaultVal;
    }
    return JSON.parse(raw);
  } catch {
    return defaultVal;
  }
}

function setLocal<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (err) {
    console.error('Storage write error:', err);
  }
}

function normalizeCoverUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const value = String(url).trim();
  if (!value) return undefined;
  if (value.startsWith('//')) return `https:${value}`;
  return value.replace(/^http:\/\//i, 'https://');
}

export class LibraryService {
  // --------------------------------------------------------------------------
  // Books & Bibliographic Data
  // --------------------------------------------------------------------------

  static async getBooks(): Promise<Book[]> {
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('books')
        .select(`
          *,
          publisher:publishers(id, name),
          authors:book_authors(author:authors(id, name)),
          categories:book_categories(category:categories(id, name)),
          copies:book_copies(*)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((b: any) => ({
          ...b,
          authors: b.authors?.map((a: any) => a.author).filter(Boolean) || [],
          categories: b.categories?.map((c: any) => c.category).filter(Boolean) || [],
          copies: b.copies || [],
        }));
      }
    }

    // Local Storage Fallback
    const books: Book[] = getLocal(STORAGE_KEY_BOOKS, initialBooks);
    const copies: BookCopy[] = getLocal(STORAGE_KEY_COPIES, initialCopies);

    return books.map((b) => ({
      ...b,
      copies: copies.filter((c) => c.book_id === b.id),
    }));
  }

  static async getBookByIsbn(isbn: string): Promise<Book | null> {
    const isbn13 = normalizeToIsbn13(isbn);

    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('books')
        .select(`
          *,
          publisher:publishers(id, name),
          authors:book_authors(author:authors(id, name)),
          categories:book_categories(category:categories(id, name)),
          copies:book_copies(*)
        `)
        .eq('isbn_13', isbn13)
        .maybeSingle();

      if (!error && data) {
        return {
          ...data,
          authors: (data as any).authors?.map((a: any) => a.author).filter(Boolean) || [],
          categories: (data as any).categories?.map((c: any) => c.category).filter(Boolean) || [],
          copies: (data as any).copies || [],
        };
      }
      return null;
    }

    const books = getLocal<Book[]>(STORAGE_KEY_BOOKS, initialBooks);
    return books.find((b) => b.isbn_13 === isbn13 || b.isbn_10 === isbn) || null;
  }

  static async addBookWithCopies(
    metadata: ScannedBookMetadata,
    inventoryParams: {
      copyCount: number;
      shelfLocation: string;
      rackNumber: string;
      condition: string;
      acquisitionPrice: number;
      acquisitionSource?: string;
    }
  ): Promise<{ book: Book; newCopies: BookCopy[]; syncError?: string }> {
    const isbn13 = normalizeToIsbn13(metadata.isbn13);
    const books = getLocal<Book[]>(STORAGE_KEY_BOOKS, initialBooks);
    const copies = getLocal<BookCopy[]>(STORAGE_KEY_COPIES, initialCopies);
    const normalizedCover = normalizeCoverUrl(metadata.coverUrl);

    // Check if book already exists
    let existingBook = books.find((b) => b.isbn_13 === isbn13);
    let bookId = existingBook?.id || crypto.randomUUID();

    if (!existingBook) {
      existingBook = {
        id: bookId,
        isbn_10: metadata.isbn10,
        isbn_13: isbn13,
        title: metadata.title,
        subtitle: metadata.subtitle,
        description: metadata.description,
        publication_year: metadata.publicationYear,
        language: metadata.language || 'en',
        page_count: metadata.pageCount,
        publisher: metadata.publisher ? { id: crypto.randomUUID(), name: metadata.publisher } : undefined,
        cover_url: normalizedCover,
        metadata_source: metadata.source,
        created_at: new Date().toISOString(),
        authors: metadata.authors.filter(Boolean).map((name) => ({ id: crypto.randomUUID(), name })),
        categories: metadata.categories.filter(Boolean).map((name) => ({ id: crypto.randomUUID(), name })),
      };
      books.unshift(existingBook);
      setLocal(STORAGE_KEY_BOOKS, books);
    } else if (!existingBook.cover_url && normalizedCover) {
      existingBook.cover_url = normalizedCover;
      existingBook.updated_at = new Date().toISOString();
      existingBook.metadata_source = existingBook.metadata_source || metadata.source;
      const idx = books.findIndex((b) => b.id === existingBook?.id);
      if (idx >= 0) books[idx] = existingBook;
      setLocal(STORAGE_KEY_BOOKS, books);
    }

    // Generate physical copies (inventory codes are globally sequential; barcodes stay unique)
    const newCopies: BookCopy[] = [];
    const highestNum = copies.reduce((max, c) => {
      const match = c.inventory_code.match(/RDW-(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 0);

    for (let i = 0; i < inventoryParams.copyCount; i++) {
      const copyNum = highestNum + i + 1;
      const invCode = `RDW-${copyNum.toString().padStart(6, '0')}`;
      const copy: BookCopy = {
        id: crypto.randomUUID(),
        book_id: bookId,
        inventory_code: invCode,
        barcode: `${isbn13}-${copyNum}`,
        shelf_location: inventoryParams.shelfLocation,
        rack_number: inventoryParams.rackNumber,
        condition: inventoryParams.condition,
        acquisition_date: new Date().toISOString().split('T')[0],
        acquisition_price: inventoryParams.acquisitionPrice,
        acquisition_source: inventoryParams.acquisitionSource || 'Direct Purchase',
        status: 'Available',
        created_at: new Date().toISOString(),
      };
      newCopies.push(copy);
      copies.push(copy);
    }

    setLocal(STORAGE_KEY_COPIES, copies);

    // Activity log
    await this.logActivity(
      'BOOK_ADDED',
      'books',
      `Cataloged "${metadata.title}" (${isbn13}) with ${inventoryParams.copyCount} physical copy(ies)`
    );

    // Sync to Supabase if configured
    let syncError: string | undefined;
    if (isSupabaseConfigured && supabase) {
      try {
        // Upsert on isbn_13 so concurrent/other-device records don't break on unique constraint
        const { data: remoteBook, error: bookErr } = await supabase
          .from('books')
          .upsert(
            {
              id: existingBook.id,
              isbn_13: existingBook.isbn_13,
              isbn_10: existingBook.isbn_10,
              title: existingBook.title,
              subtitle: existingBook.subtitle,
              description: existingBook.description,
              publication_year: existingBook.publication_year,
              language: existingBook.language,
              page_count: existingBook.page_count,
              cover_url: existingBook.cover_url || normalizedCover,
              metadata_source: existingBook.metadata_source,
            },
            { onConflict: 'isbn_13' }
          )
          .select('id')
          .maybeSingle();

        if (bookErr) throw bookErr;

        // Remote may reuse a row created by another device (different id from local uuid)
        const remoteBookId = remoteBook?.id || existingBook.id;

        // Publisher (unique by name)
        if (existingBook.publisher?.name) {
          const { data: pub, error: pubErr } = await supabase
            .from('publishers')
            .upsert({ name: existingBook.publisher.name }, { onConflict: 'name' })
            .select('id')
            .maybeSingle();
          if (pubErr) throw pubErr;
          if (pub?.id && remoteBookId === existingBook.id) {
            const { error: linkErr } = await supabase
              .from('books')
              .update({ publisher_id: pub.id })
              .eq('id', remoteBookId);
            if (linkErr) throw linkErr;
          }
        }

        // Authors (not unique; de-dupe by name client-side, reuse remote rows when present)
        const seenAuthors = new Set<string>();
        for (const author of existingBook.authors.filter(Boolean)) {
          const name = author.name;
          if (!name || seenAuthors.has(name)) continue;
          seenAuthors.add(name);

          const { data: existingAuthor } = await supabase
            .from('authors')
            .select('id')
            .ilike('name', name)
            .limit(1)
            .maybeSingle();

          let authorId = existingAuthor?.id;
          if (!authorId) {
            const { data: created, error: authorErr } = await supabase
              .from('authors')
              .insert({ name })
              .select('id')
              .maybeSingle();
            if (authorErr) throw authorErr;
            authorId = created?.id;
          }

          if (authorId) {
            const { error: linkErr } = await supabase
              .from('book_authors')
              .upsert(
                { book_id: remoteBookId, author_id: authorId },
                { onConflict: 'book_id,author_id', ignoreDuplicates: true }
              );
            if (linkErr) throw linkErr;
          }
        }

        // Categories (unique by name)
        const seenCategories = new Set<string>();
        for (const category of existingBook.categories.filter(Boolean)) {
          const name = category.name;
          if (!name || seenCategories.has(name)) continue;
          seenCategories.add(name);

          const { data: cat, error: catErr } = await supabase
            .from('categories')
            .upsert({ name }, { onConflict: 'name' })
            .select('id')
            .maybeSingle();
          if (catErr) throw catErr;

          if (cat?.id) {
            const { error: linkErr } = await supabase
              .from('book_categories')
              .upsert(
                { book_id: remoteBookId, category_id: cat.id },
                { onConflict: 'book_id,category_id', ignoreDuplicates: true }
              );
            if (linkErr) throw linkErr;
          }
        }

        for (const copy of newCopies) {
          const { error: copyErr } = await supabase.from('book_copies').insert({
            id: copy.id,
            book_id: remoteBookId,
            inventory_code: copy.inventory_code,
            barcode: copy.barcode,
            shelf_location: copy.shelf_location,
            rack_number: copy.rack_number,
            condition: copy.condition,
            acquisition_date: copy.acquisition_date,
            acquisition_price: copy.acquisition_price,
            acquisition_source: copy.acquisition_source,
            status: copy.status,
          });
          if (copyErr) throw copyErr;
        }
      } catch (err: any) {
        // Keep local save intact; surface remote failure to the caller instead of hiding it
        syncError = err?.message || String(err);
        console.warn('Supabase remote sync warning:', syncError);
      }
    }

    return { book: existingBook, newCopies, syncError };
  }

  static async deleteBook(bookId: string): Promise<boolean> {
    const books = getLocal<Book[]>(STORAGE_KEY_BOOKS, initialBooks);
    const copies = getLocal<BookCopy[]>(STORAGE_KEY_COPIES, initialCopies);

    const filteredBooks = books.filter((b) => b.id !== bookId);
    const filteredCopies = copies.filter((c) => c.book_id !== bookId);

    setLocal(STORAGE_KEY_BOOKS, filteredBooks);
    setLocal(STORAGE_KEY_COPIES, filteredCopies);

    if (isSupabaseConfigured && supabase) {
      await supabase.from('books').delete().eq('id', bookId);
    }

    await this.logActivity('BOOK_DELETED', 'books', `Removed book record ${bookId} from catalog`);
    return true;
  }

  // --------------------------------------------------------------------------
  // Physical Inventory & Copies
  // --------------------------------------------------------------------------

  static async getCopies(): Promise<BookCopy[]> {
    const books = await this.getBooks();
    const booksMap = new Map(books.map((b) => [b.id, b]));
    const copies = getLocal<BookCopy[]>(STORAGE_KEY_COPIES, initialCopies);

    return copies.map((c) => ({
      ...c,
      book: booksMap.get(c.book_id),
    }));
  }

  static async getCopyByInventoryCode(code: string): Promise<BookCopy | null> {
    const copies = await this.getCopies();
    const clean = code.trim().toUpperCase();
    return copies.find((c) => c.inventory_code.toUpperCase() === clean || c.barcode === clean) || null;
  }

  static async updateCopyStatus(copyId: string, status: CopyStatus, condition?: string): Promise<boolean> {
    const copies = getLocal<BookCopy[]>(STORAGE_KEY_COPIES, initialCopies);
    const copy = copies.find((c) => c.id === copyId);
    if (!copy) return false;

    copy.status = status;
    if (condition) copy.condition = condition;
    copy.updated_at = new Date().toISOString();

    setLocal(STORAGE_KEY_COPIES, copies);

    if (isSupabaseConfigured && supabase) {
      await supabase.from('book_copies').update({ status, condition: copy.condition }).eq('id', copyId);
    }

    await this.logActivity('COPY_UPDATED', 'book_copies', `Updated status of copy ${copy.inventory_code} to ${status}`);
    return true;
  }

  // --------------------------------------------------------------------------
  // Members Management
  // --------------------------------------------------------------------------

  static async getMembers(): Promise<Member[]> {
    const members = getLocal<Member[]>(STORAGE_KEY_MEMBERS, initialMembers);
    const loans = getLocal<BorrowTransaction[]>(STORAGE_KEY_LOANS, initialLoans);

    // Compute live active loan counts
    return members.map((m) => {
      const activeMemberLoans = loans.filter((l) => l.member_id === m.id && l.status === 'Active');
      return {
        ...m,
        active_loans_count: activeMemberLoans.reduce((sum, l) => sum + l.items.filter((i) => i.status === 'Borrowed').length, 0),
      };
    });
  }

  static async addMember(memberData: Omit<Member, 'id' | 'member_code' | 'created_at'>): Promise<Member> {
    const members = getLocal<Member[]>(STORAGE_KEY_MEMBERS, initialMembers);
    const count = members.length + 1;
    const memberCode = `MEM-${new Date().getFullYear()}-${count.toString().padStart(3, '0')}`;

    const newMember: Member = {
      ...memberData,
      id: crypto.randomUUID(),
      member_code: memberCode,
      registration_date: memberData.registration_date || new Date().toISOString().split('T')[0],
      membership_expiration_date: memberData.membership_expiration_date || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      active_loans_count: 0,
      created_at: new Date().toISOString(),
    };

    members.unshift(newMember);
    setLocal(STORAGE_KEY_MEMBERS, members);

    if (isSupabaseConfigured && supabase) {
      await supabase.from('members').insert(newMember);
    }

    await this.logActivity('MEMBER_REGISTERED', 'members', `Registered new member ${newMember.full_name} (${memberCode})`);
    return newMember;
  }

  static async updateMember(id: string, updates: Partial<Member>): Promise<boolean> {
    const members = getLocal<Member[]>(STORAGE_KEY_MEMBERS, initialMembers);
    const index = members.findIndex((m) => m.id === id);
    if (index === -1) return false;

    members[index] = { ...members[index], ...updates };
    setLocal(STORAGE_KEY_MEMBERS, members);

    if (isSupabaseConfigured && supabase) {
      await supabase.from('members').update(updates).eq('id', id);
    }

    await this.logActivity('MEMBER_UPDATED', 'members', `Updated details for member ${members[index].full_name}`);
    return true;
  }

  // --------------------------------------------------------------------------
  // Circulation: Borrowing Workflow
  // --------------------------------------------------------------------------

  static async borrowBooks(
    memberId: string,
    bookCopyIds: string[],
    loanDays = 14
  ): Promise<{ success: boolean; transaction?: BorrowTransaction; error?: string }> {
    const members = await this.getMembers();
    const member = members.find((m) => m.id === memberId);

    if (!member) {
      return { success: false, error: 'Member not found.' };
    }

    if (member.status !== 'Active') {
      return { success: false, error: `Member account is ${member.status}. Only Active members can borrow books.` };
    }

    const settings = this.getSettings();
    const currentActiveLoans = member.active_loans_count || 0;
    if (currentActiveLoans + bookCopyIds.length > settings.circulation_rules.max_loans_per_member) {
      return {
        success: false,
        error: `Borrow limit exceeded. Member has ${currentActiveLoans} active loans (limit is ${settings.circulation_rules.max_loans_per_member}).`,
      };
    }

    const copies = getLocal<BookCopy[]>(STORAGE_KEY_COPIES, initialCopies);
    const selectedCopies = copies.filter((c) => bookCopyIds.includes(c.id));

    // Verify all copies are available
    for (const copy of selectedCopies) {
      if (copy.status !== 'Available') {
        return {
          success: false,
          error: `Copy ${copy.inventory_code} is currently "${copy.status}" and cannot be checked out.`,
        };
      }
    }

    // Mark copies as Borrowed
    selectedCopies.forEach((c) => {
      c.status = 'Borrowed';
      c.updated_at = new Date().toISOString();
    });
    setLocal(STORAGE_KEY_COPIES, copies);

    // Compute due date
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + loanDays);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    const txCode = `TRX-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const txId = crypto.randomUUID();
    const newTransaction: BorrowTransaction = {
      id: txId,
      transaction_code: txCode,
      member_id: memberId,
      member,
      borrowed_at: new Date().toISOString(),
      due_date: dueDateStr,
      status: 'Active',
      created_at: new Date().toISOString(),
      items: selectedCopies.map((c) => ({
        id: crypto.randomUUID(),
        transaction_id: txId,
        book_copy_id: c.id,
        copy: c,
        late_fee: 0,
        status: 'Borrowed',
      })),
    };

    const loans = getLocal<BorrowTransaction[]>(STORAGE_KEY_LOANS, initialLoans);
    loans.unshift(newTransaction);
    setLocal(STORAGE_KEY_LOANS, loans);

    await this.logActivity(
      'BORROW_ISSUED',
      'borrow_transactions',
      `Issued loan ${txCode} (${selectedCopies.length} books) to ${member.full_name}`
    );

    return { success: true, transaction: newTransaction };
  }

  // --------------------------------------------------------------------------
  // Circulation: Returning Workflow
  // --------------------------------------------------------------------------

  static async returnBookCopy(
    inventoryCode: string,
    condition = 'Good',
    notes?: string
  ): Promise<{
    success: boolean;
    overdueDays?: number;
    lateFee?: number;
    transactionCode?: string;
    bookTitle?: string;
    error?: string;
  }> {
    const cleanCode = inventoryCode.trim().toUpperCase();
    const copies = getLocal<BookCopy[]>(STORAGE_KEY_COPIES, initialCopies);
    const copy = copies.find((c) => c.inventory_code.toUpperCase() === cleanCode || c.barcode === cleanCode);

    if (!copy) {
      return { success: false, error: `No physical copy found with code "${inventoryCode}".` };
    }

    const loans = getLocal<BorrowTransaction[]>(STORAGE_KEY_LOANS, initialLoans);
    let targetLoan: BorrowTransaction | undefined;
    let targetItemIndex = -1;

    for (const loan of loans) {
      const idx = loan.items.findIndex((item) => item.book_copy_id === copy.id && item.status === 'Borrowed');
      if (idx !== -1) {
        targetLoan = loan;
        targetItemIndex = idx;
        break;
      }
    }

    if (!targetLoan || targetItemIndex === -1) {
      return {
        success: false,
        error: `Copy ${copy.inventory_code} does not have an active borrowing record (current status: ${copy.status}).`,
      };
    }

    // Calculate overdue days & late fee
    const today = new Date().toISOString().split('T')[0];
    const dueDate = targetLoan.due_date;
    let overdueDays = 0;
    let lateFee = 0;

    if (today > dueDate) {
      const diffMs = new Date(today).getTime() - new Date(dueDate).getTime();
      overdueDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const dailyRate = this.getSettings().circulation_rules.daily_late_fee || 0.5;
      lateFee = Math.round(overdueDays * dailyRate * 100) / 100;
    }

    // Update item
    targetLoan.items[targetItemIndex].status = 'Returned';
    targetLoan.items[targetItemIndex].returned_at = new Date().toISOString();
    targetLoan.items[targetItemIndex].condition_on_return = condition;
    targetLoan.items[targetItemIndex].late_fee = lateFee;

    // Check if entire transaction is now completed
    const remainingBorrowed = targetLoan.items.filter((i) => i.status === 'Borrowed');
    if (remainingBorrowed.length === 0) {
      targetLoan.status = 'Completed';
      targetLoan.returned_at = new Date().toISOString();
    }

    setLocal(STORAGE_KEY_LOANS, loans);

    // Update physical copy status
    copy.status = condition === 'Damaged' || condition === 'Lost' ? 'Maintenance' : 'Available';
    copy.condition = condition;
    copy.notes = notes ? `${copy.notes ? copy.notes + ' | ' : ''}${notes}` : copy.notes;
    copy.updated_at = new Date().toISOString();
    setLocal(STORAGE_KEY_COPIES, copies);

    // Retrieve book title for feedback
    const books = await this.getBooks();
    const book = books.find((b) => b.id === copy.book_id);

    await this.logActivity(
      'BOOK_RETURNED',
      'borrow_transactions',
      `Processed return of copy ${copy.inventory_code} ("${book?.title || 'Book'}") with condition ${condition}. Overdue: ${overdueDays}d ($${lateFee.toFixed(2)})`
    );

    return {
      success: true,
      overdueDays,
      lateFee,
      transactionCode: targetLoan.transaction_code,
      bookTitle: book?.title,
    };
  }

  // --------------------------------------------------------------------------
  // Loans & History
  // --------------------------------------------------------------------------

  static async getLoans(): Promise<BorrowTransaction[]> {
    const loans = getLocal<BorrowTransaction[]>(STORAGE_KEY_LOANS, initialLoans);
    const members = await this.getMembers();
    const copies = await this.getCopies();

    const memberMap = new Map(members.map((m) => [m.id, m]));
    const copyMap = new Map(copies.map((c) => [c.id, c]));

    const today = new Date().toISOString().split('T')[0];

    return loans.map((l) => ({
      ...l,
      member: memberMap.get(l.member_id),
      status: l.status === 'Active' && l.due_date < today ? 'Overdue' : l.status,
      items: l.items.map((i) => ({
        ...i,
        copy: copyMap.get(i.book_copy_id),
      })),
    }));
  }

  // --------------------------------------------------------------------------
  // Audit Logs & Activity
  // --------------------------------------------------------------------------

  static async getLogs(): Promise<ActivityLog[]> {
    return getLocal<ActivityLog[]>(STORAGE_KEY_LOGS, initialLogs);
  }

  static async logActivity(action: string, entity_type: string, description: string): Promise<void> {
    const logs = getLocal<ActivityLog[]>(STORAGE_KEY_LOGS, initialLogs);
    const log: ActivityLog = {
      id: crypto.randomUUID(),
      action,
      entity_type,
      description,
      created_at: new Date().toISOString(),
    };
    logs.unshift(log);
    setLocal(STORAGE_KEY_LOGS, logs.slice(0, 100)); // maintain recent 100 logs
  }

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------

  static getSettings(): LibrarySettings {
    return getLocal<LibrarySettings>(STORAGE_KEY_SETTINGS, defaultSettings);
  }

  static updateSettings(settings: LibrarySettings): void {
    setLocal(STORAGE_KEY_SETTINGS, settings);
  }

  // --------------------------------------------------------------------------
  // Analytics & Summary Metrics
  // --------------------------------------------------------------------------

  static async getDashboardMetrics() {
    const books = await this.getBooks();
    const copies = await this.getCopies();
    const members = await this.getMembers();
    const loans = await this.getLoans();

    const totalBooks = books.length;
    const totalCopies = copies.length;
    const availableCopies = copies.filter((c) => c.status === 'Available').length;
    const borrowedCopies = copies.filter((c) => c.status === 'Borrowed').length;
    const maintenanceCopies = copies.filter((c) => c.status === 'Maintenance' || c.status === 'Damaged').length;

    const today = new Date().toISOString().split('T')[0];
    const activeLoans = loans.filter((l) => l.status === 'Active' || l.status === 'Overdue');
    const overdueLoans = loans.filter((l) => l.status === 'Overdue' || (l.status === 'Active' && l.due_date < today));

    const totalValuation = copies.reduce((sum, c) => sum + (c.acquisition_price || 0), 0);

    return {
      totalBooks,
      totalCopies,
      availableCopies,
      borrowedCopies,
      maintenanceCopies,
      totalMembers: members.length,
      activeLoansCount: activeLoans.length,
      overdueLoansCount: overdueLoans.length,
      totalValuation,
    };
  }

  static clearAllData(): void {
    setLocal(STORAGE_KEY_BOOKS, []);
    setLocal(STORAGE_KEY_COPIES, []);
    setLocal(STORAGE_KEY_MEMBERS, []);
    setLocal(STORAGE_KEY_LOANS, []);
    setLocal(STORAGE_KEY_LOGS, []);
  }
}
