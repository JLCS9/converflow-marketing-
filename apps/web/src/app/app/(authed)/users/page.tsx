import Link from 'next/link';
import {
  effectivePermissions,
  type PermissionModule,
  type UserRole,
} from '@converflow/shared';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { TabBar, SETTINGS_TABS } from '@/components/ui/tab-bar';
import { PERMISSION_LABELS } from '@/components/permissions-editor';
import { UserActions } from './user-actions';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: string;
  /** Stored override; null when the user follows role defaults. */
  permissions: PermissionModule[] | null;
  lastLoginAt: string | null;
  createdAt: string;
}

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Admin',
  BUILDER: 'Builder',
  AGENT_USER: 'Agente',
};

const USER_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Activo',
  PENDING: 'Pendiente',
  SUSPENDED: 'Suspendido',
};

export const metadata = { title: 'Usuarios' };

export default async function UsersPage() {
  const [users, me] = await Promise.all([
    serverApiFetch<UserRow[]>('/users'),
    serverApiFetch<{ user: { userId: string; role: string } }>('/auth/me'),
  ]);

  const canManage = ['OWNER', 'ADMIN'].includes(me.user.role);

  return (
    <div className="space-y-6">
      <TabBar items={SETTINGS_TABS} />
      <PageHeader
        title="Usuarios"
        description={`${users.length} ${users.length === 1 ? 'usuario' : 'usuarios'} en tu cuenta.`}
        action={
          canManage ? (
            <Link href="/app/users/new" className={buttonClass('primary')}>
              + Invitar usuario
            </Link>
          ) : undefined
        }
      />

      {users.length === 0 ? (
        <EmptyState
          title="Sin usuarios todavía"
          description="Invita a tu equipo para colaborar en la gestión de leads, conversaciones y agentes."
          cta={
            canManage ? (
              <Link href="/app/users/new" className={buttonClass('primary', 'text-xs')}>
                + Invitar usuario
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="hidden px-4 py-3 md:table-cell">Nombre</th>
                <th className="px-4 py-3">Rol</th>
                <th className="hidden px-4 py-3 lg:table-cell">Permisos efectivos</th>
                <th className="px-4 py-3">Estado</th>
                <th className="hidden px-4 py-3 md:table-cell">Último login</th>
                {canManage && <th className="px-4 py-3 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const effective = effectivePermissions(u.role, u.permissions);
                const isOverride = u.role !== 'OWNER' && u.permissions != null;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40"
                  >
                    <td className="px-4 py-3 font-medium">
                      {u.email}
                      {u.id === me.user.userId && (
                        <span className="ml-2">
                          <Badge color="blue">tú</Badge>
                        </span>
                      )}
                      <div className="mt-0.5 text-xs text-ink-500 md:hidden">{u.name}</div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">{u.name}</td>
                    <td className="px-4 py-3">
                      <Badge color={u.role === 'OWNER' ? 'blue' : 'gray'}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-ink-700 lg:table-cell">
                      {u.role === 'OWNER' ? (
                        <span className="text-ink-500">Acceso completo</span>
                      ) : (
                        <span className="block max-w-md truncate">
                          {effective.map((p) => PERMISSION_LABELS[p]).join(' · ')}
                          {isOverride && (
                            <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-amber-900">
                              personalizado
                            </span>
                          )}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        color={
                          u.status === 'ACTIVE'
                            ? 'green'
                            : u.status === 'PENDING'
                              ? 'yellow'
                              : 'red'
                        }
                      >
                        {USER_STATUS_LABEL[u.status] ?? u.status}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-ink-500 md:table-cell">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('es-ES') : '—'}
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        {u.id === me.user.userId ? (
                          <span className="text-xs text-ink-500">—</span>
                        ) : (
                          <UserActions
                            user={{
                              id: u.id,
                              email: u.email,
                              name: u.name,
                              role: u.role,
                              status: u.status,
                              permissions: u.permissions,
                            }}
                          />
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
