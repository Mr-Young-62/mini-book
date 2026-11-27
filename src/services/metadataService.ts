import { supabase, metadataSupabase } from '../lib/supabase';
import { ScannedBookMetadata } from '../types/library';
import { cleanIsbn, isValidIsbn, normalizeToIsbn13 } from './isbnValidator';

export type MetadataErrorType =
  | 'invalid_isbn'
  | 'not_found'
  | 'timeout'
  | 'rate_limited'
  | 'network_error'
  | 'provider_error'
  | 'unknown';

export interface MetadataFetchResult {
  success: boolean;
  metadata?: ScannedBookMetadata;
  error?: string;
  errorType?: MetadataErrorType;
  source?: 'open_library' | 'google_books' | 'jakarta_library' | 'manual' | 'local_database' | 'merged';
  alternateCoverUrl?: string;
}

interface EdgeMetadataResponse {
  title: string;
  subtitle?: string;
  authors: string[];
  publisher?: string;
  publicationYear?: number;
  isbn10?: string;
  isbn13: string;
  description?: string;
  language?: string;
  pageCount?: number;
  coverUrl?: string;
  alternateCoverUrl?: string;
  categories: string[];
  source: 'open_library' | 'google_books' | 'jakarta_library' | 'manual' | 'local_database' | 'merged';
}

const metadataCache = new Map<string, MetadataFetchResult>();

function isCacheWorthy(metadata: ScannedBookMetadata): boolean {
  const knownFields = [
    metadata.publisher,
    metadata.publicationYear,
    metadata.description,
    metadata.pageCount,
    metadata.language,
  ].filter(Boolean).length;
  const hasKnownAuthor = metadata.authors.some((author) => author.trim() && author !== 'Unknown Author');
  return Boolean(metadata.title.trim() && hasKnownAuthor && knownFields >= 3);
}

function emptyMetadata(isbn10: string | undefined, isbn13: string): ScannedBookMetadata {
  return {
    title: '',
    authors: [],
    isbn10,
    isbn13,
    categories: ['Koleksi Umum'],
    source: 'manual',
    coverUrl: undefined,
  };
}

function mapEdgeResponse(data: EdgeMetadataResponse, isbn13: string, isbn10?: string): ScannedBookMetadata {
  return {
    title: data.title,
    subtitle: data.subtitle,
    authors: Array.isArray(data.authors) && data.authors.length > 0
      ? data.authors.filter(Boolean)
      : ['Unknown Author'],
    publisher: data.publisher,
    publicationYear: data.publicationYear,
    isbn10: data.isbn10 || isbn10,
    isbn13: data.isbn13 || isbn13,
    description: data.description,
    language: data.language,
    pageCount: data.pageCount,
    coverUrl: data.coverUrl,
    alternateCoverUrl: data.alternateCoverUrl,
    categories:
      Array.isArray(data.categories) && data.categories.filter(Boolean).length > 0
        ? data.categories.filter(Boolean)
        : ['Koleksi Umum'],
    source: data.source,
  };
}

/** Error payload returned by the Edge Function alongside a non-2xx status. */
interface EdgeFailureBody {
  found?: boolean;
  errorType?: string;
  error?: string;
}

const KNOWN_EDGE_ERROR_TYPES: MetadataErrorType[] = [
  'invalid_isbn',
  'not_found',
  'timeout',
  'rate_limited',
  'network_error',
  'provider_error',
];

function mapEdgeErrorType(value: unknown): MetadataErrorType | null {
  return typeof value === 'string' && (KNOWN_EDGE_ERROR_TYPES as string[]).includes(value)
    ? (value as MetadataErrorType)
    : null;
}

/**
 * Fallback classification for a non-2xx response without a structured errorType.
 * Provider outages (5xx, timeouts, unexpected 4xx) are never reported as not_found.
 */
function classifyHttpStatus(status: number): MetadataErrorType {
  if (status === 400 || status === 422) return 'invalid_isbn';
  if (status === 429) return 'rate_limited';
  if (status === 408 || status === 504) return 'timeout';
  return 'provider_error';
}

function classifyEdgeErrorMessage(error: { message?: string }): MetadataErrorType | null {
  const message = String(error?.message || '');
  if (/429|rate.?limit/i.test(message)) return 'rate_limited';
  if (/timeout|timed? out/i.test(message)) return 'timeout';
  if (/relay/i.test(message)) return 'provider_error';
  return null;
}

function getInvokeStatus(error: unknown): number | undefined {
  const status = (error as { context?: { status?: unknown } })?.context?.status;
  return typeof status === 'number' ? status : undefined;
}

/** Reads the JSON body of a FunctionsHttpError without letting a read failure mask the status. */
async function readInvokeErrorBody(error: unknown): Promise<EdgeFailureBody | null> {
  const context = (error as { context?: { json?: () => Promise<unknown> } })?.context;
  if (!context || typeof context.json !== 'function') return null;
  try {
    const body = await context.json();
    return body && typeof body === 'object' ? (body as EdgeFailureBody) : null;
  } catch {
    return null;
  }
}

/**
 * Classifies an `functions.invoke` failure. The structured `errorType` from the
 * Edge Function wins, then the HTTP status, then the message, so that a 429/5xx/
 * timeout answer is distinguishable from a successful "no match" response.
 */
