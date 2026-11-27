export interface BookPalette {
  cover: string;
  spine: string;
  spineBottom: string;
  bottomWrap: string;
  edge: string;
  ribbon: string;
  ribbonEnd: string;
  textOnSurface: string;
}

export const FALLBACK_BOOK_PALETTES: readonly BookPalette[] = [
  {
    cover: '#2E584B',
    spine: '#24483D',
    spineBottom: '#1F3F35',
    bottomWrap: '#162F27',
    edge: '#2E584B',
    ribbon: '#F59553',
    ribbonEnd: '#FBC573',
    textOnSurface: '#FFFFFF',
  }, // Forest Green
  {
    cover: '#D1432A',
    spine: '#A72914',
    spineBottom: '#991F12',
    bottomWrap: '#7D1708',
    edge: '#D1432A',
    ribbon: '#F59553',
    ribbonEnd: '#FBC573',
    textOnSurface: '#FFFFFF',
  }, // Warm Terracotta Crimson
  {
    cover: '#264166',
    spine: '#1C304E',
    spineBottom: '#172943',
    bottomWrap: '#101E33',
    edge: '#264166',
    ribbon: '#F59553',
    ribbonEnd: '#FBC573',
    textOnSurface: '#FFFFFF',
  }, // Deep Slate Navy
  {
    cover: '#5A4786',
    spine: '#443568',
    spineBottom: '#3B2D5C',
    bottomWrap: '#2D2147',
    edge: '#5A4786',
    ribbon: '#F2994A',
    ribbonEnd: '#F7C674',
    textOnSurface: '#FFFFFF',
  }, // Amethyst Purple
  {
    cover: '#5D3358',
    spine: '#452441',
    spineBottom: '#3B1E38',
    bottomWrap: '#2B1429',
    edge: '#5D3358',
    ribbon: '#F2994A',
    ribbonEnd: '#F7C674',
    textOnSurface: '#FFFFFF',
  }, // Plum Burgundy
  {
    cover: '#487A52',
    spine: '#355D3D',
    spineBottom: '#2E5236',
    bottomWrap: '#223E28',
    edge: '#487A52',
    ribbon: '#F59553',
    ribbonEnd: '#FBC573',
    textOnSurface: '#FFFFFF',
  }, // Botanical Sage
  {
    cover: '#883858',
    spine: '#672842',
    spineBottom: '#5A2239',
    bottomWrap: '#441729',
    edge: '#883858',
    ribbon: '#F2994A',
    ribbonEnd: '#F7C674',
    textOnSurface: '#FFFFFF',
  }, // Dusty Berry
  {
    cover: '#6F5037',
    spine: '#523A27',
    spineBottom: '#473221',
    bottomWrap: '#362417',
    edge: '#6F5037',
    ribbon: '#F59553',
    ribbonEnd: '#FBC573',
    textOnSurface: '#FFFFFF',
  }, // Warm Walnut
  {
    cover: '#235A67',
    spine: '#18424C',
    spineBottom: '#143942',
    bottomWrap: '#0D2A31',
    edge: '#235A67',
    ribbon: '#F59553',
    ribbonEnd: '#FBC573',
    textOnSurface: '#FFFFFF',
  }, // Ocean Teal
  {
    cover: '#B46427',
    spine: '#8C4B1B',
    spineBottom: '#7B4016',
    bottomWrap: '#5E2F0E',
    edge: '#B46427',
    ribbon: '#C83E25',
    ribbonEnd: '#E05A3C',
    textOnSurface: '#FFFFFF',
  }, // Warm Amber
];

const PALETTE_STORAGE_KEY = 'meeliefont_book_palettes_v3';
const MAX_STORED_PALETTES = 200;

const paletteCache = new Map<string, BookPalette>();
const inflightExtractions = new Map<string, Promise<BookPalette | null>>();
let storedPalettesLoaded = false;

function readStoredPalettes(): Record<string, BookPalette> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(PALETTE_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, BookPalette>)
      : {};
  } catch {
    return {};
  }
}

function hydratePaletteCache(): void {
  if (storedPalettesLoaded) return;
  storedPalettesLoaded = true;
  const stored = readStoredPalettes();
  for (const [key, value] of Object.entries(stored)) {
    if (value && typeof value.cover === 'string' && typeof value.spine === 'string') {
      paletteCache.set(key, value);
    }
  }
}

function persistPalette(key: string, palette: BookPalette): void {
  paletteCache.set(key, palette);
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const stored = readStoredPalettes();
    delete stored[key];
    stored[key] = palette;
    const keys = Object.keys(stored);
    if (keys.length > MAX_STORED_PALETTES) {
      for (const oldest of keys.slice(0, keys.length - MAX_STORED_PALETTES)) {
        delete stored[oldest];
      }
    }
    window.localStorage.setItem(PALETTE_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    /* ignore storage quota or privacy-mode errors */
  }
}

