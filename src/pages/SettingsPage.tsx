import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  RefreshCw,
  Smartphone,
  Building,
  Cloud,
  Database,
  Eye,
  EyeOff,
  HardDrive,
  Save,
  Users,
} from 'lucide-react';
import type { UpdaterApi } from '../hooks/useAppUpdater';
import {
  describeNotificationError,
  disableAndroidNotifications,
  enableAndroidNotifications,
  getNotificationStatus,
  getPushSubscription,
  isAndroidPlatform,
  isIosDevice,
  isIosStandalone,
  isWebPushSupported,
  NotificationStatus,
  savePushSubscription,
  showTestNotification,
  subscribeToPush,
  unsubscribeFromPush,
} from '../services/pushService';
import { LibraryService } from '../services/libraryService';
import { LibrarySettings, UserRole } from '../types/library';
import {
  buildTimeSupabaseUrl,
  configureSupabase,
  effectiveSupabaseKey,
  effectiveSupabaseUrl,
  isSupabaseConfigured,
  resetSupabaseConfig,
  supabase,
} from '../lib/supabase';
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
const getInitials = (fullName: string, email: string): string => {
  const source = (fullName || email || 'U').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
};

interface SettingsPageProps {
  updater: UpdaterApi;
  userRole?: UserRole;
  onRefreshAppState?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  userRole = 'Administrator',
  onRefreshAppState = () => {},
  updater,
}) => {
  const [settings, setSettings] = useState<LibrarySettings>(
    LibraryService.getSettings(),
  );
  const [supabaseUrl, setSupabaseUrl] = useState(effectiveSupabaseUrl || '');
  const [supabaseKey, setSupabaseKey] = useState(effectiveSupabaseKey || '');
  const [showSupabaseKey, setShowSupabaseKey] = useState(false);
  const [pendingHostConfirm, setPendingHostConfirm] = useState<string | null>(
    null,
  );
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState(
    'Pengaturan berhasil disimpan.',
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [pushSupported] = useState(() => isWebPushSupported());
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const [roleAssignments, setRoleAssignments] = useState<RoleAssignment[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [roleSelections, setRoleSelections] = useState<Record<string, UserRole>>(
    {},
  );
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

  const [notificationStatus, setNotificationStatus] = useState<NotificationStatus | null>(null);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationNotice, setNotificationNotice] = useState<string | null>(null);

  const refreshNotificationStatus = useCallback(async () => {
    const status = await getNotificationStatus();
    setNotificationStatus(status);
  }, []);

  useEffect(() => {
    void refreshNotificationStatus();
  }, [refreshNotificationStatus]);

  const handleRoleChange = async (userId: string) => {
    if (!supabase) return;
    const role =
      roleSelections[userId] ||
      roleAssignments.find((item) => item.user_id === userId)?.role_name;
    if (!role) {
      setRoleError('Pilih peran sebelum menyimpan perubahan.');
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
      setRoleNotice(`Peran ${roleLabel[role]} berhasil disimpan.`);
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

  const executeSave = async (allowHostSwitch: boolean) => {
    setErrorMessage(null);
    setSaveSuccess(false);
    setPendingHostConfirm(null);
    setSavingSettings(true);

    try {
      let configChanged = false;
      if (supabaseUrl && supabaseKey) {
        const nextUrl = supabaseUrl.trim();
        const nextKey = supabaseKey.trim();
        configChanged =
          nextUrl !== effectiveSupabaseUrl || nextKey !== effectiveSupabaseKey;
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
          if (
            !allowHostSwitch &&
            buildHost &&
            nextHost &&
            nextHost !== buildHost
          ) {
            setPendingHostConfirm(nextHost);
            setSavingSettings(false);
            return;
          }
          const configResult = configureSupabase(nextUrl, nextKey);
          if (!configResult.success) {
            setErrorMessage(
              configResult.error || 'Gagal memperbarui konfigurasi Supabase.',
            );
            return;
          }
        }
      }

      try {
        await LibraryService.updateSettings(settings);
        setSaveSuccessMessage(
          configChanged
            ? 'Koneksi Supabase dan pengaturan perpustakaan disimpan. Masuk ulang ke proyek baru bila diminta.'
            : 'Pengaturan berhasil disimpan.',
        );
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3200);
      } catch (err: unknown) {
        if (!configChanged) throw err;
        const message =
          err instanceof Error ? err.message : 'kesalahan tidak dikenal';
        setErrorMessage(
          `Koneksi Supabase tersimpan, tetapi pengaturan perpustakaan belum tersimpan ke cloud (${message}). Masuk ulang lalu simpan lagi.`,
        );
      }
      onRefreshAppState();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Terjadi kesalahan saat menyimpan pengaturan.';
      setErrorMessage(message);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    void executeSave(false);
  };

  const handleConfirmResetToSandbox = () => {
    resetSupabaseConfig();
    setSupabaseUrl('');
    setSupabaseKey('');
    setConfirmingReset(false);
    setPendingHostConfirm(null);
    onRefreshAppState();
  };

  const navLinks: Array<{ href: string; label: string }> = [
    { href: '#profil', label: 'Profil perpustakaan' },
    { href: '#koneksi', label: 'Koneksi database' },
    ...(canManageRoles ? [{ href: '#akses', label: 'Peran & akses' }] : []),
    { href: '#sistem', label: 'Aplikasi & notifikasi' },
  ];

  const inputClass =
    'w-full min-h-[44px] px-3.5 py-2.5 bg-[#F2EFE8] rounded-[12px] text-sm text-[#262925] placeholder-[#686C65] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25 transition-colors';
  const labelClass = 'block text-xs font-semibold text-[#686C65] mb-1.5';

  return (
    <div className="max-w-5xl space-y-6 pb-8">
      {/* Header + System Summary Grouped Strip */}
      <header className="space-y-4">
        <div>
          <h1 className="page-title">
            Pengaturan
          </h1>
          <p className="mt-1 text-[13px] sm:text-[15px] leading-[1.55] text-[#686C65]">
            Kelola identitas perpustakaan, sinkronisasi cloud, hak akses tim, dan pembaruan perangkat.
          </p>
        </div>

        <div className="rounded-[18px] overflow-hidden shadow-[0_1px_3px_rgba(38,41,37,0.04)] grid grid-cols-1 sm:grid-cols-3 gap-px bg-[#ECE7DD]">
          <div className="flex items-center gap-3 bg-white px-4 py-3.5">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${
                isSupabaseConfigured
                  ? 'bg-[#E5F2EE] text-[#1F6F5B]'
                  : 'bg-[#F2EFE8] text-[#686C65]'
              }`}
              aria-hidden="true"
            >
              {isSupabaseConfigured ? (
                <Cloud className="h-4 w-4" strokeWidth={1.5} />
              ) : (
                <HardDrive className="h-4 w-4" strokeWidth={1.5} />
              )}
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-[#737770]">
                Mode penyimpanan
              </div>
              <div className="truncate text-xs font-semibold text-[#262925]">
                {isSupabaseConfigured ? 'Cloud Supabase' : 'Penyimpanan Lokal'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white px-4 py-3.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#E5F2EE] text-[#1F6F5B]"
              aria-hidden="true"
            >
              <Users className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-[#737770]">
                Peran aktif
              </div>
              <div className="truncate text-xs font-semibold text-[#262925]">
                {roleLabel[userRole]}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white px-4 py-3.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#F2EFE8] text-[#262925]"
              aria-hidden="true"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-[#737770]">
                Versi terpasang
              </div>
              <div className="truncate text-xs font-semibold tabular-nums text-[#262925]">
                v{updater.currentVersion}
              </div>
            </div>
          </div>
        </div>
      </header>

      {saveSuccess && (
        <div
          role="status"
          className="rounded-[18px] bg-[#E5F2EE] px-4 py-3 flex items-center gap-2.5 text-xs font-semibold text-[#165243]"
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="rounded-[18px] bg-[#FDECEC] px-4 py-3 flex items-center gap-2.5 text-xs font-semibold text-[#B3261E]"
        >
          <AlertCircle className="w-4 h-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Two-Column iOS Grouped Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-5 items-start">
        <nav
          aria-label="Bagian pengaturan"
          className="hidden lg:flex flex-col gap-0.5 sticky top-16 rounded-[18px] bg-white shadow-[0_1px_3px_rgba(38,41,37,0.04)] p-1.5"
        >
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-[12px] px-3 py-2.5 text-xs font-semibold text-[#686C65] hover:bg-[#F2EFE8] hover:text-[#165243] transition-colors"
            >
              <span className="reserve-bold" data-label={link.label}>
                {link.label}
              </span>
            </a>
          ))}
        </nav>

        <div className="space-y-5 min-w-0">
          {/* Form covers Profile + Database */}
          <form onSubmit={handleSaveSettings} className="space-y-5">
            {/* 1. Library Profile */}
            <section
              id="profil"
              className="scroll-mt-20 bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] overflow-hidden divide-y divide-[#ECE7DD]"
            >
              <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#E5F2EE] text-[#1F6F5B]"
                  aria-hidden="true"
                >
                  <Building className="w-4 h-4" strokeWidth={1.5} />
                </span>
                <div>
                  <h2 className="text-[16px] font-semibold text-[#262925]">
                    Profil perpustakaan
                  </h2>
                  <p className="text-xs text-[#737770] mt-0.5">
                    Identitas ini ditampilkan pada Beranda dan header laporan cetak.
                  </p>
                </div>
              </div>

              <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="settings-lib-name" className={labelClass}>
                    Nama perpustakaan
                  </label>
                  <input
                    id="settings-lib-name"
                    type="text"
                    value={settings.library_info.name}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        library_info: {
                          ...settings.library_info,
                          name: e.target.value,
                        },
                      })
                    }
                    className={`${inputClass} font-medium`}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="settings-lib-code" className={labelClass}>
                    Kode cabang
                  </label>
                  <input
                    id="settings-lib-code"
                    type="text"
                    value={settings.library_info.code}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        library_info: {
                          ...settings.library_info,
                          code: e.target.value,
                        },
                      })
                    }
                    className={`${inputClass} font-mono`}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="settings-lib-address" className={labelClass}>
                    Alamat
                  </label>
                  <input
                    id="settings-lib-address"
                    type="text"
                    value={settings.library_info.address}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        library_info: {
                          ...settings.library_info,
                          address: e.target.value,
                        },
                      })
                    }
                    placeholder="Contoh: Ruang Baca Lt. 2"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="settings-lib-email" className={labelClass}>
                    Email kontak
                  </label>
                  <input
                    id="settings-lib-email"
                    type="email"
                    value={settings.library_info.email}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        library_info: {
                          ...settings.library_info,
                          email: e.target.value,
                        },
                      })
                    }
                    placeholder="perpus@domain.id"
                    className={inputClass}
                  />
                </div>
              </div>
            </section>

            {/* 2. Database Connection */}
            <section
              id="koneksi"
              className="scroll-mt-20 bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] overflow-hidden divide-y divide-[#ECE7DD]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#E5F2EE] text-[#1F6F5B]"
                    aria-hidden="true"
                  >
                    <Database className="w-4 h-4" strokeWidth={1.5} />
                  </span>
                  <div>
                    <h2 className="text-[16px] font-semibold text-[#262925]">
                      Koneksi database Supabase
                    </h2>
                    <p className="text-xs text-[#737770] mt-0.5">
                      Sinkronkan katalog buku, sampul, pinjaman, dan akun lintas perangkat.
                    </p>
                  </div>
                </div>

                <span
                  className={`px-2.5 py-1 rounded-[10px] text-[11px] font-semibold ${
                    isSupabaseConfigured
                      ? 'bg-[#E5F2EE] text-[#165243]'
                      : 'bg-[#F2EFE8] text-[#686C65]'
                  }`}
                >
                  {isSupabaseConfigured ? 'Terhubung ke Cloud' : 'Mode Lokal'}
                </span>
              </div>

              <div className="p-4 sm:p-5 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label htmlFor="settings-supabase-url" className={labelClass}>
                      Supabase URL
                    </label>
                    <input
                      id="settings-supabase-url"
                      type="text"
                      value={supabaseUrl}
                      onChange={(e) => {
                        setSupabaseUrl(e.target.value);
                        if (pendingHostConfirm) setPendingHostConfirm(null);
                      }}
                      placeholder="https://xyzproject.supabase.co"
                      className={`${inputClass} font-mono text-xs`}
                    />
                  </div>

                  <div>
                    <label htmlFor="settings-supabase-key" className={labelClass}>
                      Publishable / Anon Key
                    </label>
                    <div className="relative">
                      <input
                        id="settings-supabase-key"
                        type={showSupabaseKey ? 'text' : 'password'}
                        value={supabaseKey}
                        onChange={(e) => setSupabaseKey(e.target.value)}
                        placeholder="sbp_... atau eyJhbGciOi..."
                        className={`${inputClass} pr-11 font-mono text-xs`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSupabaseKey((prev) => !prev)}
                        aria-label={
                          showSupabaseKey
                            ? 'Sembunyikan kunci Supabase'
                            : 'Tampilkan kunci Supabase'
                        }
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[#686C65] hover:bg-white hover:text-[#262925]"
                      >
                        {showSupabaseKey ? (
                          <EyeOff className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                        ) : (
                          <Eye className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {pendingHostConfirm && (
                  <div
                    role="alert"
                    className="rounded-[12px] bg-[#F7EAE4] p-3.5 space-y-2.5"
                  >
                    <p className="text-xs font-medium text-[#9E4028]">
                      Koneksi akan diarahkan ke host <span className="font-mono font-semibold">{pendingHostConfirm}</span>. Pastikan host tersebut milik proyek Supabase yang tepercaya.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void executeSave(true)}
                        className="min-h-[38px] rounded-[12px] bg-[#B9543A] px-3.5 text-xs font-semibold text-white hover:bg-[#9E4028]"
                      >
                        Ya, arahkan ke host baru
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPendingHostConfirm(null);
                          setErrorMessage('Perubahan koneksi Supabase dibatalkan.');
                        }}
                        className="min-h-[38px] rounded-[12px] bg-white px-3.5 text-xs font-semibold text-[#262925] hover:bg-[#ECE8DF]"
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5 text-xs">
                <div className="text-[#737770]">
                  Migrasi skema tersedia di{' '}
                  <code className="font-mono font-semibold text-[#262925]">
                    supabase/migrations/
                  </code>
                </div>

                {isSupabaseConfigured && !confirmingReset && (
                  <button
                    type="button"
                    onClick={() => setConfirmingReset(true)}
                    className="text-xs font-semibold text-[#B3261E] hover:text-[#8E1D17]"
                  >
                    Putuskan & pakai mode lokal
                  </button>
                )}
              </div>

              {confirmingReset && (
                <div
                  role="alert"
                  className="bg-[#FDECEC] px-4 py-3 sm:px-5 flex flex-wrap items-center justify-between gap-3"
                >
                  <span className="text-xs font-medium text-[#B3261E]">
                    Putuskan koneksi cloud dan gunakan data lokal perangkat ini?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmingReset(false)}
                      className="min-h-[36px] rounded-[12px] bg-white px-3 text-xs font-semibold text-[#262925] hover:bg-[#ECE8DF]"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmResetToSandbox}
                      className="min-h-[36px] rounded-[12px] bg-[#B3261E] px-3 text-xs font-semibold text-white hover:bg-[#8E1D17]"
                    >
                      Ya, putuskan
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Primary Save Bar */}
            <div className="bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] px-4 py-3.5 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <p className="text-xs text-[#737770]">
                Simpan perubahan profil perpustakaan dan koneksi database secara bersamaan.
              </p>
              <button
                type="submit"
                disabled={savingSettings}
                className="btn-primary-tactile inline-flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 px-5 text-sm font-semibold rounded-[12px] disabled:opacity-60 shrink-0"
              >
                <Save className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                <span>{savingSettings ? 'Menyimpan...' : 'Simpan pengaturan'}</span>
              </button>
            </div>
          </form>

          {/* 3. Team & Role Management */}
          {canManageRoles && (
            <section
              id="akses"
              className="scroll-mt-20 rounded-[18px] bg-white shadow-[0_1px_3px_rgba(38,41,37,0.04)] overflow-hidden divide-y divide-[#ECE7DD]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#E5F2EE] text-[#1F6F5B]"
                    aria-hidden="true"
                  >
                    <Users className="h-4 w-4" strokeWidth={1.5} />
                  </span>
                  <div>
                    <h2 className="text-[16px] font-semibold text-[#262925]">
                      Peran & permintaan akses
                    </h2>
                    <p className="text-xs text-[#737770] mt-0.5">
                      Atur izin anggota. Perubahan peran diproses langsung melalui server.
                    </p>
                  </div>
                </div>

                {accessRequests.length > 0 && (
                  <span className="rounded-[10px] bg-[#F7EAE4] px-2.5 py-1 text-[11px] font-semibold text-[#9E4028]">
                    {accessRequests.length} permintaan baru
                  </span>
                )}
              </div>

              {roleError && (
                <p
                  role="alert"
                  className="bg-[#FDECEC] px-4 py-3 sm:px-5 text-xs font-medium text-[#B3261E]"
                >
                  {roleError}
                </p>
              )}
              {roleNotice && (
                <p
                  role="status"
                  className="bg-[#E5F2EE] px-4 py-3 sm:px-5 text-xs font-medium text-[#165243]"
                >
                  {roleNotice}
                </p>
              )}

              {accessRequests.length > 0 && (
                <div className="divide-y divide-[#ECE7DD]">
                  <div className="px-4 py-2.5 sm:px-5 text-xs font-semibold text-[#686C65]">
                    Permintaan akses menunggu
                  </div>
                  {accessRequests.map((request) => (
                    <div
                      key={request.user_id}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#262925]">
                          {request.full_name}
                        </p>
                        <p className="text-[11px] text-[#686C65]">
                          {request.email} ·{' '}
                          {new Date(request.requested_at).toLocaleString('id-ID')}
                        </p>
                      </div>
                      <span className="rounded-[10px] bg-[#F7EAE4] px-2.5 py-1 text-[11px] font-semibold text-[#9E4028]">
                        {request.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="divide-y divide-[#ECE7DD]">
                <div className="px-4 py-2.5 sm:px-5 text-xs font-semibold text-[#686C65]">
                  Daftar akun & peran
                </div>
                {roleLoading ? (
                  <div className="h-14 bg-white animate-pulse" />
                ) : roleAssignments.length === 0 ? (
                  <p className="px-4 py-3.5 sm:px-5 text-xs text-[#737770]">
                    {isSupabaseConfigured
                      ? 'Belum ada profil pengguna yang terdaftar.'
                      : 'Manajemen peran aktif setelah koneksi cloud Supabase terhubung.'}
                  </p>
                ) : (
                  roleAssignments.map((assignment) => {
                    const selectedRole =
                      roleSelections[assignment.user_id] ||
                      assignment.role_name ||
                      'Member';
                    return (
                      <div
                        key={assignment.user_id}
                        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#E5F2EE] text-xs font-semibold text-[#165243]"
                            aria-hidden="true"
                          >
                            {getInitials(assignment.full_name, assignment.email)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[#262925]">
                              {assignment.full_name}
                            </p>
                            <p className="truncate text-[11px] text-[#686C65]">
                              {assignment.email}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Peran ${assignment.email}`}
                            value={selectedRole}
                            onChange={(event) =>
                              setRoleSelections((current) => ({
                                ...current,
                                [assignment.user_id]: event.target
                                  .value as UserRole,
                              }))
                            }
                            className="min-h-[38px] rounded-[12px] bg-[#F2EFE8] px-3 py-1.5 text-xs font-medium text-[#262925] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25"
                          >
                            {(
                              [
                                'Member',
                                'Librarian',
                                'Administrator',
                              ] as UserRole[]
                            ).map((role) => (
                              <option key={role} value={role}>
                                {roleLabel[role]}
                              </option>
                            ))}
                            {userRole === 'Owner' && (
                              <option value="Owner">{roleLabel.Owner}</option>
                            )}
                          </select>
                          <button
                            type="button"
                            onClick={() =>
                              void handleRoleChange(assignment.user_id)
                            }
                            disabled={
                              roleBusyUserId === assignment.user_id ||
                              selectedRole === assignment.role_name
                            }
                            className="btn-primary-tactile min-h-[38px] rounded-[12px] px-3.5 text-xs font-semibold disabled:opacity-50"
                          >
                            {roleBusyUserId === assignment.user_id
                              ? 'Menyimpan...'
                              : 'Simpan'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {/* 4. System Updates & Device Notifications */}
          <section
            id="sistem"
            className="scroll-mt-20 bg-white rounded-[18px] shadow-[0_1px_3px_rgba(38,41,37,0.04)] overflow-hidden divide-y divide-[#ECE7DD]"
          >
            {/* App Updates Header */}
            <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-[#F2EFE8] text-[#262925]"
                aria-hidden="true"
              >
                <RefreshCw className="w-4 h-4" strokeWidth={1.5} />
              </span>
              <div>
                <h2 className="text-[16px] font-semibold text-[#262925]">
                  Pembaruan aplikasi
                </h2>
                <p className="text-xs text-[#737770] mt-0.5">
                  Informasi rilis yang terpasang dan pemeriksaan versi terbaru.
                </p>
              </div>
            </div>

            {/* Version Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#ECE7DD]">
              <div className="px-4 py-3 sm:px-5">
                <span className="block text-[11px] font-medium text-[#737770]">
                  Versi terpasang
                </span>
                <div className="mt-0.5 text-xs font-semibold tabular-nums text-[#262925]">
                  {updater.currentVersion} ({updater.currentVersionCode || 'local'})
                </div>
              </div>
              <div className="px-4 py-3 sm:px-5">
                <span className="block text-[11px] font-medium text-[#737770]">
                  Versi terbaru
                </span>
                <div className="mt-0.5 text-xs font-semibold tabular-nums text-[#262925]">
                  {updater.platform === 'desktop'
                    ? updater.desktop.version || '-'
                    : updater.manifest
                    ? `${updater.manifest.version} (${updater.manifest.versionCode})`
                    : '-'}
                </div>
              </div>
            </div>

            {/* Update Check Action */}
            <div className="px-4 py-3.5 sm:px-5 space-y-3">
              {updater.platform === 'desktop' &&
                updater.desktop.available &&
                updater.desktop.version && (
                  <div className="rounded-[12px] bg-[#E5F2EE] p-3 space-y-1 text-xs text-[#165243]">
                    <div className="font-semibold">
                      Pembaruan v{updater.desktop.version} tersedia
                    </div>
                    {updater.desktop.notes &&
                      updater.desktop.notes.split('\n').map((line, index) =>
                        line.trim() ? (
                          <div key={`${index}-${line}`}>{line.trim()}</div>
                        ) : null,
                      )}
                  </div>
                )}
              {updater.platform === 'desktop' &&
                !updater.desktop.available &&
                updater.desktop.manualStatus === 'up_to_date' && (
                  <p className="text-xs font-medium text-[#165243]">
                    Anda sudah menggunakan versi terbaru.
                  </p>
                )}
              {updater.platform === 'desktop' &&
                updater.desktop.manualStatus === 'error' &&
                updater.desktop.error && (
                  <p className="text-xs font-medium text-[#9E4028]">
                    Tidak dapat memeriksa pembaruan: {updater.desktop.error}
                  </p>
                )}

              {updater.platform !== 'desktop' &&
                updater.status === 'available' &&
                updater.manifest && (
                  <div className="rounded-[12px] bg-[#E5F2EE] p-3 space-y-1 text-xs text-[#165243]">
                    <div className="font-semibold">
                      Pembaruan v{updater.manifest.version} tersedia
                    </div>
                    {updater.manifest.changelog.map((entry, index) => (
                      <div key={`${index}-${entry}`}>{entry}</div>
                    ))}
                  </div>
                )}
              {updater.platform !== 'desktop' &&
                updater.status === 'up_to_date' && (
                  <p className="text-xs font-medium text-[#165243]">
                    Anda sudah menggunakan versi terbaru.
                  </p>
                )}
              {updater.platform !== 'desktop' &&
                updater.status === 'unavailable' && (
                  <p className="text-xs font-medium text-[#9E4028]">
                    Tidak dapat memeriksa pembaruan. Periksa koneksi internet.
                  </p>
                )}
              {updater.platform !== 'desktop' &&
                updater.status === 'disabled' && (
                  <p className="text-xs text-[#737770]">
                    {updater.platform === 'android'
                      ? 'Pemeriksaan pembaruan hanya aktif pada build rilis Android.'
                      : 'Pemeriksaan pembaruan tersedia di build Android dan desktop.'}
                  </p>
                )}

              <button
                type="button"
                onClick={() => void updater.checkManually()}
                disabled={updater.checking}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-[12px] bg-[#F2EFE8] px-4 text-xs font-semibold text-[#262925] hover:bg-[#E7E2D7] disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${updater.checking ? 'animate-spin' : ''}`}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span>
                  {updater.checking ? 'Memeriksa...' : 'Periksa pembaruan'}
                </span>
              </button>
            </div>

            {/* Push Notifications Sibling Row */}
            {pushSupported && (
              <div className="px-4 py-4 sm:px-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <BellRing
                      className="w-4 h-4 text-[#1F6F5B]"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <h3 className="text-sm font-semibold text-[#262925]">
                      Notifikasi pembaruan (Web / iOS)
                    </h3>
                  </div>

                  <span
                    className={`rounded-[10px] px-2.5 py-1 text-[11px] font-semibold ${
                      pushSubscribed
                        ? 'bg-[#E5F2EE] text-[#165243]'
                        : 'bg-[#F2EFE8] text-[#686C65]'
                    }`}
                  >
                    {pushSubscribed ? 'Aktif' : 'Nonaktif'}
                  </span>
                </div>

                <p className="text-xs text-[#737770]">
                  Dapatkan pemberitahuan saat versi baru aplikasi tersedia di perangkat ini.
                </p>

                {iosBrowserHint && (
                  <p className="rounded-[12px] bg-[#F7EAE4] p-3 text-xs text-[#9E4028]">
                    iOS hanya mengirim notifikasi ke aplikasi yang terpasang di Layar Utama. Di Safari, pilih <strong>Bagikan</strong> lalu{' '}
                    <strong>Tambahkan ke Layar Utama</strong>, kemudian aktifkan dari sana.
                  </p>
                )}

                {pushError && (
                  <p
                    role="alert"
                    className="rounded-[12px] bg-[#FDECEC] p-3 text-xs font-medium text-[#B3261E]"
                  >
                    {pushError}
                  </p>
                )}

                <div>
                  {pushSubscribed ? (
                    <button
                      type="button"
                      onClick={() => void handleDisablePush()}
                      disabled={pushBusy}
                      className="inline-flex min-h-[40px] items-center gap-2 rounded-[12px] bg-[#F2EFE8] px-4 text-xs font-semibold text-[#262925] hover:bg-[#E7E2D7] disabled:opacity-50"
                    >
                      <span>
                        {pushBusy ? 'Memproses...' : 'Nonaktifkan notifikasi'}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void handleEnablePush()}
                      disabled={pushBusy}
                      className="btn-primary-tactile inline-flex min-h-[40px] items-center gap-2 rounded-[12px] px-4 text-xs font-semibold disabled:opacity-50"
                    >
                      <BellRing className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
                      <span>
                        {pushBusy ? 'Mengaktifkan...' : 'Aktifkan notifikasi'}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