async function classifyInvokeError(error: unknown): Promise<MetadataErrorType> {
  const body = await readInvokeErrorBody(error);
  const status = getInvokeStatus(error);
  return mapEdgeErrorType(body?.errorType)
    || (status !== undefined && status >= 400 ? classifyHttpStatus(status) : null)
    || classifyEdgeErrorMessage(error as { message?: string })
    || 'network_error';
}

function describeMetadataError(errorType: MetadataErrorType, isbn13: string, status?: number): string {
  switch (errorType) {
    case 'rate_limited':
      return 'Batas permintaan metadata tercapai (rate limit). Coba lagi beberapa saat atau isi detail buku secara manual.';
    case 'timeout':
      return 'Server metadata tidak merespons dalam batas waktu. Coba lagi beberapa saat atau isi detail buku secara manual.';
    case 'invalid_isbn':
      return `Format atau checksum ISBN tidak valid: "${isbn13}". Silakan periksa kembali digit barcode.`;
    case 'provider_error':
      return status === 404
        ? 'Endpoint metadata Supabase tidak ditemukan. Pastikan Edge Function "book-metadata" sudah di-deploy.'
        : `Layanan metadata sedang tidak tersedia${status ? ` (HTTP ${status})` : ''}. Isi detail buku secara manual atau coba lagi nanti.`;
    case 'network_error':
      return 'Tidak dapat terhubung ke Edge Function metadata. Periksa koneksi Anda.';
    default:
      return `ISBN ${isbn13} valid, namun pencarian metadata gagal. Silakan lengkapi judul dan penulis secara manual.`;
  }
}

/**
 * Fetch book metadata by ISBN.
 *
 * Single pipeline: the `book-metadata` Edge Function is the only lookup source.
 * The Edge Function performs Open Library, Google Books, and Jakarta catalog
 * lookup server-side; the browser no longer calls those APIs directly.
 */
export async function fetchBookMetadataByIsbn(isbn: string): Promise<MetadataFetchResult> {
  const cleaned = cleanIsbn(isbn);
  if (!isValidIsbn(cleaned)) {
    return {
      success: false,
      errorType: 'invalid_isbn',
      error: `Format atau checksum ISBN tidak valid: "${isbn}". Silakan periksa kembali digit barcode.`,
    };
  }

  const isbn13 = normalizeToIsbn13(cleaned);
  const isbn10 = cleaned.length === 10 ? cleaned : undefined;

  const cached = metadataCache.get(isbn13);
  if (cached) return cached;

  // Metadata lookup uses the build-configured project even when the library is in local-only mode.
  const metadataClient = supabase || metadataSupabase;
  if (!metadataClient) {
    return {
      success: false,
      errorType: 'not_found',
      error: 'Endpoint metadata Supabase tidak dikonfigurasi. Pencarian metadata membutuhkan Edge Function "book-metadata".',
      source: 'manual',
      metadata: emptyMetadata(isbn10, isbn13),
    };
  }

  try {
    const { data, error } = await metadataClient.functions.invoke('book-metadata', {
      body: { isbn: isbn13 },
    });

      // Handle "found: false" from Edge Function (HTTP 200 but no book matched).
      // This is checked regardless of `error` because Supabase returns error: null
      // when the function responds 200 with { found: false }.
      if (data && data.found === false) {
        const edgeErrorType = mapEdgeErrorType(data.errorType);
        if (edgeErrorType && edgeErrorType !== 'not_found') {
          return {
            success: false,
            errorType: edgeErrorType,
            error: describeMetadataError(edgeErrorType, isbn13),
            source: 'manual',
            metadata: emptyMetadata(isbn10, isbn13),
          };
        }
        return {
          success: false,
          errorType: 'not_found',
          error: `Buku dengan ISBN ${isbn13} tidak ditemukan di Open Library atau Google Books.`,
          source: 'manual',
          metadata: emptyMetadata(isbn10, isbn13),
        };
      }

      if (error) {
        // Non-2xx from the Edge Function: classify from the structured errorType or
        // the HTTP status, so 429/5xx/timeout are told apart from a real empty result
        // instead of collapsing into not_found.
        const errorType = await classifyInvokeError(error);
        return {
          success: false,
          errorType,
          error: describeMetadataError(errorType, isbn13, getInvokeStatus(error)),
          source: 'manual',
          metadata: emptyMetadata(isbn10, isbn13),
        };
      }

      if (data && (data as EdgeMetadataResponse).title && data.source) {
        const metadata = mapEdgeResponse(data as EdgeMetadataResponse, isbn13, isbn10);
        if (isCacheWorthy(metadata)) {
          const result: MetadataFetchResult = {
            success: true,
            metadata,
            source: data.source,
            alternateCoverUrl: data.alternateCoverUrl || metadata.alternateCoverUrl,
          };
          metadataCache.set(isbn13, result);
          return result;
        }
        return {
          success: true,
          metadata,
          source: data.source,
          alternateCoverUrl: data.alternateCoverUrl || metadata.alternateCoverUrl,
        };
      }

    return {
      success: false,
      errorType: 'not_found',
      error: `ISBN ${isbn13} valid, namun belum tercatat di sumber metadata. Silakan lengkapi judul dan penulis secara manual untuk menyimpannya.`,
      source: 'manual',
      metadata: emptyMetadata(isbn10, isbn13),
    };
  } catch (err: any) {
    return {
      success: false,
      errorType: 'network_error',
      error: `Tidak dapat terhubung ke Edge Function metadata: ${err?.message || String(err)}. Periksa koneksi Anda.`,
      source: 'manual',
      metadata: emptyMetadata(isbn10, isbn13),
    };
  }
}
