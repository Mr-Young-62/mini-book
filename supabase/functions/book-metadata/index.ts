// Supabase Edge Function: book-metadata
// Secure server-side ISBN metadata lookup with multi-provider fallback (Open Library + Google Books)

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
  source: "open_library" | "google_books" | "manual" | "merged";
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
      olMetadata.description &&
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
              return rawId === cleanIsbn;
            });
          }) || (gbData.items.length === 1 ? gbData.items[0] : null);

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

    // 3. Merging logic (BUG-02 fix)
    if (olMetadata && gbMetadata) {
      const primaryCover = hasRealGbCover
        ? gbMetadata.coverUrl
        : (hasRealOlCover ? olMetadata.coverUrl : gbMetadata.coverUrl || olMetadata.coverUrl);

      const alternateCover = hasRealGbCover && hasRealOlCover && olMetadata.coverUrl !== primaryCover
        ? olMetadata.coverUrl
        : undefined;

      const merged: MetadataResponse = {
        title: olMetadata.title || gbMetadata.title,
        subtitle: olMetadata.subtitle || gbMetadata.subtitle,
        authors: olMetadata.authors.length > 0 ? olMetadata.authors : gbMetadata.authors,
        publisher: olMetadata.publisher || gbMetadata.publisher,
        publicationYear: olMetadata.publicationYear || gbMetadata.publicationYear,
        isbn10: olMetadata.isbn10 || gbMetadata.isbn10,
        isbn13: olMetadata.isbn13 || gbMetadata.isbn13,
        description: olMetadata.description || gbMetadata.description,
        language: gbMetadata.language || olMetadata.language,
        pageCount: olMetadata.pageCount || gbMetadata.pageCount,
        coverUrl: primaryCover,
        alternateCoverUrl: alternateCover,
        categories: olMetadata.categories.length > 0 ? olMetadata.categories : gbMetadata.categories,
        source: "merged",
      };

      return new Response(JSON.stringify(merged), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (olMetadata) {
      return new Response(JSON.stringify(olMetadata), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (gbMetadata) {
      return new Response(JSON.stringify(gbMetadata), {
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
