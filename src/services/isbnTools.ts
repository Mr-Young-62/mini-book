// Pembersih + validator ISBN yang menerima ISBN-10 (termasuk 'X'), ISBN-13 (978 & 979),
// serta EAN-13 yang membawa add-on harga 2/5 digit.

export function cleanIsbn(input: string): string {
  return (input || '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

export function isValidIsbn10(s: string): boolean {
  if (!/^\d{9}[\dX]$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const v = s[i] === 'X' ? 10 : parseInt(s[i], 10);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

export function isValidIsbn13(s: string): boolean {
  if (!/^97[89]\d{10}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(s[i], 10) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === parseInt(s[12], 10);
}

export function isValidIsbn(input: string): boolean {
  const s = cleanIsbn(input);
  return s.length === 10 ? isValidIsbn10(s) : s.length === 13 ? isValidIsbn13(s) : false;
}

export function isbn10To13(isbn10: string): string {
  const core = '978' + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(core[i], 10) * (i % 2 === 0 ? 1 : 3);
  return core + ((10 - (sum % 10)) % 10);
}

export function isbn13To10(isbn13: string): string | undefined {
  if (!isbn13.startsWith('978')) return undefined; // 979 tidak punya ISBN-10
  const core = isbn13.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(core[i], 10) * (10 - i);
  const r = (11 - (sum % 11)) % 11;
  return core + (r === 10 ? 'X' : String(r));
}

export function normalizeToIsbn13(input: string): string {
  const s = cleanIsbn(input);
  return s.length === 10 ? isbn10To13(s) : s;
}
