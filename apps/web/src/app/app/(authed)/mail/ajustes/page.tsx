import Link from 'next/link';
import { serverApiFetch } from '@/lib/server-api';
import { Card, Badge, buttonClass } from '@/components/ui/primitives';
import { PageHeader } from '@/components/ui/page-header';
import { TabBar } from '@/components/ui/tab-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { MailConnectionActions } from '../mail-connection-actions';

const AJUSTES_TABS = [
  { href: '/app/mail/ajustes', label: 'Buzones' },
  { href: '/app/mail/ajustes/plantillas', label: 'Plantillas' },
];

interface ConnRow {
  id: string;
  fromAddress: string;
  displayName: string | null;
  driver: string;
  visibility: string;
  status: string;
  lastError: string | null;
  lastSyncedAt: string | null;
}

export const metadata = { title: 'Correo · Buzones' };

const STATUS: Record<string, { label: string; color: 'gray' | 'green' | 'red' | 'yellow' }> = {
  PENDING: { label: 'Pendiente', color: 'yellow' },
  CONNECTED: { label: 'Conectado', color: 'green' },
  ERROR: { label: 'Error', color: 'red' },
};

export default async function MailConnectionsSettingsPage() {
  const conns = await serverApiFetch<ConnRow[]>('/mail/connections').catch(() => [] as ConnRow[]);

  return (
    <div className="space-y-6">
      <TabBar items={AJUSTES_TABS} />
      <PageHeader
        title="Buzones conectados"
        description="Conecta los buzones del equipo (compartidos) o tu buzón privado. Cada tenant usa sus propias cuentas — el correo se envía desde tu dominio, nunca desde Converflow."
        back={{ href: '/app/mail', label: 'Correo' }}
        action={
          <Link href="/app/mail/new" className={buttonClass('primary')}>
            + Conectar buzón
          </Link>
        }
      />

      {conns.length === 0 ? (
        <EmptyState
          title="Sin buzones conectados"
          description="Conecta tu primer buzón (Gmail, Outlook, IONOS o cualquier IMAP/SMTP) para enviar y recibir desde Converflow."
          cta={
            <Link href="/app/mail/new" className={buttonClass('primary', 'text-xs')}>
              + Conectar buzón
            </Link>
          }
        />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-ink-100 text-left text-xs font-mono uppercase tracking-wider text-ink-500">
              <tr>
                <th className="px-4 py-3">Buzón</th>
                <th className="px-4 py-3">Visibilidad</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {conns.map((c) => {
                const st = STATUS[c.status] ?? { label: c.status, color: 'gray' as const };
                return (
                  <tr key={c.id} className="border-b border-ink-100 last:border-0 hover:bg-ink-100/40">
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.fromAddress}</div>
                      {c.displayName && <div className="text-xs text-ink-500">{c.displayName}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {c.visibility === 'PRIVATE' ? '🔒 Privado' : '👥 Compartido'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={st.color}>{st.label}</Badge>
                      {c.status === 'ERROR' && c.lastError && (
                        <div className="mt-0.5 max-w-xs truncate text-[11px] text-red-600" title={c.lastError}>
                          {c.lastError}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <MailConnectionActions id={c.id} />
                    </td>
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
