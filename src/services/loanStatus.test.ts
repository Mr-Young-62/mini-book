import { describe, expect, it } from 'vitest';
import { getLoanStatus, validateLoanDates } from './libraryService';

describe('getLoanStatus', () => {
  it('marks returned loans as returned regardless of due date', () => {
    expect(getLoanStatus('2000-01-01', '2000-01-02')).toBe('returned');
  });

  it('marks a past due date as overdue and today as active', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const today = new Date().toISOString().slice(0, 10);

    expect(getLoanStatus(yesterday.toISOString().slice(0, 10))).toBe('overdue');
    expect(getLoanStatus(today)).toBe('active');
  });
});

describe('validateLoanDates', () => {
  it('accepts a due date on or after the loan date', () => {
    expect(() => validateLoanDates('2026-11-20', '2026-11-27')).not.toThrow();
    expect(() => validateLoanDates('2026-11-20', '2026-11-20')).not.toThrow();
  });

  it('rejects missing dates and a due date before the loan date', () => {
    expect(() => validateLoanDates('', '2026-11-27')).toThrow('wajib diisi');
    expect(() => validateLoanDates('2026-11-20', '2026-11-19')).toThrow('tidak boleh sebelum');
  });
});
