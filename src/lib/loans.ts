import type { LoanRecord, LoanStatus } from '../types/library';

export const loanStatusLabel: Record<LoanStatus, string> = {
  borrowed: 'Dipinjam',
  overdue: 'Terlambat',
  returned: 'Sudah Dikembalikan',
};

export function toLocalDateString(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDaysToDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return toLocalDateString();
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const year = dt.getUTCFullYear();
  const month = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const day = String(dt.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function diffCalendarDays(startDateStr: string, endDateStr: string): number {
  const [sy, sm, sd] = startDateStr.slice(0, 10).split('-').map(Number);
  const [ey, em, ed] = endDateStr.slice(0, 10).split('-').map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return 0;
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ey, em - 1, ed);
  return Math.round((endUtc - startUtc) / 86_400_000);
}

export function getLoanStatus(
  loan: Pick<LoanRecord, 'due_date' | 'returned_at'>,
  todayStr: string = toLocalDateString(),
): LoanStatus {
  if (loan.returned_at) return 'returned';
  const due = loan.due_date.slice(0, 10);
  if (todayStr > due) return 'overdue';
  return 'borrowed';
}

export interface LoanDurationInfo {
  elapsedDays: number;
  totalAllowedDays: number;
  overdueDays: number;
  remainingDays: number;
  progressPercent: number;
  durationLabel: string;
  deadlineLabel: string;
}

export function getLoanDuration(
  loan: Pick<LoanRecord, 'borrowed_at' | 'due_date' | 'returned_at'>,
  todayStr: string = toLocalDateString(),
): LoanDurationInfo {
  const borrowedDate = loan.borrowed_at.slice(0, 10);
  const dueDate = loan.due_date.slice(0, 10);
  const endDate = loan.returned_at ? loan.returned_at.slice(0, 10) : todayStr;

  const elapsedDays = Math.max(0, diffCalendarDays(borrowedDate, endDate));
  const totalAllowedDays = Math.max(1, diffCalendarDays(borrowedDate, dueDate));
  const overdueDays = loan.returned_at ? 0 : Math.max(0, diffCalendarDays(dueDate, todayStr));
  const remainingDays = loan.returned_at ? 0 : Math.max(0, diffCalendarDays(todayStr, dueDate));

  const durationLabel = elapsedDays === 0 ? 'Hari ini (0 hari)' : `${elapsedDays} hari`;

  let deadlineLabel: string;
  if (loan.returned_at) {
    deadlineLabel = 'Sudah dikembalikan';
  } else if (overdueDays > 0) {
    deadlineLabel = `Terlambat ${overdueDays} hari`;
  } else if (remainingDays === 0) {
    deadlineLabel = 'Jatuh tempo hari ini';
  } else {
    deadlineLabel = `Sisa ${remainingDays} hari`;
  }

  const progressPercent =
    loan.returned_at || overdueDays > 0
      ? 100
      : Math.min(100, Math.max(0, Math.round((elapsedDays / totalAllowedDays) * 100)));

  return {
    elapsedDays,
    totalAllowedDays,
    overdueDays,
    remainingDays,
    progressPercent,
    durationLabel,
    deadlineLabel,
  };
}

export function formatShortDateId(dateStr?: string): string {
  if (!dateStr) return '-';
  const clean = dateStr.slice(0, 10);
  const [y, m, d] = clean.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