export function getCachedBookPalette(coverUrl?: string): BookPalette | undefined {
  const normalized = normalizeCoverUrl(coverUrl);
  if (!normalized) return undefined;
  hydratePaletteCache();
  return paletteCache.get(normalized);
}

export function normalizeCoverUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const value = String(url).trim();
  if (!value) return undefined;
  if (value.startsWith('//')) return `https:${value}`;
  return value.replace(/^http:\/\//i, 'https://');
}

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '0.0.0.0' ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    return true;
  }
  if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match172 = host.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const octet = Number(match172[1]);
    if (octet >= 16 && octet <= 31) return true;
  }
  return false;
}

export function buildCorsColorSampleUrls(
  url: string,
  options?: { includeLocalProxy?: boolean },
): string[] {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return [];
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return [];
    if (isPrivateOrLocalHostname(parsed.hostname)) return [];
    const host = parsed.hostname.toLowerCase();
    if (host === 'wsrv.nl' || host === 'i0.wp.com') return [];
    if (parsed.pathname.includes('/storage/v1/object/sign/')) return [];

    const queryLower = parsed.search.toLowerCase();
    if (
      queryLower.includes('token=') ||
      queryLower.includes('sig=') ||
      queryLower.includes('signature=') ||
      queryLower.includes('x-amz-signature=')
    ) {
      return [];
    }

    const candidates: string[] = [];
    if (options?.includeLocalProxy) {
      candidates.push(`/__cover-proxy?url=${encodeURIComponent(url)}`);
    }
    candidates.push(`https://wsrv.nl/?url=${encodeURIComponent(url)}&w=48&h=64&fit=cover&output=png`);
    if (parsed.search === '') {
      candidates.push(`https://i0.wp.com/${parsed.host}${parsed.pathname}?w=64`);
    }
    return candidates;
  } catch {
    return [];
  }
}

