import { describe, expect, it } from 'vitest';
import { normalizeUserRole, roleLabel } from './userRole';

describe('normalizeUserRole', () => {
  it.each([
    ['Owner', 'Owner'],
    ['Pemilik', 'Owner'],
    ['Super Admin', 'Owner'],
    ['Administrator', 'Administrator'],
    ['Admin Perpustakaan', 'Administrator'],
    ['Librarian', 'Librarian'],
    ['Petugas', 'Librarian'],
    ['Member', 'Member'],
    ['Anggota', 'Member'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeUserRole(input)).toBe(expected);
  });

  it('rejects unknown and non-string values instead of granting a role', () => {
    expect(normalizeUserRole('Superuser')).toBeNull();
    expect(normalizeUserRole(null)).toBeNull();
    expect(normalizeUserRole({ role: 'Administrator' })).toBeNull();
  });

  it('uses localized labels for each canonical role', () => {
    expect(roleLabel).toEqual({
      Owner: 'Pemilik',
      Administrator: 'Admin Perpustakaan',
      Librarian: 'Petugas',
      Member: 'Anggota',
    });
  });
});
