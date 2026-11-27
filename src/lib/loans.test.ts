import { describe, expect, it } from 'vitest';
import {
  addDaysToDateString,
  diffCalendarDays,
  getLoanDuration,
  getLoanStatus,
  loanStatusLabel,
} from './loans';

describe('loans helpers', () => {
  it('adds calendar days without timezone drift', () => {
    expect(addDaysToDateString('2026-11-26', 7)).toBe('2026-12-03');
    expect(addDaysToDateString('2026-02-27', 2)).toBe('2026-03-01');
  });

  it('computes calendar day differences', () => {
    expect(diffCalendarDays('2026-11-20', '2026-11-26')).toBe(6);
    expect(diffCalendarDays('2026-11-26', '2026-11-26')).toBe(0);
  });

  it('tracks borrowed item started today (0 hari)', () => {
    const loan = { borrowed_at: '2026-11-26', due_date: '2026-12-03' };
    expect(getLoanStatus(loan, '2026-11-26')).toBe('borrowed');
    expect(loanStatusLabel.borrowed).toBe('Dipinjam');

    const info = getLoanDuration(loan, '2026-11-26');
    expect(info.elapsedDays).toBe(0);
    expect(info.durationLabel).toBe('Hari ini (0 hari)');
    expect(info.remainingDays).toBe(7);
    expect(info.deadlineLabel).toBe('Sisa 7 hari');
    expect(info.progressPercent).toBe(0);
  });

  it('reports due today when today equals due_date', () => {
    const loan = { borrowed_at: '2026-11-19', due_date: '2026-11-26' };
    expect(getLoanStatus(loan, '2026-11-26')).toBe('borrowed');

    const info = getLoanDuration(loan, '2026-11-26');
    expect(info.elapsedDays).toBe(7);
    expect(info.durationLabel).toBe('7 hari');
    expect(info.overdueDays).toBe(0);
    expect(info.deadlineLabel).toBe('Jatuh tempo hari ini');
    expect(info.progressPercent).toBe(100);
  });

  it('marks overdue loans after due_date', () => {
    const loan = { borrowed_at: '2026-11-16', due_date: '2026-11-23' };
    expect(getLoanStatus(loan, '2026-11-26')).toBe('overdue');
    expect(loanStatusLabel.overdue).toBe('Terlambat');

    const info = getLoanDuration(loan, '2026-11-26');
    expect(info.elapsedDays).toBe(10);
    expect(info.overdueDays).toBe(3);
    expect(info.deadlineLabel).toBe('Terlambat 3 hari');
    expect(info.progressPercent).toBe(100);
  });

  it('stops duration tracker when item is returned', () => {
    const loan = {
      borrowed_at: '2026-11-16',
      due_date: '2026-11-23',
      returned_at: '2026-11-21T10:15:00.000Z',
    };
    expect(getLoanStatus(loan, '2026-11-30')).toBe('returned');
    expect(loanStatusLabel.returned).toBe('Sudah Dikembalikan');

    const info = getLoanDuration(loan, '2026-11-30');
    expect(info.elapsedDays).toBe(5);
    expect(info.overdueDays).toBe(0);
    expect(info.deadlineLabel).toBe('Sudah dikembalikan');
  });
});
