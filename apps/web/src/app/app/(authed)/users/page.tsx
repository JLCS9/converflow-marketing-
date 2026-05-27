import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
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

export const metadata = { title: 'Usuarios' };

export default async function UsersPage() {
  const [users, me] = await Promise.all([
    serverApiFetch<UserRow[]>('/users'),
    serverApiFetch<{ user: { userId: string; role: string } }>('/auth/me'),
  ]);

  const canManage = ['OWNER', 'ADMIN'].includes(me.user.role);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuarios</h1>
          <p className="mt-1 text-sm text-ink-500">
            {users.length} {users.length === 1 ? 'usuario' : 'usuarios'} en tu tenant.
          </p>
        </div>
        {canManage && (
          <Link href="/app/users/new" className={buttonClass('primary')}>
            + Invitar usuario
          </Link>
        )}
      </header>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Nombre</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Último login</th>
              {canManage && <th className="px-4 py-3 text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                <td className="px-4 py-3 font-medium">
                  {u.email}
                  {u.id === me.user.userId && (
                    <Badge color="blue">
                      <span className="ml-1">tú</span>
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3">{u.name}</td>
                <td className="px-4 py-3">
                  <Badge color={u.role === 'OWNER' ? 'blue' : 'gray'}>{u.role}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge color={u.status === 'ACTIVE' ? 'green' : u.status === 'PENDING' ? 'yellow' : 'red'}>
                    {u.status}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-ink-500">
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
    </div>
  );
}
