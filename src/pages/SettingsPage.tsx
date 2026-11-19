import React, { useEffect, useState } from 'react';
import {
  Settings as SettingsIcon,
  Database,
  ShieldCheck,
  Save,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Code,
  Building,
  Layers,
  RefreshCw,
  BellRing,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import type { UpdaterApi } from '../hooks/useAppUpdater';
import {
  getPushSubscription,
  isIosDevice,
  isIosStandalone,
  isWebPushSupported,
  savePushSubscription,
  subscribeToPush,
  unsubscribeFromPush,
} from '../services/pushService';
import { LibrarySettings, UserRole } from '../types/library';
import {
  isSupabaseConfigured,
  effectiveSupabaseUrl,
  effectiveSupabaseKey,
  buildTimeSupabaseUrl,
  configureSupabase,
  resetSupabaseConfig,
} from '../lib/supabase';

interface SettingsPageProps {
  userRole: UserRole;
  onRefreshAppState: () => void;
  updater: UpdaterApi;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  userRole,
  onRefreshAppState,
  updater,
}) => {
  const [settings, setSettings] = useState<LibrarySettings>(LibraryService.getSettings());
  const [supabaseUrl, setSupabaseUrl] = useState(effectiveSupabaseUrl || '');
  const [supabaseKey, setSupabaseKey] = useState(effectiveSupabaseKey || '');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState('Settings saved successfully!');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pushSupported] = useState(() => isWebPushSupported());
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const iosBrowserHint = pushSupported && isIosDevice() && !isIosStandalone();

  useEffect(() => {
    if (!pushSupported) return;
    let cancelled = false;
    void getPushSubscription()
      .then((subscription) => {
        if (!cancelled) setPushSubscribed(Boolean(subscription));
      })
      .catch(() => {
        /* no registration yet */
      });
    return () => {
      cancelled = true;
    };
  }, [pushSupported]);

  const handleEnablePush = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      const payload = await subscribeToPush();
      await savePushSubscription(payload, isIosDevice() ? 'ios-pwa' : 'web');
      setPushSubscribed(true);
    } catch (error) {
      setPushError(error instanceof Error ? error.message : String(error));
    } finally {
      setPushBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      await unsubscribeFromPush();
      setPushSubscribed(false);
    } catch (error) {
      setPushError(error instanceof Error ? error.message : String(error));
    } finally {
      setPushBusy(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      let configChanged = false;
      if (supabaseUrl && supabaseKey) {
        const nextUrl = supabaseUrl.trim();
        const nextKey = supabaseKey.trim();
        configChanged = nextUrl !== effectiveSupabaseUrl || nextKey !== effectiveSupabaseKey;
        if (configChanged) {
          let buildHost = '';
          let nextHost = '';
          try {
            buildHost = new URL(buildTimeSupabaseUrl).hostname;
          } catch {
            // No build-time URL to compare against.
          }
          try {
            nextHost = new URL(nextUrl).hostname;
          } catch {
            // configureSupabase will report the malformed URL.
          }
          if (buildHost && nextHost && nextHost !== buildHost) {
            const confirmed = window.confirm(
              `Koneksi Supabase akan diarahkan ke ${nextHost}. Kredensial login akan dikirim ke server tersebut. Lanjutkan?`,
            );
            if (!confirmed) {
              setErrorMessage('Perubahan koneksi Supabase dibatalkan.');
              return;
            }
          }
          const configResult = configureSupabase(nextUrl, nextKey);
          if (!configResult.success) {
            setErrorMessage(configResult.error || 'Failed to update Supabase configuration.');
            return;
          }
        }
      }

      // Save the library settings in the same submit, including when the
      // Supabase connection was just changed.
      try {
        await LibraryService.updateSettings(settings);
        setSaveSuccessMessage(
          configChanged
            ? 'Supabase connection and library settings saved. Sign in to the new project if prompted.'
            : 'Settings saved successfully!',
        );
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      } catch (err: any) {
        if (!configChanged) throw err;
        setErrorMessage(
          `Supabase connection saved, but library settings could not be saved to the cloud yet: ${err.message || 'unknown error'}. Sign in to the configured project and save again.`,
        );
      }
      onRefreshAppState();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving settings.');
    }
  };

  const handleResetToSandbox = () => {
    if (window.confirm('Reset to local offline sandbox mode?')) {
      resetSupabaseConfig();
      setSupabaseUrl('');
      setSupabaseKey('');
      onRefreshAppState();
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="border-b border-[#EAE5DE] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#2C221E] font-sans">
          Library & System Settings
        </h1>
        <p className="text-xs text-[#7E6F64]">
          Configure your Supabase database connection, library metadata, and inventory defaults.
        </p>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-900">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* ================================================================= */}
        {/* 1. SUPABASE DATABASE CONFIGURATION */}
        {/* ================================================================= */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#c62828]" />
              <h3 className="text-sm font-bold text-[#2C221E]">
                Supabase Backend Configuration
              </h3>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold ${
                isSupabaseConfigured
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {isSupabaseConfigured ? 'Supabase Live Connected' : 'Local Storage Sandbox'}
            </span>
          </div>

          <p className="text-xs text-[#7E6F64] leading-relaxed">
            MeelieFont uses Supabase PostgreSQL, Storage, Auth, and Edge Functions. When live credentials are supplied below, the client persists directly to your cloud Supabase database.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Supabase URL (VITE_SUPABASE_URL)
              </label>
              <input
                type="text"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://xyzproject.supabase.co"
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Supabase Publishable / Anon Key
              </label>
              <input
                type="password"
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                placeholder="sbp_... or eyJhbGciOi..."
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F0ECE4] text-[11px]">
            <div className="text-[#7E6F64]">
              Migrations stored in <code className="font-mono text-[#2C221E]">supabase/migrations/</code>
            </div>
            {isSupabaseConfigured && (
              <button
                type="button"
                onClick={handleResetToSandbox}
                className="text-[#7E6F64] hover:text-rose-600 font-medium"
              >
                Disconnect & Use Local Sandbox
              </button>
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* 2. LIBRARY INFORMATION */}
        {/* ================================================================= */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#F0ECE4]">
            <Building className="w-4 h-4 text-[#c62828]" />
            <h3 className="text-sm font-bold text-[#2C221E]">Library Profile</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Library Name
              </label>
              <input
                type="text"
                value={settings.library_info.name}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    library_info: { ...settings.library_info, name: e.target.value },
                  })
                }
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Library Branch Code
              </label>
              <input
                type="text"
                value={settings.library_info.code}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    library_info: { ...settings.library_info, code: e.target.value },
                  })
                }
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Physical Address
              </label>
              <input
                type="text"
                value={settings.library_info.address}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    library_info: { ...settings.library_info, address: e.target.value },
                  })
                }
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Contact Email
              </label>
              <input
                type="email"
                value={settings.library_info.email}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    library_info: { ...settings.library_info, email: e.target.value },
                  })
                }
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs"
              />
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 3. APPLICATION UPDATES */}
        {/* ================================================================= */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 pb-3 border-b border-[#F0ECE4]">
            <RefreshCw className="w-4 h-4 text-[#c62828]" />
            <h3 className="text-sm font-bold text-[#2C221E]">Application Updates</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <span className="text-[10px] uppercase text-[#7E6F64]">Versi terpasang</span>
              <div className="text-[#2C221E]">{updater.currentVersion} ({updater.currentVersionCode || 'local'})</div>
            </div>
            <div>
              <span className="text-[10px] uppercase text-[#7E6F64]">Versi terbaru</span>
              <div className="text-[#2C221E]">
                {updater.platform === 'desktop'
                  ? (updater.desktop.version || '-')
                  : (updater.manifest ? `${updater.manifest.version} (${updater.manifest.versionCode})` : '-')}
              </div>
            </div>
          </div>

          {updater.platform === 'desktop' && updater.desktop.available && updater.desktop.version && (
            <div className="rounded-lg bg-[#FAF8F5] p-3 space-y-1 text-xs text-[#4A3E35]">
              <div className="font-semibold text-[#2C221E]">Pembaruan v{updater.desktop.version} tersedia</div>
              {updater.desktop.notes && updater.desktop.notes.split('\n').map((line, index) => (
                line.trim() ? <div key={`${index}-${line}`}>• {line.trim()}</div> : null
              ))}
            </div>
          )}
          {updater.platform === 'desktop' && !updater.desktop.available && updater.desktop.manualStatus === 'up_to_date' && (
            <p className="text-xs text-emerald-700">Anda sudah menggunakan versi terbaru.</p>
          )}
          {updater.platform === 'desktop' && updater.desktop.manualStatus === 'error' && updater.desktop.error && (
            <p className="text-xs text-amber-700">Tidak dapat memeriksa pembaruan: {updater.desktop.error}</p>
          )}

          {updater.platform !== 'desktop' && updater.status === 'available' && updater.manifest && (
            <div className="rounded-lg bg-[#FAF8F5] p-3 space-y-1 text-xs text-[#4A3E35]">
              <div className="font-semibold text-[#2C221E]">Pembaruan v{updater.manifest.version} tersedia</div>
              {updater.manifest.changelog.map((entry, index) => (
                <div key={`${index}-${entry}`}>• {entry}</div>
              ))}
            </div>
          )}
          {updater.platform !== 'desktop' && updater.status === 'up_to_date' && (
            <p className="text-xs text-emerald-700">Anda sudah menggunakan versi terbaru.</p>
          )}
          {updater.platform !== 'desktop' && updater.status === 'unavailable' && (
            <p className="text-xs text-amber-700">Tidak dapat memeriksa pembaruan. Periksa koneksi internet.</p>
          )}
          {updater.platform !== 'desktop' && updater.status === 'disabled' && (
            <p className="text-xs text-[#7E6F64]">
              {updater.platform === 'android'
                ? 'Pemeriksaan pembaruan hanya aktif pada build rilis Android.'
                : 'Pemeriksaan pembaruan tersedia di build Android dan desktop.'}
            </p>
          )}

          <button
            type="button"
            onClick={() => void updater.checkManually()}
            disabled={updater.checking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4CDC3] bg-[#FAF8F5] px-3 py-1.5 text-xs font-semibold text-[#2C221E] hover:bg-[#F0ECE4] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${updater.checking ? 'animate-spin' : ''}`} />
            {updater.checking ? 'Memeriksa...' : 'Periksa pembaruan'}
          </button>
        </div>

        {/* ================================================================= */}
        {/* 4. UPDATE NOTIFICATIONS (Web Push / iOS PWA) */}
        {/* ================================================================= */}
        {pushSupported && (
          <div className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 pb-3 border-b border-[#F0ECE4]">
              <BellRing className="w-4 h-4 text-[#c62828]" />
              <h3 className="text-sm font-bold text-[#2C221E]">Notifikasi Update (Web / iOS)</h3>
            </div>

            <p className="text-xs text-[#7E6F64]">
              Dapatkan notifikasi saat versi baru dirilis — langsung ke perangkat ini.
            </p>
            {iosBrowserHint && (
              <p className="text-xs text-amber-700">
                iOS hanya mengirim notifikasi ke app di Layar Utama. Di Safari: tombol <strong>Bagikan</strong> →{' '}
                <strong>Tambahkan ke Layar Utama</strong>, lalu buka dari ikon tersebut dan aktifkan di sini.
              </p>
            )}
            {pushError && <p className="text-xs text-red-600">{pushError}</p>}

            <div className="flex items-center gap-3">
              <span className="text-xs font-mono">
                Status:{' '}
                {pushSubscribed ? (
                  <span className="text-emerald-700 font-semibold">Aktif</span>
                ) : (
                  <span className="text-[#7E6F64]">Nonaktif</span>
                )}
              </span>
              {pushSubscribed ? (
                <button
                  type="button"
                  onClick={() => void handleDisablePush()}
                  disabled={pushBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#D4CDC3] bg-[#FAF8F5] px-3 py-1.5 text-xs font-semibold text-[#2C221E] hover:bg-[#F0ECE4] disabled:opacity-50"
                >
                  {pushBusy ? 'Memproses...' : 'Nonaktifkan notifikasi'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleEnablePush()}
                  disabled={pushBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#c62828] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#a61f1f] disabled:opacity-50"
                >
                  <BellRing className="h-3.5 w-3.5" />
                  {pushBusy ? 'Mengaktifkan...' : 'Aktifkan notifikasi update'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Form Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#c62828] hover:bg-[#a61f1f] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Save Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
};
