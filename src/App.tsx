import React, { useCallback, useEffect, useRef, useState, Suspense } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MainLayout } from './layouts/MainLayout';
import { Book, LoanRecord, UserRole } from './types/library';
import { getErrorMessage } from './lib/errorMessage';
import { getLoanStatus, toLocalDateString } from './lib/loans';
import { normalizeUserRole } from './lib/userRole';
import { ToastProvider, useToast } from './components/ToastProvider';
import { UpdateNotifications } from './components/UpdateNotifications';
import { Capacitor } from '@capacitor/core';
import { UpdateBanner } from './components/updater/UpdateBanner';
import { UpdateDialog } from './components/updater/UpdateDialog';
import { DesktopUpdateBanner, DesktopUpdateDialog } from './components/updater/DesktopUpdateBanner';
import { isTauriPlatform, useAppUpdater } from './hooks/useAppUpdater';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { LibraryService } from './services/libraryService';
import { LoanService } from './services/loanService';
import { unsubscribeFromPush } from './services/pushService';

// Lazy-loaded page components to reduce initial bundle size
const Dashboard = React.lazy(() => import('./pages/DashboardPage').then(mod => ({ default: mod.DashboardPage })));
const Bookshelf = React.lazy(() => import('./pages/BookshelfPage').then(mod => ({ default: mod.BookshelfPage })));
const Loans = React.lazy(() => import('./pages/LoansPage').then(mod => ({ default: mod.LoansPage })));
const Scanner = React.lazy(() => import('./pages/ScannerPage').then(mod => ({ default: mod.ScannerPage })));
const Reports = React.lazy(() => import('./pages/ReportsPage').then(mod => ({ default: mod.ReportsPage })));
const Settings = React.lazy(() => import('./pages/SettingsPage').then(mod => ({ default: mod.SettingsPage })));
const Auth = React.lazy(() => import('./pages/AuthPage').then(mod => ({ default: mod.AuthPage })));

const allowedTabs: Record<UserRole, string[]> = {
  Owner: ['dashboard', 'books', 'loans', 'scanner', 'reports', 'settings'],
  Administrator: ['dashboard', 'books', 'loans', 'scanner', 'reports', 'settings'],
  Librarian: ['dashboard', 'books', 'loans', 'scanner', 'reports', 'settings'],
  Member: ['dashboard', 'books', 'loans', 'scanner', 'settings'],
};

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
}

