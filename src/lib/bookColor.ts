export interface BookPalette {
  spine: string;
  cover: string;
  edge: string;
  ribbon: string;
  textOnSurface: string;
}

export const FALLBACK_BOOK_PALETTES: readonly BookPalette[] = [
  { spine: '#112822', cover: '#18362F', edge: '#18362F', ribbon: '#E5A94C', textOnSurface: '#FFFFFF' }, // Deep Pine
  { spine: '#8F2112', cover: '#C83E25', edge: '#C83E25', ribbon: '#F2AA5E', textOnSurface: '#FFFFFF' }, // Terracotta Rust
  { spine: '#192C48', cover: '#243E63', edge: '#243E63', ribbon: '#E5A94C', textOnSurface: '#FFFFFF' }, // Indigo Slate
  { spine: '#381D36', cover: '#4F2B4C', edge: '#4F2B4C', ribbon: '#E5B254', textOnSurface: '#FFFFFF' }, // Plum Burgundy
  { spine: '#203C30', cover: '#2E5443', edge: '#2E5443', ribbon: '#F2AA5E', textOnSurface: '#FFFFFF' }, // Forest Sage
  { spine: '#523615', cover: '#734C20', edge: '#734C20', ribbon: '#C83E25', textOnSurface: '#FFFFFF' }, // Warm Ochre
  { spine: '#123942', cover: '#1C515D', edge: '#1C515D', ribbon: '#E5A94C', textOnSurface: '#FFFFFF' }, // Ocean Teal
  { spine: '#36261C', cover: '#4F382B', edge: '#4F382B', ribbon: '#E5A94C', textOnSurface: '#FFFFFF' }, // Espresso Cocoa
];

const paletteCache = new Map<string, BookPalette>();

export function normalizeCoverUrl(url?: string): string | undefined {
  if (!url) return undefined;
  const value = String(url).trim();
  if (!value) return undefined;
  if (value.startsWith('//')) return `https:${value}`;
  return value.replace(/^http:\/\//i, 'https://');
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
  // Front cover base color: capped at luminance <= 0.20 so fallback text stays crisp
  let cr = clampByte(r * 0.9);
  let cg = clampByte(g * 0.9);
  let cb = clampByte(b * 0.9);

  for (let step = 0; step < 12; step += 1) {
    if (relativeLuminance(cr, cg, cb) <= 0.2) break;
    cr = clampByte(cr * 0.86);
    cg = clampByte(cg * 0.86);
    cb = clampByte(cb * 0.86);
  }

  // Spine is visibly darker than cover (~28% deeper) and <= 0.14 luminance
  let sr = clampByte(cr * 0.72);
  let sg = clampByte(cg * 0.72);
  let sb = clampByte(cb * 0.72);

  for (let step = 0; step < 10; step += 1) {
    if (relativeLuminance(sr, sg, sb) <= 0.14) break;
    sr = clampByte(sr * 0.85);
    sg = clampByte(sg * 0.85);
    sb = clampByte(sb * 0.85);
  }

  const edgeHex = edgeRgb
    ? toHex(edgeRgb[0], edgeRgb[1], edgeRgb[2])
    : toHex(cr, cg, cb);

  // Pick warm contrasting bookmark ribbon
  const isYellowAmber = r > 155 && g > 110 && b < 110;
  const ribbon = isYellowAmber ? '#C83E25' : '#F2AA5E';
  const textOnSurface = edgeRgb
    ? relativeLuminance(edgeRgb[0], edgeRgb[1], edgeRgb[2]) > 0.36
      ? '#111214'
      : '#FFFFFF'
    : '#FFFFFF';

  return {
    spine: toHex(sr, sg, sb),
    cover: toHex(cr, cg, cb),
    edge: edgeHex,
    ribbon,
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

export async function extractBookPalette(
  coverUrl: string | undefined,
  seed: string,
): Promise<BookPalette> {
  const normalized = normalizeCoverUrl(coverUrl);
  const fallback = getFallbackBookPalette(seed);
  if (!normalized || typeof document === 'undefined') {
    return fallback;
  }

  const cached = paletteCache.get(normalized);
  if (cached) return cached;

  return new Promise<BookPalette>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';

    const finishWithFallback = () => {
      paletteCache.set(normalized, fallback);
      resolve(fallback);
    };

    img.onload = () => {
      try {
        const size = 32;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finishWithFallback();
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        const edgeBuckets = new Map<
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

        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const idx = (y * size + x) * 4;
            const alpha = data[idx + 3];
            if (alpha < 128) continue;

            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];

            // Outer 2px border forms the natural edge backdrop
            if (x < 2 || x >= size - 2 || y < 2 || y >= size - 2) {
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
            }

            const maxC = Math.max(r, g, b);
            const minC = Math.min(r, g, b);
            const saturation = maxC === 0 ? 0 : (maxC - minC) / maxC;
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

            // Skip washed-out white/cream paper and deep shadow when finding book's signature hue
            if (maxC > 218 && saturation < 0.15) continue;
            if (maxC < 20) continue;

            const weight = 0.25 + saturation * saturation * 10;
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

        const dominantRgb =
          pickBestBucket(signatureBuckets) ?? pickBestBucket(allBuckets);
        if (!dominantRgb) {
          finishWithFallback();
          return;
        }

        const edgeRgb = pickBestBucket(edgeBuckets) ?? undefined;
        const derived = derivePaletteFromRgb(
          dominantRgb[0],
          dominantRgb[1],
          dominantRgb[2],
          edgeRgb,
        );
        paletteCache.set(normalized, derived);
        resolve(derived);
      } catch {
        // SecurityError when external cover server omits CORS headers
        finishWithFallback();
      }
    };

    img.onerror = finishWithFallback;
    img.src = normalized;
  });
}
