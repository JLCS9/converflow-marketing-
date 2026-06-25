import { PageHeader } from '@/components/ui/page-header';
import { MailConnectionForm } from '../mail-connection-form';

export const metadata = { title: 'Conectar buzón' };

export default function NewMailConnectionPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Conectar buzón"
        description="Conecta un buzón IMAP/SMTP. Converflow verificará la conexión al guardar."
        back={{ href: '/app/mail/ajustes', label: 'Buzones' }}
      />
      <MailConnectionForm />
    </div>
  );
}
