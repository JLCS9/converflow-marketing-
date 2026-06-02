'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  PERMISSION_MODULES,
  ROLE_DEFAULTS,
  USER_ROLES,
  type PermissionModule,
  type UserRole,
} from '@converflow/shared';
import { apiFetch, ApiError } from '@/lib/api-client';
import { Card, Field, Input, Select, buttonClass } from '@/components/ui/primitives';
import { CopyButton } from '@/components/ui/copy-button';
import { PermissionsEditor, PERMISSION_LABELS } from '@/components/permissions-editor';

interface InviteResponse {
  user: { id: string; email: string };
  tempPassword: string;
}

export function InviteUserForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<InviteResponse | null>(null);
  const [pending, startTransition] = useTransition();

  // Role and override flag are controlled — the permission checklist
  // re-renders when the role changes.
  const [role, setRole] = useState<UserRole>('AGENT_USER');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [usingDefaults, setUsingDefaults] = useState(true);
  const [perms, setPerms] = useState<PermissionModule[]>([
    ...ROLE_DEFAULTS.AGENT_USER,
  ]);

  // When the role changes and we're following defaults, reset the perm set.
  const roleDefaults = useMemo(() => [...ROLE_DEFAULTS[role]], [role]);
  function changeRole(next: UserRole) {
    setRole(next);
    if (usingDefaults) setPerms([...ROLE_DEFAULTS[next]]);
  }
  function toggleOverride(enabled: boolean) {
    setUsingDefaults(!enabled);
    if (!enabled) setPerms([...ROLE_DEFAULTS[role]]);
  }

  if (result) {
    return (
      <Card className="space-y-4">
        <h2 className="text-base font-semibold">Usuario creado</h2>
        <dl className="space-y-2 rounded-md bg-ink-100/60 p-4 font-mono text-sm">
          <div>
            <dt className="text-xs text-ink-500">Email</dt>
            <dd>{result.user.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Contraseña temporal</dt>
            <dd className="mt-1 flex items-center gap-2">
              <code className="flex-1 select-all rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-900">
                {result.tempPassword}
              </code>
              <CopyButton value={result.tempPassword} />
            </dd>
          </div>
        </dl>
        <p className="text-xs text-ink-500">
          Comunica esta contraseña al usuario por un canal seguro. Cuando entre por
          primera vez la plataforma le pedirá cambiarla.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => router.push('/app/users')}
            className={buttonClass('primary')}
          >
            Volver a usuarios
          </button>
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setName('');
              setEmail('');
              setRole('AGENT_USER');
              setUsingDefaults(true);
              setPerms([...ROLE_DEFAULTS.AGENT_USER]);
            }}
            className={buttonClass('secondary')}
          >
            Invitar otro
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          const payload: {
            email: string;
            name: string;
            role: UserRole;
            permissions: PermissionModule[] | null;
          } = {
            email: email.trim(),
            name: name.trim(),
            role,
            // null means "use role defaults"; explicit array means override.
            permissions: usingDefaults ? null : perms,
          };
          setError(null);
          startTransition(async () => {
            try {
              const res = await apiFetch<InviteResponse>('/users/invite', {
                method: 'POST',
                json: payload,
              });
              setResult(res);
            } catch (err) {
              setError(err instanceof ApiError ? err.message : 'Error inesperado');
            }
          });
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" required>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Nombre" required>
            <Input
              type="text"
              required
              minLength={2}
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Rol" required help="Determina los permisos por defecto.">
          <Select value={role} onChange={(e) => changeRole(e.target.value as UserRole)}>
            <option value="AGENT_USER">Agente — uso operativo (CRM y conversaciones)</option>
            <option value="BUILDER">Constructor — diseña agentes y bots</option>
            <option value="ADMIN">Administrador — gestión completa del tenant</option>
            <option value="OWNER">Propietario — control total, no se puede limitar</option>
          </Select>
        </Field>

        {/* Permissions block */}
        <div className="space-y-3 rounded-md border border-ink-100 bg-ink-100/30 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-mono uppercase tracking-wider text-ink-500">
                Permisos
              </div>
              <p className="mt-1 text-xs text-ink-600">
                {role === 'OWNER'
                  ? 'Los propietarios siempre tienen acceso completo. No se pueden limitar permisos a un OWNER.'
                  : usingDefaults
                    ? `Este usuario tendrá los permisos por defecto del rol ${role}. Activa la personalización para ajustar módulos concretos.`
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
              Acceso completo a {PERMISSION_MODULES.length} módulos:{' '}
              {PERMISSION_MODULES.map((m) => PERMISSION_LABELS[m]).join(' · ')}.
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

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => router.push('/app/users')}
            className={buttonClass('secondary')}
            disabled={pending}
          >
            Cancelar
          </button>
          <button type="submit" className={buttonClass('primary')} disabled={pending}>
            {pending ? 'Creando…' : 'Crear usuario'}
          </button>
        </div>
      </form>
    </Card>
  );
}

// Re-export for callers that want the same role list ordering.
export const ROLE_OPTIONS = USER_ROLES;
