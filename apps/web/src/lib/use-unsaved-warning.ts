'use client';

import { useEffect, useState } from 'react';

/**
 * Hook that:
 *   - Tracks dirty state externally (caller passes the boolean).
 *   - Adds a beforeunload prompt while dirty (browser-level warning if the
 *     user closes the tab or navigates away outside Next.js).
 *
 * For in-app navigation use the returned `confirmDiscard` helper together
 * with useFeedback().confirm().
 */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}

/** Convenience: tracks dirty automatically when any of the provided values change from initial. */
export function useDirtyState<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const dirty = Object.keys(initial).some((k) => initial[k] !== values[k]);
  useUnsavedWarning(dirty);
  return [values, setValues, dirty] as const;
}
