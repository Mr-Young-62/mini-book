import React, { useState } from 'react';
import { CheckCircle2, LoaderCircle, LogOut, ShieldAlert } from 'lucide-react';
import { SupabaseClient } from '@supabase/supabase-js';
import brandLogo from '../assets/meeliefont-logo.png';
import { resolveAuthRedirectUrl } from '../lib/authRedirect';

interface AuthPageProps {
  supabase: SupabaseClient | null;
  message?: string | null;
  onSignOut?: () => void;
  canRequestAccess?: boolean;
  onRequestAccess?: () => void;
  requestAccessBusy?: boolean;
  requestAccessNotice?: string | null;
  requestAccessError?: string | null;
  onUseLocalMode?: () => void;
}

function getAuthErrorMessage(error: unknown, action: 'login' | 'register' | 'google'): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : '';

  if (code === 'email_not_confirmed' || message.toLowerCase().includes('email not confirmed')) {
    return 'Email belum diverifikasi. Buka email verifikasi atau kirim ulang sebelum masuk.';
  }
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
  onUseLocalMode,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

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
        const emailRedirectTo = resolveAuthRedirectUrl(
          import.meta.env.VITE_AUTH_REDIRECT_URL,
          window.location.origin,
        );
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: { full_name: fullName.trim() },
            emailRedirectTo,
          },
        });
        if (signUpError) throw signUpError;

        if (!data.session) {
          const recipient = data.user?.email || normalizedEmail;
          setNotice(`Registrasi berhasil. Email verifikasi dikirim ke ${recipient}. Periksa inbox dan folder spam.`);
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

  const handleResendConfirmation = async () => {
    if (!supabase || !email.trim()) return;
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      const emailRedirectTo = resolveAuthRedirectUrl(
        import.meta.env.VITE_AUTH_REDIRECT_URL,
        window.location.origin,
      );
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: email.trim().toLowerCase(),
        options: { emailRedirectTo },
      });
      if (resendError) throw resendError;
      setNotice(`Permintaan email verifikasi ulang untuk ${email.trim().toLowerCase()} berhasil dikirim. Periksa inbox dan folder spam.`);
    } catch (resendError) {
      setError(getAuthErrorMessage(resendError, 'register'));
    } finally {
      setResending(false);
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
            The Supabase client could not be initialized. Check the URL and publishable key in Settings.
          </p>
        ) : onSignOut ? (
          <div className="space-y-4">
            <p className="text-sm text-[#4B5563]">
              {canRequestAccess
                ? 'Akun terautentikasi, tetapi belum memiliki role perpustakaan. Ajukan akses kepada administrator atau gunakan mode lokal.'
                : 'Role akun gagal dimuat. Periksa pesan di atas, lalu hubungi administrator atau gunakan mode lokal.'}
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
            {mode === 'register' && notice && (
              <button
                type="button"
                onClick={() => void handleResendConfirmation()}
                disabled={resending || !email.trim()}
                className="w-full text-center text-xs font-semibold text-[#18362F] hover:underline disabled:opacity-50"
              >
                {resending ? 'Mengirim ulang...' : 'Kirim ulang email konfirmasi'}
              </button>
            )}
            <p className="text-center text-[11px] leading-relaxed text-[#6E737D]">
              {mode === 'register'
                ? 'Akun baru hanya mendapat akses Member. Hak akses staf diberikan administrator.'
                : 'Jika belum memiliki akun, Anda dapat mendaftar sementara.'}
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
        {onUseLocalMode && (
          <button
            type="button"
            onClick={onUseLocalMode}
            className="mt-4 w-full text-center text-xs font-medium text-[#6E737D] underline hover:text-[#14181F]"
          >
            Disconnect and use local library
          </button>
        )}
      </section>
    </main>
  );
};
