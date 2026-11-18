import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MainLayout } from './layouts/MainLayout';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { BookshelfPage } from './pages/BookshelfPage';
import { ScannerPage } from './pages/ScannerPage';
import { MembersPage } from './pages/MembersPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UserRole } from './types/library';
import { UpdateNotifications } from './components/UpdateNotifications';
import { isSupabaseConfigured, resetSupabaseConfig, supabase } from './lib/supabase';
import { LibraryService } from './services/libraryService';

const isUserRole = (role: unknown): role is UserRole =>
  role === 'Administrator' || role === 'Librarian' || role === 'Member';

const allowedTabs: Record<UserRole, string[]> = {
  Administrator: ['dashboard', 'books', 'scanner', 'members', 'reports', 'settings'],
  Librarian: ['dashboard', 'books', 'scanner', 'members', 'reports'],
  Member: ['dashboard', 'books'],
};

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [userRole, setUserRole] = useState<UserRole>('Administrator');
  const [appRefreshKey, setAppRefreshKey] = useState<number>(0);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [roleLoading, setRoleLoading] = useState(isSupabaseConfigured);
  const [cloudRole, setCloudRole] = useState<UserRole | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

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
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setAuthError(null);
    });

    client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setAuthError(error.message);
      setSession(data.session);
      setAuthLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthError(error instanceof Error ? error.message : String(error));
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [appRefreshKey]);

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
        setAuthError(error.message);
        setCloudRole(null);
      } else if (isUserRole(data)) {
        try {
          await LibraryService.loadCloudSettings();
          if (!active) return;
          setCloudRole(data);
          setAuthError(null);
        } catch (settingsError) {
          setCloudRole(null);
          setAuthError(settingsError instanceof Error ? settingsError.message : String(settingsError));
        }
      } else {
        setCloudRole(null);
        setAuthError('No valid library role is assigned to this account.');
      }
      setRoleLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthError(error instanceof Error ? error.message : String(error));
      setCloudRole(null);
      setRoleLoading(false);
    });

    return () => {
      active = false;
    };
  }, [session]);

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
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(error.message);
  };

  const handleUseLocalMode = () => {
    if (window.confirm("Disconnect from Supabase and use this device's local library data?")) {
      resetSupabaseConfig();
      handleRefreshApp();
    }
  };

  if (isSupabaseConfigured) {
    if (authLoading || roleLoading) {
      return (
        <>
          <UpdateNotifications />
          <div className="min-h-screen flex items-center justify-center text-sm text-[#7E6F64]">Connecting to library...</div>
        </>
      );
    }
    if (!supabase) {
      return (
        <>
          <UpdateNotifications />
          <AuthPage supabase={null} message={authError} onUseLocalMode={handleUseLocalMode} />
        </>
      );
    }
    if (!session || !cloudRole) {
      return (
        <>
          <UpdateNotifications />
          <AuthPage
            supabase={supabase}
            message={authError}
            onSignOut={session ? handleSignOut : undefined}
            onUseLocalMode={handleUseLocalMode}
          />
        </>
      );
    }
  }

  const activeRole = isSupabaseConfigured ? cloudRole || 'Member' : userRole;
  const activeTab = isSupabaseConfigured && !allowedTabs[activeRole].includes(currentTab)
    ? 'dashboard'
    : currentTab;

  return (
    <>
      <UpdateNotifications />
      <MainLayout
        key={appRefreshKey}
        currentTab={activeTab}
        onSelectTab={setCurrentTab}
        userRole={activeRole}
        onOpenQuickScan={() => setCurrentTab('scanner')}
        cloudMode={isSupabaseConfigured}
        onSignOut={isSupabaseConfigured ? handleSignOut : undefined}
      >
        {activeTab === 'dashboard' && (
          <DashboardPage
            userRole={activeRole}
            onNavigateToBooks={() => setCurrentTab('books')}
            onNavigateToMembers={() => setCurrentTab('members')}
            onNavigateToReports={() => setCurrentTab('reports')}
            onNavigateToSettings={() => setCurrentTab('settings')}
          />
        )}

        {activeTab === 'books' && (
          <BookshelfPage
            userRole={activeRole}
            onNavigateToScanner={() => setCurrentTab('scanner')}
          />
        )}

        {activeTab === 'scanner' && (
          <ScannerPage
            onBookCataloged={handleBookCataloged}
            onNavigateToBookshelf={() => setCurrentTab('books')}
          />
        )}

        {activeTab === 'members' && (
          <MembersPage
            userRole={activeRole}
          />
        )}

        {activeTab === 'reports' && <ReportsPage />}

        {activeTab === 'settings' && (
          <SettingsPage
            userRole={activeRole}
            onRefreshAppState={handleRefreshApp}
          />
        )}
      </MainLayout>
    </>
  );
}
