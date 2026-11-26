import React, { useEffect, useRef, useState } from 'react';
import {
  QrCode,
  Library,
  Settings as SettingsIcon,
  LogOut,
  Home,
  BookOpen,
  BarChart3,
  CalendarClock,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { UserRole } from '../types/library';

interface MainLayoutProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  userRole: UserRole;
  cloudMode: boolean;
  onSignOut?: () => void;
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  currentTab,
  onSelectTab,
  userRole,
  cloudMode,
  onSignOut,
  children,
}) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [navCompact, setNavCompact] = useState(false);
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    setNavCompact(false);
  }, [currentTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    lastScrollYRef.current = window.scrollY;
    const handleScroll = () => {
      const y = window.scrollY;
      const delta = y - lastScrollYRef.current;
      if (y < 24) {
        setNavCompact(false);
      } else if (delta > 6 && y > 72) {
        setNavCompact(true);
      } else if (delta < -6) {
        setNavCompact(false);
      }
      lastScrollYRef.current = y;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleMobileTabSelect = (tabId: string) => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(8);
      }
    } catch {
      /* ignore unsupported vibration */
    }
    onSelectTab(tabId);
  };

  const primaryNavItems = [
    { id: 'dashboard', label: 'Beranda', mobileLabel: 'Beranda', icon: Home, roles: ['Owner', 'Administrator', 'Librarian', 'Member'] },
    { id: 'books', label: 'Rak Buku', mobileLabel: 'Rak', icon: Library, roles: ['Owner', 'Administrator', 'Librarian', 'Member'] },
    { id: 'loans', label: 'Pinjaman', mobileLabel: 'Pinjam', icon: CalendarClock, roles: ['Owner', 'Administrator', 'Librarian', 'Member'] },
    { id: 'scanner', label: 'Scan ISBN', mobileLabel: 'Scan', icon: QrCode, roles: ['Owner', 'Administrator', 'Librarian', 'Member'] },
    { id: 'reports', label: 'Laporan', mobileLabel: 'Laporan', icon: BarChart3, roles: ['Owner', 'Administrator', 'Librarian'] },
  ];

  const canAccessSettings = userRole === 'Owner' || userRole === 'Administrator';
  const canAccessReports = userRole === 'Owner' || userRole === 'Administrator' || userRole === 'Librarian';
  const visiblePrimaryNav = primaryNavItems.filter((item) => item.roles.includes(userRole));

  const byId = new Map(visiblePrimaryNav.map((item) => [item.id, item]));
  const settingsItem = {
    id: 'settings',
    label: 'Pengaturan',
    mobileLabel: 'Atur',
    icon: SettingsIcon,
    roles: ['Owner', 'Administrator'],
  };

  const mobileNavItems = (
    canAccessSettings
      ? [byId.get('dashboard'), byId.get('books'), byId.get('scanner'), byId.get('loans'), settingsItem]
      : canAccessReports
      ? [byId.get('dashboard'), byId.get('books'), byId.get('scanner'), byId.get('loans'), byId.get('reports')]
      : [byId.get('dashboard'), byId.get('books'), byId.get('scanner'), byId.get('loans')]
  ).filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div className="app-shell">
      <aside className={`sidebar-panel ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div>
          <div className="sidebar-top-row">
            <button
              onClick={() => onSelectTab('dashboard')}
              className="brand-logo"
              type="button"
              aria-label="Beranda MeelieFont"
              title="MeelieFont"
            >
              <span className="brand-mark" aria-hidden="true">
                <BookOpen className="w-4 h-4" strokeWidth={1.5} />
              </span>
              <span className="brand-text-group">
                <span className="brand-text">MEELIEFONT</span>
                <span className="brand-subtext">Perpustakaan Mini</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setSidebarCollapsed((prev) => !prev)}
              className="sidebar-collapse-btn"
              aria-expanded={!sidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Lebarkan bilah samping' : 'Kecilkan bilah samping'}
              title={sidebarCollapsed ? 'Lebarkan bilah samping' : 'Kecilkan bilah samping'}
            >
              {sidebarCollapsed
                ? <PanelLeftOpen className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
                : <PanelLeftClose className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />}
            </button>
          </div>

          <div className="sidebar-menu-label">Menu</div>

          <nav className="sidebar-nav" aria-label="Navigasi utama">
            {visiblePrimaryNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  title={sidebarCollapsed ? item.label : undefined}
                  onClick={() => onSelectTab(item.id)}
                  className={`nav-item ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-item-icon" aria-hidden="true">
                    <Icon className="w-4 h-4" strokeWidth={1.5} />
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
                aria-label="Pengaturan"
                aria-current={currentTab === 'settings' ? 'page' : undefined}
                title={sidebarCollapsed ? 'Pengaturan' : undefined}
                onClick={() => onSelectTab('settings')}
                className={`nav-item ${currentTab === 'settings' ? 'active' : ''}`}
              >
                <span className="nav-item-icon" aria-hidden="true">
                  <SettingsIcon className="w-4 h-4" strokeWidth={1.5} />
                </span>
                <span className="nav-item-label">Pengaturan</span>
              </button>
            )}
            {cloudMode && onSignOut && (
              <button
                type="button"
                aria-label="Keluar"
                title={sidebarCollapsed ? 'Keluar' : undefined}
                className="nav-item"
                onClick={onSignOut}
              >
                <span className="nav-item-icon" aria-hidden="true">
                  <LogOut className="w-4 h-4" strokeWidth={1.5} />
                </span>
                <span className="nav-item-label">Keluar</span>
              </button>
            )}
          </div>
        )}
      </aside>

      <div className="main-panel">
        <header className="main-header">
          <button
            type="button"
            onClick={() => onSelectTab('dashboard')}
            className="mobile-brand"
            aria-label="Beranda MeelieFont"
          >
            <span className="brand-mark" aria-hidden="true">
              <BookOpen className="w-4 h-4" strokeWidth={1.5} />
            </span>
            <span className="brand-text">MEELIEFONT</span>
          </button>

          <div className="header-actions">
            {canAccessReports && canAccessSettings && (
              <button
                type="button"
                onClick={() => onSelectTab('reports')}
                aria-label="Laporan"
                className={`tablet-mobile-only min-h-[44px] items-center gap-1.5 rounded-[10px] px-3.5 text-xs font-semibold ${
                  currentTab === 'reports'
                    ? 'bg-[#24483D] text-white'
                    : 'bg-[#F1EDE4] text-[#262925] hover:bg-[#E7E1D5]'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden="true" />
                <span>Laporan</span>
              </button>
            )}
            <span className="hidden sm:inline-flex items-center rounded-[10px] bg-[#F1EDE4] px-3.5 py-1.5 text-xs font-medium text-[#363A34]">
              {userRole}
            </span>
            {cloudMode && onSignOut && (
              <button
                type="button"
                aria-label="Keluar"
                className="scan-button sign-out-btn"
                onClick={onSignOut}
              >
                <LogOut className="w-4 h-4 sm:hidden" strokeWidth={1.5} aria-hidden="true" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            )}
          </div>
        </header>

        <main className="content-shell">
          <div key={currentTab} className="tab-view-transition">
            {children}
          </div>
        </main>
      </div>

      <nav
        className={`mobile-bottom-nav ${navCompact ? 'is-compact' : ''}`}
        aria-label="Navigasi mobile"
      >
        <div
          className="mobile-bottom-track"
          style={
            {
              '--tab-count': mobileNavItems.length,
              '--active-index': Math.max(
                0,
                mobileNavItems.findIndex((item) => item.id === currentTab),
              ),
            } as React.CSSProperties
          }
        >
          <span
            aria-hidden="true"
            className={`mobile-nav-indicator ${
              currentTab !== 'scanner' &&
              mobileNavItems.some((item) => item.id === currentTab)
                ? ''
                : 'is-hidden'
            }`}
          />
          {mobileNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            const isCenter = item.id === 'scanner';

            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => handleMobileTabSelect(item.id)}
                className={`mobile-bottom-tab ${isCenter ? 'is-center' : ''} ${
                  isActive ? 'active' : ''
                }`}
              >
                <span className="mobile-tab-icon-wrap" aria-hidden="true">
                  {isCenter ? (
                    <span className="mobile-scan-badge">
                      <Icon
                        className="w-5 h-5"
                        strokeWidth={isActive ? 2 : 1.75}
                      />
                    </span>
                  ) : (
                    <Icon
                      className="w-5 h-5"
                      strokeWidth={isActive ? 2 : 1.5}
                    />
                  )}
                </span>
                {!isCenter && (
                  <span className="mobile-bottom-label">{item.mobileLabel}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
