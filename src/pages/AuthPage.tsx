import React, { useState } from 'react';
import { CheckCircle2, LoaderCircle, LogOut, ShieldAlert } from 'lucide-react';
import { SupabaseClient } from '@supabase/supabase-js';
import brandLogo from '../assets/meeliefont-logo.png';
import { resolveAuthRedirectUrl } from '../lib/authRedirect';
import { getErrorMessage } from '../lib/errorMessage';

interface AuthPageProps {
  supabase: SupabaseClient | null;
  message?: string | null;
  onSignOut?: () => void;
  canRequestAccess?: boolean;
  onRequestAccess?: () => void;
  requestAccessBusy?: boolean;
  requestAccessNotice?: string | null;
  requestAccessError?: string | null;
}

function getAuthErrorMessage(error: unknown, action: 'login' | 'register' | 'google'): string {
  const message = getErrorMessage(error);
  if (action === 'google') return `Login Google gagal: ${message}`;
  if (action === 'register') return `Registrasi gagal: ${message}`;
  return `Login gagal: ${message}`;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  supabase,
  message,
  onSignOut,
  canRequestAccess = false,
  onRequestAccess,
  requestAccessBusy = false,
  requestAccessNotice,
  requestAccessError,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setError(null);
    setNotice(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (mode === 'register') {
      if (fullName.trim().length < 2) {
        setError('Nama lengkap minimal 2 karakter.');
        return;
      }
      if (password.length < 8) {
        setError('Password minimal 8 karakter.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Konfirmasi password tidak sama.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (mode === 'register') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: { full_name: fullName.trim() },
          },
        });
        if (signUpError) throw signUpError;

        if (data.session) {
          setNotice('Registrasi berhasil. Anda telah masuk secara otomatis.');
        } else {
          const recipient = data.user?.email || normalizedEmail;
          setNotice(`Registrasi berhasil untuk ${recipient}. Jika belum bisa masuk, nonaktifkan Confirm email di Supabase Dashboard.`);
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (authError) {
      setError(getAuthErrorMessage(authError, mode));
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!supabase) return;
    setError(null);
    setNotice(null);
    setSubmitting(true);
    try {
      const redirectTo = resolveAuthRedirectUrl(
        import.meta.env.VITE_AUTH_REDIRECT_URL,
        window.location.origin,
      );
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo },
      });
      if (oauthError) throw oauthError;
    } catch (oauthError) {
      setError(getAuthErrorMessage(oauthError, 'google'));
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!supabase || !email.trim()) return;
    setError(null);
    setNotice(null);
    try {
      const redirectTo = resolveAuthRedirectUrl(
        import.meta.env.VITE_AUTH_REDIRECT_URL,
        window.location.origin,
      );
      await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo,
      });
      setNotice(`Email reset password dikirim ke ${email.trim().toLowerCase()}. Periksa inbox dan folder spam.`);
    } catch (resetError) {
      setError(getAuthErrorMessage(resetError, 'login'));
    }
  };

  return (
    <main className="min-h-screen bg-[#E4DFCE] flex items-center justify-center p-4">
      <section className="w-full max-w-sm rounded-3xl border border-[#ECEEF2] bg-white p-7 shadow-[0_18px_40px_-12px_rgba(20,24,31,0.12)]">
        <div className="mb-6 flex flex-col items-center gap-3">
          <img src={brandLogo} alt="MeelieFont" className="h-20 w-56 object-cover object-center" />
          <div className="text-center">
            <p className="text-xs font-medium text-[#6E737D]">
              {mode === 'login' ? 'Masuk ke akun perpustakaan' : 'Buat akun perpustakaan'}
            </p>
          </div>
        </div>

        {(message || error || notice || requestAccessNotice || requestAccessError) && (
          <div
            role={notice || requestAccessNotice ? 'status' : 'alert'}
            className={`mb-4 flex gap-2 rounded-lg border p-3 text-xs ${
              notice || requestAccessNotice
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-rose-200 bg-rose-50 text-rose-900'
            }`}
          >
            {notice || requestAccessNotice
              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
              : <ShieldAlert className="h-4 w-4 shrink-0" />}
            <span>{error || requestAccessError || requestAccessNotice || notice || message}</span>
          </div>
        )}

        {!supabase ? (
          <p className="text-sm text-[#4B5563]">
            Koneksi Supabase belum tersedia. Periksa konfigurasi lingkungan aplikasi, lalu muat ulang halaman.
          </p>
        ) : onSignOut ? (
          <div className="space-y-4">
            <p className="text-sm text-[#4B5563]">
              {canRequestAccess
                ? 'Akun terautentikasi, tetapi belum memiliki role perpustakaan. Ajukan akses kepada administrator.'
                : 'Role akun gagal dimuat. Periksa pesan di atas, lalu hubungi administrator.'}
            </p>
            {canRequestAccess && onRequestAccess && (
              <button
                type="button"
                onClick={onRequestAccess}
                disabled={requestAccessBusy}
                className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#18362F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#112822] disabled:opacity-60"
              >
                {requestAccessBusy && <LoaderCircle className="h-4 w-4 animate-spin" />}
                Minta akses perpustakaan
              </button>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] px-4 py-2 text-sm font-semibold text-[#14181F] hover:bg-[#F5F6F8]"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <label className="block text-xs font-medium text-[#4B5563]">
                Nama lengkap
                <input
                  type="text"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-[#F5F6F8] px-3 py-2.5 text-sm text-[#14181F]"
                />
              </label>
            )}
            <label className="block text-xs font-medium text-[#4B5563]">
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-[#F5F6F8] px-3 py-2.5 text-sm text-[#14181F]"
              />
            </label>
            <label className="block text-xs font-medium text-[#4B5563]">
              Password
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'register' ? 8 : undefined}
                maxLength={72}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-[#F5F6F8] px-3 py-2.5 text-sm text-[#14181F]"
              />
            </label>
            {mode === 'register' && (
              <label className="block text-xs font-medium text-[#4B5563]">
                Konfirmasi password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#E5E7EB] bg-[#F5F6F8] px-3 py-2.5 text-sm text-[#14181F]"
                />
              </label>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#18362F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#112822] disabled:opacity-60"
            >
              {submitting && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Masuk' : 'Daftar'}
            </button>
            <div className="relative py-1 text-center text-[11px] text-[#6E737D]">
              <span className="bg-white px-2">atau</span>
              <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-[#ECEEF2]" />
            </div>
            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={submitting}
              className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-4 py-2.5 text-sm font-semibold text-[#14181F] hover:bg-[#F5F6F8] disabled:opacity-60"
            >
              <span aria-hidden="true" className="font-bold text-base text-[#4285F4]">G</span>
              Lanjutkan dengan Google
            </button>
            <p className="text-center text-[11px] text-[#6E737D]">
              Google OAuth langsung masuk tanpa kode verifikasi email tambahan.
            </p>
            <p className="text-center text-[11px] leading-relaxed text-[#6E737D]">
              {mode === 'register'
                ? 'Akun baru mendapat role Administrator dan dapat mengakses pengaturan aplikasi.'
                : 'Jika belum memiliki akun, Anda dapat mendaftar.'}
            </p>
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                className="w-full text-center text-xs font-semibold text-[#18362F] hover:underline disabled:opacity-50"
              >
                Lupa password?
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
                setNotice(null);
              }}
              className="w-full text-center text-xs font-semibold text-[#18362F] hover:underline"
            >
              {mode === 'login' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
};
