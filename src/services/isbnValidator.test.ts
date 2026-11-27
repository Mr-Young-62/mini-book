import { describe, expect, it } from 'vitest';
import {
  cleanIsbn,
  convertIsbn10To13,
  extractIsbnCandidate,
  formatIsbn,
  isbn10To13,
  isbn13To10,
  isValidIsbn,
  isValidIsbn10,
  isValidIsbn13,
} from './isbnValidator';

describe('ISBN normalization', () => {
  it('strips separators', () => {
    expect(cleanIsbn('978-0-306-40615-7')).toBe('9780306406157');
  });

  it('drops EAN add-on digits', () => {
    expect(cleanIsbn('9780306406157 12')).toBe('9780306406157');
    expect(cleanIsbn('9780306406157 12345')).toBe('9780306406157');
  });

  it('converts ISBN-10 to ISBN-13', () => {
    expect(isbn10To13('0306406152')).toBe('9780306406157');
    expect(convertIsbn10To13('0306406152')).toBe('9780306406157');
  });

  it('converts ISBN-13 to ISBN-10 only for 978 prefixes', () => {
    expect(isbn13To10('9780306406157')).toBe('0306406152');
    expect(isbn13To10('9791234567896')).toBeUndefined();
  });
});

describe('ISBN-13 to ISBN-10 conversion', () => {
  it('recomputes a checksum-valid ISBN-10 that round-trips back', () => {
    const isbn10 = isbn13To10('9780306406157');

    expect(isbn10).toBe('0306406152');
    expect(isValidIsbn10(isbn10!)).toBe(true);
    expect(isbn10To13(isbn10!)).toBe('9780306406157');

    const another = isbn13To10('9780140449136');
    expect(another).toBe('0140449132');
    expect(isValidIsbn10(another!)).toBe(true);
    expect(isbn10To13(another!)).toBe('9780140449136');
  });

  it('emits an X check digit when the ISBN-10 remainder is 10', () => {
    expect(isbn13To10('9780000000064')).toBe('000000006X');
    expect(isValidIsbn10('000000006X')).toBe(true);
    expect(isbn10To13('000000006X')).toBe('9780000000064');
  });

  it('returns no counterpart for 979 books', () => {
    expect(isbn13To10('9791234567896')).toBeUndefined();
    expect(isbn13To10('9790000000001')).toBeUndefined();
  });

  it('returns no counterpart for malformed or checksum-invalid input', () => {
    expect(isbn13To10('978123')).toBeUndefined();
    expect(isbn13To10('0306406152')).toBeUndefined();
    expect(isbn13To10('')).toBeUndefined();
    expect(isbn13To10('9780306406158')).toBeUndefined();
  });
});

describe('ISBN validation', () => {
  it('accepts valid ISBN-10 and ISBN-13 values', () => {
    expect(isValidIsbn10('0306406152')).toBe(true);
    expect(isValidIsbn13('9780306406157')).toBe(true);
    expect(isValidIsbn('0-306-40615-2')).toBe(true);
    expect(isValidIsbn('978-0-306-40615-7')).toBe(true);
  });

  it('rejects invalid checksums and lengths', () => {
    expect(isValidIsbn('9780306406158')).toBe(false);
    expect(isValidIsbn('0306406153')).toBe(false);
    expect(isValidIsbn('12345')).toBe(false);
    expect(isValidIsbn('')).toBe(false);
  });

  it('accepts an ISBN-13 followed by an EAN add-on', () => {
    expect(isValidIsbn('9780306406157 12')).toBe(true);
  });
});

describe('ISBN formatting and extraction', () => {
  it('formats ISBN-13 with hyphens', () => {
    expect(formatIsbn('9780306406157')).toBe('978-0-306-40615-7');
  });

  it('extracts a valid ISBN from noisy scanner text', () => {
    expect(extractIsbnCandidate('ISBN 978-0-306-40615-7 12')).toBe('9780306406157');
  });

  it('returns null when no valid ISBN is present', () => {
    expect(extractIsbnCandidate('not an isbn')).toBeNull();
  });
});
