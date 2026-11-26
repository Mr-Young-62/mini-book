import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string;
}

/**
 * Last line of defence for the whole app.
 *
 * Without a boundary, one thrown render/lifecycle error unmounts the entire
 * React tree and the user is left staring at a blank white page with no hint
 * about what happened. This renders the actual message instead, so the next
 * occurrence is diagnosable (and recoverable) without opening devtools.
 *
 * Note: React only routes render/lifecycle/constructor errors here. Errors
 * thrown inside event handlers, timers or promise rejections are not caught.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Unhandled UI error:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack || '' });
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleRetry = (): void => {
    this.setState({ error: null, componentStack: '' });
  };

  render(): React.ReactNode {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#F5F6F8] p-6">
        <div className="w-full max-w-lg rounded-2xl border border-[#ECEEF2] bg-white p-6 shadow-lg">
          <h1 className="text-lg font-bold text-[#14181F]">Terjadi kendala tampilan</h1>
          <p className="mt-2 text-sm leading-relaxed text-[#4B5563]">
            Halaman ini berhenti karena sebuah error. Data Anda tidak hilang — muat ulang untuk
            melanjutkan, atau salin pesan di bawah saat melaporkan masalah.
          </p>

          <pre className="mt-4 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#F5F6F8] p-3 text-[11px] leading-relaxed text-[#B42318]">
            {error.message || String(error)}
          </pre>

          {componentStack && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-[#6E737D]">
                Detail komponen
              </summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[#F5F6F8] p-3 text-[10px] leading-relaxed text-[#6E737D]">
                {componentStack}
              </pre>
            </details>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-xl bg-[#18362F] px-4 py-2 text-xs font-semibold text-white hover:bg-[#112822]"
            >
              Muat ulang
            </button>
            <button
              type="button"
              onClick={this.handleRetry}
              className="rounded-xl bg-[#ECEEF2] px-4 py-2 text-xs font-semibold text-[#14181F] hover:bg-[#E5E7EB]"
            >
              Coba lagi
            </button>
          </div>
        </div>
      </div>
    );
  }
}
