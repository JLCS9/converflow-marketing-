import { redirect } from 'next/navigation';

/**
 * La lista de leads vive ahora en la página unificada de contactos. Solo
 * redirige el LISTADO: el detalle (/leads/[id]) y las rutas de alta siguen
 * aquí. Se conservan los filtros de la URL para no romper enlaces guardados.
 */
export default async function RedirectLeads({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  qs.set('type', 'lead');
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  redirect(`/app/contacts?${qs.toString()}`);
}
