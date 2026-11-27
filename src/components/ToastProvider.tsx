import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CalendarClock, CheckCircle2, X } from 'lucide-react';

export type ToastTone = 'success' | 'loan' | 'warning' | 'error';

export interface ToastInput {
  tone: ToastTone;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastItem extends ToastInput {
  id: string;
}

interface ToastContextValue {
  notify: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TONE_STYLES: Record<
  ToastTone,
  {
    bar: string;
    iconWrap: string;
    actionBtn: string;
  }
> = {
  success: {
    bar: 'bg-[#1F6F5B]',
    iconWrap: 'bg-[#E5F2EE] text-[#1F6F5B]',
    actionBtn: 'bg-[#E5F2EE] text-[#165243] hover:bg-[#D6EAE4]',
  },
  loan: {
    bar: 'bg-[#C27B0E]',
    iconWrap: 'bg-[#F7EDD6] text-[#7A510B]',
    actionBtn: 'bg-[#F7EDD6] text-[#7A510B] hover:bg-[#EFE0BC]',
  },
  warning: {
    bar: 'bg-[#B9543A]',
    iconWrap: 'bg-[#F7EAE4] text-[#9E4028]',
    actionBtn: 'bg-[#F7EAE4] text-[#9E4028] hover:bg-[#F0DDD4]',
  },
  error: {
    bar: 'bg-[#B3261E]',
    iconWrap: 'bg-[#FDECEC] text-[#B3261E]',
    actionBtn: 'bg-[#FDECEC] text-[#B3261E] hover:bg-[#F9DADA]',
  },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (input: ToastInput) => {
      const id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random()}`;
      const durationMs = input.durationMs ?? (input.tone === 'warning' || input.tone === 'error' ? 7500 : 5000);

      setToasts((prev) => {
        const next = [...prev, { ...input, id }];
        if (next.length > 3) {
          const evicted = next[0];
          const oldTimer = timersRef.current.get(evicted.id);
          if (oldTimer !== undefined) {
            window.clearTimeout(oldTimer);
            timersRef.current.delete(evicted.id);
          }
          return next.slice(-3);
        }
        return next;
      });

      const timer = window.setTimeout(() => {
        timersRef.current.delete(id);
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, durationMs);
      timersRef.current.set(id, timer);
    },
    [],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        window.clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed inset-x-4 top-4 sm:left-auto sm:right-5 sm:top-5 sm:w-[360px] z-[110] space-y-2.5 pointer-events-none"
        >
          {toasts.map((toast) => {
            const style = TONE_STYLES[toast.tone];
            const isAlert = toast.tone === 'warning' || toast.tone === 'error';
            return (
              <div
                key={toast.id}
                role={isAlert ? 'alert' : 'status'}
                className="toast-enter pointer-events-auto relative overflow-hidden rounded-[18px] bg-white shadow-[0_12px_32px_rgba(38,41,37,0.14)] p-3.5 pl-4 flex items-start gap-3"
              >
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 w-1 ${style.bar}`}
                />
                <span
                  aria-hidden="true"
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] ${style.iconWrap}`}
                >
                  {toast.tone === 'success' ? (
                    <CheckCircle2 className="h-4 w-4" strokeWidth={1.75} />
                  ) : toast.tone === 'loan' ? (
                    <CalendarClock className="h-4 w-4" strokeWidth={1.75} />
                  ) : toast.tone === 'warning' ? (
                    <AlertTriangle className="h-4 w-4" strokeWidth={1.75} />
                  ) : (
                    <AlertCircle className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </span>

                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[13px] font-bold leading-snug text-[#262925]">
                    {toast.title}
                  </p>
                  {toast.description && (
                    <p className="mt-0.5 text-[12px] leading-relaxed text-[#737770]">
                      {toast.description}
                    </p>
                  )}
                  {toast.actionLabel && toast.onAction && (
                    <button
                      type="button"
                      onClick={() => {
                        toast.onAction?.();
                        dismiss(toast.id);
                      }}
                      className={`mt-2 inline-flex min-h-[32px] items-center rounded-[10px] px-3 text-[11.5px] font-semibold transition-colors ${style.actionBtn}`}
                    >
                      {toast.actionLabel}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Tutup notifikasi"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#686C65] hover:bg-[#F2EFE8] hover:text-[#262925]"
                >
                  <X className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      notify: () => {},
    };
  }
  return ctx;
}
