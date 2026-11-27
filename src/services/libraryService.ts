import {
  Book,
  ActivityLog,
  LibrarySettings,
  ScannedBookMetadata,
} from '../types/library';
import { getErrorMessage, getSupabaseErrorMessage } from '../lib/errorMessage';
import { normalizeStockCount } from '../lib/stock';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { cleanIsbn, isValidIsbn, normalizeToIsbn13 } from './isbnValidator';

const COVER_BUCKET = 'book-covers';

const STORAGE_KEY_BOOKS = 'readowl_data_books';
const STORAGE_KEY_LOGS = 'readowl_data_logs';
const STORAGE_KEY_SETTINGS = 'readowl_data_settings';
const STORAGE_KEY_STOCK_OVERRIDES = 'readowl_book_stock_overrides';

function readStockOverrides(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STOCK_OVERRIDES);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveStockOverride(bookId: string, isbn13: string, stockCount: number): void {
  try {
    const map = readStockOverrides();
    map[bookId] = stockCount;
    if (isbn13) map[`isbn:${isbn13}`] = stockCount;
    localStorage.setItem(STORAGE_KEY_STOCK_OVERRIDES, JSON.stringify(map));
  } catch {
    /* ignore storage quota errors on fallback mirror */
  }
}

function removeStockOverride(bookId: string, isbn13?: string): void {
  try {
    const map = readStockOverrides();
    let changed = false;
    if (bookId in map) {
      delete map[bookId];
      changed = true;
    }
    if (isbn13 && `isbn:${isbn13}` in map) {
      delete map[`isbn:${isbn13}`];
      changed = true;
    }
    if (changed) {
      localStorage.setItem(STORAGE_KEY_STOCK_OVERRIDES, JSON.stringify(map));
    }
  } catch {
    /* ignore storage errors */
  }
}

function resolveStockCount(rawBook: { id: string; isbn_13?: string; stock_count?: number | null }): number {
  if (typeof rawBook.stock_count === 'number' && Number.isFinite(rawBook.stock_count) && rawBook.stock_count >= 1) {
    return normalizeStockCount(rawBook.stock_count);
  }
  const overrides = readStockOverrides();
  const byId = overrides[rawBook.id];
  if (typeof byId === 'number') return normalizeStockCount(byId);
  const byIsbn = rawBook.isbn_13 ? overrides[`isbn:${rawBook.isbn_13}`] : undefined;
  if (typeof byIsbn === 'number') return normalizeStockCount(byIsbn);
  return 1;
}

function isMissingStockColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String(error.code) : '';
  const message = 'message' in error ? String(error.message).toLowerCase() : '';
  return code === '42703' || code === 'PGRST204' || message.includes('stock_count');
}

async function syncCloudStockCount(bookId: string, isbn13: string, stockCount: number): Promise<void> {
  const normalized = normalizeStockCount(stockCount);
  if (!supabase) {
    saveStockOverride(bookId, isbn13, normalized);
    return;
  }
  const { error } = await supabase
    .from('books')
    .update({ stock_count: normalized })
    .eq('id', bookId);

  if (!error) {
    removeStockOverride(bookId, isbn13);
    return;
  }
  if (isMissingStockColumnError(error)) {
    saveStockOverride(bookId, isbn13, normalized);
    return;
  }
  throw new Error(getSupabaseErrorMessage(error));
}

// Default initial settings
export const defaultSettings: LibrarySettings = {
  library_info: {
    name: 'Perpustakaan MeelieFont',
    code: 'RDW-01',
    address: '',
    phone: '',
    email: '',
    currency: 'IDR',
  },
};

