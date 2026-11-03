import React, { useState } from 'react';
import { MainLayout } from './layouts/MainLayout';
import { DashboardPage } from './pages/DashboardPage';
import { BookshelfPage } from './pages/BookshelfPage';
import { ScannerPage } from './pages/ScannerPage';
import { InventoryPage } from './pages/InventoryPage';
import { CirculationPage } from './pages/CirculationPage';
import { MembersPage } from './pages/MembersPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { UserRole } from './types/library';

export default function App() {
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [userRole, setUserRole] = useState<UserRole>('Administrator');
  const [initialBorrowCopyId, setInitialBorrowCopyId] = useState<string | undefined>(undefined);
  const [appRefreshKey, setAppRefreshKey] = useState<number>(0);

  const handleNavigateToBorrow = (copyId?: string) => {
    setInitialBorrowCopyId(copyId);
    setCurrentTab('circulation');
  };

  const handleBookCataloged = (_bookId: string) => {
    setCurrentTab('books');
  };

  const handleRefreshApp = () => {
    setAppRefreshKey((prev) => prev + 1);
  };

  return (
    <MainLayout
      key={appRefreshKey}
      currentTab={currentTab}
      onSelectTab={(tab) => {
        setInitialBorrowCopyId(undefined);
        setCurrentTab(tab);
      }}
      userRole={userRole}
      onChangeRole={setUserRole}
      onOpenQuickScan={() => setCurrentTab('scanner')}
    >
      {currentTab === 'dashboard' && (
        <DashboardPage
          userRole={userRole}
          onNavigate={(tab) => {
            setInitialBorrowCopyId(undefined);
            setCurrentTab(tab);
          }}
          onScanClick={() => setCurrentTab('scanner')}
        />
      )}

      {currentTab === 'books' && (
        <BookshelfPage
          userRole={userRole}
          onNavigateToBorrow={handleNavigateToBorrow}
          onNavigateToScanner={() => setCurrentTab('scanner')}
        />
      )}

      {currentTab === 'scanner' && (
        <ScannerPage
          onBookCataloged={handleBookCataloged}
          onNavigateToBookshelf={() => setCurrentTab('books')}
        />
      )}

      {currentTab === 'inventory' && (
        <InventoryPage
          userRole={userRole}
          onNavigateToBorrow={handleNavigateToBorrow}
        />
      )}

      {currentTab === 'circulation' && (
        <CirculationPage
          userRole={userRole}
          initialCopyId={initialBorrowCopyId}
        />
      )}

      {currentTab === 'members' && (
        <MembersPage
          userRole={userRole}
        />
      )}

      {currentTab === 'reports' && (
        <ReportsPage
          userRole={userRole}
        />
      )}

      {currentTab === 'settings' && (
        <SettingsPage
          userRole={userRole}
          onRefreshAppState={handleRefreshApp}
        />
      )}
    </MainLayout>
  );
}
