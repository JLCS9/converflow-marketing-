import { notFound } from 'next/navigation';
import { serverApiFetch } from '@/lib/server-api';
import { PageHeader } from '@/components/ui/page-header';
import { MailConnectionForm, type MailConnectionData } from '../mail-connection-form';

export default async function EditMailConnectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conn = await serverApiFetch<MailConnectionData>(`/mail/connections/${id}`).catch(() => null);
  if (!conn) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editar buzón"
        description="Deja la contraseña vacía para no cambiarla. Al guardar se vuelve a verificar la conexión."
        back={{ href: '/app/mail/ajustes', label: 'Buzones' }}
      />
      <MailConnectionForm connection={conn} />
    </div>
  );
}
