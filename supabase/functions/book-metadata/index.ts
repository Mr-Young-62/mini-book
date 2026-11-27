// Supabase Edge Function: book-metadata
// Server-side ISBN metadata lookup with public-catalog fallbacks.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createRateLimiter, getRateLimitKey } from "./rateLimit.ts";
import {
  buildAcceptedIsbns,
  buildGoogleBooksQueries,
  buildIsbnSearchTerms,
  classifyHttpFailure,
  combineFailures,
  isValidIsbn,
  normalizeIsbn13,
  pickVerifiedGoogleBooksItem,
  type ProviderFailureKind,
} from "./isbnSearch.ts";

const checkRateLimit = createRateLimiter({ windowMs: 60_000, max: 20 });

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MetadataResponse {
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
  source: "open_library" | "google_books" | "jakarta_library" | "manual" | "merged";
}

type ProviderName = "open_library" | "google_books" | "jakarta_library";

type ProviderRequest =
  | { kind: "ok"; response: Response }
  | { kind: "empty" }
  | { kind: "failure"; failure: ProviderFailureKind };

/** Provider failures are reported, never logged with outbound credentials attached. */
function redactSecrets(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value ?? "");
  const secret = Deno.env.get("GOOGLE_BOOKS_API_KEY");
  return secret ? message.split(secret).join("***") : message;
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "TimeoutError" || /timeout|timed out/i.test(error.message));
}

class ProviderLookupError extends Error {
  constructor(message: string, readonly failure: ProviderFailureKind) {
    super(message);
    this.name = "ProviderLookupError";
  }
}

/** One provider request, with failures classified instead of swallowed. */
async function requestProvider(url: string): Promise<ProviderRequest> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (response.ok) return { kind: "ok", response };
    const failure = classifyHttpFailure(response.status);
    // classifyHttpFailure returns null only for 404: the provider answered "no such record".
    return failure ? { kind: "failure", failure } : { kind: "empty" };
  } catch (err) {
    return { kind: "failure", failure: isTimeoutError(err) ? "timeout" : "provider_error" };
  }
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const parsed = await response.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Open Library Covers API placeholder; default=false makes a missing cover a 404. */
function fallbackCoverUrl(isbn: string): string {
  return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg?default=false`;
}

function mapGoogleBooksVolume(
  volume: any,
  isbn13: string,
  fallbackCover: string,
): { metadata: MetadataResponse; hasCover: boolean } {
  const pubYear = volume.publishedDate
    ? parseInt(volume.publishedDate.substring(0, 4), 10) || undefined
    : undefined;
  const identifiers = Array.isArray(volume.industryIdentifiers) ? volume.industryIdentifiers : [];
  const isbn10Obj = identifiers.find((id: { type: string }) => id?.type === "ISBN_10");
  const isbn13Obj = identifiers.find((id: { type: string }) => id?.type === "ISBN_13");

  let coverUrl =
    volume.imageLinks?.extraLarge ||
    volume.imageLinks?.large ||
    volume.imageLinks?.medium ||
    volume.imageLinks?.thumbnail;
  if (coverUrl) coverUrl = coverUrl.replace(/^http:\/\//i, "https://");

  return {
    metadata: {
      title: volume.title,
      subtitle: volume.subtitle,
      authors: Array.isArray(volume.authors) ? volume.authors : [],
      publisher: volume.publisher,
      publicationYear: pubYear,
      isbn10: isbn10Obj?.identifier || (isbn13.length === 10 ? isbn13 : undefined),
      isbn13: isbn13Obj?.identifier || isbn13,
      description: volume.description,
      language: volume.language,
      pageCount: volume.pageCount,
      coverUrl: coverUrl || fallbackCover,
      categories: Array.isArray(volume.categories) ? volume.categories : [],
      source: "google_books",
    },
    hasCover: Boolean(coverUrl),
  };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(value: string): string {
  return decodeHtml(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>/gi, " "))
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getMetaContent(page: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tag = page.match(new RegExp(`<meta\\b(?=[^>]*(?:property|name)=["']${escaped}["'])[^>]*>`, "i"))?.[0];
  const content = tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1];
  return content ? stripHtml(content) : undefined;
}

function getCatalogField(page: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const row = page.match(new RegExp(
    `<div\\b[^>]*>\\s*<span\\b[^>]*>\\s*${escaped}\\s*<\\/span>\\s*<span\\b[^>]*>([\\s\\S]*?)<\\/span>\\s*<\\/div>`,
    "i",
  ))?.[1];
  return row ? stripHtml(row) : undefined;
}

function parseCatalogAuthors(value?: string): string[] {
  if (!value) return [];
  return value.split(";")
    .map((entry) => entry.replace(/\s*\([^)]*\)\s*/g, " ").trim())
    .filter(Boolean)
    .map((entry) => {
      const comma = entry.indexOf(",");
      return comma > 0
        ? `${entry.slice(comma + 1).trim()} ${entry.slice(0, comma).trim()}`
        : entry;
    });
}