export function buildCorsColorSampleUrl(url: string): string | null {
  const candidates = buildCorsColorSampleUrls(url, { includeLocalProxy: false });
  return candidates[0] ?? null;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [clampByte(r), clampByte(g), clampByte(b)]
      .map((channel) => channel.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function relativeLuminance(r: number, g: number, b: number): number {
  const linearize = (value: number) => {
    const c = clampByte(value) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = clampByte(r) / 255;
  const gn = clampByte(g) / 255;
  const bn = clampByte(b) / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) {
    return [0, 0, l];
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === rn) {
    h = (gn - bn) / d + (gn < bn ? 6 : 0);
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return [(h * 60) % 360, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360;
  if (s === 0) {
    const v = clampByte(l * 255);
    return [v, v, v];
  }

  const hueToChannel = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hNorm = hue / 360;
  return [
    clampByte(hueToChannel(p, q, hNorm + 1 / 3) * 255),
    clampByte(hueToChannel(p, q, hNorm) * 255),
    clampByte(hueToChannel(p, q, hNorm - 1 / 3) * 255),
  ];
}

export function getFallbackBookPalette(seed: string): BookPalette {
  const clean = (seed || 'book').trim();
  let hash = 0;
  for (let i = 0; i < clean.length; i += 1) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return FALLBACK_BOOK_PALETTES[hash % FALLBACK_BOOK_PALETTES.length];
}

export function derivePaletteFromRgb(
  r: number,
  g: number,
  b: number,
  edgeRgb?: readonly [number, number, number],
): BookPalette {
  const [h, s, l] = rgbToHsl(r, g, b);
  let cr = 0;
  let cg = 0;
  let cb = 0;
  let sr = 0;
  let sg = 0;
  let sb = 0;
  let sbr = 0;
  let sbg = 0;
  let sbb = 0;
  let wr = 0;
  let wg = 0;
  let wb = 0;

  if (s >= 0.1) {
    // 1. Base front cover
    const coverS = Math.min(0.72, Math.max(0.28, s * 1.12));
    let coverL = Math.min(0.4, Math.max(0.28, l * 0.74));
    [cr, cg, cb] = hslToRgb(h, coverS, coverL);
    while (relativeLuminance(cr, cg, cb) > 0.2 && coverL > 0.22) {
      coverL = Math.max(0.22, coverL - 0.025);
      [cr, cg, cb] = hslToRgb(h, coverS, coverL);
    }

    // 2. Shadow 1 (left rounded spine vertical gradient)
    const spineS = Math.min(0.76, Math.max(0.28, coverS * 1.05));
    let spineL = Math.max(0.16, coverL - 0.085);
    [sr, sg, sb] = hslToRgb(h, spineS, spineL);
    if (toHex(sr, sg, sb) === toHex(cr, cg, cb)) {
      spineL = Math.max(0.14, spineL - 0.03);
      [sr, sg, sb] = hslToRgb(h, spineS, spineL);
    }

    let spineBottomL = Math.max(0.13, spineL - 0.03);
    [sbr, sbg, sbb] = hslToRgb(h, spineS, spineBottomL);

    // 3. Shadow 2 (darkest bottom C-wrap casing)
    const wrapS = Math.min(0.8, Math.max(0.3, spineS * 1.06));
    let wrapL = Math.max(0.08, spineL - 0.075);
    [wr, wg, wb] = hslToRgb(h, wrapS, wrapL);
    if (toHex(wr, wg, wb) === toHex(sr, sg, sb) || toHex(wr, wg, wb) === toHex(sbr, sbg, sbb)) {
      wrapL = Math.max(0.06, spineBottomL - 0.04);
      [wr, wg, wb] = hslToRgb(h, wrapS, wrapL);
    }
  } else {
    let coverL = Math.min(0.34, Math.max(0.24, l * 0.68));
    [cr, cg, cb] = hslToRgb(h, s, coverL);
    while (relativeLuminance(cr, cg, cb) > 0.2 && coverL > 0.18) {
      coverL = Math.max(0.18, coverL - 0.025);
      [cr, cg, cb] = hslToRgb(h, s, coverL);
    }

    let spineL = Math.max(0.16, coverL - 0.08);
    [sr, sg, sb] = hslToRgb(h, s, spineL);
    if (toHex(sr, sg, sb) === toHex(cr, cg, cb)) {
      spineL = Math.max(0.13, spineL - 0.03);
      [sr, sg, sb] = hslToRgb(h, s, spineL);
    }

    const spineBottomL = Math.max(0.13, spineL - 0.03);
    [sbr, sbg, sbb] = hslToRgb(h, s, spineBottomL);

    let wrapL = Math.max(0.08, spineL - 0.07);
    [wr, wg, wb] = hslToRgb(h, s, wrapL);
    if (toHex(wr, wg, wb) === toHex(sr, sg, sb) || toHex(wr, wg, wb) === toHex(sbr, sbg, sbb)) {
      wrapL = Math.max(0.05, spineBottomL - 0.04);
      [wr, wg, wb] = hslToRgb(h, s, wrapL);
    }
  }

  const edgeHex = edgeRgb
    ? toHex(edgeRgb[0], edgeRgb[1], edgeRgb[2])
    : toHex(cr, cg, cb);

  const isWarmAmber = s >= 0.22 && h >= 22 && h <= 68;
  const isPurpleFamily = s >= 0.15 && h >= 250 && h < 340;
  const [ribbon, ribbonEnd] = isWarmAmber
    ? ['#C83E25', '#E05A3C']
    : isPurpleFamily
    ? ['#F2994A', '#F7C674']
    : ['#F59553', '#FBC573'];
  const textOnSurface = edgeRgb
    ? relativeLuminance(edgeRgb[0], edgeRgb[1], edgeRgb[2]) > 0.36
      ? '#111214'
      : '#FFFFFF'
    : '#FFFFFF';

  return {
    cover: toHex(cr, cg, cb),
    spine: toHex(sr, sg, sb),
    spineBottom: toHex(sbr, sbg, sbb),
    bottomWrap: toHex(wr, wg, wb),
    edge: edgeHex,
    ribbon,
    ribbonEnd,
    textOnSurface,
  };
}

function pickBestBucket(
  buckets: Map<string, { r: number; g: number; b: number; weight: number }>,
): [number, number, number] | null {
  let best: { r: number; g: number; b: number; weight: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.weight > best.weight) {
      best = bucket;
    }
  }
  if (!best || best.weight <= 0) return null;
  return [
    clampByte(best.r / best.weight),
    clampByte(best.g / best.weight),
    clampByte(best.b / best.weight),
  ];
}

export function extractPaletteFromPixels(
  data: Uint8ClampedArray,
  size: number,
): BookPalette | null {
  const edgeBuckets = new Map<
    string,
    { r: number; g: number; b: number; weight: number }
  >();
  const chromaticBorderBuckets = new Map<
    string,
    { r: number; g: number; b: number; weight: number }
  >();
  const signatureBuckets = new Map<
    string,
    { r: number; g: number; b: number; weight: number }
  >();
  const allBuckets = new Map<
    string,
    { r: number; g: number; b: number; weight: number }
  >();

  let totalBorderPixels = 0;
  let chromaticBorderPixels = 0;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      const alpha = data[idx + 3];
      if (alpha < 128) continue;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;

      // Outer 3px border anchors natural sleeve edge and perimeter cover color
      if (x < 3 || x >= size - 3 || y < 3 || y >= size - 3) {
        totalBorderPixels += 1;
        const ek = `${r >> 3}-${g >> 3}-${b >> 3}`;
        const prevEdge = edgeBuckets.get(ek);
        if (prevEdge) {
          prevEdge.r += r;
          prevEdge.g += g;
          prevEdge.b += b;
          prevEdge.weight += 1;
        } else {
          edgeBuckets.set(ek, { r, g, b, weight: 1 });
        }

        if (saturation >= 0.12 && maxC >= 18 && !(maxC > 225 && saturation < 0.16)) {
          chromaticBorderPixels += 1;
          const prevChrom = chromaticBorderBuckets.get(ek);
          if (prevChrom) {
            prevChrom.r += r;
            prevChrom.g += g;
            prevChrom.b += b;
            prevChrom.weight += 1;
          } else {
            chromaticBorderBuckets.set(ek, { r, g, b, weight: 1 });
          }
        }
      }

      const bucketKey = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const prevAll = allBuckets.get(bucketKey);
      if (prevAll) {
        prevAll.r += r;
        prevAll.g += g;
        prevAll.b += b;
        prevAll.weight += 1;
      } else {
        allBuckets.set(bucketKey, { r, g, b, weight: 1 });
      }

      if (maxC > 220 && saturation < 0.15) continue;
      if (maxC < 16) continue;

      const weight = 0.6 + saturation * 2.2;
      const prevSig = signatureBuckets.get(bucketKey);
      if (prevSig) {
        prevSig.r += r * weight;
        prevSig.g += g * weight;
        prevSig.b += b * weight;
        prevSig.weight += weight;
      } else {
        signatureBuckets.set(bucketKey, {
          r: r * weight,
          g: g * weight,
          b: b * weight,
          weight,
        });
      }
    }
  }

  const preferChromaticBorder =
    totalBorderPixels > 0 && chromaticBorderPixels / totalBorderPixels >= 0.3;

  const dominantRgb =
    (preferChromaticBorder ? pickBestBucket(chromaticBorderBuckets) : null) ??
    pickBestBucket(signatureBuckets) ??
    pickBestBucket(allBuckets);

  if (!dominantRgb) return null;

  const edgeRgb = pickBestBucket(edgeBuckets) ?? undefined;
  return derivePaletteFromRgb(
    dominantRgb[0],
    dominantRgb[1],
    dominantRgb[2],
    edgeRgb,
  );
}

export function extractPaletteFromImageElement(
  img: HTMLImageElement,
  cacheKey?: string,
): BookPalette | null {
  if (typeof document === 'undefined') return null;
  try {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, size, size);
    const { data } = ctx.getImageData(0, 0, size, size);
    const derived = extractPaletteFromPixels(data, size);
    if (derived && cacheKey) {
      persistPalette(cacheKey, derived);
    }
    return derived;
  } catch {
    // SecurityError when external cover server omits CORS headers
    return null;
  }
}

