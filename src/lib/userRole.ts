import type { UserRole } from '../types/library';

const roleAliases: Record<string, UserRole> = {
  owner: 'Owner',
  'super admin': 'Owner',
  administrator: 'Administrator',
  'admin perpustakaan': 'Administrator',
  librarian: 'Librarian',
  petugas: 'Librarian',
  member: 'Member',
  anggota: 'Member',
};

export function normalizeUserRole(role: unknown): UserRole | null {
  if (typeof role !== 'string') return null;
  return roleAliases[role.trim().toLowerCase()] ?? null;
}

export const roleLabel: Record<UserRole, string> = {
  Owner: 'Super Admin / Owner',
  Administrator: 'Admin Perpustakaan',
  Librarian: 'Petugas',
  Member: 'Anggota',
};
