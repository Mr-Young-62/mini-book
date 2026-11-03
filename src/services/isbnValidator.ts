/**
 * ISBN Validation, Normalization, and Formatting Utilities
 * Supports ISBN-10 and ISBN-13 (EAN-13) with mathematical checksum verification.
 */

export function cleanIsbn(input: string): string {
  return input.replace(/[-\s]/g, '').trim().toUpperCase();
}

/**
 * Validate an ISBN-10 checksum
 * Formula: (10*d1 + 9*d2 + 8*d3 + ... + 1*d10) % 11 == 0
 */
export function isValidIsbn10(isbn: string): boolean {
  const cleaned = cleanIsbn(isbn);
  if (!/^\d{9}[\dX]$/.test(cleaned)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cleaned[i], 10) * (10 - i);
  }
  const lastChar = cleaned[9];
  sum += lastChar === 'X' ? 10 : parseInt(lastChar, 10);

  return sum % 11 === 0;
}

/**
 * Validate an ISBN-13 (EAN-13) checksum
 * Formula: (d1*1 + d2*3 + d3*1 + d4*3 + ... + d13*1) % 10 == 0
 */
export function isValidIsbn13(isbn: string): boolean {
  const cleaned = cleanIsbn(isbn);
  if (!/^\d{13}$/.test(cleaned)) {
    return false;
  }

  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const digit = parseInt(cleaned[i], 10);
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }

  return sum % 10 === 0;
}

/**
 * General validator for any ISBN (10 or 13)
 */
export function isValidIsbn(isbn: string): boolean {
  const cleaned = cleanIsbn(isbn);
  if (cleaned.length === 10) return isValidIsbn10(cleaned);
  if (cleaned.length === 13) return isValidIsbn13(cleaned);
  return false;
}

/**
 * Convert valid ISBN-10 to standard normalized ISBN-13
 */
export function convertIsbn10To13(isbn10: string): string {
  const cleaned = cleanIsbn(isbn10);
  if (cleaned.length !== 10) return cleaned;

  const core = '978' + cleaned.substring(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(core[i], 10);
    sum += digit * (i % 2 === 0 ? 1 : 3);
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return core + checkDigit.toString();
}

/**
 * Standardize any ISBN input into canonical ISBN-13
 */
export function normalizeToIsbn13(isbn: string): string {
  const cleaned = cleanIsbn(isbn);
  if (cleaned.length === 10) {
    return convertIsbn10To13(cleaned);
  }
  return cleaned;
}

/**
 * Prettify ISBN for clean display (e.g. 978-0-13-235088-4)
 */
export function formatIsbn(isbn: string): string {
  const cleaned = cleanIsbn(isbn);
  if (cleaned.length === 13) {
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7, 12)}-${cleaned.slice(12)}`;
  }
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 1)}-${cleaned.slice(1, 4)}-${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  return isbn;
}
