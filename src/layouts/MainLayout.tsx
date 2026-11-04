import React, { useState } from 'react';
import {
  BookOpen,
  QrCode,
  Layers,
  ArrowRightLeft,
  Users,
  BarChart3,
  Settings as SettingsIcon,
  Database,
  ShieldCheck,
  Menu,
  X,
  Plus,
  BookCopy,
} from 'lucide-react';
import { UserRole } from '../types/library';
import { isSupabaseConfigured, effectiveSupabaseUrl } from '../lib/supabase';

interface MainLayoutProps {
  currentTab: string;
  dashboardView?: 'shelves' | 'all-books';
  onChangeDashboardView?: (view: 'shelves' | 'all-books') => void;
  onSelectTab: (tab: string) => void;
  userRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  onOpenQuickScan: () => void;
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
  children,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart3, roles: ['Administrator', 'Librarian', 'Member'] },
    { id: 'books', label: 'Bookshelf & Catalog', icon: BookOpen, roles: ['Administrator', 'Librarian', 'Member'] },
    { id: 'scanner', label: 'ISBN Scanner', icon: QrCode, roles: ['Administrator', 'Librarian'] },
    { id: 'inventory', label: 'Physical Inventory', icon: Layers, roles: ['Administrator', 'Librarian'] },
    { id: 'circulation', label: 'Borrow & Return', icon: ArrowRightLeft, roles: ['Administrator', 'Librarian'] },
    { id: 'members', label: 'Members', icon: Users, roles: ['Administrator', 'Librarian'] },
    { id: 'reports', label: 'Analytics & Reports', icon: BarChart3, roles: ['Administrator', 'Librarian'] },
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
              <BookCopy className="w-5 h-5" />
            </span>
            <span>Readowl</span>
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

        <div className="sidebar-footer">
          <div className="continue-card">
            <span className="card-title">Continue reading</span>
            <div className="mini-book-preview" />
            <div className="mini-shelf" />
          </div>

          <button
            type="button"
            className="user-profile"
            onClick={() => onSelectTab('settings')}
          >
            <div className="user-info">
              <div className="avatar">S</div>
              <div>
                <div className="user-name">Stephan</div>
                <div className="user-role">{userRole}</div>
              </div>
            </div>
            <div className="chevron">›</div>
          </button>
        </div>
      </aside>

      <div className="main-panel">
        <header className="main-header">
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

          <div className="header-actions">
            <div className="search-box">
              <span className="search-icon"><BookOpen className="w-4 h-4" /></span>
              <input type="search" placeholder="Search in My Library" aria-label="Search in My Library" />
            </div>

            <div className="role-switcher">
              <ShieldCheck className="w-3.5 h-3.5" />
              <select value={userRole} onChange={(e) => onChangeRole(e.target.value as UserRole)}>
                <option value="Administrator">Admin</option>
                <option value="Librarian">Librarian</option>
                <option value="Member">Member</option>
              </select>
            </div>

            {userRole !== 'Member' && (
              <button type="button" className="scan-button" onClick={onOpenQuickScan}>
                <QrCode className="w-4 h-4" />
                <span>Scan ISBN</span>
              </button>
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
