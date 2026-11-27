export function cleanIsbn(input: string): string {
  const withoutNoise = (input || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (/^(97[89]\d{10})(\d{2}|\d{5})$/.test(withoutNoise)) {
    return withoutNoise.slice(0, 13);
  }
  return withoutNoise;
}

export function isValidIsbn10(s: string): boolean {
  const cleaned = cleanIsbn(s);
  if (!/^\d{9}[\dX]$/.test(cleaned)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const v = cleaned[i] === 'X' ? 10 : parseInt(cleaned[i], 10);
    sum += v * (10 - i);
  }
  return sum % 11 === 0;
}

export function isValidIsbn13(s: string): boolean {
  const cleaned = cleanIsbn(s);
  if (!/^97[89]\d{10}$/.test(cleaned)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(cleaned[i], 10) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10 === parseInt(cleaned[12], 10);
}

export function isValidIsbn(input: string): boolean {
  const s = cleanIsbn(input);
  return s.length === 10 ? isValidIsbn10(s) : s.length === 13 ? isValidIsbn13(s) : false;
}

export function isbn10To13(isbn10: string): string {
  const cleaned = cleanIsbn(isbn10);
  if (cleaned.length !== 10) return cleaned;
  const core = '978' + cleaned.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(core[i], 10) * (i % 2 === 0 ? 1 : 3);
  return core + ((10 - (sum % 10)) % 10);
}

export function isbn13To10(isbn13: string): string | undefined {
  const cleaned = cleanIsbn(isbn13);
  // Only a checksum-valid ISBN-13 yields a meaningful ISBN-10 counterpart;
  // a malformed or 979-prefixed number has no counterpart at all.
  if (!isValidIsbn13(cleaned)) return undefined;
  if (!cleaned.startsWith('978')) return undefined;
  const core = cleaned.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(core[i], 10) * (10 - i);
  const r = (11 - (sum % 11)) % 11;
  return core + (r === 10 ? 'X' : String(r));
}

export function normalizeToIsbn13(input: string): string {
  const s = cleanIsbn(input);
  return s.length === 10 ? isbn10To13(s) : s;
}

export function convertIsbn10To13(isbn10: string): string {
  return isbn10To13(isbn10);
}

export function formatIsbn(isbn: string): string {
  const cleaned = cleanIsbn(isbn);
  if (cleaned.length === 13) {
    if (cleaned.startsWith('978634')) {
      const registrationRange = Number(cleaned.slice(6));
      const registrantLength =
        registrationRange <= 599999 ? 2
          : registrationRange >= 2000000 && registrationRange <= 3999999 ? 3
            : registrationRange >= 7000000 && registrationRange <= 8499999 ? 4
              : registrationRange >= 9600000 && registrationRange <= 9999999 ? 5
                : 0;
      if (registrantLength > 0) {
        const registrantEnd = 6 + registrantLength;
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, registrantEnd)}-${cleaned.slice(registrantEnd, 12)}-${cleaned.slice(12)}`;
      }
    }
    if (cleaned.startsWith('978602')) {
      const registrantRange = Number(cleaned.slice(6, 8));
      if (registrantRange >= 62 && registrantRange <= 69) {
        return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}-${cleaned.slice(10, 12)}-${cleaned.slice(12)}`;
      }
    }
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 4)}-${cleaned.slice(4, 7)}-${cleaned.slice(7, 12)}-${cleaned.slice(12)}`;
  }
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 1)}-${cleaned.slice(1, 4)}-${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  return isbn;
}

export function extractIsbnCandidate(input: string): string | null {
  const raw = (input ?? '').trim();
  if (!raw) return null;

  const direct = cleanIsbn(raw);
  if (direct && (isValidIsbn10(direct) || isValidIsbn13(direct))) {
    return normalizeToIsbn13(direct);
  }

  const seen = new Set<string>();
  const pushCandidate = (value?: string | null) => {
    if (!value) return null;
    const candidate = cleanIsbn(value);
    if (!candidate || candidate.length < 8 || candidate.length > 13 || seen.has(candidate)) return null;
    seen.add(candidate);
    return candidate;
  };

  for (const pattern of [
    /(?:isbn|ean|upc)[\s:=-]*([0-9]{8,13}[Xx]?)/gi,
    /"isbn"\s*:\s*"?([0-9]{8,13}[Xx]?)"?/gi,
    /(?:^|[^0-9])((?:97[89]\d{10}|\d{9}[\dXx]))(?=[^0-9]|$)/gi,
    /(?:^|[^0-9])((?:97[89]\d{10}|\d{9}[\dXx]))(?:[^0-9]|$)/gi,
  ]) {
    for (const match of raw.matchAll(pattern)) {
      const candidate = pushCandidate(match[1] ?? match[0]);
      if (!candidate) continue;

      if (candidate.length === 10 && isValidIsbn10(candidate)) {
        return normalizeToIsbn13(candidate);
      }
      if (candidate.length === 13 && isValidIsbn13(candidate)) {
        return normalizeToIsbn13(candidate);
      }
    }
  }

  const urlPatterns = [
    /(?:^|[?&/])(?:isbn|ean|upc)[=_:-]*([0-9]{8,13}[Xx]?)/gi,
    /(?:isbn|ean|upc)\b[^0-9]{0,4}([0-9]{8,13}[Xx]?)/gi,
  ];

  for (const pattern of urlPatterns) {
    for (const match of raw.matchAll(pattern)) {
      const candidate = pushCandidate(match[1]);
      if (!candidate) continue;

      if (candidate.length === 10 && isValidIsbn10(candidate)) {
        return normalizeToIsbn13(candidate);
      }
      if (candidate.length === 13 && isValidIsbn13(candidate)) {
        return normalizeToIsbn13(candidate);
      }
    }
  }

  return null;
}
