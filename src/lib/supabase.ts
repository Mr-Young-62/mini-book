import { createClient, SupabaseClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Stored runtime overrides (e.g. entered via Settings UI)
const storageUrl = typeof window !== 'undefined' ? localStorage.getItem('readowl_supabase_url') : null;
const storageKey = typeof window !== 'undefined' ? localStorage.getItem('readowl_supabase_key') : null;

export const effectiveSupabaseUrl = storageUrl || envUrl;
export const effectiveSupabaseKey = storageKey || envKey;

export const isSupabaseConfigured = Boolean(
  effectiveSupabaseUrl &&
  effectiveSupabaseKey &&
  !effectiveSupabaseUrl.includes('your-project-id') &&
  !effectiveSupabaseKey.includes('your_publishable_key')
);

let clientInstance: SupabaseClient | null = null;

if (isSupabaseConfigured) {
  try {
    clientInstance = createClient(effectiveSupabaseUrl, effectiveSupabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  } catch (err) {
    console.warn('Could not initialize Supabase client:', err);
  }
}

export const supabase = clientInstance;

/**
 * Configure or update Supabase credentials dynamically
 */
export function configureSupabase(url: string, key: string): { success: boolean; error?: string } {
  try {
    if (!url.startsWith('https://')) {
      return { success: false, error: 'Supabase URL must start with https://' };
    }
    if (!key || key.length < 20) {
      return { success: false, error: 'Invalid Supabase Publishable / Anon key format' };
    }

    localStorage.setItem('readowl_supabase_url', url);
    localStorage.setItem('readowl_supabase_key', key);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export function resetSupabaseConfig(): void {
  localStorage.removeItem('readowl_supabase_url');
  localStorage.removeItem('readowl_supabase_key');
}
