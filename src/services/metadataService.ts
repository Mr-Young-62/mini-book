import { supabase, isSupabaseConfigured } from '../lib/supabase';
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
  source?: 'open_library' | 'google_books' | 'manual' | 'local_database' | 'merged';
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
  source: 'open_library' | 'google_books' | 'manual' | 'local_database' | 'merged';
}

// In-memory cache: repeated lookups (test barcodes, re-scans) skip the network
const metadataCache = new Map<string, MetadataFetchResult>();

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
  metadataCache.set(metadata.isbn13, result);
  return result;
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
    coverUrl:
      data.coverUrl ||
      `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`,
    alternateCoverUrl: data.alternateCoverUrl,
    categories:
      Array.isArray(data.categories) && data.categories.filter(Boolean).length > 0
        ? data.categories.filter(Boolean)
        : ['General Collection'],
    source: data.source,
  };

  return metadata;
}

async function fetchGoogleSearchFallback(isbn13: string, isbn10?: string): Promise<ScannedBookMetadata | null> {
  const googleApiKey = (import.meta as any).env?.VITE_GOOGLE_CUSTOM_SEARCH_API_KEY;
  const googleCx = (import.meta as any).env?.VITE_GOOGLE_CUSTOM_SEARCH_ENGINE_ID;

  if (!googleApiKey || !googleCx) return null;

  const queries = [
    `"${isbn13}"`,
    ...(isbn10 ? [`"${isbn10}"`] : []),
    `isbn ${isbn13}`,
    `isbn ${isbn13} book`,
  ];

  for (const query of queries) {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(googleApiKey)}&cx=${encodeURIComponent(googleCx)}&q=${encodeURIComponent(query)}&num=5`;
      const response = await fetch(url);
      if (!response.ok) continue;

      const data = await response.json();
      const item = data.items?.find((it: any) => {
        const title = (it.title || '').toLowerCase();
        const snippet = (it.snippet || '').toLowerCase();
        return title.includes(isbn13.replace(/\s+/g, '')) || snippet.includes(isbn13.replace(/\s+/g, '')) || snippet.includes('isbn');
      }) || data.items?.[0];

      if (!item) continue;

      const title = String(item.title || '').replace(/\s*-\s*Google Search.*$/i, '').trim() || `Buku ${isbn13}`;
      return {
        title,
        subtitle: undefined,
        authors: ['Unknown Author'],
        publisher: undefined,
        publicationYear: undefined,
        isbn10,
        isbn13,
        description: item.snippet || undefined,
        language: undefined,
        pageCount: undefined,
        coverUrl: `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`,
        categories: ['General Collection'],
        source: 'google_books',
      };
    } catch {
      // continue to next query if Google Search fallback fails
    }
  }

  return null;
}

/**
 * Fetch book metadata by ISBN.
 * Pipeline:
 * 1. Supabase edge function (server-side, cached, authenticated)
 * 2. Multi-source client query: Open Library and Google Books
 * 3. Google Search fallback when Google Books does not return a match
 * 4. Smart metadata merging for complete fields (title, author, publisher, cover, description)
 * 5. Verification that returned volume truly matches the scanned ISBN.
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

  // 1. Supabase edge function: bypasses client-side rate limits & uses server API key
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.functions.invoke('book-metadata', {
        body: { isbn: isbn13 },
      });

      if (!error && data && (data as EdgeMetadataResponse).title && data.source) {
        const metadata = mapEdgeResponse(data as EdgeMetadataResponse, isbn13, isbn10);
        const result: MetadataFetchResult = {
          success: true,
          metadata,
          source: metadata.source,
          alternateCoverUrl: metadata.alternateCoverUrl,
        };
        metadataCache.set(isbn13, result);
        return result;
      }
    } catch (err: any) {
      console.warn('Edge function book-metadata unavailable, falling back to direct lookup:', err?.message);
    }
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
          coverUrl: verifiedCover || `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`,
          categories: categories.length > 0 ? categories : ['General Collection'],
          source: 'open_library',
        };
      }
    } else if (res.status === 429) {
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

    const apiKey = (import.meta as any).env?.VITE_GOOGLE_BOOKS_API_KEY;
    const apiKeyParam = apiKey ? `&key=${apiKey}` : '';
    const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}${apiKeyParam}`;

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
            return rawId === isbn13 || (isbn10 && rawId === isbn10);
          });
        }) || (data.items.length === 1 ? data.items[0] : null);

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
            coverUrl: coverUrl || `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`,
            categories: volume.categories && volume.categories.length > 0 ? volume.categories : ['General Collection'],
            source: 'google_books',
          };
        }
      }
    } else if (res.status === 429) {
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
  if (olMetadata && gbMetadata) {
    const primaryCover = hasRealGbCover
      ? gbMetadata.coverUrl
      : (hasRealOlCover ? olMetadata.coverUrl : gbMetadata.coverUrl || olMetadata.coverUrl);

    const alternateCover = hasRealGbCover && hasRealOlCover && olMetadata.coverUrl !== primaryCover
      ? olMetadata.coverUrl
      : undefined;

    const mergedAuthors =
      olMetadata.authors[0] !== 'Unknown Author'
        ? olMetadata.authors
        : gbMetadata.authors;

    const mergedCategories =
      olMetadata.categories.length > 0 && olMetadata.categories[0] !== 'General Collection'
        ? olMetadata.categories
        : gbMetadata.categories;

    const mergedMetadata: ScannedBookMetadata = {
      title: olMetadata.title || gbMetadata.title,
      subtitle: olMetadata.subtitle || gbMetadata.subtitle,
      authors: mergedAuthors,
      publisher: olMetadata.publisher || gbMetadata.publisher,
      publicationYear: olMetadata.publicationYear || gbMetadata.publicationYear,
      isbn10: olMetadata.isbn10 || gbMetadata.isbn10,
      isbn13,
      description: olMetadata.description || gbMetadata.description,
      language: gbMetadata.language || olMetadata.language,
      pageCount: olMetadata.pageCount || gbMetadata.pageCount,
      coverUrl: primaryCover,
      alternateCoverUrl: alternateCover,
      categories: mergedCategories,
      source: 'merged',
    };

    return finalizeSuccess(mergedMetadata, 'merged', alternateCover);
  }

  // If only Open Library found data:
  if (olMetadata) {
    return finalizeSuccess(olMetadata, 'open_library');
  }

  // If only Google Books found data:
  if (gbMetadata) {
    return finalizeSuccess(gbMetadata, 'google_books');
  }

  const genericGoogleResult = await fetchGoogleSearchFallback(isbn13, isbn10);
  if (genericGoogleResult) {
    return finalizeSuccess(genericGoogleResult, 'google_books');
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
        coverUrl: `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`,
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
        coverUrl: `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`,
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
        coverUrl: `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`,
      },
    };
  }

  // Valid ISBN, but not cataloged in external databases (BUG-05)
  return {
    success: false,
    errorType: 'not_found',
    error: `ISBN ${isbn13} valid, namun belum tercatat di database Open Library atau Google Books. Silakan lengkapi judul dan penulis secara manual untuk menyimpannya.`,
    source: 'manual',
    metadata: {
      title: '',
      authors: [],
      isbn10,
      isbn13,
      categories: ['General Collection'],
      source: 'manual',
      coverUrl: `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`,
    },
  };
}
