'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { PermissionModule, UserRole } from '@converflow/shared';

export interface SessionUser {
  userId: string;
  tenantId: string;
  email: string;
  role: UserRole;
  /** Effective permissions (role defaults + per-user override). OWNER is full. */
  permissions: PermissionModule[];
}

const Ctx = createContext<SessionUser | null>(null);

export function SessionProvider({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  return <Ctx.Provider value={user}>{children}</Ctx.Provider>;
}

/** Throws if used outside the authed layout. */
export function useSession(): SessionUser {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useSession must be used inside an authed layout');
  }
  return ctx;
}

/**
 * Convenience: does the current user have the given module?
 * OWNER always returns true (defensive — backend already enforces this).
 */
export function useCan(module: PermissionModule): boolean {
  const u = useSession();
  if (u.role === 'OWNER') return true;
  return u.permissions.includes(module);
}
