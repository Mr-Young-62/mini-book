import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  BellRing,
  CheckCircle2,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import type { UpdaterApi } from '../hooks/useAppUpdater';
import {
  describeNotificationError,
  disableAndroidNotifications,
  enableAndroidNotifications,
  getNotificationStatus,
  isAndroidPlatform,
  isIosDevice,
  NotificationStatus,
  savePushSubscription,
  showTestNotification,
  subscribeToPush,
  unsubscribeFromPush,
} from '../services/pushService';

interface SettingsPageProps {
  updater: UpdaterApi;
}

const permissionLabel: Record<string, string> = {
  granted: 'diizinkan',
  denied: 'ditolak',
  prompt: 'belum diminta',
  unsupported: 'tidak tersedia',
};

export const SettingsPage: React.FC<SettingsPageProps> = ({ updater }) => {
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

  const handleEnableNotifications = async () => {
    setNotificationBusy(true);
    setNotificationError(null);
    setNotificationNotice(null);
    try {
      if (notificationStatus?.platform === 'android') {
        await enableAndroidNotifications();
        setNotificationNotice('Notifikasi update Android aktif.');
      } else {
        const payload = await subscribeToPush();
        await savePushSubscription(payload, isIosDevice() ? 'ios-pwa' : 'web');
        try {
          await showTestNotification();
          setNotificationNotice('Notifikasi aktif. Notifikasi uji sudah dikirim.');
        } catch {
          setNotificationNotice('Notifikasi update aktif.');
        }
      }
      await refreshNotificationStatus();
    } catch (error) {
      if (notificationStatus?.platform === 'web') {
        await unsubscribeFromPush().catch(() => undefined);
        await refreshNotificationStatus();
      }
      setNotificationError(describeNotificationError(error));
    } finally {
      setNotificationBusy(false);
    }
  };

  const handleDisableNotifications = async () => {
    setNotificationBusy(true);
    setNotificationError(null);
    setNotificationNotice(null);
    try {
      if (notificationStatus?.platform === 'android') {
        await disableAndroidNotifications();
        setNotificationNotice('Notifikasi update Android dinonaktifkan.');
      } else {
        await unsubscribeFromPush();
        setNotificationNotice('Notifikasi update dinonaktifkan.');
      }
      await refreshNotificationStatus();
    } catch (error) {
      setNotificationError(describeNotificationError(error));
    } finally {
      setNotificationBusy(false);
    }
  };

  const handleTestNotification = async () => {
    setNotificationError(null);
    setNotificationNotice(null);
    try {
      await showTestNotification();
      setNotificationNotice('Notifikasi uji berhasil dikirim.');
    } catch (error) {
      setNotificationError(describeNotificationError(error));
    }
  };

  const latestVersion = updater.platform === 'desktop'
    ? updater.desktop.version || '-'
    : updater.manifest
      ? `${updater.manifest.version} (${updater.manifest.versionCode})`
      : '-';

  const updateNotes = updater.platform === 'desktop'
    ? updater.desktop.notes
    : updater.manifest?.changelog.join('\n');

  return (
    <div className="max-w-4xl space-y-7 pb-6">
      <div className="border-b border-[#ECEEF2] pb-5">
        <h1 className="font-sans text-2xl font-extrabold tracking-tight text-[#14181F] sm:text-3xl">
          Pengaturan Aplikasi
        </h1>
        <p className="mt-1.5 text-xs leading-relaxed text-[#6E737D]">
          Informasi pembaruan dan notifikasi untuk perangkat ini.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-[#ECEEF2] bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-[#ECEEF2] pb-3">
          <RefreshCw className="h-4 w-4 text-[#18362F]" />
          <div>
            <h2 className="text-sm font-bold text-[#14181F]">Keterangan Update</h2>
            <p className="text-[11px] text-[#6E737D]">Versi yang terpasang dan pembaruan yang tersedia.</p>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
          <div className="rounded-lg border border-[#ECEEF2] bg-[#F5F6F8] p-3">
            <dt className="text-[10px] uppercase tracking-wide text-[#6E737D]">Versi terpasang</dt>
            <dd className="mt-1 font-mono font-semibold text-[#14181F]">
              {updater.currentVersion} ({updater.currentVersionCode || 'local'})
            </dd>
          </div>
          <div className="rounded-lg border border-[#ECEEF2] bg-[#F5F6F8] p-3">
            <dt className="text-[10px] uppercase tracking-wide text-[#6E737D]">Versi terbaru</dt>
            <dd className="mt-1 font-mono font-semibold text-[#14181F]">{latestVersion}</dd>
          </div>
        </dl>

        {updateNotes && (
          <div className="rounded-lg border border-[#ECEEF2] p-3 text-xs leading-relaxed text-[#4B5563]">
            {updateNotes.split('\n').filter(Boolean).map((line, index) => (
              <p key={`${index}-${line}`}>{line.replace(/^•\s*/, '')}</p>
            ))}
          </div>
        )}

        {updater.platform === 'desktop' && updater.desktop.error && (
          <p role="alert" className="text-xs text-amber-700">
            Pemeriksaan gagal: {updater.desktop.error}
          </p>
        )}
        {updater.platform !== 'desktop' && updater.status === 'unavailable' && (
          <p role="alert" className="text-xs text-amber-700">
            Pembaruan tidak dapat diperiksa. Periksa koneksi internet.
          </p>
        )}
        {updater.platform !== 'desktop' && updater.status === 'disabled' && (
          <p className="text-xs text-[#6E737D]">
            {updater.platform === 'android'
              ? 'Pemeriksaan pembaruan aktif pada build rilis Android.'
              : 'Pemeriksaan pembaruan tersedia di Android dan desktop.'}
          </p>
        )}
        {(updater.desktop.manualStatus === 'up_to_date'
          || (updater.platform !== 'desktop' && updater.status === 'up_to_date')) && (
          <p className="text-xs font-semibold text-emerald-700">Aplikasi sudah menggunakan versi terbaru.</p>
        )}

        <button
          type="button"
          onClick={() => void updater.checkManually()}
          disabled={updater.checking}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#E5E7EB] bg-[#F5F6F8] px-4 py-2 text-xs font-semibold text-[#14181F] hover:bg-[#ECEEF2] disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${updater.checking ? 'animate-spin' : ''}`} />
          {updater.checking ? 'Memeriksa...' : 'Periksa pembaruan'}
        </button>
      </section>

      <section className="space-y-4 rounded-xl border border-[#ECEEF2] bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-2 border-b border-[#ECEEF2] pb-3">
          <BellRing className="h-4 w-4 text-[#18362F]" />
          <div>
            <h2 className="text-sm font-bold text-[#14181F]">Notifikasi Update</h2>
            <p className="text-[11px] text-[#6E737D]">Notifikasi rilis baru untuk perangkat ini.</p>
          </div>
        </div>

        {notificationError && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notificationError}</span>
          </div>
        )}
        {notificationNotice && (
          <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notificationNotice}</span>
          </div>
        )}

        {!notificationStatus ? (
          <p className="text-xs text-[#6E737D]">Memeriksa status notifikasi...</p>
        ) : !notificationStatus.supported ? (
          <p className="text-xs leading-relaxed text-[#6E737D]">
            Notifikasi push tidak tersedia di perangkat ini. Pembaruan tetap dapat dicek manual dari halaman ini.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded-lg border border-[#ECEEF2] bg-[#F5F6F8] p-3">
                <dt className="text-[10px] uppercase tracking-wide text-[#6E737D]">Perangkat</dt>
                <dd className="mt-1 font-semibold text-[#14181F]">
                  {notificationStatus.platform === 'android' ? 'Android' : 'Web / iOS'}
                </dd>
              </div>
              <div className="rounded-lg border border-[#ECEEF2] bg-[#F5F6F8] p-3">
                <dt className="text-[10px] uppercase tracking-wide text-[#6E737D]">Izin</dt>
                <dd className="mt-1 font-semibold text-[#14181F]">
                  {permissionLabel[notificationStatus.permission] || notificationStatus.permission}
                </dd>
              </div>
              <div className="rounded-lg border border-[#ECEEF2] bg-[#F5F6F8] p-3">
                <dt className="text-[10px] uppercase tracking-wide text-[#6E737D]">Status</dt>
                <dd className={`mt-1 font-semibold ${notificationStatus.subscribed ? 'text-emerald-700' : 'text-[#6E737D]'}`}>
                  {notificationStatus.subscribed ? 'Aktif' : 'Nonaktif'}
                </dd>
              </div>
            </dl>

            {notificationStatus.platform === 'web' && !notificationStatus.configured && (
              <p role="alert" className="text-xs text-amber-700">
                VAPID public key belum valid. Notifikasi web tidak dapat diaktifkan sampai VITE_VAPID_PUBLIC_KEY berisi kunci publik yang benar saat build.
              </p>
            )}
            {notificationStatus.iosNeedsStandalone && (
              <p className="text-xs leading-relaxed text-amber-700">
                iOS hanya mengirim notifikasi dari aplikasi di Layar Utama. Tambahkan halaman ini ke Layar Utama, lalu buka dari ikon tersebut.
              </p>
            )}
            {notificationStatus.permission === 'denied' && (
              <p className="text-xs leading-relaxed text-[#6E737D]">
                Izin notifikasi ditolak. Ubah izin situs di pengaturan browser, lalu buka halaman ini lagi.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {notificationStatus.subscribed ? (
                <button
                  type="button"
                  onClick={() => void handleDisableNotifications()}
                  disabled={notificationBusy}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#E5E7EB] bg-[#F5F6F8] px-4 py-2 text-xs font-semibold text-[#14181F] hover:bg-[#ECEEF2] disabled:opacity-50"
                >
                  Nonaktifkan notifikasi
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleEnableNotifications()}
                  disabled={notificationBusy || (notificationStatus.platform === 'web' && !notificationStatus.configured)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[#18362F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#112822] disabled:opacity-50"
                >
                  <BellRing className="h-3.5 w-3.5" />
                  {notificationBusy ? 'Memproses...' : 'Aktifkan notifikasi'}
                </button>
              )}
              {notificationStatus.platform === 'web' && notificationStatus.subscribed && (
                <button
                  type="button"
                  onClick={() => void handleTestNotification()}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-4 py-2 text-xs font-semibold text-[#14181F] hover:bg-[#F5F6F8]"
                >
                  <Smartphone className="h-3.5 w-3.5" />
                  Uji notifikasi
                </button>
              )}
              {isAndroidPlatform() && (
                <p className="text-[11px] text-[#6E737D]">
                  Notifikasi Android memakai topik update bawaan aplikasi.
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
};

export default SettingsPage;
