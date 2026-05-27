// Placeholder dashboard. Real super admin UI lands in Fase 1.
export const metadata = { title: 'Admin' };

export default function AdminHomePage() {
  return (
    <main className="min-h-screen bg-ink-100/40 p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-2xl font-semibold">Panel de administración</h1>
        <p className="text-ink-500">
          Aquí va el dashboard del super admin: tenants, bots, usuarios, métricas y auditoría.
          Implementación completa en Fase 1.
        </p>
        <div className="rounded-lg border border-ink-100 bg-white p-6 text-sm text-ink-700">
          <p className="font-mono text-xs uppercase tracking-wider text-primary-700">próximos pasos</p>
          <ul className="mt-3 list-inside list-disc space-y-1">
            <li>Listado de tenants con búsqueda y filtros</li>
            <li>Edición de límites (usuarios, bots, conversaciones, almacenamiento)</li>
            <li>Vista global de bots activos por tenant</li>
            <li>Auditoría de acciones del admin</li>
            <li>Impersonación con badge visible</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
