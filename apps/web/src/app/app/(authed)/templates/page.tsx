import { redirect } from 'next/navigation';

// The templates list now lives inside Correo → Ajustes → Plantillas.
// Keep this route as a redirect so old links/bookmarks still resolve.
export default function TemplatesPage() {
  redirect('/app/mail/ajustes/plantillas');
}
