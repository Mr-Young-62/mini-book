import { supabase, metadataSupabase } from '../lib/supabase';
import { ScannedBookMetadata } from '../types/library';
import { cleanIsbn, isValidIsbn, normalizeToIsbn13 } from './isbnValidator';

export type MetadataErrorType =
  | 'invalid_isbn'
  | 'not_found'
  | 'timeout'
  | 'rate_limited'
  | 'network_error'
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

// In-memory cache: repeated lookups (test barcodes, re-scans) skip the network
const metadataCache = new Map<string, MetadataFetchResult>();

function hasKnownAuthor(metadata: ScannedBookMetadata): boolean {
  return metadata.authors.some((author) => author.trim() && author !== 'Unknown Author');
}

function isCacheWorthy(metadata: ScannedBookMetadata): boolean {
  const knownFields = [
    metadata.publisher,
    metadata.publicationYear,
    metadata.description,
    metadata.pageCount,
    metadata.language,
  ].filter(Boolean).length;
  return Boolean(metadata.title.trim() && hasKnownAuthor(metadata) && knownFields >= 3);
}

async function isRateLimitedResponse(response: Response): Promise<boolean> {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;

  try {
    const body = await response.clone().json();
    const error = body?.error;
    const reasons = Array.isArray(error?.errors)
      ? error.errors.map((item: { reason?: string }) => item.reason || '')
      : [];
    return reasons.some((reason: string) => /quota|ratelimit|rate.?limit/i.test(reason))
      || /quota|rate.?limit/i.test(String(error?.message || ''));
  } catch {
    return false;
  }
}

function finalizeSuccess(
  metadata: ScannedBookMetadata,
  source: Exclude<MetadataFetchResult['source'], undefined>,
  alternateCoverUrl?: string
): MetadataFetchResult {
  const result: MetadataFetchResult = {
    success: true,
    metadata,
    source,
    alternateCoverUrl: alternateCoverUrl || metadata.alternateCoverUrl,
  };
  if (isCacheWorthy(metadata)) metadataCache.set(metadata.isbn13, result);
  return result;
}

function mergeMetadataSources(
  sources: ScannedBookMetadata[],
  isbn13: string,
  hasRealOlCover: boolean,
  hasRealGbCover: boolean,
): ScannedBookMetadata {
  const firstValue = <T,>(getValue: (metadata: ScannedBookMetadata) => T | undefined, isUseful: (value: T) => boolean = Boolean) =>
    sources.map(getValue).find((value): value is T => value !== undefined && isUseful(value));
  const realCover = hasRealGbCover
    ? sources.find((metadata) => metadata.source === 'google_books')?.coverUrl
    : hasRealOlCover
      ? sources.find((metadata) => metadata.source === 'open_library')?.coverUrl
      : undefined;
  const alternateCover = hasRealGbCover && hasRealOlCover
    ? sources.find((metadata) => metadata.source === 'open_library')?.coverUrl
    : undefined;
  const authors = firstValue(
    (metadata) => metadata.authors,
    (value) => value.some((author) => author.trim() && author !== 'Unknown Author'),
  );
  const categories = firstValue(
    (metadata) => metadata.categories,
    (value) => value.some((category) => category.trim() && category !== 'General Collection'),
  );
  const title = firstValue((metadata) => metadata.title, (value) => Boolean(value.trim())) || '';
  const source = sources.length > 1 ? 'merged' : sources[0].source;

  return {
    title,
    subtitle: firstValue((metadata) => metadata.subtitle, (value) => Boolean(value.trim())),
    authors: authors?.filter((author) => author !== 'Unknown Author') || [],
    publisher: firstValue((metadata) => metadata.publisher, (value) => Boolean(value.trim())),
    publicationYear: firstValue((metadata) => metadata.publicationYear, (value) => value > 0),
    isbn10: firstValue((metadata) => metadata.isbn10, (value) => Boolean(value.trim())),
    isbn13,
    description: firstValue((metadata) => metadata.description, (value) => Boolean(value.trim())),
    language: firstValue((metadata) => metadata.language, (value) => Boolean(value.trim())),
    pageCount: firstValue((metadata) => metadata.pageCount, (value) => value > 0),
    coverUrl: realCover || firstValue(
      (metadata) => metadata.coverUrl,
      (value) => Boolean(value && !value.includes('covers.openlibrary.org/b/isbn/')),
    ),
    alternateCoverUrl: alternateCover && alternateCover !== realCover ? alternateCover : undefined,
    categories: categories?.filter((category) => category !== 'General Collection') || ['General Collection'],
    source,
  };
}

function mapEdgeResponse(data: EdgeMetadataResponse, isbn13: string, isbn10?: string): ScannedBookMetadata {
  const metadata: ScannedBookMetadata = {
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
        : ['General Collection'],
    source: data.source,
  };

  return metadata;
}

