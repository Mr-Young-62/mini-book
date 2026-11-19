import { describe, expect, it } from 'vitest';
import { formatAddedAt } from './datetime';

describe('formatAddedAt', () => {
  it('includes both date and time for a valid timestamp', () => {
    const formatted = formatAddedAt('2026-11-19T04:45:00.000Z');
    expect(formatted).toContain('2026');
    expect(formatted).toMatch(/\d{1,2}[.:]\d{2}/);
  });

  it('returns a placeholder for missing or invalid values', () => {
    expect(formatAddedAt()).toBe('-');
    expect(formatAddedAt('not-a-date')).toBe('-');
  });
});
