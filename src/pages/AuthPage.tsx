import React, { useState } from 'react';
import { LoaderCircle, LogOut, ShieldAlert } from 'lucide-react';
import { SupabaseClient } from '@supabase/supabase-js';
import brandLogo from '../assets/meeliefont-logo.png';

interface AuthPageProps {
  supabase: SupabaseClient | null;
  message?: string | null;
  onSignOut?: () => void;
  onUseLocalMode?: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ supabase, message, onSignOut, onUseLocalMode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setError(null);
    setSubmitting(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : String(signInError));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#F7F4EE] flex items-center justify-center p-4">
      <section className="w-full max-w-sm rounded-2xl border border-[#E8E2D9] bg-white p-7 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-3">
          <img src={brandLogo} alt="MeelieFont" className="h-20 w-56 object-cover object-center" />
          <div className="text-center">
            <p className="text-xs text-[#7E6F64]">Sign in to your library</p>
          </div>
        </div>

        {(message || error) && (
          <div role="alert" className="mb-4 flex gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{error || message}</span>
          </div>
        )}

        {!supabase ? (
          <p className="text-sm text-[#5A4D44]">
            The Supabase client could not be initialized. Check the URL and publishable key in Settings.
          </p>
        ) : onSignOut ? (
          <div className="space-y-4">
            <p className="text-sm text-[#5A4D44]">
              This account does not have a library role. Ask an administrator to assign one, then sign in again.
            </p>
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#D4CDC3] px-4 py-2 text-sm font-semibold text-[#2C221E] hover:bg-[#FAF8F5]"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block text-xs font-medium text-[#5A4D44]">
              Email
              <input
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E5E0D8] bg-[#FAF8F5] px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-xs font-medium text-[#5A4D44]">
              Password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[#E5E0D8] bg-[#FAF8F5] px-3 py-2 text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#c62828] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#a61f1f] disabled:opacity-60"
            >
              {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
              Sign in
            </button>
            <p className="text-[11px] leading-relaxed text-[#7E6F64]">
              Accounts are created by the library administrator in Supabase; public self-registration is disabled.
            </p>
          </form>
        )}
        {onUseLocalMode && (
          <button
            type="button"
            onClick={onUseLocalMode}
            className="mt-4 w-full text-center text-xs font-medium text-[#7E6F64] underline hover:text-[#2C221E]"
          >
            Disconnect and use local library
          </button>
        )}
      </section>
    </main>
  );
};