// Initial clean library state (zero dummy records)
const initialBooks: Book[] = [];
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
    throw new Error(`Could not read local library data "${key}": ${getErrorMessage(error)}`);
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

  static async getBooks({ limit: take = 50, skip = 0 } = {}): Promise<Book[]> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { data, error: supabaseError } = await supabase
        .from('books')
        .select(`
          *,
          publisher:publishers(id, name),
          authors:book_authors(author:authors(id, name)),
          categories:book_categories(category:categories(id, name))
        `, { count: 'exact' })
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(skip, skip + take - 1);

      if (supabaseError) throw supabaseError;

      const books = data || [];
      return books.map((b: any) => ({
        ...b,
        stock_count: resolveStockCount(b),
        authors: b.authors?.map((a: any) => a.author).filter(Boolean) || [],
        categories: b.categories?.map((c: any) => c.category).filter(Boolean) || [],
      }));
    }

    // Local Storage Fallback
    const books: Book[] = getLocal(STORAGE_KEY_BOOKS, initialBooks);
    return books
      .filter((b) => !b.deleted_at)
      .map((b) => ({
        ...b,
        stock_count: resolveStockCount(b),
      }));
  }

  /**
   * Return every active book.
   *
   * The catalogue screens used to call `getBooks({ limit: 20, skip: 0 })`, so any
   * book past the first 20 was silently invisible (list, search, category counts
   * and report totals were all truncated). This pages through `getBooks` instead.
   *
   * The local-storage branch ignores `limit`/`skip` and returns everything at
   * once, so the `added === 0` guard stops the loop as soon as a page brings no
   * new ids — that also protects against a server that ignores `skip`.
   */
  static async getAllBooks(pageSize = 200): Promise<Book[]> {
    const all: Book[] = [];
    const seen = new Set<string>();
    const maxPages = 500;

    for (let skip = 0, pages = 0; pages < maxPages; skip += pageSize, pages += 1) {
      const page = await LibraryService.getBooks({ limit: pageSize, skip });
      let added = 0;
      for (const book of page) {
        if (seen.has(book.id)) continue;
        seen.add(book.id);
        all.push(book);
        added += 1;
      }
      // Short page => no more data. No new ids => the source is not honouring skip.
      if (page.length < pageSize || added === 0) break;
    }

    return all;
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

      if (error) throw new Error(getSupabaseErrorMessage(error));
      if (!data) return null;

      return {
        ...data,
        stock_count: resolveStockCount(data as any),
        authors: (data as any).authors?.map((a: any) => a.author).filter(Boolean) || [],
        categories: (data as any).categories?.map((c: any) => c.category).filter(Boolean) || [],
      };
    }

    const books = getLocal<Book[]>(STORAGE_KEY_BOOKS, initialBooks);
    const cleanedInput = cleanIsbn(isbn);
    const matched = books.find((b) => !b.deleted_at && (b.isbn_13 === isbn13 || (b.isbn_10 && cleanIsbn(b.isbn_10) === cleanedInput))) || null;
    return matched ? { ...matched, stock_count: resolveStockCount(matched) } : null;
  }

  static async addBook(metadata: ScannedBookMetadata): Promise<{ book: Book }> {
    const isbn13 = normalizeToIsbn13(metadata.isbn13);
    if (!isValidIsbn(isbn13)) throw new Error('Book ISBN is invalid.');
    if (!metadata.title.trim()) throw new Error('Book title is required.');
    const stockCount = normalizeStockCount(metadata.stockCount);
    let coverPath: string | undefined;
    const normalizedCover = normalizeCoverUrl(metadata.coverUrl);

    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      if (metadata.coverUrl && metadata.coverUrl.startsWith('data:')) {
        const base64Data = metadata.coverUrl.split(',')[1];
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const fileBlob = new Blob([byteArray], { type: 'image/jpeg' });
        // Single filename for upload + public URL: previously Date.now() was called
        // three times, so getPublicUrl() pointed at a file that was never uploaded.
        const coverFileName = `${Date.now()}-${metadata.isbn13}.jpg`;
        const { data, error } = await supabase.storage.from(COVER_BUCKET).upload(
          coverFileName,
          fileBlob,
          { contentType: 'image/jpeg' }
        );
        if (error) throw new Error(getSupabaseErrorMessage(error));
        const { data: publicUrlData } = await supabase.storage.from(COVER_BUCKET).getPublicUrl(
          coverFileName
        );
        coverPath = publicUrlData.publicUrl || `/${COVER_BUCKET}/${coverFileName}`;
      } else {
        coverPath = normalizedCover;
      }
      const { data, error } = await supabase.rpc('add_book_atomic', {
        p_isbn_10: metadata.isbn10 || null,
        p_isbn_13: isbn13,
        p_title: metadata.title.trim(),
        p_subtitle: metadata.subtitle || null,
        p_description: metadata.description || null,
        p_publication_year: metadata.publicationYear || null,
        p_language: metadata.language || 'en',
        p_page_count: metadata.pageCount || null,
        p_publisher: metadata.publisher || null,
        p_cover_url: coverPath || null,
        p_metadata_source: metadata.source,
        p_authors: metadata.authors.filter(Boolean),
        p_categories: metadata.categories.filter(Boolean),
      });
      if (error) throw new Error(getSupabaseErrorMessage(error));
      if (!data?.book_id) {
        throw new Error('Catalog operation returned an invalid result. Check the catalog before retrying.');
      }
      await syncCloudStockCount(data.book_id, isbn13, stockCount);
      return {
        book: {
          id: data.book_id,
          isbn_10: metadata.isbn10,
          isbn_13: isbn13,
          title: metadata.title.trim(),
          subtitle: metadata.subtitle,
          description: metadata.description,
          publication_year: metadata.publicationYear,
          language: metadata.language || 'en',
          page_count: metadata.pageCount,
          stock_count: stockCount,
          cover_url: coverPath || normalizedCover,
          metadata_source: metadata.source,
          created_at: new Date().toISOString(),
          authors: metadata.authors.filter(Boolean).map((name, index) => ({
            id: crypto.randomUUID(),
            name,
          })),
          categories: metadata.categories.filter(Boolean).map((name, index) => ({
            id: crypto.randomUUID(),
            name,
          })),
        },
      };
    }

    const books = getLocal<Book[]>(STORAGE_KEY_BOOKS, initialBooks);
    const originalBooks = books.map((book) => ({ ...book }));

    // Archived records are ignored so re-cataloging a removed ISBN creates a fresh active record.
    let book = books.find((b) => !b.deleted_at && b.isbn_13 === isbn13);
    if (!book) {
      book = {
        id: crypto.randomUUID(),
        isbn_10: metadata.isbn10,
        isbn_13: isbn13,
        title: metadata.title,
        subtitle: metadata.subtitle,
        description: metadata.description,
        publication_year: metadata.publicationYear,
        language: metadata.language || 'en',
        page_count: metadata.pageCount,
        stock_count: stockCount,
        publisher: metadata.publisher ? { id: crypto.randomUUID(), name: metadata.publisher } : undefined,
        cover_url: normalizedCover,
        metadata_source: metadata.source,
        created_at: new Date().toISOString(),
        authors: metadata.authors.filter(Boolean).map((name) => ({ id: crypto.randomUUID(), name })),
        categories: metadata.categories.filter(Boolean).map((name) => ({ id: crypto.randomUUID(), name })),
      };
      books.unshift(book);
    } else {
      book.stock_count = stockCount;
      book.updated_at = new Date().toISOString();
      if (!book.cover_url && normalizedCover) {
        book.cover_url = normalizedCover;
        book.metadata_source = book.metadata_source || metadata.source;
      }
      const idx = books.findIndex((b) => b.id === book?.id);
      if (idx >= 0) books[idx] = book;
    }

    try {
      setLocal(STORAGE_KEY_BOOKS, books);
    } catch (error) {
      try {
        setLocal(STORAGE_KEY_BOOKS, originalBooks);
      } catch (rollbackError) {
        throw new Error(
          `Catalog save failed and local rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
        );
      }
      throw error;
    }

    await this.logActivity('BOOK_ADDED', 'books', `Cataloged "${metadata.title}" (${isbn13})`);
    return { book };
  }

  static async updateBook(book: Book, metadata: ScannedBookMetadata): Promise<Book> {
    const isbn13 = normalizeToIsbn13(metadata.isbn13);
    if (!isValidIsbn(isbn13)) throw new Error('Book ISBN is invalid.');
    if (!metadata.title.trim()) throw new Error('Book title is required.');

    const normalizedCover = normalizeCoverUrl(metadata.coverUrl);
    const positiveInt = (value?: number): number | undefined =>
      typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
    const stockCount = normalizeStockCount(metadata.stockCount ?? book.stock_count);
    const updated: Book = {
      ...book,
      isbn_10: metadata.isbn10?.trim() || undefined,
      isbn_13: isbn13,
      title: metadata.title.trim(),
      subtitle: metadata.subtitle?.trim() || undefined,
      description: metadata.description?.trim() || undefined,
      publication_year: positiveInt(metadata.publicationYear),
      language: metadata.language?.trim() || 'en',
      page_count: positiveInt(metadata.pageCount),
      stock_count: stockCount,
      publisher: metadata.publisher?.trim()
        ? { id: book.publisher?.id ?? crypto.randomUUID(), name: metadata.publisher.trim() }
        : undefined,
      cover_url: normalizedCover,
      metadata_source: 'manual',
      updated_at: new Date().toISOString(),
      authors: metadata.authors.map((name, index) => ({
        id: book.authors[index]?.id ?? crypto.randomUUID(),
        name: name.trim(),
      })).filter((author) => author.name),
      categories: metadata.categories.map((name, index) => ({
        id: book.categories[index]?.id ?? crypto.randomUUID(),
        name: name.trim(),
      })).filter((category) => category.name),
    };

    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { error } = await supabase.rpc('update_book_atomic', {
        p_book_id: book.id,
        p_isbn_10: updated.isbn_10 || null,
        p_isbn_13: isbn13,
        p_title: updated.title,
        p_subtitle: updated.subtitle || null,
        p_description: updated.description || null,
        p_publication_year: updated.publication_year || null,
        p_language: updated.language || 'en',
        p_page_count: updated.page_count || null,
        p_publisher: updated.publisher?.name || null,
        p_cover_url: updated.cover_url || null,
        p_metadata_source: updated.metadata_source || 'manual',
        p_authors: updated.authors.map((author) => author.name),
        p_categories: updated.categories.map((category) => category.name),
      });
      if (error) throw new Error(getSupabaseErrorMessage(error));
      await syncCloudStockCount(book.id, isbn13, stockCount);
      return updated;
    }

    const books = getLocal<Book[]>(STORAGE_KEY_BOOKS, initialBooks);
    const originalBooks = books.map((item) => ({ ...item }));
    const index = books.findIndex((item) => item.id === book.id && !item.deleted_at);
    if (index < 0) throw new Error('Book not found or archived.');
    books[index] = updated;

    try {
      setLocal(STORAGE_KEY_BOOKS, books);
    } catch (error) {
      try {
        setLocal(STORAGE_KEY_BOOKS, originalBooks);
      } catch (rollbackError) {
        throw new Error(
          `Catalog save failed and local rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
        );
      }
      throw error;
    }

    await this.logActivity('BOOK_UPDATED', 'books', `Updated "${updated.title}" (${isbn13})`);
    return updated;
  }

  static async deleteBook(bookId: string): Promise<boolean> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { data: activeLoan, error: loanError } = await supabase
        .from('loans')
        .select('id')
        .eq('book_id', bookId)
        .is('returned_at', null)
        .maybeSingle();
      if (loanError && loanError.code !== '42P01' && loanError.code !== 'PGRST205') {
        throw new Error(getSupabaseErrorMessage(loanError));
      }
      if (activeLoan) throw new Error('Buku tidak dapat diarsipkan karena masih sedang dipinjam.');

      const { data, error } = await supabase
        .from('books')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', bookId)
        .is('deleted_at', null)
        .select('id')
        .maybeSingle();
      if (error) throw new Error(getSupabaseErrorMessage(error));
      if (!data) return false;
      await this.logActivity('BOOK_ARCHIVED', 'books', `Archived book record ${bookId}`);
      return true;
    }

    let localActiveLoan = false;
    try {
      const raw = localStorage.getItem('readowl_data_loans');
      const localLoans = raw ? JSON.parse(raw) : [];
      if (Array.isArray(localLoans)) {
        localActiveLoan = localLoans.some(
          (l: any) => l.book_id === bookId && !l.returned_at,
        );
      }
    } catch {
      // ignore malformed local loan data
    }
    if (localActiveLoan) throw new Error('Buku tidak dapat diarsipkan karena masih sedang dipinjam.');

    const books = getLocal<Book[]>(STORAGE_KEY_BOOKS, initialBooks);
    const book = books.find((b) => b.id === bookId && !b.deleted_at);
    if (!book) return false;
    const originalBooks = books.map((b) => ({ ...b }));
    const archivedBooks = books.map((b) =>
      b.id === bookId ? { ...b, deleted_at: new Date().toISOString() } : b,
    );
    try {
      setLocal(STORAGE_KEY_BOOKS, archivedBooks);
    } catch (error) {
      try {
        setLocal(STORAGE_KEY_BOOKS, originalBooks);
      } catch (rollbackError) {
        throw new Error(
          `Book archive failed and local rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
        );
      }
      throw error;
    }
    await this.logActivity('BOOK_ARCHIVED', 'books', `Archived book record ${bookId}`);
    return true;
  }

  static async getArchivedBooks(): Promise<Book[]> {
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
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });
      if (error) throw new Error(getSupabaseErrorMessage(error));

      const books = data || [];
      return books.map((b: any) => ({
        ...b,
        stock_count: resolveStockCount(b),
        authors: b.authors?.map((a: any) => a.author).filter(Boolean) || [],
        categories: b.categories?.map((c: any) => c.category).filter(Boolean) || [],
      }));
    }

    const books = getLocal<Book[]>(STORAGE_KEY_BOOKS, initialBooks);
    return books
      .filter((b) => b.deleted_at)
      .map((b) => ({
        ...b,
        stock_count: resolveStockCount(b),
      }));
  }

  static async restoreBook(bookId: string): Promise<boolean> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { data, error } = await supabase
        .from('books')
        .update({ deleted_at: null })
        .eq('id', bookId)
        .not('deleted_at', 'is', null)
        .select('id')
        .maybeSingle();
      if (error) {
        if (error.code === '23505') return false;
        throw error;
      }
      if (!data) return false;
      await this.logActivity('BOOK_RESTORED', 'books', `Restored archived book record ${bookId}`);
      return true;
    }

    const books = getLocal<Book[]>(STORAGE_KEY_BOOKS, initialBooks);
    const book = books.find((b) => b.id === bookId && b.deleted_at);
    if (!book) return false;
    if (books.some((b) => b.id !== bookId && !b.deleted_at && b.isbn_13 === book.isbn_13)) return false;

    const originalBooks = books.map((b) => ({ ...b }));
    const restoredBooks = books.map((b) => {
      if (b.id !== bookId) return b;
      const activeBook = { ...b };
      delete activeBook.deleted_at;
      return activeBook;
    });
    try {
      setLocal(STORAGE_KEY_BOOKS, restoredBooks);
    } catch (error) {
      try {
        setLocal(STORAGE_KEY_BOOKS, originalBooks);
      } catch (rollbackError) {
        throw new Error(
          `Book restore failed and local rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`
        );
      }
      throw error;
    }
    await this.logActivity('BOOK_RESTORED', 'books', `Restored archived book record ${bookId}`);
    return true;
  }

  // --------------------------------------------------------------------------
  // Audit Logs & Activity
  // --------------------------------------------------------------------------

  static async getLogs(): Promise<ActivityLog[]> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) return [];
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .eq('user_id', authData.user.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(getSupabaseErrorMessage(error));
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
    if (
      libraryInfo.name === 'Readowl Community Library' ||
      libraryInfo.name === 'MeelieFont Library'
    ) {
      libraryInfo.name = 'Perpustakaan MeelieFont';
    }
    if (libraryInfo.email === 'contact@readowl.library') libraryInfo.email = '';
    // Normalize the historical seed values for installations that still have
    // them in local storage. Values edited by the user are left untouched.
    if (libraryInfo.address === '452 Bookkeeper Way, Alexandria, VA') libraryInfo.address = '';
    if (libraryInfo.phone === '+1 (555) 234-5678') libraryInfo.phone = '';
    if (libraryInfo.currency === '$') libraryInfo.currency = 'IDR';
    return { library_info: libraryInfo };
  }

  static async loadCloudSettings(): Promise<LibrarySettings> {
    if (!isSupabaseConfigured) return this.getSettings();
    if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');

    const { data, error } = await supabase
      .from('settings')
      .select('setting_key, setting_value')
      .eq('setting_key', 'library_info')
      .maybeSingle();
    if (error) throw new Error(getSupabaseErrorMessage(error));

    const settings: LibrarySettings = {
      library_info: { ...defaultSettings.library_info, ...((data as any)?.setting_value || {}) },
    };
    setLocal(STORAGE_KEY_SETTINGS, settings);
    return settings;
  }

  static async updateSettings(settings: LibrarySettings): Promise<void> {
    if (isSupabaseConfigured) {
      if (!supabase) throw new Error('Supabase is configured but the client could not be initialized.');
      const { error } = await supabase.from('settings').upsert(
        { setting_key: 'library_info', setting_value: settings.library_info },
        { onConflict: 'setting_key' },
      );
      if (error) throw new Error(getSupabaseErrorMessage(error));
    }
    setLocal(STORAGE_KEY_SETTINGS, settings);
  }
}
