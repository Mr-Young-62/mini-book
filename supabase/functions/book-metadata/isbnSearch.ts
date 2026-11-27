// Pure helpers for the tiered ISBN lookup performed by the book-metadata Edge
// Function. Nothing here touches Deno globals, so the Vitest suite next to this
// file can exercise the search order, the HTTP failure mapping and the Google
// Books result verification directly.

export type ProviderFailureKind = "rate_limited" | "timeout" | "provider_error";

export type GoogleBooksQueryKind = "isbn_exact" | "text";

export interface GoogleBooksQuery {
  query: string;
  kind: GoogleBooksQueryKind;
}

export interface CombinedFailure {
  kind: ProviderFailureKind;
  status: number;
}

const FAILURE_PRIORITY: Record<ProviderFailureKind, number> = {
  rate_limited: 3,
  timeout: 2,
  provider_error: 1,
};

const FAILURE_STATUS: Record<ProviderFailureKind, number> = {
  rate_limited: 429,
  timeout: 504,
  provider_error: 502,
};

function stripNoise(value: string): string {
  return (value || "").replace(/[^0-9X]/gi, "").toUpperCase();
}

export function normalizeIsbn13(value: string): string {
  const cleaned = stripNoise(value);
  if (!/^\d{9}[\dX]$/.test(cleaned)) return cleaned;

  const core = `978${cleaned.slice(0, 9)}`;
  let sum = 0;
  for (let index = 0; index < core.length; index++) {
    sum += Number(core[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return `${core}${(10 - (sum % 10)) % 10}`;
}

export function hasValidIsbn10Checksum(value: string): boolean {
  if (!/^\d{9}[\dX]$/.test(value)) return false;
  let sum = 0;
  for (let index = 0; index < 10; index++) {
    const digit = value[index] === "X" ? 10 : Number(value[index]);
    sum += digit * (10 - index);
  }
  return sum % 11 === 0;
}

export function hasValidIsbn13Checksum(value: string): boolean {
  if (!/^97[89]\d{10}$/.test(value)) return false;
  let sum = 0;
  for (let index = 0; index < 12; index++) {
    sum += Number(value[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10 === Number(value[12]);
}

export function isValidIsbn(value: string): boolean {
  const cleaned = stripNoise(value);
  return cleaned.length === 10
    ? hasValidIsbn10Checksum(cleaned)
    : cleaned.length === 13
      ? hasValidIsbn13Checksum(cleaned)
      : false;
}

/** ISBN-13 → ISBN-10 with a recomputed check digit. 979 and malformed input have no counterpart. */
export function isbn13To10(value: string): string | undefined {
  const cleaned = stripNoise(value);
  if (cleaned.length !== 13 || !hasValidIsbn13Checksum(cleaned)) return undefined;
  if (!cleaned.startsWith("978")) return undefined;

  const core = cleaned.slice(3, 12);
  let sum = 0;
  for (let index = 0; index < 9; index++) {
    sum += Number(core[index]) * (10 - index);
  }
  const remainder = (11 - (sum % 11)) % 11;
  return core + (remainder === 10 ? "X" : String(remainder));
}

export function isbn10To13(value: string): string {
  const cleaned = stripNoise(value);
  if (cleaned.length !== 10) return cleaned;

  const core = `978${cleaned.slice(0, 9)}`;
  let sum = 0;
  for (let index = 0; index < core.length; index++) {
    sum += Number(core[index]) * (index % 2 === 0 ? 1 : 3);
  }
  return `${core}${(10 - (sum % 10)) % 10}`;
}

/**
 * Exact ISBN lookup terms in attempt order: ISBN-13 first, then the ISBN-10
 * counterpart of a 978 book. Duplicates are dropped so an ISBN-10 input never
 * triggers the same request twice, and 979 books are never converted.
 */
export function buildIsbnSearchTerms(cleaned: string): string[] {
  const terms: string[] = [];
  const push = (term?: string) => {
    if (term && !terms.includes(term)) terms.push(term);
  };

  if (cleaned.length === 13 && hasValidIsbn13Checksum(cleaned)) {
    push(cleaned);
    push(isbn13To10(cleaned));
  } else if (cleaned.length === 10 && hasValidIsbn10Checksum(cleaned)) {
    push(isbn10To13(cleaned));
    push(cleaned);
  }

  return terms;
}

/** Every identifier form a provider may legitimately answer with for this lookup. */
export function buildAcceptedIsbns(cleaned: string): Set<string> {
  const accepted = new Set<string>();
  if (cleaned.length === 13 && hasValidIsbn13Checksum(cleaned)) {
    accepted.add(cleaned);
    const isbn10 = isbn13To10(cleaned);
    if (isbn10) accepted.add(isbn10);
  } else if (cleaned.length === 10 && hasValidIsbn10Checksum(cleaned)) {
    accepted.add(cleaned);
    accepted.add(isbn10To13(cleaned));
  }
  return accepted;
}

export function matchesAcceptedIsbn(rawIdentifier: string, accepted: Set<string>): boolean {
  const cleaned = stripNoise(rawIdentifier);
  if (!cleaned) return false;
  if (accepted.has(cleaned)) return true;

  if (cleaned.length === 13 && hasValidIsbn13Checksum(cleaned)) {
    const isbn10 = isbn13To10(cleaned);
    return isbn10 ? accepted.has(isbn10) : false;
  }
  if (cleaned.length === 10 && hasValidIsbn10Checksum(cleaned)) {
    return accepted.has(isbn10To13(cleaned));
  }
  return false;
}

/**
 * Google Books query plan: exact `isbn:` queries first, and only as a last resort a
 * plain text query. Text hits are still subject to the ISBN verification.
 */
export function buildGoogleBooksQueries(searchTerms: string[]): GoogleBooksQuery[] {
  const queries: GoogleBooksQuery[] = searchTerms.map((term) => ({
    query: `isbn:${term}`,
    kind: "isbn_exact",
  }));
  const primary = searchTerms[0];
  if (primary) queries.push({ query: primary, kind: "text" });
  return queries;
}

/**
 * Returns the first Google Books volume whose industryIdentifiers prove the ISBN
 * (either directly or through its convertible counterpart). Unverifiable volumes are
 * never accepted, so a text search cannot silently populate metadata.
 */
export function pickVerifiedGoogleBooksItem(
  items: unknown,
  accepted: Set<string>,
): Record<string, unknown> | null {
  if (!Array.isArray(items)) return null;

  for (const entry of items) {
    if (!entry || typeof entry !== "object") continue;
    const volumeInfo = (entry as Record<string, unknown>).volumeInfo;
    if (!volumeInfo || typeof volumeInfo !== "object") continue;

    const identifiers = (volumeInfo as Record<string, unknown>).industryIdentifiers;
    if (!Array.isArray(identifiers)) continue;

    const verified = identifiers.some((identifier) => {
      const value = identifier && typeof identifier === "object"
        ? (identifier as Record<string, unknown>).identifier
        : undefined;
      return typeof value === "string" && matchesAcceptedIsbn(value, accepted);
    });

    if (verified) return entry as Record<string, unknown>;
  }

  return null;
}

/**
 * Maps a non-2xx provider response to a failure kind. `null` means the provider
 * answered with no record (404), which is a legitimate empty result rather than a
 * failure; 429, 5xx and unexpected 4xx are never turned into "not found".
 */
export function classifyHttpFailure(status: number): ProviderFailureKind | null {
  if (status >= 200 && status < 300) return null;
  if (status === 404) return null;
  if (status === 429) return "rate_limited";
  if (status === 408 || status === 504) return "timeout";
  return "provider_error";
}

/** Collapses recorded failures into one response: rate_limited beats timeout beats provider_error. */
export function combineFailures(kinds: ProviderFailureKind[]): CombinedFailure | null {
  if (kinds.length === 0) return null;
  const kind = kinds.reduce((worst, current) =>
    FAILURE_PRIORITY[current] > FAILURE_PRIORITY[worst] ? current : worst
  );
  return { kind, status: FAILURE_STATUS[kind] };
}
