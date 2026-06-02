'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  ROLE_DEFAULTS,
  type PermissionModule,
  type UserRole,
} from '@converflow/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { useFeedback } from '@/components/ui/feedback';
import { Field, Select, buttonClass } from '@/components/ui/primitives';
import {
  PermissionsEditor,
  PERMISSION_LABELS,
} from '@/components/permissions-editor';

interface UserSnapshot {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: string;
  permissions: PermissionModule[] | null;
}

/**
 * Inline actions for a single row of /app/users. Renders "Editar" (opens
 * a modal with role + status + permissions) and "Eliminar". Owners can
 * never be edited away from full access — the modal hides the perms
 * checklist when role === 'OWNER'.
 */
export function UserActions({ user }: { user: UserSnapshot }) {
  const router = useRouter();
  const { confirm, toast } = useFeedback();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="inline-flex items-center gap-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-primary-700 hover:text-primary-800"
        disabled={pending}
      >
        Editar
      </button>
      <button
        type="button"
        onClick={async () => {
          const ok = await confirm({
            title: `Eliminar usuario ${user.email}`,
            description: 'Pierde acceso inmediatamente. No se puede deshacer.',
            danger: true,
          });
          if (!ok) return;
          startTransition(async () => {
            try {
              await apiFetch(`/users/${user.id}`, { method: 'DELETE' });
              toast.success('Usuario eliminado');
              router.refresh();
            } catch (err) {
              toast.error(err instanceof ApiError ? err.message : 'No se pudo eliminar');
            }
          });
        }}
        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-60"
        disabled={pending}
      >
        {pending ? 'Eliminando…' : 'Eliminar'}
      </button>
      {open && (
        <EditUserModal
          user={user}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: UserSnapshot;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useFeedback();
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<UserRole>(user.role);
  const [status, setStatus] = useState(user.status);
  const [usingDefaults, setUsingDefaults] = useState(user.permissions === null);
  const [perms, setPerms] = useState<PermissionModule[]>(
    user.permissions ?? [...ROLE_DEFAULTS[user.role]],
  );

  const roleDefaults = useMemo(() => [...ROLE_DEFAULTS[role]], [role]);

  function changeRole(next: UserRole) {
    setRole(next);
    if (usingDefaults) setPerms([...ROLE_DEFAULTS[next]]);
  }
  function toggleOverride(enabled: boolean) {
    setUsingDefaults(!enabled);
    if (!enabled) setPerms([...ROLE_DEFAULTS[role]]);
  }

  function save() {
    startTransition(async () => {
      try {
        await apiFetch(`/users/${user.id}`, {
          method: 'PATCH',
          json: {
            role,
            status,
            permissions:
              role === 'OWNER' ? null : usingDefaults ? null : perms,
          },
        });
        toast.success('Usuario actualizado');
        onSaved();
      } catch (err) {
        toast.error(err instanceof ApiError ? err.message : 'No se pudo guardar');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/60 p-4">
      <div className="w-full max-w-2xl space-y-5 rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Editar usuario
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              {user.name} · {user.email}
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="text-ink-500 hover:text-ink-900"
          >
            ✕
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Rol">
            <Select
              value={role}
              onChange={(e) => changeRole(e.target.value as UserRole)}
            >
              <option value="AGENT_USER">Agente</option>
              <option value="BUILDER">Constructor</option>
              <option value="ADMIN">Administrador</option>
              <option value="OWNER">Propietario</option>
            </Select>
          </Field>
          <Field label="Estado">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ACTIVE">Activo</option>
              <option value="PENDING">Pendiente</option>
              <option value="SUSPENDED">Suspendido</option>
            </Select>
          </Field>
        </div>

        <div className="space-y-3 rounded-md border border-ink-100 bg-ink-100/30 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
                Permisos
              </div>
              <p className="mt-1 text-xs text-ink-600">
                {role === 'OWNER'
                  ? 'Los propietarios siempre tienen acceso completo.'
                  : usingDefaults
                    ? `Usando los valores por defecto del rol ${role}. Activa la personalización para ajustar módulos concretos.`
                    : 'Permisos personalizados — solo los módulos marcados estarán disponibles.'}
              </p>
            </div>
            {role !== 'OWNER' && (
              <label className="inline-flex shrink-0 items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={!usingDefaults}
                  onChange={(e) => toggleOverride(e.target.checked)}
                  className="rounded border-ink-300 text-primary-600 focus:ring-primary-500"
                />
                Personalizar
              </label>
            )}
          </div>

          {role === 'OWNER' ? (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Acceso completo a todos los módulos: {Object.values(PERMISSION_LABELS).join(' · ')}.
            </div>
          ) : (
            <PermissionsEditor
              value={perms}
              onChange={setPerms}
              disabled={usingDefaults}
              roleDefaults={roleDefaults}
            />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className={buttonClass('secondary')}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className={buttonClass('primary')}
          >
            {pending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
