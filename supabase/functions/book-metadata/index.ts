// Supabase Edge Function: book-metadata
// Secure server-side ISBN metadata lookup with multi-provider fallback (Open Library -> Google Books)

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
  categories: string[];
  source: "open_library" | "google_books" | "manual";
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

    // 1. Try Open Library Books API
    try {
      const olUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
      const olRes = await fetch(olUrl);
      if (olRes.ok) {
        const olData = await olRes.json();
        const bookKey = `ISBN:${cleanIsbn}`;
        const item = olData[bookKey];

        if (item) {
          const pubYear = item.publish_date
            ? parseInt(item.publish_date.match(/\d{4}/)?.[0] || "0", 10) || undefined
            : undefined;

          const metadata: MetadataResponse = {
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
            coverUrl: item.cover?.large || item.cover?.medium || item.cover?.small,
            categories: item.subjects
              ?.slice(0, 5)
              .map((s: { name: string } | string) => (typeof s === "string" ? s : s.name))
              .filter(Boolean) || [],
            source: "open_library",
          };

          return new Response(JSON.stringify(metadata), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } catch (err) {
      console.warn("Open Library fetch error:", err);
    }

    // 2. Fallback to Google Books API
    try {
      const gbApiKey = Deno.env.get("GOOGLE_BOOKS_API_KEY");
      const apiKeyParam = gbApiKey ? `&key=${gbApiKey}` : "";
      const gbUrl = `https://www.googleapis.com/books/v1/volumes?q=isbn:${cleanIsbn}${apiKeyParam}`;
      const gbRes = await fetch(gbUrl);

      if (gbRes.ok) {
        const gbData = await gbRes.json();
        if (gbData.items && gbData.items.length > 0) {
          const volume = gbData.items[0].volumeInfo;
          const pubYear = volume.publishedDate
            ? parseInt(volume.publishedDate.substring(0, 4), 10) || undefined
            : undefined;

          const identifiers = volume.industryIdentifiers || [];
          const isbn10Obj = identifiers.find((id: { type: string; identifier: string }) => id.type === "ISBN_10");
          const isbn13Obj = identifiers.find((id: { type: string; identifier: string }) => id.type === "ISBN_13");

          const metadata: MetadataResponse = {
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
            coverUrl: volume.imageLinks?.thumbnail?.replace("http://", "https://"),
            categories: volume.categories || [],
            source: "google_books",
          };

          return new Response(JSON.stringify(metadata), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } catch (err) {
      console.warn("Google Books fetch error:", err);
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
