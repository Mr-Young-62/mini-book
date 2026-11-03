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
  onSelectTab: (tab: string) => void;
  userRole: UserRole;
  onChangeRole: (role: UserRole) => void;
  onOpenQuickScan: () => void;
  children: React.ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({
  currentTab,
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
    <div className="min-h-screen bg-[#FAF8F5] text-[#2C221E] flex flex-col font-sans">
      {/* Top Bar adhering to Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-[#FFFDF9]/95 backdrop-blur-md border-b border-[#EAE5DE] px-4 sm:px-8 py-3.5 flex items-center justify-between gap-6">
        {/* Zone 1: Single-element brand wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => onSelectTab('dashboard')}
            className="flex items-center gap-2.5 text-left group focus:outline-hidden"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#EA580C] to-[#C2410C] flex items-center justify-center text-white shadow-xs group-hover:scale-105 transition-transform">
              <BookCopy className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight text-[#2C221E] font-sans">
                Readowl
              </span>
              <span className="hidden sm:inline-block ml-2 text-[11px] font-medium text-[#7C2D12] bg-[#FFEDD5] px-2 py-0.5 rounded-sm">
                Library OS
              </span>
            </div>
          </button>
        </div>

        {/* Zone 2: Navigation Links (single line, unboxed, hover underline) */}
        <nav className="hidden lg:flex items-center gap-5 text-xs font-semibold text-[#5A4D44]">
          {visibleNav.map((item) => {
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`transition-colors whitespace-nowrap py-1 relative ${
                  isActive
                    ? 'text-[#EA580C]'
                    : 'hover:text-[#1F1713]'
                }`}
              >
                {item.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 w-full h-[2px] bg-[#EA580C] rounded-full" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action + Role Switcher */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Supabase Status Pill */}
          <button
            onClick={() => onSelectTab('settings')}
            className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono rounded-md border transition-colors ${
              isSupabaseConfigured
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
            }`}
            title={
              isSupabaseConfigured
                ? `Connected to Supabase at ${effectiveSupabaseUrl}`
                : 'Running on local offline storage. Click to connect cloud Supabase.'
            }
          >
            <Database className="w-3 h-3" />
            <span>{isSupabaseConfigured ? 'Supabase Live' : 'Local Storage Mode'}</span>
          </button>

          {/* User Role Switcher */}
          <div className="flex items-center gap-1 bg-[#F2EDE4] p-1 rounded-lg text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#8C7A6B] ml-1 mr-0.5" />
            <select
              value={userRole}
              onChange={(e) => onChangeRole(e.target.value as UserRole)}
              className="bg-transparent font-medium text-[#4A3E35] focus:outline-hidden cursor-pointer pr-1"
            >
              <option value="Administrator">Admin</option>
              <option value="Librarian">Librarian</option>
              <option value="Member">Member</option>
            </select>
          </div>

          {/* Primary Action Button */}
          {userRole !== 'Member' && (
            <button
              onClick={onOpenQuickScan}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#EA580C] hover:bg-[#C2410C] rounded-lg shadow-xs transition-colors whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4" />
              <span className="hidden sm:inline">Scan ISBN</span>
            </button>
          )}

          {/* Mobile hamburger menu toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-1.5 text-[#5A4D44] hover:text-[#1F1713] rounded-lg border border-[#E5E0D8]"
            aria-label="Toggle Navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#FFFDF9] border-b border-[#EAE5DE] px-4 py-3 flex flex-col gap-1 shadow-md">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-left transition-colors ${
                  isActive ? 'bg-[#FFEDD5] text-[#C2410C]' : 'text-[#5A4D44] hover:bg-[#F5F2EB]'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-[#EAE5DE] bg-[#FFFDF9] py-4 px-6 text-xs text-[#8C7E74]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#4A3E35]">Readowl</span>
            <span>·</span>
            <span>Mini Digital Library Management System</span>
            <span>·</span>
            <span>Supabase Edition</span>
          </div>
          <div className="text-[11px] text-[#A89F91]">
            Desktop (Tauri 2) · Mobile (Capacitor) · Web
          </div>
        </div>
      </footer>
    </div>
  );
};
