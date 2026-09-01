import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
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
import { PERMISSION_LABEL_KEYS } from '@/components/permissions-editor';
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

const ROLE_KEY: Record<string, string> = {
  OWNER: 'roleShortOwner',
  ADMIN: 'roleShortAdmin',
  BUILDER: 'roleShortBuilder',
  AGENT_USER: 'roleShortAgent',
};

const USER_STATUS_KEY: Record<string, string> = {
  ACTIVE: 'statusActive',
  PENDING: 'statusPending',
  SUSPENDED: 'statusSuspended',
};

export async function generateMetadata() {
  const t = await getTranslations();
  return { title: t('users.title') };
}

export default async function UsersPage() {
  const t = await getTranslations('users');
  const tUi = await getTranslations('uiBits');
  const [users, me] = await Promise.all([
    serverApiFetch<UserRow[]>('/users'),
    serverApiFetch<{ user: { userId: string; role: string } }>('/auth/me'),
  ]);

  const canManage = ['OWNER', 'ADMIN'].includes(me.user.role);

  return (
    <div className="space-y-6">
      <TabBar items={SETTINGS_TABS} />
      <PageHeader
        title={t('title')}
        description={t('countInAccount', { count: users.length })}
        action={
          canManage ? (
            <Link href="/app/users/new" className={buttonClass('primary')}>
              {t('inviteUser')}
            </Link>
          ) : undefined
        }
      />

      {users.length === 0 ? (
        <EmptyState
          title={t('emptyTitle')}
          description={t('emptyDescription')}
          cta={
            canManage ? (
              <Link href="/app/users/new" className={buttonClass('primary', 'text-xs')}>
                {t('inviteUser')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">{t('colEmail')}</th>
                <th className="hidden px-4 py-3 md:table-cell">{t('colName')}</th>
                <th className="px-4 py-3">{t('colRole')}</th>
                <th className="hidden px-4 py-3 lg:table-cell">{t('colPermissions')}</th>
                <th className="px-4 py-3">{t('colStatus')}</th>
                <th className="hidden px-4 py-3 md:table-cell">{t('colLastLogin')}</th>
                {canManage && <th className="px-4 py-3 text-right">{t('colActions')}</th>}
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
                          <Badge color="blue">{t('youBadge')}</Badge>
                        </span>
                      )}
                      <div className="mt-0.5 text-xs text-ink-500 md:hidden">{u.name}</div>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">{u.name}</td>
                    <td className="px-4 py-3">
                      <Badge color={u.role === 'OWNER' ? 'blue' : 'gray'}>
                        {ROLE_KEY[u.role] ? t(ROLE_KEY[u.role]!) : u.role}
                      </Badge>
                    </td>
                    <td className="hidden px-4 py-3 text-xs text-ink-700 lg:table-cell">
                      {u.role === 'OWNER' ? (
                        <span className="text-ink-500">{t('fullAccess')}</span>
                      ) : (
                        <span className="block max-w-md truncate">
                          {effective.map((p) => tUi(PERMISSION_LABEL_KEYS[p])).join(' · ')}
                          {isOverride && (
                            <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wider text-amber-900">
                              {t('customBadge')}
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
                        {USER_STATUS_KEY[u.status] ? t(USER_STATUS_KEY[u.status]!) : u.status}
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
