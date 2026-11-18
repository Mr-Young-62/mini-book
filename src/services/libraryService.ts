import {
  Book,
  BookCopy,
  Member,
  ActivityLog,
  LibrarySettings,
  ScannedBookMetadata,
  CopyStatus,
} from '../types/library';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isValidIsbn, normalizeToIsbn13 } from './isbnValidator';

const STORAGE_KEY_BOOKS = 'readowl_data_books';
const STORAGE_KEY_COPIES = 'readowl_data_copies';
const STORAGE_KEY_MEMBERS = 'readowl_data_members';
const STORAGE_KEY_LOGS = 'readowl_data_logs';
const STORAGE_KEY_SETTINGS = 'readowl_data_settings';

// Default initial settings
export const defaultSettings: LibrarySettings = {
  library_info: {
    name: 'MeelieFont Library',
    code: 'RDW-01',
    address: '',
    phone: '',
    email: '',
    currency: 'IDR',
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
const initialLogs: ActivityLog[] = [];

// Helper to load or initialize local storage database
function getLocal<T>(key: string, defaultVal: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      localStorage.setItem(key, JSON.stringify(defaultVal));
      return defaultVal;
    }
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Could not read local library data "${key}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

function setLocal<T>(key: string, val: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (err) {
    console.error('Storage write error:', err);
    throw new Error(`Could not save local library data "${key}": ${err instanceof Error ? err.message : String(err)}`);
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
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { data, error } = await supabase
        .from('books')
        .select(`
          *,
          publisher:publishers(id, name),
          authors:book_authors(author:authors(id, name)),
          categories:book_categories(category:categories(id, name))
        `)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const books = data || [];
      const copiesByBook = new Map<string, any[]>();
      if (books.length > 0) {
        // Read from the catalog-safe view so Members never receive acquisition data.
        const { data: copies, error: copiesError } = await supabase
          .from('book_copies_public')
          .select('*')
          .in('book_id', books.map((book: any) => book.id));
        if (copiesError) throw copiesError;
        for (const copy of copies || []) {
          const list = copiesByBook.get(copy.book_id) || [];
          list.push(copy);
          copiesByBook.set(copy.book_id, list);
        }
      }

      return books.map((b: any) => ({
        ...b,
        authors: b.authors?.map((a: any) => a.author).filter(Boolean) || [],
        categories: b.categories?.map((c: any) => c.category).filter(Boolean) || [],
        copies: copiesByBook.get(b.id) || [],
      }));
    }

    // Local Storage Fallback
    const books: Book[] = getLocal(STORAGE_KEY_BOOKS, initialBooks);
    const copies: BookCopy[] = getLocal(STORAGE_KEY_COPIES, initialCopies);

    return books
      .filter((b) => !b.deleted_at)
      .map((b) => ({
        ...b,
        copies: copies.filter((c) => c.book_id === b.id),
      }));
  }

  static async getBookByIsbn(isbn: string): Promise<Book | null> {
    const isbn13 = normalizeToIsbn13(isbn);

    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { data, error } = await supabase
        .from('books')
        .select(`
          *,
          publisher:publishers(id, name),
          authors:book_authors(author:authors(id, name)),
          categories:book_categories(category:categories(id, name))
        `)
        .eq('isbn_13', isbn13)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const { data: copies, error: copiesError } = await supabase
        .from('book_copies_public')
        .select('*')
        .eq('book_id', data.id);
      if (copiesError) throw copiesError;

      return {
        ...data,
        authors: (data as any).authors?.map((a: any) => a.author).filter(Boolean) || [],
        categories: (data as any).categories?.map((c: any) => c.category).filter(Boolean) || [],
        copies: copies || [],
      };
    }

    const books = getLocal<Book[]>(STORAGE_KEY_BOOKS, initialBooks);
    return books.find((b) => !b.deleted_at && (b.isbn_13 === isbn13 || b.isbn_10 === isbn)) || null;
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
  ): Promise<{ book: Book; newCopies: BookCopy[] }> {
    const isbn13 = normalizeToIsbn13(metadata.isbn13);
    if (!isValidIsbn(isbn13)) throw new Error('Book ISBN is invalid.');
    if (!metadata.title.trim()) throw new Error('Book title is required.');
    if (!Number.isInteger(inventoryParams.copyCount) || inventoryParams.copyCount < 1 || inventoryParams.copyCount > 20) {
      throw new Error('Copy count must be between 1 and 20.');
    }
    if (!inventoryParams.shelfLocation.trim() || !inventoryParams.rackNumber.trim()) {
      throw new Error('Shelf location and rack number are required.');
    }
    if (!['Like New', 'Good', 'Fair', 'Worn'].includes(inventoryParams.condition)) {
      throw new Error('Unsupported book condition.');
    }
    if (!Number.isFinite(inventoryParams.acquisitionPrice) || inventoryParams.acquisitionPrice < 0) {
      throw new Error('Acquisition price cannot be negative.');
    }
    const normalizedCover = normalizeCoverUrl(metadata.coverUrl);

    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { data, error } = await supabase.rpc('add_book_with_copies_atomic', {
        p_isbn_10: metadata.isbn10 || null,
        p_isbn_13: isbn13,
        p_title: metadata.title.trim(),
        p_subtitle: metadata.subtitle || null,
        p_description: metadata.description || null,
        p_publication_year: metadata.publicationYear || null,
        p_language: metadata.language || 'en',
        p_page_count: metadata.pageCount || null,
        p_publisher: metadata.publisher || null,
        p_cover_url: normalizedCover || null,
        p_metadata_source: metadata.source,
        p_authors: metadata.authors.filter(Boolean),
        p_categories: metadata.categories.filter(Boolean),
        p_copy_count: inventoryParams.copyCount,
        p_shelf_location: inventoryParams.shelfLocation.trim(),
        p_rack_number: inventoryParams.rackNumber.trim(),
        p_condition: inventoryParams.condition,
        p_acquisition_price: inventoryParams.acquisitionPrice,
        p_acquisition_source: inventoryParams.acquisitionSource || 'Direct Purchase',
      });
      if (error) throw error;
      if (!data?.book_id || !Array.isArray(data.copies) || data.copies.length !== inventoryParams.copyCount) {
        throw new Error('Catalog operation returned an invalid result. Check the catalog before retrying.');
      }

      const createdAt = new Date().toISOString();
      const book: Book = {
        id: data.book_id,
        isbn_10: metadata.isbn10,
        isbn_13: isbn13,
        title: metadata.title.trim(),
        subtitle: metadata.subtitle,
        description: metadata.description,
        publication_year: metadata.publicationYear,
        language: metadata.language || 'en',
        page_count: metadata.pageCount,
        cover_url: normalizedCover,
        metadata_source: metadata.source,
        created_at: createdAt,
        authors: [],
        categories: [],
      };
      const newCopies: BookCopy[] = (data.copies || []).map((copy: any) => ({
        ...copy,
        book_id: book.id,
        shelf_location: inventoryParams.shelfLocation.trim(),
        rack_number: inventoryParams.rackNumber.trim(),
        condition: inventoryParams.condition,
        acquisition_date: createdAt.split('T')[0],
        acquisition_price: inventoryParams.acquisitionPrice,
        acquisition_source: inventoryParams.acquisitionSource || 'Direct Purchase',
        status: 'Available',
        created_at: createdAt,
      }));

      return { book, newCopies };
    }

    const books = getLocal<Book[]>(STORAGE_KEY_BOOKS, initialBooks);
    const copies = getLocal<BookCopy[]>(STORAGE_KEY_COPIES, initialCopies);
    const originalBooks = books.map((book) => ({ ...book }));
    const originalCopies = copies.map((copy) => ({ ...copy }));

    // Check if an active book already exists. Archived records are ignored so
    // re-cataloging a removed ISBN creates a fresh active record.
    let existingBook = books.find((b) => !b.deleted_at && b.isbn_13 === isbn13);
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
    } else if (!existingBook.cover_url && normalizedCover) {
      existingBook.cover_url = normalizedCover;
      existingBook.updated_at = new Date().toISOString();
      existingBook.metadata_source = existingBook.metadata_source || metadata.source;
      const idx = books.findIndex((b) => b.id === existingBook?.id);
      if (idx >= 0) books[idx] = existingBook;
    }

    // Generate physical copies (inventory codes are globally sequential; barcodes stay unique)
    const newCopies: BookCopy[] = [];
    const codePrefix = this.getSettings().inventory_config.code_prefix || 'RDW';
    const highestNum = copies.reduce((max, c) => {
      const prefix = `${codePrefix}-`;
      if (!c.inventory_code.startsWith(prefix)) return max;
      const num = Number(c.inventory_code.slice(prefix.length));
      return Number.isInteger(num) && num > max ? num : max;
    }, 0);

    for (let i = 0; i < inventoryParams.copyCount; i++) {
      const copyNum = highestNum + i + 1;
      const invCode = `${codePrefix}-${copyNum.toString().padStart(6, '0')}`;
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

    try {
      setLocal(STORAGE_KEY_BOOKS, books);
      setLocal(STORAGE_KEY_COPIES, copies);
    } catch (error) {
      try {
        setLocal(STORAGE_KEY_BOOKS, originalBooks);
        setLocal(STORAGE_KEY_COPIES, originalCopies);
      } catch (rollbackError) {
        throw new Error(
          `Catalog save failed and local rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
        );
      }
      throw error;
    }

    // Activity log
    await this.logActivity(
      'BOOK_ADDED',
      'books',
      `Cataloged "${metadata.title}" (${isbn13}) with ${inventoryParams.copyCount} physical copy(ies)`
    );

    return { book: existingBook, newCopies };
  }

  static async deleteBook(bookId: string): Promise<boolean> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');

      const { count, error: countError } = await supabase
        .from('book_copies')
        .select('id', { count: 'exact', head: true })
        .eq('book_id', bookId);
      if (countError) throw countError;

      // Keep copies and acquisition history. Only the catalog record is archived.
      if ((count ?? 0) > 0) {
        const { data, error } = await supabase
          .from('books')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', bookId)
          .is('deleted_at', null)
          .select('id')
          .maybeSingle();
        if (error) throw error;
        if (!data) return false;
        await this.logActivity(
          'BOOK_ARCHIVED',
          'books',
          `Archived book record ${bookId}; physical copies and acquisition history retained`,
        );
        return true;
      }

      const { data, error } = await supabase.from('books').delete().eq('id', bookId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return false;
      await this.logActivity('BOOK_DELETED', 'books', `Removed book record ${bookId} from catalog`);
      return true;
    }

    const books = getLocal<Book[]>(STORAGE_KEY_BOOKS, initialBooks);
    const copies = getLocal<BookCopy[]>(STORAGE_KEY_COPIES, initialCopies);
    const book = books.find((b) => b.id === bookId);
    if (!book) return false;

    const bookCopies = copies.filter((c) => c.book_id === bookId);
    if (bookCopies.length > 0) {
      const archivedBooks = books.map((b) =>
        b.id === bookId ? { ...b, deleted_at: new Date().toISOString() } : b,
      );
      setLocal(STORAGE_KEY_BOOKS, archivedBooks);
      await this.logActivity(
        'BOOK_ARCHIVED',
        'books',
        `Archived book record ${bookId}; physical copies and acquisition history retained`,
      );
      return true;
    }

    const originalBooks = [...books];
    const originalCopies = [...copies];

    const filteredBooks = books.filter((b) => b.id !== bookId);
    const filteredCopies = copies.filter((c) => c.book_id !== bookId);

    try {
      setLocal(STORAGE_KEY_BOOKS, filteredBooks);
      setLocal(STORAGE_KEY_COPIES, filteredCopies);
    } catch (error) {
      try {
        setLocal(STORAGE_KEY_BOOKS, originalBooks);
        setLocal(STORAGE_KEY_COPIES, originalCopies);
      } catch (rollbackError) {
        throw new Error(
          `Book deletion failed and local rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
        );
      }
      throw error;
    }

    await this.logActivity('BOOK_DELETED', 'books', `Removed book record ${bookId} from catalog`);
    return true;
  }

  // --------------------------------------------------------------------------
  // Physical Inventory & Copies
  // --------------------------------------------------------------------------

  static async getCopies(): Promise<BookCopy[]> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { data, error } = await supabase
        .from('book_copies')
        .select(`
          *,
          book:books(
            *,
            publisher:publishers(id, name),
            authors:book_authors(author:authors(id, name)),
            categories:book_categories(category:categories(id, name))
          )
        `)
        .order('inventory_code', { ascending: true });

      if (error) throw error;
      return (data || []).map((copy: any) => ({
        ...copy,
        book: copy.book
          ? {
              ...copy.book,
              authors: copy.book.authors?.map((a: any) => a.author).filter(Boolean) || [],
              categories: copy.book.categories?.map((c: any) => c.category).filter(Boolean) || [],
            }
          : undefined,
      }));
    }

    const books = getLocal<Book[]>(STORAGE_KEY_BOOKS, initialBooks);
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
    return copies.find((c) =>
      c.inventory_code.toUpperCase() === clean || c.barcode.toUpperCase() === clean
    ) || null;
  }

  static async updateCopyStatus(copyId: string, status: CopyStatus, condition?: string): Promise<boolean> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { data, error } = await supabase.from('book_copies').update({
        status,
        ...(condition ? { condition } : {}),
        updated_at: new Date().toISOString(),
      }).eq('id', copyId).select('id').maybeSingle();
      if (error) throw error;
      if (!data) return false;
      await this.logActivity('COPY_UPDATED', 'book_copies', `Updated status of copy ${copyId} to ${status}`);
      return true;
    }

    const copies = getLocal<BookCopy[]>(STORAGE_KEY_COPIES, initialCopies);
    const copy = copies.find((c) => c.id === copyId);
    if (!copy) return false;

    copy.status = status;
    if (condition) copy.condition = condition;
    copy.updated_at = new Date().toISOString();

    setLocal(STORAGE_KEY_COPIES, copies);

    await this.logActivity('COPY_UPDATED', 'book_copies', `Updated status of copy ${copy.inventory_code} to ${status}`);
    return true;
  }

  // --------------------------------------------------------------------------
  // Members Management
  // --------------------------------------------------------------------------

  static async getMembers(): Promise<Member[]> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }

    return getLocal<Member[]>(STORAGE_KEY_MEMBERS, initialMembers);
  }

  static async countMembers(): Promise<number> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      // Only fetch the count so personal member data never reaches the browser.
      const { count, error } = await supabase
        .from('members')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    }

    return getLocal<Member[]>(STORAGE_KEY_MEMBERS, initialMembers).length;
  }

  static async addMember(memberData: Omit<Member, 'id' | 'member_code' | 'created_at'>): Promise<Member> {
    const now = new Date();
    const year = now.getFullYear();
    const memberCode = `MEM-${year}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const newMember: Member = {
      ...memberData,
      id: crypto.randomUUID(),
      member_code: memberCode,
      registration_date: memberData.registration_date || now.toISOString().split('T')[0],
      membership_expiration_date: memberData.membership_expiration_date || new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      created_at: now.toISOString(),
    };

    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { data, error } = await supabase.from('members').insert({
        id: newMember.id,
        member_code: newMember.member_code,
        full_name: newMember.full_name,
        email: newMember.email,
        phone: newMember.phone,
        address: newMember.address,
        registration_date: newMember.registration_date,
        membership_expiration_date: newMember.membership_expiration_date,
        membership_type: newMember.membership_type,
        status: newMember.status,
        profile_photo_url: newMember.profile_photo_url,
      }).select('*').single();
      if (error) throw error;
      await this.logActivity('MEMBER_REGISTERED', 'members', `Registered new member ${data.full_name} (${data.member_code})`);
      return data;
    }

    const members = getLocal<Member[]>(STORAGE_KEY_MEMBERS, initialMembers);

    members.unshift(newMember);
    setLocal(STORAGE_KEY_MEMBERS, members);

    await this.logActivity('MEMBER_REGISTERED', 'members', `Registered new member ${newMember.full_name} (${memberCode})`);
    return newMember;
  }

  static async updateMember(id: string, updates: Partial<Member>): Promise<boolean> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { data, error } = await supabase.from('members')
        .update({
          ...(updates.full_name !== undefined ? { full_name: updates.full_name } : {}),
          ...(updates.email !== undefined ? { email: updates.email } : {}),
          ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
          ...(updates.address !== undefined ? { address: updates.address } : {}),
          ...(updates.membership_expiration_date !== undefined ? { membership_expiration_date: updates.membership_expiration_date } : {}),
          ...(updates.membership_type !== undefined ? { membership_type: updates.membership_type } : {}),
          ...(updates.status !== undefined ? { status: updates.status } : {}),
          ...(updates.profile_photo_url !== undefined ? { profile_photo_url: updates.profile_photo_url } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      await this.logActivity('MEMBER_UPDATED', 'members', `Updated member ${id}`);
      return Boolean(data);
    }

    const members = getLocal<Member[]>(STORAGE_KEY_MEMBERS, initialMembers);
    const index = members.findIndex((m) => m.id === id);
    if (index === -1) return false;

    members[index] = { ...members[index], ...updates };
    setLocal(STORAGE_KEY_MEMBERS, members);

    await this.logActivity('MEMBER_UPDATED', 'members', `Updated details for member ${members[index].full_name}`);
    return true;
  }

  // --------------------------------------------------------------------------
  // Audit Logs & Activity
  // --------------------------------------------------------------------------

  static async getLogs(): Promise<ActivityLog[]> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    }
    return getLocal<ActivityLog[]>(STORAGE_KEY_LOGS, initialLogs);
  }

  static async logActivity(action: string, entity_type: string, description: string): Promise<void> {
    if (isSupabaseConfigured) {
      if (!supabase) {
        console.error('Activity could not be recorded: Supabase client is unavailable.');
        return;
      }
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error('Activity could not be recorded:', sessionError.message);
        return;
      }
      const { error } = await supabase.from('activity_logs').insert({
        user_id: session?.user.id || null,
        action,
        entity_type,
        description,
      });
      if (error) console.error('Activity could not be recorded:', error.message);
      return;
    }

    const logs = getLocal<ActivityLog[]>(STORAGE_KEY_LOGS, initialLogs);
    const log: ActivityLog = {
      id: crypto.randomUUID(),
      action,
      entity_type,
      description,
      created_at: new Date().toISOString(),
    };
    logs.unshift(log);
    try {
      setLocal(STORAGE_KEY_LOGS, logs.slice(0, 100));
    } catch (error) {
      console.error('Activity could not be recorded:', error);
    }
  }

  // --------------------------------------------------------------------------
  // Settings
  // --------------------------------------------------------------------------

  static getSettings(): LibrarySettings {
    const stored = getLocal<LibrarySettings>(STORAGE_KEY_SETTINGS, defaultSettings);
    const libraryInfo = { ...defaultSettings.library_info, ...stored.library_info };
    if (libraryInfo.name === 'Readowl Community Library') libraryInfo.name = 'MeelieFont Library';
    if (libraryInfo.email === 'contact@readowl.library') libraryInfo.email = '';
    // Normalize the historical seed values for installations that still have
    // them in local storage. Values edited by the user are left untouched.
    if (libraryInfo.address === '452 Bookkeeper Way, Alexandria, VA') libraryInfo.address = '';
    if (libraryInfo.phone === '+1 (555) 234-5678') libraryInfo.phone = '';
    if (libraryInfo.currency === '$') libraryInfo.currency = 'IDR';
    return {
      library_info: libraryInfo,
      inventory_config: { ...defaultSettings.inventory_config, ...stored.inventory_config },
    };
  }

  static async loadCloudSettings(): Promise<LibrarySettings> {
    if (!isSupabaseConfigured) return this.getSettings();
    if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');

    const { data, error } = await supabase
      .from('settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['library_info', 'inventory_config']);
    if (error) throw error;

    const values = new Map((data || []).map((row: any) => [row.setting_key, row.setting_value]));
    const settings: LibrarySettings = {
      library_info: { ...defaultSettings.library_info, ...(values.get('library_info') || {}) },
      inventory_config: { ...defaultSettings.inventory_config, ...(values.get('inventory_config') || {}) },
    };
    setLocal(STORAGE_KEY_SETTINGS, settings);
    return settings;
  }

  static async updateSettings(settings: LibrarySettings): Promise<void> {
    if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(settings.inventory_config.code_prefix)) {
      throw new Error('Inventory code prefix may contain letters, numbers, and single hyphens only.');
    }

    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { error } = await supabase.from('settings').upsert([
        { setting_key: 'library_info', setting_value: settings.library_info },
        { setting_key: 'inventory_config', setting_value: settings.inventory_config },
      ], { onConflict: 'setting_key' });
      if (error) throw error;
    }
    setLocal(STORAGE_KEY_SETTINGS, settings);
  }
}
