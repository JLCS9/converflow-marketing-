import Link from 'next/link';
import { CreateBotForm } from './create-form';

export const metadata = { title: 'Nuevo bot' };

export default function NewBotPage() {
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <Link href="/app/bots" className="text-sm text-ink-500 hover:text-ink-900">
          ← Volver a bots
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Nuevo bot</h1>
        <p className="mt-1 text-sm text-ink-500">
          Crea un bot. En esta fase solo se registra; el flujo de conexión real (WhatsApp
          por QR vía Baileys) llega en Fase 3. Los bots Web Chat ya pueden recibir
          mensajes una vez los embebas en tu web.
        </p>
      </div>
      <CreateBotForm />
    </div>
  );
}
