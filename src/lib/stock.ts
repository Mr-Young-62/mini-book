import type { Book, LoanRecord } from '../types/library';

export interface BookStockInfo {
  total: number;
  borrowed: number;
  available: number;
  isOutOfStock: boolean;
}

export function normalizeStockCount(value?: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  const rounded = Math.floor(value);
  return rounded >= 1 ? rounded : 1;
}

export function getActiveLoanCountByBook(loans: LoanRecord[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const loan of loans) {
    if (!loan.returned_at && loan.book_id) {
      counts.set(loan.book_id, (counts.get(loan.book_id) ?? 0) + 1);
    }
  }
  return counts;
}

export function getBookStockInfo(
  book: Pick<Book, 'id' | 'stock_count'>,
  activeLoanCount = 0,
): BookStockInfo {
  const total = normalizeStockCount(book.stock_count);
  const borrowed = Math.max(0, Math.floor(activeLoanCount));
  const available = Math.max(0, total - borrowed);
  return {
    total,
    borrowed,
    available,
    isOutOfStock: available === 0,
  };
}
