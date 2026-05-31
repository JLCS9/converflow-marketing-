import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { UserActions } from './user-actions';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
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
                <th className="px-4 py-3">Estado</th>
                <th className="hidden px-4 py-3 md:table-cell">Último login</th>
                {canManage && <th className="px-4 py-3 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
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
                  <td className="px-4 py-3">
                    <Badge color={u.status === 'ACTIVE' ? 'green' : u.status === 'PENDING' ? 'yellow' : 'red'}>
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
                        <UserActions userId={u.id} userEmail={u.email} />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