/**
 * Fetch book metadata by ISBN.
 * Pipeline:
 * 1. Supabase edge function (server-side, cached, authenticated)
 * 2. Supabase Edge Function lookup across Open Library, Google Books, and Jakarta Library
 * 3. Direct Open Library and unauthenticated Google Books fallback when the Edge Function is unavailable
 * 4. Smart metadata merging for complete fields (title, author, publisher, cover, description)
 * 5. Verification that returned records match the scanned ISBN.
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

  let edgeMetadata: ScannedBookMetadata | null = null;
  let edgeFunctionError: string | undefined;

  // Metadata lookup uses the build-configured project even when the library is in local-only mode.
  const metadataClient = supabase || metadataSupabase;
  if (metadataClient) {
    try {
      const { data, error } = await metadataClient.functions.invoke('book-metadata', {
        body: { isbn: isbn13 },
      });

      if (!error && data && (data as EdgeMetadataResponse).title && data.source) {
        const metadata = mapEdgeResponse(data as EdgeMetadataResponse, isbn13, isbn10);
        if (isCacheWorthy(metadata)) {
          return finalizeSuccess(metadata, metadata.source, metadata.alternateCoverUrl);
        }
        edgeMetadata = metadata;
      } else if (error) {
        edgeFunctionError = error.message;
        console.warn('Supabase book-metadata lookup failed:', error.message);
      }
    } catch (err: any) {
      edgeFunctionError = err?.message || String(err);
      console.warn('Edge function book-metadata unavailable, falling back to direct lookup:', edgeFunctionError);
    }
  } else {
    edgeFunctionError = 'Endpoint metadata Supabase tidak dikonfigurasi. Katalog Perpustakaan Jakarta membutuhkan Edge Function Supabase.';
  }

  // 2. Direct pipeline with multi-provider fallback & data merging
  let olMetadata: ScannedBookMetadata | null = null;
  let hasRealOlCover = false;
  let encounteredRateLimit = false;
  let encounteredTimeout = false;
  let encounteredNetworkError = false;

  // Step A: Fetch Open Library Books API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const olUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`;
    const res = await fetch(olUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const item = data[`ISBN:${isbn13}`];

      if (item && item.title) {
        let pubYear: number | undefined;
        if (item.publish_date) {
          const match = item.publish_date.match(/\b(19\d\d|20\d\d)\b/);
          if (match) pubYear = parseInt(match[0], 10);
        }

        const authors: string[] = item.authors?.map((a: { name: string }) => a.name) || [];
        const publisherName = item.publishers?.[0]?.name;
        const categories: string[] = item.subjects
          ?.slice(0, 5)
          .map((s: { name: string } | string) => (typeof s === 'string' ? s : s.name))
          .filter(Boolean) || [];

        const verifiedCover = item.cover?.large || item.cover?.medium || item.cover?.small;
        hasRealOlCover = Boolean(verifiedCover);

        olMetadata = {
          title: item.title,
          subtitle: item.subtitle,
          authors: authors.length > 0 ? authors : ['Unknown Author'],
          publisher: publisherName,
          publicationYear: pubYear,
          isbn10: item.identifiers?.isbn_10?.[0] || isbn10,
          isbn13,
          description: typeof item.notes === 'string'
            ? item.notes
            : (typeof item.description === 'object' ? item.description?.value : item.description) || undefined,
          pageCount: item.number_of_pages,
          coverUrl: verifiedCover,
          categories: categories.length > 0 ? categories : ['General Collection'],
          source: 'open_library',
        };
      }
    } else if (await isRateLimitedResponse(res)) {
      encounteredRateLimit = true;
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      encounteredTimeout = true;
    } else if (!navigator.onLine) {
      encounteredNetworkError = true;
    }
    console.warn('Open Library API fetch failed or timed out:', err?.message);
  }

  // Completeness check for Open Library:
  // If it has title, known author, publisher, description, AND confirmed cover, we can safely finalize.
  const isOlComplete = Boolean(
    olMetadata &&
    olMetadata.title &&
    olMetadata.authors.length > 0 &&
    olMetadata.authors[0] !== 'Unknown Author' &&
    olMetadata.publisher &&
    olMetadata.description &&
    hasRealOlCover
  );

  if (isOlComplete && olMetadata) {
    return finalizeSuccess(olMetadata, 'open_library');
  }

  // Step B: Query Google Books API
  // We query Google Books when Open Library has missing fields or returned nothing
  let gbMetadata: ScannedBookMetadata | null = null;
  let hasRealGbCover = false;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${encodeURIComponent(isbn13)}`;

    const res = await fetch(googleUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        // BUG-03 fix: Do NOT blindly take data.items[0]. Verify ISBN in industryIdentifiers.
        const matchingItem = data.items.find((item: any) => {
          const identifiers = item?.volumeInfo?.industryIdentifiers || [];
          return identifiers.some((id: any) => {
            const rawId = cleanIsbn(id?.identifier || '');
            return rawId === isbn13 || normalizeToIsbn13(rawId) === isbn13 || (isbn10 && rawId === isbn10);
          });
        });

        if (matchingItem && matchingItem.volumeInfo) {
          const volume = matchingItem.volumeInfo;
          let pubYear: number | undefined;
          if (volume.publishedDate) {
            const match = volume.publishedDate.match(/\b(19\d\d|20\d\d)\b/);
            if (match) pubYear = parseInt(match[0], 10);
          }

          const identifiers = volume.industryIdentifiers || [];
          const foundIsbn10 = identifiers.find((i: any) => i.type === 'ISBN_10')?.identifier || isbn10;

          let coverUrl =
            volume.imageLinks?.extraLarge ||
            volume.imageLinks?.large ||
            volume.imageLinks?.medium ||
            volume.imageLinks?.thumbnail;

          if (coverUrl) {
            coverUrl = coverUrl.replace(/^http:\/\//i, 'https://');
            hasRealGbCover = true;
          }

          gbMetadata = {
            title: volume.title || '',
            subtitle: volume.subtitle,
            authors: volume.authors && volume.authors.length > 0 ? volume.authors : ['Unknown Author'],
            publisher: volume.publisher,
            publicationYear: pubYear,
            isbn10: foundIsbn10,
            isbn13,
            description: volume.description,
            language: volume.language,
            pageCount: volume.pageCount,
            coverUrl,
            categories: volume.categories && volume.categories.length > 0 ? volume.categories : ['General Collection'],
            source: 'google_books',
          };
        }
      }
    } else if (await isRateLimitedResponse(res)) {
      encounteredRateLimit = true;
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      encounteredTimeout = true;
    } else if (!navigator.onLine) {
      encounteredNetworkError = true;
    }
    console.warn('Google Books API fetch failed or timed out:', err?.message);
  }

  // Step C: Smart Merge Pipeline (BUG-02 fix)
  // If we have both Open Library and Google Books, merge them for highest completeness.
  const metadataSources = [olMetadata, gbMetadata, edgeMetadata]
    .filter((metadata): metadata is ScannedBookMetadata => metadata !== null);
  if (metadataSources.length > 0) {
    const mergedMetadata = mergeMetadataSources(
      metadataSources,
      isbn13,
      hasRealOlCover,
      hasRealGbCover,
    );
    return finalizeSuccess(mergedMetadata, mergedMetadata.source, mergedMetadata.alternateCoverUrl);
  }

  // Step D: Error Classification (BUG-08 & BUG-05)
  if (encounteredNetworkError || (!navigator.onLine && typeof navigator !== 'undefined')) {
    return {
      success: false,
      errorType: 'network_error',
      error: 'Tidak dapat terhubung ke internet. Periksa koneksi data atau Wi-Fi Anda.',
      source: 'manual',
      metadata: {
        title: '',
        authors: [],
        isbn10,
        isbn13,
        categories: ['General Collection'],
        source: 'manual',
        coverUrl: undefined,
      },
    };
  }

  if (encounteredTimeout) {
    return {
      success: false,
      errorType: 'timeout',
      error: 'Permintaan metadata melampaui batas waktu (timeout). Server mungkin sedang lambat, coba lagi beberapa saat.',
      source: 'manual',
      metadata: {
        title: '',
        authors: [],
        isbn10,
        isbn13,
        categories: ['General Collection'],
        source: 'manual',
        coverUrl: undefined,
      },
    };
  }

  if (encounteredRateLimit) {
    return {
      success: false,
      errorType: 'rate_limited',
      error: 'Batas kuota request API harian terlampaui (Rate limit). Anda dapat memasukkan detail buku secara manual.',
      source: 'manual',
      metadata: {
        title: '',
        authors: [],
        isbn10,
        isbn13,
        categories: ['General Collection'],
        source: 'manual',
        coverUrl: undefined,
      },
    };
  }

  // Valid ISBN, but not cataloged in external databases (BUG-05)
  return {
    success: false,
    errorType: 'not_found',
    error: edgeFunctionError
      ? `Metadata otomatis tidak ditemukan. Katalog Perpustakaan Jakarta gagal diakses: ${edgeFunctionError}. Periksa konfigurasi Supabase dan pastikan Edge Function "book-metadata" terbaru sudah di-deploy, lalu coba lagi.`
      : `ISBN ${isbn13} valid, namun belum tercatat di sumber metadata yang tersedia. Silakan lengkapi judul dan penulis secara manual untuk menyimpannya.`,
    source: 'manual',
    metadata: {
      title: '',
      authors: [],
      isbn10,
      isbn13,
      categories: ['General Collection'],
      source: 'manual',
      coverUrl: undefined,
    },
  };
}
