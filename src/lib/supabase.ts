import { createClient, SupabaseClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

function getStoredConfig(): { url: string; key: string; disabled: boolean } {
  try {
    return {
      url: typeof window !== 'undefined' ? localStorage.getItem('readowl_supabase_url') || '' : '',
      key: typeof window !== 'undefined' ? localStorage.getItem('readowl_supabase_key') || '' : '',
      disabled: typeof window !== 'undefined' && localStorage.getItem('readowl_supabase_disabled') === 'true',
    };
  } catch {
    return { url: '', key: '', disabled: false };
  }
}

function isValidConfig(url: string, key: string): boolean {
  return Boolean(
    url &&
    key &&
    !url.includes('your-project-id') &&
    !key.includes('your_publishable_key')
  );
}

const storedConfig = getStoredConfig();
export let effectiveSupabaseUrl = storedConfig.disabled ? '' : storedConfig.url || envUrl;
export let effectiveSupabaseKey = storedConfig.disabled ? '' : storedConfig.key || envKey;
export let isSupabaseConfigured = isValidConfig(effectiveSupabaseUrl, effectiveSupabaseKey);
export let supabase: SupabaseClient | null = createSupabaseClient(effectiveSupabaseUrl, effectiveSupabaseKey);
export const metadataSupabase: SupabaseClient | null = createSupabaseClient(envUrl, envKey);

function createSupabaseClient(url: string, key: string): SupabaseClient | null {
  if (!isValidConfig(url, key)) return null;
  try {
    return createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  } catch (err) {
    console.warn('Could not initialize Supabase client:', err);
    return null;
  }
}

function refreshSupabaseClient(url: string, key: string): void {
  effectiveSupabaseUrl = url;
  effectiveSupabaseKey = key;
  isSupabaseConfigured = isValidConfig(url, key);
  supabase = createSupabaseClient(url, key);
}

/**
 * Configure or update Supabase credentials dynamically
 */
export function configureSupabase(url: string, key: string): { success: boolean; error?: string } {
  try {
    const parsedUrl = new URL(url);
    const isLocalDevelopment = parsedUrl.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(parsedUrl.hostname);
    if (parsedUrl.protocol !== 'https:' && !isLocalDevelopment) {
      return { success: false, error: 'Supabase URL must use HTTPS (HTTP is allowed only for localhost).' };
    }
    if (!key || key.length < 20) {
      return { success: false, error: 'Invalid Supabase Publishable / Anon key format' };
    }

    localStorage.setItem('readowl_supabase_url', url);
    localStorage.setItem('readowl_supabase_key', key);
    localStorage.removeItem('readowl_supabase_disabled');
    refreshSupabaseClient(url, key);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function resetSupabaseConfig(): void {
  try {
    localStorage.removeItem('readowl_supabase_url');
    localStorage.removeItem('readowl_supabase_key');
    localStorage.setItem('readowl_supabase_disabled', 'true');
  } finally {
    refreshSupabaseClient('', '');
  }
}
