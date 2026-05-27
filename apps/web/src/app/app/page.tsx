// Placeholder tenant dashboard. Real UI lands in Fase 1-2.
export const metadata = { title: 'Panel' };

export default function AppHomePage() {
  return (
    <main className="min-h-screen p-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <h1 className="text-2xl font-semibold">Hola 👋</h1>
        <p className="text-ink-500">
          Tu panel de cliente. Aquí gestionarás agentes, bots y conversaciones.
        </p>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          ⚠️ Estás interactuando con una herramienta que utiliza IA. Lee nuestra{' '}
          <a className="underline" href="/ai-disclosure">
            política de uso de IA
          </a>
          .
        </div>
      </div>
    </main>
  );
}
