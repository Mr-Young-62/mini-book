import React, { useState } from 'react';
import {
  QrCode,
  BarChart3,
  Library,
  Settings as SettingsIcon,
  Menu,
  X,
} from 'lucide-react';
import brandLogo from '../assets/meeliefont-logo.png';
import { UserRole } from '../types/library';

interface MainLayoutProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  userRole: UserRole;
  onOpenQuickScan: () => void;
  cloudMode: boolean;
  onSignOut?: () => void;
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  currentTab,
  onSelectTab,
  userRole,
  onOpenQuickScan,
  cloudMode,
  onSignOut,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, roles: ['Administrator', 'Librarian', 'Member'] },
    { id: 'scanner', label: 'ISBN Scanner', icon: QrCode, roles: ['Administrator', 'Librarian'] },
    { id: 'books', label: 'Book Shelf', icon: Library, roles: ['Administrator', 'Librarian', 'Member'] },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, roles: ['Administrator'] },
  ];

  const visibleNav = navItems.filter((item) => item.roles.includes(userRole));

  return (
    <div className="app-shell">
      <aside className="sidebar-panel">
        <div>
          <button
            onClick={() => onSelectTab('dashboard')}
            className="brand-logo"
            type="button"
          >
            <span className="brand-mark">
              <img src={brandLogo} alt="MeelieFont" />
            </span>
          </button>

          <nav className="sidebar-nav" aria-label="Main navigation">
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onSelectTab(item.id)}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

      </aside>

      <div className="main-panel">
        <header className="main-header">
          <div className="header-actions">
            {userRole !== 'Member' && (
              <button type="button" className="scan-button" onClick={onOpenQuickScan}>
                <QrCode className="w-4 h-4" />
                <span>Scan ISBN</span>
              </button>
            )}
            {cloudMode && onSignOut && (
              <button type="button" className="scan-button" onClick={onSignOut}>Sign out</button>
            )}
          </div>
        </header>

        <main className="content-shell">{children}</main>
      </div>

      {mobileMenuOpen && (
        <div className="mobile-drawer">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSelectTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`mobile-menu-item ${isActive ? 'active' : ''}`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="mobile-toggle"
        aria-label="Toggle navigation"
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
      >
        {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
    </div>
  );
};