async function fetchJakartaCatalogMetadata(isbn: string, isbn13: string): Promise<MetadataResponse | null> {
  const baseUrl = "https://perpustakaan.jakarta.go.id";
  const searchUrl = `${baseUrl}/book?keyword=${encodeURIComponent(isbn)}`;
  let searchResponse: Response;
  try {
    searchResponse = await fetch(searchUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MeelieFont/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new ProviderLookupError(
      `Jakarta catalog search failed: ${redactSecrets(err)}`,
      isTimeoutError(err) ? "timeout" : "provider_error",
    );
  }
  if (!searchResponse.ok) {
    const failure = classifyHttpFailure(searchResponse.status);
    // classifyHttpFailure is null only for 404: no catalog entry for this query.
    if (!failure) return null;
    throw new ProviderLookupError(`Jakarta catalog search failed: HTTP ${searchResponse.status}`, failure);
  }

  const searchPage = await searchResponse.text();
  const detailLinks = [...searchPage.matchAll(
    /<a\b([^>]*href=["']([^"']*\/book\/detail\?cn=[^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi,
  )].slice(0, 5);

  for (const match of detailLinks) {
    const detailUrl = new URL(decodeHtml(match[2]), baseUrl);
    if (detailUrl.origin !== baseUrl || detailUrl.pathname !== "/book/detail") continue;

    let detailResponse: Response;
    try {
      detailResponse = await fetch(detailUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; MeelieFont/1.0)" },
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      throw new ProviderLookupError(
        `Jakarta catalog detail failed: ${redactSecrets(err)}`,
        isTimeoutError(err) ? "timeout" : "provider_error",
      );
    }
    if (!detailResponse.ok) continue;

    const detailPage = await detailResponse.text();
    const listedIsbns = getCatalogField(detailPage, "ISBN")?.match(/97[89][0-9Xx-]{10,}/g) || [];
    if (!listedIsbns.some((value) => normalizeIsbn13(value) === isbn13)) continue;

    const title = getMetaContent(detailPage, "og:title")
      || stripHtml(match[3].match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
    if (!title) continue;

    const authorText = match[3].match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/i)?.[1];
    const publisherText = getCatalogField(detailPage, "Penerbit");
    const publisher = publisherText?.match(/:\s*([^,;]+)/)?.[1]?.trim();
    const publicationYear = Number(publisherText?.match(/\b(?:19|20)\d{2}\b/)?.[0]) || undefined;
    const physicalDescription = getCatalogField(detailPage, "Deskripsi Fisik") || "";
    const pageCount = Number(physicalDescription.match(/\b(\d+)\s*halaman\b/i)?.[1]) || undefined;
    const languageText = getCatalogField(detailPage, "Bahasa")?.toLowerCase();
    const coverUrl = getMetaContent(detailPage, "og:image");
    const description = getMetaContent(detailPage, "og:description")
      || getCatalogField(detailPage, "Deskripsi Teks");
    const category = getCatalogField(detailPage, "Subjek");

    return {
      title,
      authors: parseCatalogAuthors(authorText),
      publisher,
      publicationYear,
      isbn10: isbn.length === 10 ? isbn : undefined,
      isbn13,
      description,
      language: languageText?.includes("indonesia") ? "id" : languageText?.slice(0, 10),
      pageCount,
      coverUrl,
      categories: category ? [category] : [],
      source: "jakarta_library",
    };
  }

  return null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const rate = checkRateLimit(getRateLimitKey(req));
  if (!rate.allowed) {
    return new Response(JSON.stringify({ error: "Terlalu banyak permintaan. Coba lagi beberapa saat." }), {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(rate.retryAfterSeconds),
      },
    });
  }

  try {
    const body = await req.json().catch(() => null);
    const isbnInput = body?.isbn;

    if (typeof isbnInput !== "string" || !isbnInput.trim()) {
      return new Response(JSON.stringify({ error: "A valid ISBN string is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean and validate before building any outbound URL.
    const cleanIsbn = isbnInput.replace(/[^0-9X]/gi, "").toUpperCase();
    if (!isValidIsbn(cleanIsbn)) {
      return new Response(JSON.stringify({ error: "Invalid ISBN. Provide a valid ISBN-10 or ISBN-13." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tiered lookup plan: exact ISBN terms first (ISBN-13, then the ISBN-10
    // counterpart of a 978 book), and only after those fail a plain Google Books
    // text query whose hits still have to prove the ISBN. 979 books are never
    // converted and an ISBN-10 input is never queried twice.
    const searchTerms = buildIsbnSearchTerms(cleanIsbn);
    const acceptedIsbns = buildAcceptedIsbns(cleanIsbn);
    const fallbackCover = fallbackCoverUrl(cleanIsbn);
    const failures: { provider: ProviderName; kind: ProviderFailureKind }[] = [];
    const recordFailure = (provider: ProviderName, kind: ProviderFailureKind) => {
      if (!failures.some((entry) => entry.provider === provider)) failures.push({ provider, kind });
    };

    let olMetadata: MetadataResponse | null = null;
    let hasRealOlCover = false;

    // 1. Open Library Books API (bibkeys form), one exact ISBN term at a time.
    for (const term of searchTerms) {
      const request = await requestProvider(
        `https://openlibrary.org/api/books?bibkeys=ISBN:${encodeURIComponent(term)}&format=json&jscmd=data`,
      );
      if (request.kind === "failure") {
        recordFailure("open_library", request.failure);
        break;
      }
      if (request.kind === "empty") continue;

      const olData = await readJson(request.response);
      if (!olData) {
        recordFailure("open_library", "provider_error");
        break;
      }

      const item = olData[`ISBN:${term}`] as any;
      if (!item?.title) continue; // no record for this exact ISBN term

      const pubYear = item.publish_date
        ? parseInt(String(item.publish_date).match(/\b(19\d\d|20\d\d)\b/)?.[0] || "0", 10) || undefined
        : undefined;

      const verifiedCover = item.cover && item.cover !== false
        ? item.cover.large || item.cover.medium || item.cover.small
        : undefined;
      hasRealOlCover = Boolean(verifiedCover);

      olMetadata = {
        title: item.title,
        subtitle: item.subtitle,
        authors: item.authors?.map((a: { name: string }) => a.name) || [],
        publisher: item.publishers?.[0]?.name,
        publicationYear: pubYear,
        isbn10: item.identifiers?.isbn_10?.[0] || (term.length === 10 ? term : undefined),
        isbn13: item.identifiers?.isbn_13?.[0] || cleanIsbn,
        description:
          typeof item.notes === "string"
            ? item.notes
            : typeof item.description === "object"
              ? item.description?.value
              : (item.description as string | undefined),
        pageCount: item.number_of_pages,
        coverUrl: verifiedCover || fallbackCover,
        categories: item.subjects
          ?.slice(0, 5)
          .map((s: { name: string } | string) => (typeof s === "string" ? s : s.name))
          .filter(Boolean) || [],
        source: "open_library",
      };
      break;
    }

    // If Open Library has a complete record, we can return it directly.
    const isOlComplete = Boolean(
      olMetadata &&
      olMetadata.title &&
      olMetadata.authors.length > 0 &&
      olMetadata.publisher &&
      olMetadata.publicationYear &&
      olMetadata.description &&
      olMetadata.pageCount &&
      hasRealOlCover
    );

    if (isOlComplete && olMetadata) {
      return new Response(JSON.stringify(olMetadata), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Google Books API: exact `isbn:` queries first, then — only when they yield
    // no verified match — a plain text query. Every candidate, text search included,
    // must prove its ISBN before its data is used; anything unverifiable is discarded.
    let gbMetadata: MetadataResponse | null = null;
    let hasRealGbCover = false;
    const gbApiKey = Deno.env.get("GOOGLE_BOOKS_API_KEY");
    const apiKeyParam = gbApiKey ? `&key=${encodeURIComponent(gbApiKey)}` : "";

    for (const { query } of buildGoogleBooksQueries(searchTerms)) {
      const request = await requestProvider(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}${apiKeyParam}`,
      );
      if (request.kind === "failure") {
        // Never turn a provider failure into a successful "no results" answer,
        // and never echo the request URL (it carries the API key) in logs or errors.
        recordFailure("google_books", request.failure);
        break;
      }
      if (request.kind === "empty") continue;

      const gbData = await readJson(request.response);
      if (!gbData) {
        recordFailure("google_books", "provider_error");
        break;
      }

      const matchingItem = pickVerifiedGoogleBooksItem(gbData.items, acceptedIsbns);
      if (!matchingItem) continue; // unverified or no match: keep to the plan, try the next query

      const volume = (matchingItem as { volumeInfo?: any }).volumeInfo;
      const mapped = mapGoogleBooksVolume(volume, cleanIsbn, fallbackCover);
      gbMetadata = mapped.metadata;
      hasRealGbCover = mapped.hasCover;
      break;
    }

    let jakartaMetadata: MetadataResponse | null = null;
    const availableMetadata = [olMetadata, gbMetadata].filter((metadata) => metadata !== null);
    const needsCatalogFallback = availableMetadata.length === 0 || availableMetadata.some((metadata) =>
      !metadata.title || !metadata.authors.length || !metadata.publisher || !metadata.publicationYear
      || !metadata.description || !metadata.pageCount
    );
    if (needsCatalogFallback) {
      try {
        jakartaMetadata = await fetchJakartaCatalogMetadata(cleanIsbn, normalizeIsbn13(cleanIsbn));
      } catch (err) {
        if (err instanceof ProviderLookupError) {
          recordFailure("jakarta_library", err.failure);
          console.warn("Jakarta library catalog fetch error:", err.message);
        } else {
          recordFailure("jakarta_library", "provider_error");
          console.warn("Jakarta library catalog fetch error:", redactSecrets(err));
        }
      }
    }

    // Merge verified records so regional catalogs can fill fields missing from global APIs.
    const sources = [olMetadata, gbMetadata, jakartaMetadata].filter(
      (metadata): metadata is MetadataResponse => metadata !== null,
    );
    if (sources.length > 0) {
      const choose = (getValue: (metadata: MetadataResponse) => string | number | undefined) =>
        sources.map(getValue).find((value) => value !== undefined && value !== "");
      const authors = sources.find((metadata) => metadata.authors.length > 0)?.authors || [];
      const categories = sources.find((metadata) => metadata.categories.length > 0)?.categories || [];
      const coverSource = sources.find((metadata) =>
        metadata.coverUrl && metadata.coverUrl !== fallbackCover
      );
      const metadata: MetadataResponse = {
        title: choose((item) => item.title as string) as string,
        subtitle: choose((item) => item.subtitle as string | undefined) as string | undefined,
        authors,
        publisher: choose((item) => item.publisher as string | undefined) as string | undefined,
        publicationYear: choose((item) => item.publicationYear) as number | undefined,
        isbn10: choose((item) => item.isbn10 as string | undefined) as string | undefined,
        isbn13: normalizeIsbn13(cleanIsbn),
        description: choose((item) => item.description as string | undefined) as string | undefined,
        language: choose((item) => item.language as string | undefined) as string | undefined,
        pageCount: choose((item) => item.pageCount) as number | undefined,
        coverUrl: coverSource?.coverUrl || fallbackCover,
        alternateCoverUrl: undefined,
        categories,
        source: sources.length > 1 ? "merged" : sources[0].source,
      };

      return new Response(JSON.stringify(metadata), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Every provider answered successfully and none had the record: a genuine not-found.
    if (failures.length === 0) {
      return new Response(
        JSON.stringify({
          found: false,
          isbn: cleanIsbn,
          message: "Book metadata not found in Open Library or Google Books.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // At least one provider failed: surface it as an error so the client can tell
    // "nothing matched" apart from "the lookup never completed".
    const combined = combineFailures(failures.map((entry) => entry.kind));
    const failureKind: ProviderFailureKind = combined?.kind || "provider_error";
    const failedProviders = failures.map((entry) => entry.provider).join(", ");
    const failureMessages: Record<ProviderFailureKind, string> = {
      rate_limited: "A metadata provider rate-limited this request.",
      timeout: "A metadata provider timed out before answering.",
      provider_error: "A metadata provider returned an error.",
    };
    return new Response(
      JSON.stringify({
        found: false,
        errorType: failureKind,
        error: `${failureMessages[failureKind]} (provider: ${failedProviders})`,
        failedProviders,
      }),
      {
        status: combined?.status || 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("book-metadata unexpected error:", redactSecrets(error));
    return new Response(
      JSON.stringify({
        found: false,
        errorType: "provider_error",
        error: "Unexpected error while looking up book metadata.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
