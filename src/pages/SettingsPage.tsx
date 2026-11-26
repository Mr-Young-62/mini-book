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
  Users,
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
import { supabase } from '../lib/supabase';
import { roleLabel } from '../lib/userRole';

interface RoleAssignment {
  user_id: string;
  full_name: string;
  email: string;
  role_name: UserRole | null;
}

interface AccessRequest {
  user_id: string;
  full_name: string;
  email: string;
  requested_at: string;
  status: string;
}

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
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [roleSelections, setRoleSelections] = useState<Record<string, UserRole>>({});
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleBusyUserId, setRoleBusyUserId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [roleNotice, setRoleNotice] = useState<string | null>(null);
  const iosBrowserHint = pushSupported && isIosDevice() && !isIosStandalone();
  const canManageRoles = userRole === 'Owner' || userRole === 'Administrator';

  const loadRoleManagement = async () => {
    if (!supabase || !canManageRoles) return;
    setRoleLoading(true);
    setRoleError(null);
    try {
      const [assignmentsResult, requestsResult] = await Promise.all([
        supabase.rpc('list_library_role_assignments'),
        supabase.rpc('list_library_access_requests'),
      ]);
      if (assignmentsResult.error) throw assignmentsResult.error;
      if (requestsResult.error) throw requestsResult.error;
      setRoleAssignments((assignmentsResult.data || []) as RoleAssignment[]);
      setAccessRequests((requestsResult.data || []) as AccessRequest[]);
    } catch (error) {
      setRoleError(error instanceof Error ? error.message : String(error));
    } finally {
      setRoleLoading(false);
    }
  };

  useEffect(() => {
    void loadRoleManagement();
  }, [canManageRoles]);

  const handleRoleChange = async (userId: string) => {
    if (!supabase) return;
    const role = roleSelections[userId] || roleAssignments.find((item) => item.user_id === userId)?.role_name;
    if (!role) {
      setRoleError('Pilih role sebelum menyimpan perubahan.');
      return;
    }
    setRoleBusyUserId(userId);
    setRoleError(null);
    setRoleNotice(null);
    try {
      const { error } = await supabase.rpc('set_library_user_role', {
        p_user_id: userId,
        p_role_name: role,
      });
      if (error) throw error;
      setRoleNotice(`Role ${roleLabel[role]} berhasil disimpan.`);
      await loadRoleManagement();
      onRefreshAppState();
    } catch (error) {
      setRoleError(error instanceof Error ? error.message : String(error));
    } finally {
      setRoleBusyUserId(null);
    }
  };

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
    <div className="max-w-4xl space-y-7 pb-6">
      <div className="border-b border-[#ECEEF2] pb-5">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#14181F] font-sans sm:text-3xl">
          Library & System Settings
        </h1>
        <p className="mt-1.5 text-xs leading-relaxed text-[#6E737D]">
          Configure your Supabase database connection and library metadata.
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

      {canManageRoles && (
        <section className="space-y-4 rounded-xl border border-[#ECEEF2] bg-white p-5 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-[#ECEEF2] pb-3">
            <Users className="h-4 w-4 text-[#18362F]" />
            <div>
              <h2 className="text-sm font-bold text-[#14181F]">Manajemen Role & Permintaan Akses</h2>
              <p className="text-[11px] text-[#6E737D]">Role hanya dapat diubah melalui RPC yang memvalidasi kewenangan administrator.</p>
            </div>
          </div>

          {roleError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">{roleError}</p>}
          {roleNotice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">{roleNotice}</p>}

          {accessRequests.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#6E737D]">Permintaan akses</h3>
              {accessRequests.map((request) => (
                <div key={request.user_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#ECEEF2] bg-[#F5F6F8] p-3">
                  <div>
                    <p className="text-xs font-semibold text-[#14181F]">{request.full_name}</p>
                    <p className="text-[11px] text-[#6E737D]">{request.email} · {new Date(request.requested_at).toLocaleString()}</p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900">{request.status}</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wide text-[#6E737D]">Akun dan role</h3>
            {roleLoading ? (
              <p className="text-xs text-[#6E737D]">Memuat daftar akun...</p>
            ) : roleAssignments.length === 0 ? (
              <p className="text-xs text-[#6E737D]">Belum ada profil pengguna.</p>
            ) : roleAssignments.map((assignment) => {
              const selectedRole = roleSelections[assignment.user_id] || assignment.role_name || 'Member';
              return (
                <div key={assignment.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#ECEEF2] p-3">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[#14181F]">{assignment.full_name}</p>
                    <p className="truncate text-[11px] text-[#6E737D]">{assignment.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Role ${assignment.email}`}
                      value={selectedRole}
                      onChange={(event) => setRoleSelections((current) => ({
                        ...current,
                        [assignment.user_id]: event.target.value as UserRole,
                      }))}
                      className="rounded-lg border border-[#E5E7EB] bg-white px-2 py-1.5 text-xs text-[#14181F]"
                    >
                      {(['Member', 'Librarian', 'Administrator'] as UserRole[]).map((role) => (
                        <option key={role} value={role}>{roleLabel[role]}</option>
                      ))}
                      {userRole === 'Owner' && <option value="Owner">{roleLabel.Owner}</option>}
                    </select>
                    <button
                      type="button"
                      onClick={() => void handleRoleChange(assignment.user_id)}
                      disabled={roleBusyUserId === assignment.user_id || selectedRole === assignment.role_name}
                      className="rounded-lg bg-[#18362F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#112822] disabled:opacity-50"
                    >
                      {roleBusyUserId === assignment.user_id ? 'Menyimpan...' : 'Simpan'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* ================================================================= */}
        {/* 1. SUPABASE DATABASE CONFIGURATION */}
        {/* ================================================================= */}
        <div className="bg-white border border-[#ECEEF2] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#ECEEF2]">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#18362F]" />
              <h3 className="text-sm font-bold text-[#14181F]">
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

          <p className="text-xs text-[#6E737D] leading-relaxed">
            MeelieFont uses Supabase PostgreSQL, Storage, Auth, and Edge Functions. When live credentials are supplied below, the client persists directly to your cloud Supabase database.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-[#4B5563] mb-1">
                Supabase URL (VITE_SUPABASE_URL)
              </label>
              <input
                type="text"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://xyzproject.supabase.co"
                className="w-full px-3 py-2 bg-[#F5F6F8] border border-[#E5E7EB] rounded-lg text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#4B5563] mb-1">
                Supabase Publishable / Anon Key
              </label>
              <input
                type="password"
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                placeholder="sbp_... or eyJhbGciOi..."
                className="w-full px-3 py-2 bg-[#F5F6F8] border border-[#E5E7EB] rounded-lg text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#ECEEF2] text-[11px]">
            <div className="text-[#6E737D]">
              Migrations stored in <code className="font-mono text-[#14181F]">supabase/migrations/</code>
            </div>
            {isSupabaseConfigured && (
              <button
                type="button"
                onClick={handleResetToSandbox}
                className="text-[#6E737D] hover:text-rose-600 font-medium"
              >
                Disconnect & Use Local Sandbox
              </button>
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* 2. LIBRARY INFORMATION */}
        {/* ================================================================= */}
        <div className="bg-white border border-[#ECEEF2] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#ECEEF2]">
            <Building className="w-4 h-4 text-[#18362F]" />
            <h3 className="text-sm font-bold text-[#14181F]">Library Profile</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-[#4B5563] mb-1">
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
                className="w-full px-3 py-2 bg-[#F5F6F8] border border-[#E5E7EB] rounded-lg text-xs font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#4B5563] mb-1">
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
                className="w-full px-3 py-2 bg-[#F5F6F8] border border-[#E5E7EB] rounded-lg text-xs font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#4B5563] mb-1">
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
                className="w-full px-3 py-2 bg-[#F5F6F8] border border-[#E5E7EB] rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#4B5563] mb-1">
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
                className="w-full px-3 py-2 bg-[#F5F6F8] border border-[#E5E7EB] rounded-lg text-xs"
              />
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 3. APPLICATION UPDATES */}
        {/* ================================================================= */}
        <div className="bg-white border border-[#ECEEF2] rounded-xl p-5 shadow-2xs space-y-3">
          <div className="flex items-center gap-2 pb-3 border-b border-[#ECEEF2]">
            <RefreshCw className="w-4 h-4 text-[#18362F]" />
            <h3 className="text-sm font-bold text-[#14181F]">Application Updates</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
            <div>
              <span className="text-[10px] uppercase text-[#6E737D]">Versi terpasang</span>
              <div className="text-[#14181F]">{updater.currentVersion} ({updater.currentVersionCode || 'local'})</div>
            </div>
            <div>
              <span className="text-[10px] uppercase text-[#6E737D]">Versi terbaru</span>
              <div className="text-[#14181F]">
                {updater.platform === 'desktop'
                  ? (updater.desktop.version || '-')
                  : (updater.manifest ? `${updater.manifest.version} (${updater.manifest.versionCode})` : '-')}
              </div>
            </div>
          </div>

          {updater.platform === 'desktop' && updater.desktop.available && updater.desktop.version && (
            <div className="rounded-lg bg-[#F5F6F8] p-3 space-y-1 text-xs text-[#374151]">
              <div className="font-semibold text-[#14181F]">Pembaruan v{updater.desktop.version} tersedia</div>
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
            <div className="rounded-lg bg-[#F5F6F8] p-3 space-y-1 text-xs text-[#374151]">
              <div className="font-semibold text-[#14181F]">Pembaruan v{updater.manifest.version} tersedia</div>
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
            <p className="text-xs text-[#6E737D]">
              {updater.platform === 'android'
                ? 'Pemeriksaan pembaruan hanya aktif pada build rilis Android.'
                : 'Pemeriksaan pembaruan tersedia di build Android dan desktop.'}
            </p>
          )}

          <button
            type="button"
            onClick={() => void updater.checkManually()}
            disabled={updater.checking}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-[#F5F6F8] px-3 py-1.5 text-xs font-semibold text-[#14181F] hover:bg-[#ECEEF2] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${updater.checking ? 'animate-spin' : ''}`} />
            {updater.checking ? 'Memeriksa...' : 'Periksa pembaruan'}
          </button>
        </div>

        {/* ================================================================= */}
        {/* 4. UPDATE NOTIFICATIONS (Web Push / iOS PWA) */}
        {/* ================================================================= */}
        {pushSupported && (
          <div className="bg-white border border-[#ECEEF2] rounded-xl p-5 shadow-2xs space-y-3">
            <div className="flex items-center gap-2 pb-3 border-b border-[#ECEEF2]">
              <BellRing className="w-4 h-4 text-[#18362F]" />
              <h3 className="text-sm font-bold text-[#14181F]">Notifikasi Update (Web / iOS)</h3>
            </div>

            <p className="text-xs text-[#6E737D]">
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
                  <span className="text-[#6E737D]">Nonaktif</span>
                )}
              </span>
              {pushSubscribed ? (
                <button
                  type="button"
                  onClick={() => void handleDisablePush()}
                  disabled={pushBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-[#F5F6F8] px-3 py-1.5 text-xs font-semibold text-[#14181F] hover:bg-[#ECEEF2] disabled:opacity-50"
                >
                  {pushBusy ? 'Memproses...' : 'Nonaktifkan notifikasi'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleEnablePush()}
                  disabled={pushBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#18362F] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#112822] disabled:opacity-50"
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
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#18362F] hover:bg-[#112822] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Save Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
};
