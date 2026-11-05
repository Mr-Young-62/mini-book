// Supabase Edge Function: book-metadata
// Server-side ISBN metadata lookup with public-catalog fallbacks.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  const searchResponse = await fetch(searchUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MeelieFont/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  if (!searchResponse.ok) throw new Error(`Jakarta catalog search failed: HTTP ${searchResponse.status}`);

  const searchPage = await searchResponse.text();
  const detailLinks = [...searchPage.matchAll(
    /<a\b([^>]*href=["']([^"']*\/book\/detail\?cn=[^"']+)["'][^>]*)>([\s\S]*?)<\/a>/gi,
  )].slice(0, 5);

  for (const match of detailLinks) {
    const detailUrl = new URL(decodeHtml(match[2]), baseUrl);
    if (detailUrl.origin !== baseUrl || detailUrl.pathname !== "/book/detail") continue;

    const detailResponse = await fetch(detailUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MeelieFont/1.0)" },
      signal: AbortSignal.timeout(10000),
    });
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

function normalizeIsbn13(value: string): string {
  const cleaned = value.replace(/[^0-9X]/gi, "").toUpperCase();
  if (!/^\d{9}[\dX]$/.test(cleaned)) return cleaned;

  const core = `978${cleaned.slice(0, 9)}`;
  let sum = 0;
  for (let index = 0; index < core.length; index++) {
    sum += Number(core[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return `${core}${(10 - (sum % 10)) % 10}`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { isbn } = await req.json();

    if (!isbn) {
      return new Response(JSON.stringify({ error: "ISBN parameter is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clean ISBN: remove dashes and spaces
    const cleanIsbn = isbn.replace(/[-\s]/g, "").trim().toUpperCase();

    let olMetadata: MetadataResponse | null = null;
    let hasRealOlCover = false;

    // 1. Try Open Library Books API
    try {
      const olUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
      const olRes = await fetch(olUrl);
      if (olRes.ok) {
        const olData = await olRes.json();
        const bookKey = `ISBN:${cleanIsbn}`;
        const item = olData[bookKey];

        if (item && item.title) {
          const pubYear = item.publish_date
            ? parseInt(item.publish_date.match(/\b(19\d\d|20\d\d)\b/)?.[0] || "0", 10) || undefined
            : undefined;

          const verifiedCover = item.cover?.large || item.cover?.medium || item.cover?.small;
          hasRealOlCover = Boolean(verifiedCover);

          olMetadata = {
            title: item.title,
            subtitle: item.subtitle,
            authors: item.authors?.map((a: { name: string }) => a.name) || [],
            publisher: item.publishers?.[0]?.name,
            publicationYear: pubYear,
            isbn10: item.identifiers?.isbn_10?.[0] || (cleanIsbn.length === 10 ? cleanIsbn : undefined),
            isbn13: item.identifiers?.isbn_13?.[0] || (cleanIsbn.length === 13 ? cleanIsbn : cleanIsbn),
            description:
              typeof item.notes === "string"
                ? item.notes
                : typeof item.description === "object"
                  ? item.description?.value
                  : (item.description as string | undefined),
            pageCount: item.number_of_pages,
            coverUrl: verifiedCover || `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`,
            categories: item.subjects
              ?.slice(0, 5)
              .map((s: { name: string } | string) => (typeof s === "string" ? s : s.name))
              .filter(Boolean) || [],
            source: "open_library",
          };
        }
      }
    } catch (err) {
      console.warn("Open Library fetch error:", err);
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

    // 2. Query Google Books API (either as fallback or to complement partial Open Library data)
    let gbMetadata: MetadataResponse | null = null;
    let hasRealGbCover = false;

    try {
      const gbApiKey = Deno.env.get("GOOGLE_BOOKS_API_KEY");
      const apiKeyParam = gbApiKey ? `&key=${gbApiKey}` : "";
      const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}${apiKeyParam}`;
      const gbRes = await fetch(gbUrl);

      if (gbRes.ok) {
        const gbData = await gbRes.json();
        if (gbData.items && Array.isArray(gbData.items) && gbData.items.length > 0) {
          // BUG-03 fix: verify ISBN in industryIdentifiers, do not accept mismatched volume
          const matchingItem = gbData.items.find((item: any) => {
            const identifiers = item?.volumeInfo?.industryIdentifiers || [];
            return identifiers.some((id: any) => {
              const rawId = (id?.identifier || "").replace(/[-\s]/g, "").trim().toUpperCase();
              return rawId === cleanIsbn || normalizeIsbn13(rawId) === cleanIsbn;
            });
          });

          if (matchingItem && matchingItem.volumeInfo) {
            const volume = matchingItem.volumeInfo;
            const pubYear = volume.publishedDate
              ? parseInt(volume.publishedDate.substring(0, 4), 10) || undefined
              : undefined;

            const identifiers = volume.industryIdentifiers || [];
            const isbn10Obj = identifiers.find((id: { type: string; identifier: string }) => id.type === "ISBN_10");
            const isbn13Obj = identifiers.find((id: { type: string; identifier: string }) => id.type === "ISBN_13");

            let coverUrl =
              volume.imageLinks?.extraLarge ||
              volume.imageLinks?.large ||
              volume.imageLinks?.medium ||
              volume.imageLinks?.thumbnail;

            if (coverUrl) {
              coverUrl = coverUrl.replace(/^http:\/\//i, "https://");
              hasRealGbCover = true;
            }

            gbMetadata = {
              title: volume.title,
              subtitle: volume.subtitle,
              authors: volume.authors || [],
              publisher: volume.publisher,
              publicationYear: pubYear,
              isbn10: isbn10Obj?.identifier || (cleanIsbn.length === 10 ? cleanIsbn : undefined),
              isbn13: isbn13Obj?.identifier || (cleanIsbn.length === 13 ? cleanIsbn : cleanIsbn),
              description: volume.description,
              language: volume.language,
              pageCount: volume.pageCount,
              coverUrl: coverUrl || `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`,
              categories: volume.categories || [],
              source: "google_books",
            };
          }
        }
      }
    } catch (err) {
      console.warn("Google Books fetch error:", err);
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
        console.warn("Jakarta library catalog fetch error:", err);
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
        metadata.coverUrl && metadata.coverUrl !== `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`
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
        coverUrl: coverSource?.coverUrl || `https://covers.openlibrary.org/b/isbn/${cleanIsbn}-L.jpg`,
        alternateCoverUrl: undefined,
        categories,
        source: sources.length > 1 ? "merged" : sources[0].source,
      };

      return new Response(JSON.stringify(metadata), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If both failed to find record
    return new Response(
      JSON.stringify({
        found: false,
        isbn: cleanIsbn,
        message: "Book metadata not found in Open Library or Google Books.",
      }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
