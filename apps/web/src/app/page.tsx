import Link from 'next/link';

const channels = ['WhatsApp', 'Instagram', 'Messenger', 'Web', 'HubSpot', 'Salesforce'];

const capacities = [
  {
    tag: 'VENTAS',
    title: 'Cierre automático',
    body: 'Convierte clientes desde WhatsApp o web sin intervención humana, con seguimiento, propuesta y cierre integrados.',
  },
  {
    tag: 'PROSPECCIÓN',
    title: 'Cualificación de leads',
    body: 'Filtra, cualifica y agenda reuniones automáticamente. Tu equipo solo habla con leads listos para comprar.',
  },
  {
    tag: 'ATENCIÓN',
    title: 'Soporte 24/7',
    body: 'Resuelve dudas, gestiona incidencias y escala al humano solo cuando hace falta. Sin colas, sin esperas.',
  },
  {
    tag: 'DATOS · OCR',
    title: 'Procesado documental',
    body: 'Extrae datos de facturas, contratos y formularios sin intervención manual. De papel a base de datos en segundos.',
  },
];

const impactMetrics = [
  { value: '×3', label: 'Más conversiones', body: 'Cierra más ventas con respuestas inmediatas y seguimiento sin huecos.' },
  { value: '−30%', label: 'Menores costes operativos', body: 'Menos horas dedicadas a tareas repetitivas. Más enfoque en lo estratégico.' },
  { value: '24/7', label: 'Respuesta sin descanso', body: 'Tus clientes nunca esperan. Cualquier canal, cualquier hora, cualquier idioma.' },
  { value: '0', label: 'Errores humanos', body: 'Procesos automatizados con precisión, trazabilidad y registro completo.' },
];

export default function HomePage() {
  return (
    <main className="text-ink-900">
      {/* Top bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="font-semibold tracking-tight">converflow<span className="text-primary-600">.ai</span></div>
        <nav className="flex items-center gap-6 text-sm">
          <Link href="/login" className="text-ink-700">Entrar</Link>
          <Link
            href="/signup"
            className="rounded-md bg-ink-900 px-3 py-1.5 text-white hover:bg-ink-700"
          >
            Agendar demo
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 pb-16 pt-10 md:pt-20">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">
          Convierte cada conversación en ingresos automáticos.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-ink-500 md:text-xl">
          Automatiza ventas, atención al cliente y operaciones con agentes de IA que trabajan sin descanso,
          integrados en los canales donde ya están tus clientes.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/signup" className="rounded-md bg-ink-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-700">
            Agendar una demo
          </Link>
          <Link href="/login" className="rounded-md border border-ink-300 px-5 py-2.5 text-sm font-medium text-ink-900 hover:border-ink-700">
            Ver la plataforma
          </Link>
        </div>
        <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-500">
          <li>Implantación en menos de 7 días</li>
          <li>Sin necesidad de equipo técnico</li>
          <li>Resultados desde la primera semana</li>
        </ul>
      </section>

      {/* Channels */}
      <section className="border-y border-ink-100 bg-ink-100/40">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <p className="text-xs uppercase tracking-wider text-ink-500">Integrado nativamente con</p>
          <ul className="mt-3 flex flex-wrap gap-x-8 gap-y-2 font-medium text-ink-700">
            {channels.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* Capacidades */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <p className="text-xs uppercase tracking-wider text-ink-500">04 · Qué puede hacer</p>
        <h2 className="mt-2 text-3xl font-semibold md:text-4xl">Lo que Converflow hace por ti.</h2>
        <p className="mt-3 max-w-2xl text-ink-500">
          Cuatro capacidades centrales, una sola plataforma. Combinables según tu operativa real.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {capacities.map((c) => (
            <div key={c.title} className="rounded-lg border border-ink-100 p-6">
              <div className="text-xs font-mono tracking-wider text-primary-700">{c.tag}</div>
              <h3 className="mt-3 text-lg font-semibold">{c.title}</h3>
              <p className="mt-2 text-sm text-ink-500">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Impacto */}
      <section className="border-t border-ink-100 bg-ink-100/40">
        <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
          <p className="text-xs uppercase tracking-wider text-ink-500">03 · Impacto</p>
          <h2 className="mt-2 text-3xl font-semibold md:text-4xl">
            Resultados que se notan en la cuenta de explotación.
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {impactMetrics.map((m) => (
              <div key={m.label} className="rounded-lg border border-ink-100 bg-white p-6">
                <div className="text-3xl font-semibold tracking-tight">{m.value}</div>
                <div className="mt-1 text-sm font-medium text-ink-900">{m.label}</div>
                <p className="mt-2 text-sm text-ink-500">{m.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold md:text-4xl">
          Activa tu primer agente en menos de 7 días.
        </h2>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/signup" className="rounded-md bg-ink-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-ink-700">
            Agendar una demo
          </Link>
          <Link href="/login" className="rounded-md border border-ink-300 px-5 py-2.5 text-sm font-medium text-ink-900 hover:border-ink-700">
            Automatiza mi negocio
          </Link>
        </div>
        <p className="mt-3 font-mono text-xs text-ink-500">
          // sin compromiso · sin instalación · sin equipo técnico
        </p>
      </section>

      <footer className="border-t border-ink-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-ink-500">
          <div>© {new Date().getFullYear()} CSO Digital SL · converflow.ai</div>
          <nav className="flex gap-4">
            <Link href="/privacy">Privacidad</Link>
            <Link href="/ai-disclosure">Uso de IA</Link>
            <Link href="/changelog">Versiones</Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
