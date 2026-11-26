import React, { useState } from 'react';
import {
  QrCode,
  Library,
  Settings as SettingsIcon,
  LogOut,
  Home,
  BookOpen,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const primaryNavItems = [
    { id: 'dashboard', label: 'Discover', mobileLabel: 'Discover', icon: Home, roles: ['Owner', 'Administrator', 'Librarian', 'Member'] },
    { id: 'books', label: 'Book Shelf', mobileLabel: 'Shelf', icon: Library, roles: ['Owner', 'Administrator', 'Librarian', 'Member'] },
    { id: 'scanner', label: 'ISBN Scanner', mobileLabel: 'Scan', icon: QrCode, roles: ['Owner', 'Administrator', 'Librarian', 'Member'] },
    { id: 'reports', label: 'Reports', mobileLabel: 'Reports', icon: BarChart3, roles: ['Owner', 'Administrator', 'Librarian'] },
  ];

  const canAccessSettings = userRole === 'Owner' || userRole === 'Administrator';
  const visiblePrimaryNav = primaryNavItems.filter((item) => item.roles.includes(userRole));

  const mobileNavItems = canAccessSettings
    ? [
        ...visiblePrimaryNav,
        { id: 'settings', label: 'Settings', mobileLabel: 'Settings', icon: SettingsIcon, roles: ['Owner', 'Administrator'] },
      ].slice(0, 5)
    : visiblePrimaryNav.slice(0, 5);

  return (
    <div className="app-shell">
      {/* Desktop Sidebar */}
      <aside className={`sidebar-panel ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div>
          <div className="sidebar-top-row">
            <button
              onClick={() => onSelectTab('dashboard')}
              className="brand-logo"
              type="button"
              title="MeelieFont Library"
            >
              <span className="brand-mark">
                <BookOpen className="w-4 h-4" />
              </span>
              <span className="brand-text-group">
                <span className="brand-text">MEELIEFONT</span>
                <span className="brand-subtext">Mini Library</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="sidebar-collapse-btn"
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
            </button>
          </div>

          <div className="sidebar-menu-label">MENU</div>

          <nav className="sidebar-nav" aria-label="Main navigation">
            {visiblePrimaryNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  title={sidebarCollapsed ? item.label : undefined}
                  onClick={() => onSelectTab(item.id)}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-item-icon">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="nav-item-label">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {(canAccessSettings || (cloudMode && onSignOut)) && (
          <div className="sidebar-bottom">
            {canAccessSettings && (
              <button
                type="button"
                title={sidebarCollapsed ? 'Settings' : undefined}
                onClick={() => onSelectTab('settings')}
                className={`nav-item ${currentTab === 'settings' ? 'active' : ''}`}
              >
                <span className="nav-item-icon">
                  <SettingsIcon className="w-4 h-4" />
                </span>
                <span className="nav-item-label">Settings</span>
              </button>
            )}
            {cloudMode && onSignOut && (
              <button
                type="button"
                title={sidebarCollapsed ? 'Log out' : undefined}
                className="nav-item"
                onClick={onSignOut}
              >
                <span className="nav-item-icon">
                  <LogOut className="w-4 h-4" />
                </span>
                <span className="nav-item-label">Log out</span>
              </button>
            )}
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="main-panel">
        <header className="main-header">
          <button
            type="button"
            onClick={() => onSelectTab('dashboard')}
            className="mobile-brand"
          >
            <span className="brand-mark">
              <BookOpen className="w-4 h-4" />
            </span>
            <span className="brand-text-group">
              <span className="brand-text">MEELIEFONT</span>
              <span className="brand-subtext">Mini Library</span>
            </span>
          </button>

          <div className="header-actions">
            <span className="hidden sm:inline-flex items-center rounded-full bg-[#F5F6F8] px-3 py-1.5 text-xs font-semibold text-[#4B5563]">
              {userRole}
            </span>
            <button type="button" className="scan-button" onClick={onOpenQuickScan}>
              <QrCode className="w-4 h-4" />
              <span>Scan ISBN</span>
            </button>
            {cloudMode && onSignOut && (
              <button type="button" className="scan-button sign-out-btn" onClick={onSignOut}>
                <LogOut className="w-3.5 h-3.5 sm:hidden" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            )}
          </div>
        </header>

        <main className="content-shell">{children}</main>
      </div>

      {/* Dynamic Floating Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`mobile-bottom-tab ${isActive ? 'active' : ''}`}
            >
              <Icon className="w-5 h-5" />
              <span className="mobile-bottom-label">{item.mobileLabel}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
