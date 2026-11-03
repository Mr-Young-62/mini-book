import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Database,
  ShieldCheck,
  Save,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Code,
  Building,
  Clock,
  Layers,
} from 'lucide-react';
import { LibraryService } from '../services/libraryService';
import { LibrarySettings, UserRole } from '../types/library';
import {
  isSupabaseConfigured,
  effectiveSupabaseUrl,
  effectiveSupabaseKey,
  configureSupabase,
  resetSupabaseConfig,
} from '../lib/supabase';

interface SettingsPageProps {
  userRole: UserRole;
  onRefreshAppState: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  userRole,
  onRefreshAppState,
}) => {
  const [settings, setSettings] = useState<LibrarySettings>(LibraryService.getSettings());
  const [supabaseUrl, setSupabaseUrl] = useState(effectiveSupabaseUrl || '');
  const [supabaseKey, setSupabaseKey] = useState(effectiveSupabaseKey || '');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSaveSuccess(false);

    try {
      // Save settings object
      LibraryService.updateSettings(settings);

      // Check if user updated Supabase credentials
      if (supabaseUrl && supabaseKey) {
        const configResult = configureSupabase(supabaseUrl.trim(), supabaseKey.trim());
        if (!configResult.success) {
          setErrorMessage(configResult.error || 'Failed to update Supabase configuration.');
          return;
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      onRefreshAppState();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error saving settings.');
    }
  };

  const handleResetToSandbox = () => {
    if (window.confirm('Reset to local offline sandbox mode?')) {
      resetSupabaseConfig();
      setSupabaseUrl('');
      setSupabaseKey('');
      onRefreshAppState();
    }
  };

  const handleClearAllData = () => {
    if (window.confirm('Are you sure you want to delete all dummy and library data? This will clear all books, copies, members, and loans.')) {
      LibraryService.clearAllData();
      onRefreshAppState();
      window.location.reload();
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="border-b border-[#EAE5DE] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#2C221E] font-sans">
          Library & System Settings
        </h1>
        <p className="text-xs text-[#7E6F64]">
          Configure your Supabase database connection, circulation borrowing rules, and library metadata.
        </p>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Settings saved successfully!</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-xs text-rose-900">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-6">
        {/* ================================================================= */}
        {/* 1. SUPABASE DATABASE CONFIGURATION */}
        {/* ================================================================= */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#F0ECE4]">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#EA580C]" />
              <h3 className="text-sm font-bold text-[#2C221E]">
                Supabase Backend Configuration
              </h3>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded text-[11px] font-mono font-semibold ${
                isSupabaseConfigured
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-900'
              }`}
            >
              {isSupabaseConfigured ? 'Supabase Live Connected' : 'Local Storage Sandbox'}
            </span>
          </div>

          <p className="text-xs text-[#7E6F64] leading-relaxed">
            Readowl uses Supabase PostgreSQL, Storage, Auth, and Edge Functions. When live credentials are supplied below, the client persists directly to your cloud Supabase database.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Supabase URL (VITE_SUPABASE_URL)
              </label>
              <input
                type="text"
                value={supabaseUrl}
                onChange={(e) => setSupabaseUrl(e.target.value)}
                placeholder="https://xyzproject.supabase.co"
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Supabase Publishable / Anon Key
              </label>
              <input
                type="password"
                value={supabaseKey}
                onChange={(e) => setSupabaseKey(e.target.value)}
                placeholder="sbp_... or eyJhbGciOi..."
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#F0ECE4] text-[11px]">
            <div className="text-[#7E6F64]">
              Migrations stored in <code className="font-mono text-[#2C221E]">supabase/migrations/</code>
            </div>
            {isSupabaseConfigured && (
              <button
                type="button"
                onClick={handleResetToSandbox}
                className="text-[#7E6F64] hover:text-rose-600 font-medium"
              >
                Disconnect & Use Local Sandbox
              </button>
            )}
          </div>
        </div>

        {/* ================================================================= */}
        {/* 2. LIBRARY INFORMATION */}
        {/* ================================================================= */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#F0ECE4]">
            <Building className="w-4 h-4 text-[#EA580C]" />
            <h3 className="text-sm font-bold text-[#2C221E]">Library Profile</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Library Name
              </label>
              <input
                type="text"
                value={settings.library_info.name}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    library_info: { ...settings.library_info, name: e.target.value },
                  })
                }
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-medium"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Library Branch Code
              </label>
              <input
                type="text"
                value={settings.library_info.code}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    library_info: { ...settings.library_info, code: e.target.value },
                  })
                }
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Physical Address
              </label>
              <input
                type="text"
                value={settings.library_info.address}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    library_info: { ...settings.library_info, address: e.target.value },
                  })
                }
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Contact Email
              </label>
              <input
                type="email"
                value={settings.library_info.email}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    library_info: { ...settings.library_info, email: e.target.value },
                  })
                }
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs"
              />
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* 3. CIRCULATION & BORROWING POLICIES */}
        {/* ================================================================= */}
        <div className="bg-white border border-[#E8E2D9] rounded-xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#F0ECE4]">
            <Clock className="w-4 h-4 text-[#EA580C]" />
            <h3 className="text-sm font-bold text-[#2C221E]">Circulation & Late Fee Policies</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Default Loan Duration (Days)
              </label>
              <input
                type="number"
                value={settings.circulation_rules.default_loan_days}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    circulation_rules: {
                      ...settings.circulation_rules,
                      default_loan_days: parseInt(e.target.value, 10) || 14,
                    },
                  })
                }
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Max Books per Member
              </label>
              <input
                type="number"
                value={settings.circulation_rules.max_loans_per_member}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    circulation_rules: {
                      ...settings.circulation_rules,
                      max_loans_per_member: parseInt(e.target.value, 10) || 5,
                    },
                  })
                }
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-[#5A4D44] mb-1">
                Daily Overdue Fee Rate ($)
              </label>
              <input
                type="number"
                step="0.05"
                value={settings.circulation_rules.daily_late_fee}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    circulation_rules: {
                      ...settings.circulation_rules,
                      daily_late_fee: parseFloat(e.target.value) || 0.5,
                    },
                  })
                }
                className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#E5E0D8] rounded-lg text-xs font-mono"
                required
              />
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleClearAllData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 hover:text-rose-900 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Delete All Dummy Data</span>
          </button>

          <button
            type="submit"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#EA580C] hover:bg-[#C2410C] text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>Save Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
};
