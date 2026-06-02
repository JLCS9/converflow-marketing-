'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { buttonClass } from './primitives';

// =====================================================================
// Types
// =====================================================================

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ConfirmOptions {
  title: string;
  /**
   * Plain string or ReactNode. Use a node when the confirmation needs
   * structure (lists, emphasised words, links) — handy for GDPR-style
   * delete prompts where the user must see exactly what will be lost.
   */
  description?: string | ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface FeedbackContextValue {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

// =====================================================================
// Provider
// =====================================================================

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<
    | {
        opts: ConfirmOptions;
        resolve: (v: boolean) => void;
      }
    | null
  >(null);
  const counter = useRef(0);

  const push = useCallback((tone: ToastTone, message: string) => {
    counter.current += 1;
    const id = counter.current;
    setToasts((arr) => [...arr, { id, tone, message }]);
    setTimeout(() => {
      setToasts((arr) => arr.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const value = useMemo<FeedbackContextValue>(
    () => ({
      toast: {
        success: (m) => push('success', m),
        error: (m) => push('error', m),
        info: (m) => push('info', m),
      },
      confirm: (opts) =>
        new Promise<boolean>((resolve) => {
          setPendingConfirm({ opts, resolve });
        }),
    }),
    [push],
  );

  function resolveConfirm(value: boolean) {
    if (pendingConfirm) {
      pendingConfirm.resolve(value);
      setPendingConfirm(null);
    }
  }

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Toaster
        toasts={toasts}
        onDismiss={(id) => setToasts((arr) => arr.filter((t) => t.id !== id))}
      />
      {pendingConfirm && (
        <ConfirmDialog
          opts={pendingConfirm.opts}
          onConfirm={() => resolveConfirm(true)}
          onCancel={() => resolveConfirm(false)}
        />
      )}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) {
    throw new Error('useFeedback must be used inside <FeedbackProvider>');
  }
  return ctx;
}

// =====================================================================
// Toaster UI
// =====================================================================

const toneStyles: Record<ToastTone, string> = {
  success: 'border-green-200 bg-green-50 text-green-900',
  error: 'border-red-200 bg-red-50 text-red-900',
  info: 'border-ink-200 bg-white text-ink-900',
};

const toneIcon: Record<ToastTone, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={`pointer-events-auto flex items-start gap-2 rounded-md border px-3 py-2 text-sm shadow-md transition-all ${toneStyles[t.tone]}`}
        >
          <span
            aria-hidden
            className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              t.tone === 'success'
                ? 'bg-green-600 text-white'
                : t.tone === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-ink-200 text-ink-900'
            }`}
          >
            {toneIcon[t.tone]}
          </span>
          <span className="flex-1 leading-snug">{t.message}</span>
          <button
            type="button"
            aria-label="Cerrar notificación"
            className="text-xs text-ink-500 hover:text-ink-900"
            onClick={() => onDismiss(t.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// Confirm dialog
// =====================================================================

function ConfirmDialog({
  opts,
  onConfirm,
  onCancel,
}: {
  opts: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    }
    document.addEventListener('keydown', onKey);
    confirmRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, onConfirm]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Cancelar"
        className="absolute inset-0 cursor-default bg-ink-900/40 backdrop-blur-sm"
        onClick={onCancel}
      />
      <div className="relative w-full max-w-md rounded-lg border border-ink-100 bg-white p-6 shadow-xl">
        <h2 id="confirm-title" className="text-base font-semibold text-ink-900">
          {opts.title}
        </h2>
        {opts.description &&
          (typeof opts.description === 'string' ? (
            <p className="mt-2 text-sm text-ink-700">{opts.description}</p>
          ) : (
            <div className="mt-2 text-sm text-ink-700">{opts.description}</div>
          ))}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={buttonClass('secondary', 'text-sm')} onClick={onCancel}>
            {opts.cancelLabel ?? 'Cancelar'}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className={buttonClass(opts.danger ? 'danger' : 'primary', 'text-sm')}
            onClick={onConfirm}
          >
            {opts.confirmLabel ?? (opts.danger ? 'Eliminar' : 'Aceptar')}
          </button>
        </div>
      </div>
    </div>
  );
}
