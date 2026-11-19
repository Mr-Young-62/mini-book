import {
  cleanIsbn,
  extractIsbnCandidate,
  isbn10To13,
  isbn13To10,
  isValidIsbn10,
  isValidIsbn13,
} from './isbnValidator';

export type ResolvedCode =
  | { kind: 'isbn'; isbn13: string; isbn10?: string; raw: string }
  | { kind: 'invalid_isbn'; digits: string; raw: string }
  | { kind: 'unknown'; raw: string };

const LOOKS_LIKE_URL = /^(https?:\/\/|www\.)/i;
const EAN_SUPPLEMENT = /^(97[89]\d{10})[-\s]?(\d{2}|\d{5})$/;

function asIsbn(digits: string, raw: string): ResolvedCode | null {
  if (digits.length === 13 && isValidIsbn13(digits)) {
    return { kind: 'isbn', isbn13: digits, isbn10: isbn13To10(digits), raw };
  }
  if (digits.length === 10 && isValidIsbn10(digits)) {
    return { kind: 'isbn', isbn13: isbn10To13(digits), isbn10: digits, raw };
  }
  return null;
}

function maybeInvalidIsbnCandidate(digits: string, raw: string): ResolvedCode | null {
  const cleaned = cleanIsbn(digits);
  if (!cleaned) return null;
  if (!/^(?:97[89]\d{10}|\d{9}[\dX])$/.test(cleaned)) return null;
  if (cleaned.length === 13 && /^97[89]/.test(cleaned)) return { kind: 'invalid_isbn', digits: cleaned, raw };
  if (cleaned.length === 10) return { kind: 'invalid_isbn', digits: cleaned, raw };
  return null;
}

export function resolveScannedCode(rawInput: string): ResolvedCode {
  const raw = (rawInput || '').trim();
  if (!raw) return { kind: 'unknown', raw };

  const eanSupplement = raw.match(EAN_SUPPLEMENT);
  if (eanSupplement) {
    const base = eanSupplement[1];
    const resolved = asIsbn(base, raw);
    if (resolved) return resolved;
  }

  const isbnHit = extractIsbnCandidate(raw);
  if (isbnHit) {
    const resolved = asIsbn(isbnHit, raw);
    if (resolved) return resolved;
  }

  if (/^[0-9Xx\-\s]+$/.test(raw)) {
    const digits = cleanIsbn(raw);
    if (!digits) return { kind: 'unknown', raw };

    if (digits.length === 10 || digits.length === 13) {
      const direct = asIsbn(digits, raw);
      if (direct) return direct;
      const invalid = maybeInvalidIsbnCandidate(digits, raw);
      if (invalid) return invalid;
    }

    if (raw.length > 0 && !/^[0-9]+$/.test(raw)) {
      return { kind: 'unknown', raw };
    }

    return { kind: 'unknown', raw };
  }

  if (LOOKS_LIKE_URL.test(raw)) {
    const urlIsbn = extractIsbnCandidate(raw);
    if (urlIsbn) {
      const resolved = asIsbn(urlIsbn, raw);
      if (resolved) return resolved;
    }

    return { kind: 'unknown', raw };
  }

  if (raw.startsWith('{') || raw.startsWith('[') || raw.includes(':')) {
    const jsonIsbn = extractIsbnCandidate(raw);
    if (jsonIsbn) {
      const resolved = asIsbn(jsonIsbn, raw);
      if (resolved) return resolved;
    }
  }

  const digitsOnly = cleanIsbn(raw);
  if (/^(?:97[89]\d{10}|\d{9}[\dX])$/.test(digitsOnly)) {
    const invalid = maybeInvalidIsbnCandidate(digitsOnly, raw);
    if (invalid) return invalid;
  }

  return { kind: 'unknown', raw };
}