function AppContent() {
  const { notify } = useToast();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [preselectedLoanBook, setPreselectedLoanBook] = useState<Book | null>(null);
  const [loanInitialFilter, setLoanInitialFilter] = useState<'all' | 'overdue'>('all');
  const [overdueCount, setOverdueCount] = useState(0);
  const overdueToastShownRef = useRef(false);
  const handleStartLoanForBook = (book: Book) => {
    setPreselectedLoanBook(book);
    setCurrentTab('loans');
  };
  const [userRole, setUserRole] = useState<UserRole>('Administrator');
  const [appRefreshKey, setAppRefreshKey] = useState<number>(0);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [roleLoading, setRoleLoading] = useState(isSupabaseConfigured);
  const [cloudRole, setCloudRole] = useState<UserRole | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accessRequestBusy, setAccessRequestBusy] = useState(false);
  const [accessRequestNotice, setAccessRequestNotice] = useState<string | null>(null);
  const [accessRequestError, setAccessRequestError] = useState<string | null>(null);
  const updater = useAppUpdater();
  const updateManifest = updater.status === 'available' && (!updater.dismissed || updater.dialogOpen) ? updater.manifest : null;
  const desktopUi = updater.platform === 'desktop' && updater.desktop.available && (!updater.desktop.dismissed || updater.dialogOpen) ? (
    updater.dialogOpen ? (
      <DesktopUpdateDialog
        currentVersion={updater.currentVersion}
        version={updater.desktop.version}
        notes={updater.desktop.notes}
        downloading={updater.desktop.downloading}
        received={updater.desktop.received}
        total={updater.desktop.total}
        error={updater.desktop.error}
        onUpdate={() => void updater.startDesktopUpdate()}
        onClose={updater.closeDialog}
        onDismiss={updater.dismissDesktopUpdate}
      />
    ) : (
      <DesktopUpdateBanner
        version={updater.desktop.version}
        notes={updater.desktop.notes}
        downloading={updater.desktop.downloading}
        error={updater.desktop.error}
        onOpen={updater.openDialog}
        onUpdate={() => void updater.startDesktopUpdate()}
        onDismiss={updater.dismissDesktopUpdate}
      />
    )
  ) : null;
  const updaterUi = updateManifest ? (
    <>
      {!updater.dialogOpen && (
        <UpdateBanner
          manifest={updateManifest}
          forced={updater.forced}
          onOpen={updater.openDialog}
          onDismiss={updater.dismiss}
        />
      )}
      {updater.dialogOpen && (
        <UpdateDialog
          manifest={updateManifest}
          mode={updater.updateMode}
          currentVersion={updater.currentVersion}
          currentVersionCode={updater.currentVersionCode}
          forced={updater.forced}
          download={updater.download}
          installError={updater.installError}
          installPermissionRequired={updater.installPermissionRequired}
          onStartDownload={(forceApk) => void updater.startDownload(forceApk)}
          onCancelDownload={() => void updater.cancelDownload()}
          onInstall={updater.installApk}
          onOpenSettings={() => void updater.openInstallerSettings()}
          onClose={updater.closeDialog}
          onDismiss={updater.dismiss}
        />
      )}
    </>
  ) : desktopUi;

  // Web Push (Tahap G): register the service worker and reload when a push
  // notification says a new version is live (bundle may be stale in memory).
  useEffect(() => {
    if (Capacitor.isNativePlatform() || isTauriPlatform()) return;
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      /* push unsupported or offline: banner flows still work */
    });
    const onMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'UPDATE_AVAILABLE') {
        window.location.reload();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null);
      setAuthLoading(false);
      setRoleLoading(false);
      setCloudRole(null);
      setAuthError(null);
      return;
    }

    if (!supabase) {
      setAuthError('Supabase is configured but its client could not be initialized.');
      setAuthLoading(false);
      setRoleLoading(false);
      return;
    }

    let active = true;
    setAuthLoading(true);
    setAuthError(null);
    const client = supabase;
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setAuthError(null);
      if (event === 'SIGNED_IN') {
        notify({
          tone: 'success',
          title: 'Login berhasil',
          description: 'Selamat datang kembali di perpustakaan.',
        });
      }
      if (event === 'SIGNED_OUT') {
        overdueToastShownRef.current = false;
      }
    });

    client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      const callbackParams = new URLSearchParams(window.location.search);
      const callbackHash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const callbackError = callbackParams.get('error_description') || callbackHash.get('error_description');
      if (callbackError) setAuthError(`Login Google gagal: ${callbackError}`);
      setSession(data.session);
      setAuthLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthError(getErrorMessage(error));
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [appRefreshKey]);

  const handleLoansChanged = useCallback((rows: LoanRecord[]) => {
    const today = toLocalDateString();
    const count = rows.filter((loan) => getLoanStatus(loan, today) === 'overdue').length;
    setOverdueCount(count);
  }, []);

  useEffect(() => {
    const isReady = !isSupabaseConfigured || Boolean(session && cloudRole);
    if (!isReady) {
      setOverdueCount(0);
      return;
    }

    let cancelled = false;
    LoanService.getLoans()
      .then(({ loans }) => {
        if (cancelled) return;
        const today = toLocalDateString();
        const overdueLoans = loans.filter((loan) => getLoanStatus(loan, today) === 'overdue');
        setOverdueCount(overdueLoans.length);
        if (overdueLoans.length > 0 && !overdueToastShownRef.current) {
          overdueToastShownRef.current = true;
          const first = overdueLoans[0];
          notify({
            tone: 'warning',
            title: `${overdueLoans.length} pinjaman melewati tenggat`,
            description: `“${first.item_name}” (${first.borrower_name}) belum dikembalikan.`,
            actionLabel: 'Periksa pinjaman',
            onAction: () => {
              setLoanInitialFilter('overdue');
              setCurrentTab('loans');
            },
            durationMs: 9000,
          });
        }
      })
      .catch(() => {
        /* ignore background overdue check errors; pages surface errors on direct view */
      });

    return () => {
      cancelled = true;
    };
  }, [session, cloudRole, notify]);

  useEffect(() => {
    if (!isSupabaseConfigured || !session) {
      setCloudRole(null);
      setRoleLoading(false);
      return;
    }
    if (!supabase) return;

    let active = true;
    setRoleLoading(true);
    Promise.resolve(supabase.rpc('current_user_role')).then(async ({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthError(`Tidak dapat memeriksa role akun: ${error.message}`);
        setCloudRole(null);
      } else if (normalizeUserRole(data)) {
        try {
          await LibraryService.loadCloudSettings();
          if (!active) return;
          setCloudRole(normalizeUserRole(data));
          setAuthError(null);
        } catch (settingsError) {
          setCloudRole(null);
          setAuthError(settingsError instanceof Error ? settingsError.message : String(settingsError));
        }
      } else {
        setCloudRole(null);
        setAuthError('Akun berhasil masuk, tetapi belum memiliki role perpustakaan.');
      }
      setRoleLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthError(getErrorMessage(error));
      setCloudRole(null);
      setRoleLoading(false);
    });

    return () => {
      active = false;
    };
  }, [session, appRefreshKey]);

  useEffect(() => {
    if (isSupabaseConfigured && cloudRole && !allowedTabs[cloudRole].includes(currentTab)) {
      setCurrentTab('dashboard');
    }
  }, [cloudRole, currentTab]);

  const handleBookCataloged = (_bookId: string) => {
    setCurrentTab('books');
  };

  const handleRefreshApp = () => {
    setAppRefreshKey((prev) => prev + 1);
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    try {
      await unsubscribeFromPush();
    } catch (error) {
      console.error('Push subscription cleanup failed:', error);
    }
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(error.message);
  };

  const handleRequestAccess = async () => {
    if (!supabase) return;
    setAccessRequestBusy(true);
    setAccessRequestError(null);
    setAccessRequestNotice(null);
    try {
      const { error } = await supabase.rpc('request_library_access');
      if (error) throw error;
      setAccessRequestNotice('Permintaan akses terkirim. Administrator perpustakaan akan meninjau akun Anda.');
    } catch (requestError) {
      setAccessRequestError(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setAccessRequestBusy(false);
    }
  };

  if (isSupabaseConfigured) {
    if (authLoading || roleLoading) {
      return (
        <>
          <UpdateNotifications onUpdateSignal={updater.notifyFromPush} />
          {updaterUi}
          <div className="min-h-screen flex items-center justify-center text-sm text-[#686C65]">Menghubungkan ke perpustakaan...</div>
        </>
      );
    }
    if (!supabase) {
      return (
        <>
          <UpdateNotifications onUpdateSignal={updater.notifyFromPush} />
          {updaterUi}
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-[#686C65]">Memuat...</div>}>
            <Auth supabase={null} message={authError} />
          </Suspense>
        </>
      );
    }
    if (!session || !cloudRole) {
      return (
        <>
          <UpdateNotifications onUpdateSignal={updater.notifyFromPush} />
          {updaterUi}
          <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-[#686C65]">Memuat...</div>}>
            <Auth
              supabase={supabase}
              message={authError}
              onSignOut={session ? handleSignOut : undefined}
              canRequestAccess={Boolean(session && authError?.includes('belum memiliki role'))}
              onRequestAccess={handleRequestAccess}
              requestAccessBusy={accessRequestBusy}
              requestAccessNotice={accessRequestNotice}
              requestAccessError={accessRequestError}
            />
          </Suspense>
        </>
      );
    }
  }

  const activeRole = isSupabaseConfigured ? cloudRole || 'Administrator' : userRole;
  const activeTab = isSupabaseConfigured && !allowedTabs[activeRole].includes(currentTab)
    ? 'dashboard'
    : currentTab;

  return (
    <>
      <UpdateNotifications onUpdateSignal={updater.notifyFromPush} />
      {updaterUi}
      <MainLayout
        key={appRefreshKey}
        currentTab={activeTab}
        onSelectTab={setCurrentTab}
        userRole={activeRole}
        cloudMode={isSupabaseConfigured}
        overdueCount={overdueCount}
        onSignOut={isSupabaseConfigured ? handleSignOut : undefined}
      >
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-[#686C65]">Memuat...</div>}>
          {activeTab === 'dashboard' && (
            <Dashboard
              userRole={activeRole}
              onNavigate={setCurrentTab}
              onLendBook={handleStartLoanForBook}
            />
          )}

          {activeTab === 'books' && (
            <Bookshelf
              onNavigateToScanner={() => setCurrentTab('scanner')}
              onLendBook={handleStartLoanForBook}
            />
          )}

          {activeTab === 'loans' && (
            <Loans
              initialBook={preselectedLoanBook}
              onClearInitialBook={() => setPreselectedLoanBook(null)}
              initialFilterTab={loanInitialFilter}
              onClearInitialFilter={() => setLoanInitialFilter('all')}
              onLoansChanged={handleLoansChanged}
            />
          )}

          {activeTab === 'scanner' && (
            <Scanner
              onBookCataloged={handleBookCataloged}
              onNavigateToBookshelf={() => setCurrentTab('books')}
            />
          )}

          {activeTab === 'reports' && <Reports />}

          {activeTab === 'settings' && (
            <Settings updater={updater} />
          )}
        </Suspense>
      </MainLayout>
    </>
  );
}
