import { describe, expect, it } from 'vitest';
import {
  buildAcceptedIsbns,
  buildGoogleBooksQueries,
  buildIsbnSearchTerms,
  classifyHttpFailure,
  combineFailures,
  isbn13To10,
  matchesAcceptedIsbn,
  pickVerifiedGoogleBooksItem,
} from './isbnSearch.ts';

const ISBN13 = '9780306406157';
const ISBN10 = '0306406152';
const ISBN13_979 = '9791234567896';

describe('tiered ISBN search plan', () => {
  it('tries the exact ISBN-13 first, then the ISBN-10 counterpart of a 978 book', () => {
    expect(buildIsbnSearchTerms(ISBN13)).toEqual([ISBN13, ISBN10]);
  });

  it('never converts a 979 ISBN-13, which has no ISBN-10 counterpart', () => {
    expect(buildIsbnSearchTerms(ISBN13_979)).toEqual([ISBN13_979]);
    expect(isbn13To10(ISBN13_979)).toBeUndefined();
  });

  it('does not issue a duplicate request when the input is already an ISBN-10', () => {
    const terms = buildIsbnSearchTerms(ISBN10);
    expect(terms).toEqual([ISBN13, ISBN10]);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it('returns no terms for input that is not an ISBN', () => {
    expect(buildIsbnSearchTerms('12345')).toEqual([]);
  });
});

describe('ISBN-13 to ISBN-10 conversion', () => {
  it('recomputes a checksum-valid ISBN-10', () => {
    for (const [isbn13, isbn10] of [[ISBN13, ISBN10], ['9780140449136', '0140449132']]) {
      const converted = isbn13To10(isbn13);
      expect(converted).toBe(isbn10);
      expect(converted).toMatch(/^\d{9}[\dX]$/);
      expect(isbn10To13RoundTrip(converted!)).toBe(isbn13);
    }
  });

  it('emits an X check digit when the ISBN-10 remainder is 10', () => {
    expect(isbn13To10('9780000000064')).toBe('000000006X');
  });

  it('returns undefined for 979, malformed and ISBN-10 input', () => {
    expect(isbn13To10(ISBN13_979)).toBeUndefined();
    expect(isbn13To10('978123')).toBeUndefined();
    expect(isbn13To10('0306406152')).toBeUndefined();
  });
});

function isbn10To13RoundTrip(isbn10: string): string {
  const core = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < core.length; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3);
  return `${core}${(10 - (sum % 10)) % 10}`;
}

describe('provider failure classification', () => {
  it('maps 429 to rate_limited and 5xx to provider_error', () => {
    expect(classifyHttpFailure(429)).toBe('rate_limited');
    expect(classifyHttpFailure(500)).toBe('provider_error');
    expect(classifyHttpFailure(503)).toBe('provider_error');
    expect(classifyHttpFailure(403)).toBe('provider_error');
  });

  it('maps timeouts apart from other server errors', () => {
    expect(classifyHttpFailure(408)).toBe('timeout');
    expect(classifyHttpFailure(504)).toBe('timeout');
  });

  it('treats 404 as an empty answer rather than a failure', () => {
    expect(classifyHttpFailure(404)).toBeNull();
    expect(classifyHttpFailure(200)).toBeNull();
  });

  it('turns recorded failures into the matching HTTP status', () => {
    expect(combineFailures(['provider_error'])).toEqual({ kind: 'provider_error', status: 502 });
    expect(combineFailures(['provider_error', 'timeout'])).toEqual({ kind: 'timeout', status: 504 });
    expect(combineFailures(['provider_error', 'timeout', 'rate_limited'])).toEqual({
      kind: 'rate_limited',
      status: 429,
    });
    expect(combineFailures([])).toBeNull();
  });
});

describe('Google Books query plan', () => {
  it('runs exact isbn: queries first and the plain text query only afterwards', () => {
    expect(buildGoogleBooksQueries([ISBN13, ISBN10])).toEqual([
      { query: `isbn:${ISBN13}`, kind: 'isbn_exact' },
      { query: `isbn:${ISBN10}`, kind: 'isbn_exact' },
      { query: ISBN13, kind: 'text' },
    ]);
  });

  it('offers no ISBN-10 query for a 979 book', () => {
    expect(buildGoogleBooksQueries([ISBN13_979]).map((entry) => entry.query)).toEqual([
      `isbn:${ISBN13_979}`,
      ISBN13_979,
    ]);
  });
});

function volumeWithIdentifiers(identifiers: unknown[]): Record<string, unknown> {
  return { volumeInfo: { title: 'Someone else', industryIdentifiers: identifiers } };
}

describe('Google Books result verification', () => {
  const accepted = buildAcceptedIsbns(ISBN13);

  it('rejects a volume whose ISBN does not match the lookup', () => {
    const items = [
      volumeWithIdentifiers([{ type: 'ISBN_13', identifier: '9780140449136' }]),
      volumeWithIdentifiers([{ type: 'OTHER', identifier: 'xyz' }]),
    ];
    expect(pickVerifiedGoogleBooksItem(items, accepted)).toBeNull();
  });

  it('accepts a volume carrying the exact ISBN-13', () => {
    const items = [volumeWithIdentifiers([{ type: 'ISBN_13', identifier: ISBN13 }])];
    expect(pickVerifiedGoogleBooksItem(items, accepted)).toBe(items[0]);
  });

  it('accepts the ISBN-10 counterpart of a 978 book', () => {
    const items = [volumeWithIdentifiers([{ type: 'ISBN_10', identifier: ISBN10 }])];
    expect(pickVerifiedGoogleBooksItem(items, accepted)).toBe(items[0]);
  });

  it('never accepts a volume without verifiable identifiers', () => {
    expect(pickVerifiedGoogleBooksItem([{ volumeInfo: { title: 'No identifiers' } }], accepted)).toBeNull();
    expect(pickVerifiedGoogleBooksItem([{ volumeInfo: { industryIdentifiers: [] } }], accepted)).toBeNull();
    expect(pickVerifiedGoogleBooksItem([{ volumeInfo: {} }], accepted)).toBeNull();
  });

  it('rejects a 978 counterpart for a 979 lookup', () => {
    const items = [volumeWithIdentifiers([{ type: 'ISBN_13', identifier: '9780306406157' }])];
    expect(pickVerifiedGoogleBooksItem(items, buildAcceptedIsbns(ISBN13_979))).toBeNull();
  });

  it('ignores malformed payloads', () => {
    expect(pickVerifiedGoogleBooksItem(undefined, accepted)).toBeNull();
    expect(pickVerifiedGoogleBooksItem({ items: [] }, accepted)).toBeNull();
    expect(pickVerifiedGoogleBooksItem([null, 'string'], accepted)).toBeNull();
  });

  it('matches identifiers across separators and case', () => {
    expect(matchesAcceptedIsbn('978-0-306-40615-7', accepted)).toBe(true);
    expect(matchesAcceptedIsbn('0306406152', accepted)).toBe(true);
    expect(matchesAcceptedIsbn('9780140449136', accepted)).toBe(false);
  });
});
