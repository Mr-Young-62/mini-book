import { describe, expect, it } from 'vitest';
import {
  derivePaletteFromRgb,
  FALLBACK_BOOK_PALETTES,
  getFallbackBookPalette,
  normalizeCoverUrl,
} from './bookColor';

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

  it('derives valid hex palette colors with darker spine and preserved edge color', () => {
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
      expect(palette.spine).toMatch(hexPattern);
      expect(palette.cover).toMatch(hexPattern);
      expect(palette.edge).toBe('#F4F0E8');
      expect(palette.ribbon).toMatch(hexPattern);
      expect(palette.spine).not.toBe(palette.cover);
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
});
