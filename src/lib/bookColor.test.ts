import { describe, expect, it } from 'vitest';
import {
  buildCorsColorSampleUrl,
  buildCorsColorSampleUrls,
  derivePaletteFromRgb,
  extractPaletteFromPixels,
  FALLBACK_BOOK_PALETTES,
  getFallbackBookPalette,
  normalizeCoverUrl,
} from './bookColor';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function makePixelBuffer(
  size: number,
  fill: [number, number, number],
  override?: (x: number, y: number) => [number, number, number] | null,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      const [r, g, b] = override?.(x, y) ?? fill;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }
  return data;
}

describe('bookColor utilities', () => {
  it('returns deterministic fallback palette for the same seed', () => {
    const first = getFallbackBookPalette('book-dune-1965');
    const second = getFallbackBookPalette('book-dune-1965');
    expect(first).toEqual(second);
    expect(FALLBACK_BOOK_PALETTES).toContain(first);
  });

  it('produces varied fallback palettes across distinct book seeds', () => {
    const spines = new Set(
      ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa'].map(
        (seed) => getFallbackBookPalette(seed).spine,
      ),
    );
    expect(spines.size).toBeGreaterThan(2);
  });

  it('derives valid 3-tone hex palette colors (cover > spine > bottomWrap) and preserves edge color', () => {
    const samples: Array<[number, number, number]> = [
      [20, 45, 38],
      [230, 210, 140],
      [196, 52, 42],
      [54, 98, 178],
      [128, 128, 128],
    ];
    const hexPattern = /^#[0-9A-F]{6}$/;

    for (const [r, g, b] of samples) {
      const palette = derivePaletteFromRgb(r, g, b, [244, 240, 232]);
      expect(palette.cover).toMatch(hexPattern);
      expect(palette.spine).toMatch(hexPattern);
      expect(palette.spineBottom).toMatch(hexPattern);
      expect(palette.bottomWrap).toMatch(hexPattern);
      expect(palette.edge).toBe('#F4F0E8');
      expect(palette.ribbon).toMatch(hexPattern);
      expect(palette.ribbonEnd).toMatch(hexPattern);
      expect(palette.spine).not.toBe(palette.cover);
      expect(palette.bottomWrap).not.toBe(palette.spine);
      expect(palette.bottomWrap).not.toBe(palette.cover);
      expect(['#FFFFFF', '#111214']).toContain(palette.textOnSurface);
    }
  });

  it('normalizes cover URLs safely to HTTPS', () => {
    expect(normalizeCoverUrl(undefined)).toBeUndefined();
    expect(normalizeCoverUrl('   ')).toBeUndefined();
    expect(normalizeCoverUrl('//covers.openlibrary.org/b/id/123.jpg')).toBe(
      'https://covers.openlibrary.org/b/id/123.jpg',
    );
    expect(normalizeCoverUrl('http://books.google.com/cover.jpg')).toBe(
      'https://books.google.com/cover.jpg',
    );
    expect(normalizeCoverUrl('https://example.com/cover.jpg')).toBe(
      'https://example.com/cover.jpg',
    );
  });

  it('preserves purple cover hue instead of collapsing to yellow/brown title text', () => {
    const size = 32;
    const pixels = makePixelBuffer(size, [142, 124, 195], (x, y) => {
      if (x >= 10 && x < 22 && y >= 6 && y < 13) {
        return [238, 198, 72];
      }
      return null;
    });

    const palette = extractPaletteFromPixels(pixels, size);
    expect(palette).not.toBeNull();
    const [cr, cg, cb] = hexToRgb(palette!.cover);
    const [sr, sg, sb] = hexToRgb(palette!.spine);
    const [wr, wg, wb] = hexToRgb(palette!.bottomWrap);

    expect(cb).toBeGreaterThan(cg);
    expect(cr).toBeGreaterThan(cg);
    expect(sb).toBeGreaterThan(sg);
    expect(sr).toBeGreaterThan(sg);
    expect(wb).toBeGreaterThan(wg);
    expect(wr).toBeGreaterThan(wg);
    expect(cb).toBeGreaterThan(sb);
    expect(sb).toBeGreaterThan(wb);
    expect(palette!.ribbon).toBe('#F2994A');
    expect(palette!.ribbonEnd).toBe('#F7C674');
  });

  it('extracts interior crimson hue when cover has a white border', () => {
    const size = 32;
    const pixels = makePixelBuffer(size, [175, 42, 48], (x, y) => {
      if (x < 3 || x >= size - 3 || y < 3 || y >= size - 3) {
        return [246, 244, 240];
      }
      return null;
    });

    const palette = extractPaletteFromPixels(pixels, size);
    expect(palette).not.toBeNull();
    const [cr, cg, cb] = hexToRgb(palette!.cover);
    expect(cr).toBeGreaterThan(cg);
    expect(cr).toBeGreaterThan(cb);
    expect(palette!.edge).toBe('#F6F4F0');
    expect(palette!.textOnSurface).toBe('#111214');
  });

  it('derives hue-accurate cover and spine across purple, pink, sky blue, and mint', () => {
    const purple = derivePaletteFromRgb(142, 124, 195);
    const pink = derivePaletteFromRgb(224, 140, 178);
    const sky = derivePaletteFromRgb(125, 175, 224);
    const mint = derivePaletteFromRgb(122, 196, 166);

    const [pr, pg, pb] = hexToRgb(purple.cover);
    expect(pb).toBeGreaterThan(pg);
    expect(pr).toBeGreaterThan(pg);

    const [pkr, pkg, pkb] = hexToRgb(pink.cover);
    expect(pkr).toBeGreaterThan(pkb);
    expect(pkb).toBeGreaterThan(pkg);

    const [sr, sg, sb] = hexToRgb(sky.cover);
    expect(sb).toBeGreaterThan(sg);
    expect(sg).toBeGreaterThan(sr);

    const [mr, mg] = hexToRgb(mint.cover);
    expect(mg).toBeGreaterThan(mr);
  });

  it('builds safe CORS color sample URLs only for public external covers', () => {
    expect(
      buildCorsColorSampleUrl('https://books.google.com/books/content?id=abc&printsec=frontcover'),
    ).toBe(
      'https://wsrv.nl/?url=https%3A%2F%2Fbooks.google.com%2Fbooks%2Fcontent%3Fid%3Dabc%26printsec%3Dfrontcover&w=48&h=64&fit=cover&output=png',
    );
    expect(buildCorsColorSampleUrl('https://perpustakaan.jakarta.go.id/uploads/cover.jpg')).toContain(
      'https://wsrv.nl/?url=',
    );
    expect(
      buildCorsColorSampleUrl('https://demo.supabase.co/storage/v1/object/public/covers/a.jpg'),
    ).toContain('https://wsrv.nl/?url=');
    expect(buildCorsColorSampleUrl('data:image/jpeg;base64,/9j/4AAQ')).toBeNull();
    expect(buildCorsColorSampleUrl('blob:https://example.com/123')).toBeNull();
    expect(buildCorsColorSampleUrl('http://localhost:5173/cover.png')).toBeNull();
    expect(
      buildCorsColorSampleUrl('https://demo.supabase.co/storage/v1/object/sign/covers/a.jpg'),
    ).toBeNull();
    expect(
      buildCorsColorSampleUrl('https://example.com/cover.jpg?token=secret123'),
    ).toBeNull();

    const devCandidates = buildCorsColorSampleUrls(
      'https://perpustakaan.jakarta.go.id/uploads/cover.jpg',
      { includeLocalProxy: true },
    );
    expect(devCandidates[0]).toBe(
      '/__cover-proxy?url=https%3A%2F%2Fperpustakaan.jakarta.go.id%2Fuploads%2Fcover.jpg',
    );
    expect(devCandidates[1]).toContain('https://wsrv.nl/?url=');
    expect(devCandidates[2]).toBe(
      'https://i0.wp.com/perpustakaan.jakarta.go.id/uploads/cover.jpg?w=64',
    );

    const prodCandidates = buildCorsColorSampleUrls(
      'https://perpustakaan.jakarta.go.id/uploads/cover.jpg',
      { includeLocalProxy: false },
    );
    expect(prodCandidates).toHaveLength(2);
    expect(prodCandidates[0]).toContain('https://wsrv.nl/?url=');
  });

  it('extracts deep forest green from a dark green cover and sage/teal from a muted green-gray cover', () => {
    const size = 32;
    const hukumPixels = makePixelBuffer(size, [28, 46, 34], (x, y) => {
      if (y >= 17 && y < 26) return [18, 19, 20];
      if (x >= 7 && x < 25 && y >= 2 && y < 14) return [176, 138, 96];
      return null;
    });
    const forestPalette = extractPaletteFromPixels(hukumPixels, size);
    expect(forestPalette).not.toBeNull();
    const [fr, fg, fb] = hexToRgb(forestPalette!.cover);
    const [sr0, sg0, sb0] = hexToRgb(forestPalette!.spine);
    expect(fg).toBeGreaterThan(fr);
    expect(fg).toBeGreaterThan(fb);
    expect(sg0).toBeGreaterThan(sr0);
    expect(sg0).toBeGreaterThan(sb0);

    const sagePixels = makePixelBuffer(size, [82, 114, 108], (x, y) => {
      if (x < 3 || x >= size - 3 || y < 3 || y >= size - 3) {
        return [240, 238, 232];
      }
      return null;
    });
    const sagePalette = extractPaletteFromPixels(sagePixels, size);
    expect(sagePalette).not.toBeNull();
    const [sr, sg] = hexToRgb(sagePalette!.cover);
    expect(sg).toBeGreaterThan(sr);
  });
});
