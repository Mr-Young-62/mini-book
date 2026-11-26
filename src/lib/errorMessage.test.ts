import { describe, expect, it } from 'vitest';
import { getErrorMessage, getSupabaseErrorMessage } from './errorMessage';

describe('getErrorMessage', () => {
  it('returns native error messages', () => {
    expect(getErrorMessage(new Error('Gagal menyimpan'))).toBe('Gagal menyimpan');
  });

  it('reads supabase style error objects', () => {
    expect(getErrorMessage({ message: 'relasi tidak ada', code: 'PGRST200' })).toBe('relasi tidak ada');
    expect(getErrorMessage({ error_description: 'token tidak valid' })).toBe('token tidak valid');
  });

  it('explains stale Supabase schema cache errors', () => {
    const error = { message: "Could not find the 'loan_date' column of 'loans' in the schema cache" };
    expect(getSupabaseErrorMessage(error)).toContain('NOTIFY pgrst');
  });

  it('falls back instead of rendering object tags', () => {
    expect(getErrorMessage({})).toBe('Terjadi kesalahan.');
    expect(getErrorMessage(null, 'Gagal memuat')).toBe('Gagal memuat');
  });
});
