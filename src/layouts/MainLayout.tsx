import React, { useState } from 'react';
import {
  QrCode,
  Layers,
  Users,
  BarChart3,
  Settings as SettingsIcon,
  ShieldCheck,
  Menu,
  X,
} from 'lucide-react';
import brandLogo from '../assets/meeliefont-logo.png';
import { UserRole } from '../types/library';

interface MainLayoutProps {
  currentTab: string;
  dashboardView?: 'shelves' | 'all-books';
  onChangeDashboardView?: (view: 'shelves' | 'all-books') => void;
  onSelectTab: (tab: string) => void;
  userRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  onOpenQuickScan: () => void;
  cloudMode: boolean;
  onSignOut?: () => void;
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  currentTab,
  dashboardView = 'shelves',
  onChangeDashboardView,
  onSelectTab,
  userRole,
  onChangeRole,
  onOpenQuickScan,
  cloudMode,
  onSignOut,
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, roles: ['Administrator', 'Librarian', 'Member'] },
    { id: 'scanner', label: 'ISBN Scanner', icon: QrCode, roles: ['Administrator', 'Librarian'] },
    { id: 'inventory', label: 'Physical Inventory', icon: Layers, roles: ['Administrator', 'Librarian'] },
    { id: 'members', label: 'Members', icon: Users, roles: ['Administrator', 'Librarian'] },
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
          {currentTab === 'dashboard' && (
            <div className="tab-container">
              <button
                type="button"
                className={`tab-button ${dashboardView === 'shelves' ? 'active' : ''}`}
                onClick={() => onChangeDashboardView?.('shelves')}
              >
                Shelves
              </button>
              <button
                type="button"
                className={`tab-button ${dashboardView === 'all-books' ? 'active' : ''}`}
                onClick={() => onChangeDashboardView?.('all-books')}
              >
                All Books
              </button>
            </div>
          )}

          <div className="header-actions">
            {cloudMode ? (
              <span className="role-switcher" aria-label={`Signed in as ${userRole}`}>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{userRole}</span>
              </span>
            ) : (
              <div className="role-switcher">
                <ShieldCheck className="w-3.5 h-3.5" />
                <select
                  aria-label="Preview interface role (not an access-control mechanism)"
                  title="Role preview only; permissions are not enforced in local mode."
                  value={userRole}
                  onChange={(e) => onChangeRole(e.target.value as UserRole)}
                >
                  <option value="Administrator">Admin preview</option>
                  <option value="Librarian">Librarian preview</option>
                  <option value="Member">Member preview</option>
                </select>
              </div>
            )}

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
