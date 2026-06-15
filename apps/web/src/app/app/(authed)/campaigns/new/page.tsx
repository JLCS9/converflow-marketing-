import { PageHeader } from '@/components/ui/page-header';
import { CampaignForm } from '../campaign-form';

export const metadata = { title: 'Nueva campaña' };

export default function NewCampaignPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Nueva campaña"
        description="Define el canal, el mensaje y la audiencia. Puedes previsualizar a cuántos contactos llegará antes de enviar."
        back={{ href: '/app/campaigns', label: 'Campañas' }}
      />
      <CampaignForm />
    </div>
  );
}
