import { createClient, SupabaseClient } from '@supabase/supabase-js';

const envUrl = import.meta.env.VITE_SUPABASE_URL || '';
const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const buildTimeSupabaseUrl = envUrl;

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

function isServiceRoleKey(key: string): boolean {
  if (/^sb_secret_/i.test(key)) return true;
  if (/^sbp_/i.test(key)) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

function createSupabaseClient(url: string, key: string): SupabaseClient | null {
  if (!isValidConfig(url, key)) return null;
  if (isServiceRoleKey(key)) {
    console.error('Refusing to initialize Supabase with a service role key in the browser.');
    return null;
  }
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

export let effectiveSupabaseUrl = '';
export let effectiveSupabaseKey = '';
export let isSupabaseConfigured = false;
export let supabase: SupabaseClient | null = null;
export const metadataSupabase: SupabaseClient | null = createSupabaseClient(envUrl, envKey);

const storedConfig = getStoredConfig();
effectiveSupabaseUrl = storedConfig.disabled ? '' : storedConfig.url || envUrl;
effectiveSupabaseKey = storedConfig.disabled ? '' : storedConfig.key || envKey;
isSupabaseConfigured = isValidConfig(effectiveSupabaseUrl, effectiveSupabaseKey);
supabase = createSupabaseClient(effectiveSupabaseUrl, effectiveSupabaseKey);

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

    // Never send sign-in credentials to an arbitrary host. Allow the
    // build-configured project, any Supabase-hosted project, or localhost.
    let buildHost = '';
    try {
      buildHost = new URL(envUrl).hostname;
    } catch {
      // No build-time URL configured; fall back to the Supabase host check.
    }
    const isSupabaseHost = parsedUrl.hostname.endsWith('.supabase.co');
    if (buildHost && parsedUrl.hostname !== buildHost && !isSupabaseHost && !isLocalDevelopment) {
      return {
        success: false,
        error: `Supabase URL host "${parsedUrl.hostname}" is not allowed. Use the configured project or a *.supabase.co domain.`,
      };
    }

    if (!key || key.length < 20) {
      return { success: false, error: 'Invalid Supabase Publishable / Anon key format' };
    }

    const normalizedUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
    localStorage.setItem('readowl_supabase_url', normalizedUrl);
    localStorage.setItem('readowl_supabase_key', key);
    localStorage.removeItem('readowl_supabase_disabled');
    refreshSupabaseClient(normalizedUrl, key);
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
