import { ScannedBookMetadata } from '../types/library';
import { cleanIsbn, isValidIsbn, normalizeToIsbn13 } from './isbnValidator';

export interface MetadataFetchResult {
  success: boolean;
  metadata?: ScannedBookMetadata;
  error?: string;
  source?: 'open_library' | 'google_books' | 'manual';
}

/**
 * Fetch book metadata by ISBN using real Open Library API with Google Books fallback
 */
export async function fetchBookMetadataByIsbn(isbn: string): Promise<MetadataFetchResult> {
  const cleaned = cleanIsbn(isbn);
  if (!isValidIsbn(cleaned)) {
    return {
      success: false,
      error: `Invalid ISBN checksum or format: "${isbn}". Please check the digits.`,
    };
  }

  const isbn13 = normalizeToIsbn13(cleaned);
  const isbn10 = cleaned.length === 10 ? cleaned : undefined;

  // 1. Primary API: Open Library Books API
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

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
          .map((s: { name: string }) => (typeof s === 'string' ? s : s.name))
          .filter(Boolean) || [];

        const coverUrl =
          item.cover?.large ||
          item.cover?.medium ||
          item.cover?.small ||
          `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`;

        const metadata: ScannedBookMetadata = {
          title: item.title,
          subtitle: item.subtitle,
          authors: authors.length > 0 ? authors : ['Unknown Author'],
          publisher: publisherName,
          publicationYear: pubYear,
          isbn10: item.identifiers?.isbn_10?.[0] || isbn10,
          isbn13,
          description: typeof item.notes === 'string' ? item.notes : (item.description || undefined),
          pageCount: item.number_of_pages,
          coverUrl,
          categories: categories.length > 0 ? categories : ['General Collection'],
          source: 'open_library',
        };

        return {
          success: true,
          metadata,
          source: 'open_library',
        };
      }
    }
  } catch (err: any) {
    console.warn('Open Library API fetch failed or timed out:', err.message);
  }

  // 2. Secondary API: Google Books API Fallback
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    const googleUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn13}`;
    const res = await fetch(googleUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        const volume = data.items[0].volumeInfo;
        let pubYear: number | undefined;
        if (volume.publishedDate) {
          const match = volume.publishedDate.match(/\b(19\d\d|20\d\d)\b/);
          if (match) pubYear = parseInt(match[0], 10);
        }

        const identifiers = volume.industryIdentifiers || [];
        const foundIsbn10 = identifiers.find((i: any) => i.type === 'ISBN_10')?.identifier || isbn10;

        let coverUrl = volume.imageLinks?.extraLarge || volume.imageLinks?.large || volume.imageLinks?.medium || volume.imageLinks?.thumbnail;
        if (coverUrl) {
          coverUrl = coverUrl.replace(/^http:\/\//i, 'https://');
        } else {
          coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`;
        }

        const metadata: ScannedBookMetadata = {
          title: volume.title,
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

        return {
          success: true,
          metadata,
          source: 'google_books',
        };
      }
    }
  } catch (err: any) {
    console.warn('Google Books API fetch failed or timed out:', err.message);
  }

  // 3. Fallback: No external record found
  return {
    success: false,
    error: `No bibliographic record found for ISBN ${isbn13} across Open Library or Google Books. You can enter the book details manually.`,
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