function loadImageAndExtract(srcUrl: string): Promise<BookPalette | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  return new Promise<BookPalette | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';

    img.onload = () => {
      resolve(extractPaletteFromImageElement(img));
    };
    img.onerror = () => {
      resolve(null);
    };
    img.src = srcUrl;
  });
}

export async function extractBookPalette(
  coverUrl: string | undefined,
  seed: string,
): Promise<BookPalette> {
  const normalized = normalizeCoverUrl(coverUrl);
  const fallback = getFallbackBookPalette(seed);
  if (!normalized || typeof document === 'undefined') {
    return fallback;
  }

  hydratePaletteCache();
  const cached = paletteCache.get(normalized);
  if (cached) return cached;

  let inflight = inflightExtractions.get(normalized);
  if (!inflight) {
    inflight = (async () => {
      const direct = await loadImageAndExtract(normalized);
      if (direct) {
        persistPalette(normalized, direct);
        return direct;
      }

      const includeLocalProxy = Boolean(import.meta.env?.DEV);
      const candidates = buildCorsColorSampleUrls(normalized, { includeLocalProxy });
      for (const sampleUrl of candidates) {
        const proxied = await loadImageAndExtract(sampleUrl);
        if (proxied) {
          persistPalette(normalized, proxied);
          return proxied;
        }
      }

      return null;
    })().finally(() => {
      inflightExtractions.delete(normalized);
    });
    inflightExtractions.set(normalized, inflight);
  }

  const resolved = await inflight;
  if (resolved) return resolved;

  paletteCache.set(normalized, fallback);
  return fallback;
}
