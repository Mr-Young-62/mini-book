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
    <main className="min-h-screen bg-[#F5F3EE] flex items-center justify-center p-4">
      <section className="w-full max-w-sm rounded-[18px] bg-white shadow-[0_1px_3px_rgba(38,41,37,0.04)] p-7 sm:p-8">
        <div className="mb-6 flex flex-col items-center gap-3">
          <img src={brandLogo} alt="MeelieFont" className="h-20 w-56 object-cover object-center" />
          <div className="text-center">
            <p className="text-xs font-medium text-[#737770]">
              {mode === 'login' ? 'Masuk ke akun perpustakaan' : 'Buat akun perpustakaan'}
            </p>
          </div>
        </div>

        {(message || error || notice || requestAccessNotice || requestAccessError) && (
          <div
            role={notice || requestAccessNotice ? 'status' : 'alert'}
            className={`mb-4 flex gap-2 rounded-[12px] p-3 text-xs ${
              notice || requestAccessNotice
                ? 'bg-[#E5F2EE] text-[#165243]'
                : 'bg-[#FDECEC] text-[#262925]'
            }`}
          >
            {notice || requestAccessNotice
              ? <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1F6F5B]" strokeWidth={1.6} aria-hidden="true" />
              : <ShieldAlert className="h-4 w-4 shrink-0 text-[#B3261E]" strokeWidth={1.6} aria-hidden="true" />}
            <span>{error || requestAccessError || requestAccessNotice || notice || message}</span>
          </div>
        )}

        {!supabase ? (
          <p className="text-sm text-[#737770]">
            Koneksi Supabase belum siap. Periksa URL dan kunci publik di menu Pengaturan.
          </p>
        ) : onSignOut ? (
          <div className="space-y-4">
            <p className="text-sm text-[#737770]">
              {canRequestAccess
                ? 'Akun terautentikasi, tetapi belum memiliki role perpustakaan. Ajukan akses kepada administrator.'
                : 'Role akun gagal dimuat. Periksa pesan di atas, lalu hubungi administrator.'}
            </p>
            {canRequestAccess && onRequestAccess && (
              <button
                type="button"
                onClick={onRequestAccess}
                disabled={requestAccessBusy}
                className="btn-primary-tactile inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-[12px] px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
              >
                {requestAccessBusy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Minta akses perpustakaan
              </button>
            )}
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex w-full min-h-[44px] items-center justify-center gap-2 rounded-[12px] bg-[#F2EFE8] px-4 py-2 text-sm font-semibold text-[#262925] hover:bg-[#E7E2D7]"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.6} aria-hidden="true" /> Keluar
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <label className="block text-xs font-medium text-[#686C65]">
                Nama lengkap
                <input
                  type="text"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  required
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-1 w-full rounded-[12px] bg-[#F2EFE8] px-3.5 py-2.5 text-sm text-[#262925] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25"
                />
              </label>
            )}
            <label className="block text-xs font-medium text-[#686C65]">
              Email
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-[12px] bg-[#F2EFE8] px-3.5 py-2.5 text-sm text-[#262925] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25"
              />
            </label>
            <label className="block text-xs font-medium text-[#686C65]">
              Password
              <input
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'register' ? 8 : undefined}
                maxLength={72}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-[12px] bg-[#F2EFE8] px-3.5 py-2.5 text-sm text-[#262925] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25"
              />
            </label>
            {mode === 'register' && (
              <label className="block text-xs font-medium text-[#686C65]">
                Konfirmasi password
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={72}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  className="mt-1 w-full rounded-[12px] bg-[#F2EFE8] px-3.5 py-2.5 text-sm text-[#262925] focus:bg-[#ECE8DF] focus:outline-none focus:ring-2 focus:ring-[#1F6F5B]/25"
                />
              </label>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary-tactile inline-flex w-full min-h-[46px] items-center justify-center gap-2 rounded-[12px] px-5 text-sm font-semibold disabled:opacity-60"
            >
              {submitting && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {mode === 'login' ? 'Masuk' : 'Daftar'}
            </button>
            <div className="py-1 text-center text-[12px] font-medium text-[#737770]">atau</div>
            <button
              type="button"
              onClick={() => void handleGoogleSignIn()}
              disabled={submitting}
              className="inline-flex w-full min-h-[46px] items-center justify-center gap-2 rounded-[12px] bg-[#F2EFE8] px-5 text-sm font-semibold text-[#262925] hover:bg-[#E7E2D7] disabled:opacity-60"
            >
              <span aria-hidden="true" className="font-bold text-base text-[#4285F4]">G</span>
              Lanjutkan dengan Google
            </button>
            <p className="text-center text-[11px] text-[#737770]">
              Akun Google langsung masuk tanpa verifikasi email tambahan.
            </p>
            <p className="text-center text-[11px] leading-relaxed text-[#737770]">
              {mode === 'register'
                ? 'Akun baru mendapat role Member; admin perpustakaan dapat menaikkan peran.'
                : 'Jika belum memiliki akun, Anda dapat mendaftar.'}
            </p>
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => void handleForgotPassword()}
                className="w-full text-center text-xs font-semibold text-[#165243] hover:underline disabled:opacity-50"
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
              className="w-full text-center text-xs font-semibold text-[#165243] hover:underline"
            >
              {mode === 'login' ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
};
