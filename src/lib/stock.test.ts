import { describe, expect, it } from 'vitest';
import { getActiveLoanCountByBook, getBookStockInfo, normalizeStockCount } from './stock';
import type { LoanRecord } from '../types/library';

describe('stock utilities', () => {
  it('defaults stock count to 1 for missing or invalid values', () => {
    expect(normalizeStockCount(undefined)).toBe(1);
    expect(normalizeStockCount(null)).toBe(1);
    expect(normalizeStockCount(0)).toBe(1);
    expect(normalizeStockCount(-3)).toBe(1);
    expect(normalizeStockCount(Number.NaN)).toBe(1);
    expect(normalizeStockCount(3.9)).toBe(3);
  });

  it('computes partial loan availability accurately', () => {
    const info = getBookStockInfo({ id: 'b1', stock_count: 3 }, 1);
    expect(info).toEqual({
      total: 3,
      borrowed: 1,
      available: 2,
      isOutOfStock: false,
    });
  });

  it('marks book out of stock when all copies are borrowed and clamps over-borrowed counts', () => {
    expect(getBookStockInfo({ id: 'b1', stock_count: 1 }, 1)).toEqual({
      total: 1,
      borrowed: 1,
      available: 0,
      isOutOfStock: true,
    });

    expect(getBookStockInfo({ id: 'b1', stock_count: 2 }, 4)).toEqual({
      total: 2,
      borrowed: 4,
      available: 0,
      isOutOfStock: true,
    });
  });

  it('counts only active loans and ignores returned loans', () => {
    const loans: LoanRecord[] = [
      {
        id: 'l1',
        book_id: 'b1',
        item_name: 'Buku A',
        borrower_name: 'Ani',
        borrowed_at: '2026-11-20',
        due_date: '2026-11-27',
        created_at: '2026-11-20T08:00:00Z',
      },
      {
        id: 'l2',
        book_id: 'b1',
        item_name: 'Buku A',
        borrower_name: 'Budi',
        borrowed_at: '2026-11-21',
        due_date: '2026-11-28',
        returned_at: '2026-11-24T10:00:00Z',
        created_at: '2026-11-21T08:00:00Z',
      },
      {
        id: 'l3',
        book_id: 'b1',
        item_name: 'Buku A',
        borrower_name: 'Cici',
        borrowed_at: '2026-11-22',
        due_date: '2026-11-29',
        created_at: '2026-11-22T08:00:00Z',
      },
      {
        id: 'l4',
        item_name: 'Proyektor',
        borrower_name: 'Dedi',
        borrowed_at: '2026-11-22',
        due_date: '2026-11-25',
        created_at: '2026-11-22T09:00:00Z',
      },
    ];

    const map = getActiveLoanCountByBook(loans);
    expect(map.get('b1')).toBe(2);
    expect(map.size).toBe(1);
  });
});
