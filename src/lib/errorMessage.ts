export function getSupabaseErrorMessage(error: unknown, fallback = 'Permintaan Supabase gagal.'): string {
  const message = getErrorMessage(error, fallback);

  if (
    /schema cache/i.test(message)
    || /could not find the '[^']+' column/i.test(message)
    || /relation "public\.[^"]+" does not exist/i.test(message)
  ) {
    return 'Skema Supabase belum diperbarui. Terapkan migration terbaru, lalu jalankan NOTIFY pgrst, \'reload schema\'.';
  }

  return message;
}

export function getErrorMessage(error: unknown, fallback = 'Terjadi kesalahan.'): string {
  if (error instanceof Error) return error.message || fallback;

  if (typeof error === 'string') {
    const trimmed = error.trim();
    return trimmed || fallback;
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const candidates = [record.message, record.error_description, record.error, record.details, record.hint];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }

    try {
      const serialized = JSON.stringify(error);
      return serialized && serialized !== '{}' ? serialized : fallback;
    } catch {
      return fallback;
    }
  }

  return fallback;
}
